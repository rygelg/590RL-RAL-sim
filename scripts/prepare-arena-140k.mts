#!/usr/bin/env -S npx tsx
/**
 * Precompute REAL Chatbot Arena data from `lmarena-ai/arena-human-preference-140k`.
 *
 * Outputs (committed to repo, served at runtime — no network at request time):
 *   - data/arena-real-playground.json
 *       Top-12 most-active models, ~3000 real votes (uniform random subsample,
 *       deterministic seed). Used by the interactive playground + the live
 *       evaluation cards.
 *   - data/arena-real-snapshot.json
 *       Top-20 most-active models, BT-fitted on the full subset of votes
 *       between those models. Used by the "Real Arena snapshot" panel.
 *
 * Pipeline:
 *   1. Fetch parquet shard URLs from HF datasets-server.
 *   2. For each shard, read only (model_a, model_b, winner) via column-pruned
 *      parquet reads with HTTP range requests (cached locally on disk).
 *   3. Tally per-model battles, pick top-K by participation.
 *   4. Convert winner ∈ {model_a, model_b, tie, tie (bothbad)} → y ∈ {1, 0, 0.5}.
 *   5. Fit BT on filtered votes (full data, offline) → β, CI, ranks.
 *   6. Emit JSON.
 *
 * Run:  npm run prepare-arena
 */

import { writeFile, mkdir, readFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  asyncBufferFromUrl,
  cachedAsyncBuffer,
  parquetReadObjects,
} from "hyparquet";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// -----------------------------------------------------------------------------
// Inlined BT + linalg
//
// Mirrors lib/bt.ts and lib/math.ts so the script is self-contained. We avoid
// importing those .ts files directly because Node's built-in TypeScript
// stripping (Node 22+) does not interoperate cleanly with tsx's transform
// when the project has no `"type": "module"` declared. The runtime app still
// uses the canonical implementations in lib/.
// -----------------------------------------------------------------------------

type Vec = Float64Array;
type Mat = Float64Array;

interface Vote {
  i: number;
  j: number;
  y: number;
  w?: number;
}

interface BTFit {
  beta: Float64Array;
  hessian: Mat;
  n: number;
  ridge: number;
}

function copyMat(a: Mat): Mat {
  return new Float64Array(a);
}

function sigmoid(x: number): number {
  if (x >= 0) {
    const ez = Math.exp(-x);
    return 1 / (1 + ez);
  }
  const ez = Math.exp(x);
  return ez / (1 + ez);
}

function choleskySolve(H: Mat, b: Vec, n: number): Vec {
  for (let j = 0; j < n; j++) {
    let s = H[j * n + j];
    for (let k = 0; k < j; k++) s -= H[j * n + k] * H[j * n + k];
    if (s <= 1e-12) s = 1e-12;
    const ljj = Math.sqrt(s);
    H[j * n + j] = ljj;
    for (let i = j + 1; i < n; i++) {
      let v = H[i * n + j];
      for (let k = 0; k < j; k++) v -= H[i * n + k] * H[j * n + k];
      H[i * n + j] = v / ljj;
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let v = b[i];
    for (let k = 0; k < i; k++) v -= H[i * n + k] * y[k];
    y[i] = v / H[i * n + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let v = y[i];
    for (let k = i + 1; k < n; k++) v -= H[k * n + i] * x[k];
    x[i] = v / H[i * n + i];
  }
  return x;
}

function solve(H: Mat, b: Vec, n: number): Vec {
  return choleskySolve(copyMat(H), b, n);
}

function invDiag(H: Mat, n: number): Vec {
  const out = new Float64Array(n);
  const e = new Float64Array(n);
  const L = copyMat(H);
  for (let j = 0; j < n; j++) {
    let s = L[j * n + j];
    for (let k = 0; k < j; k++) s -= L[j * n + k] * L[j * n + k];
    if (s <= 1e-12) s = 1e-12;
    const ljj = Math.sqrt(s);
    L[j * n + j] = ljj;
    for (let i = j + 1; i < n; i++) {
      let v = L[i * n + j];
      for (let k = 0; k < j; k++) v -= L[i * n + k] * L[j * n + k];
      L[i * n + j] = v / ljj;
    }
  }
  for (let col = 0; col < n; col++) {
    e.fill(0);
    e[col] = 1;
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let v = e[i];
      for (let k = 0; k < i; k++) v -= L[i * n + k] * y[k];
      y[i] = v / L[i * n + i];
    }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let v = y[i];
      for (let k = i + 1; k < n; k++) v -= L[k * n + i] * x[k];
      x[i] = v / L[i * n + i];
    }
    out[col] = x[col];
  }
  return out;
}

function fitBT(votes: Vote[], n: number, ridge = 0.01): BTFit {
  const tol = 1e-7;
  const maxIter = 60;
  const beta = new Float64Array(n);
  const grad = new Float64Array(n);
  const H = new Float64Array(n * n);
  let prevNll = Infinity;

  for (let iter = 0; iter < maxIter; iter++) {
    grad.fill(0);
    H.fill(0);
    let nll = 0;
    for (let k = 0; k < votes.length; k++) {
      const v = votes[k];
      const w = v.w ?? 1;
      if (w === 0) continue;
      const z = beta[v.i] - beta[v.j];
      const p = sigmoid(z);
      const r = v.y - p;
      grad[v.i] += w * r;
      grad[v.j] -= w * r;
      const wpq = w * p * (1 - p);
      H[v.i * n + v.i] += wpq;
      H[v.j * n + v.j] += wpq;
      H[v.i * n + v.j] -= wpq;
      H[v.j * n + v.i] -= wpq;
      const lse = z > 35 ? z : z < -35 ? Math.exp(z) : Math.log1p(Math.exp(z));
      nll += w * (lse - v.y * z);
    }
    for (let a = 0; a < n; a++) {
      const lam = a === 0 ? ridge + 100 : ridge;
      grad[a] -= lam * beta[a];
      H[a * n + a] += lam;
      nll += 0.5 * lam * beta[a] * beta[a];
    }
    if (Math.abs(prevNll - nll) < tol) break;
    prevNll = nll;
    const delta = solve(H, grad, n);
    let damp = 1;
    let step = 0;
    while (damp > 1e-4 && step < 8) {
      let bad = false;
      for (let a = 0; a < n; a++) {
        const v = beta[a] + damp * delta[a];
        if (!Number.isFinite(v) || Math.abs(v) > 50) {
          bad = true;
          break;
        }
      }
      if (!bad) break;
      damp *= 0.5;
      step++;
    }
    for (let a = 0; a < n; a++) beta[a] += damp * delta[a];
  }

  H.fill(0);
  for (let k = 0; k < votes.length; k++) {
    const v = votes[k];
    const w = v.w ?? 1;
    if (w === 0) continue;
    const z = beta[v.i] - beta[v.j];
    const p = sigmoid(z);
    const wpq = w * p * (1 - p);
    H[v.i * n + v.i] += wpq;
    H[v.j * n + v.j] += wpq;
    H[v.i * n + v.j] -= wpq;
    H[v.j * n + v.i] -= wpq;
  }
  for (let a = 0; a < n; a++) {
    const lam = a === 0 ? ridge + 100 : ridge;
    H[a * n + a] += lam;
  }
  return { beta, hessian: H, n, ridge };
}

function btCI(fit: BTFit) {
  const diag = invDiag(fit.hessian, fit.n);
  const sd = new Float64Array(fit.n);
  const lower = new Float64Array(fit.n);
  const upper = new Float64Array(fit.n);
  for (let a = 0; a < fit.n; a++) {
    sd[a] = Math.sqrt(Math.max(0, diag[a]));
    lower[a] = fit.beta[a] - 1.96 * sd[a];
    upper[a] = fit.beta[a] + 1.96 * sd[a];
  }
  return { lower, upper, sd };
}

function toElo(beta: Float64Array, base = 1000): Float64Array {
  let mean = 0;
  for (let a = 0; a < beta.length; a++) mean += beta[a];
  mean /= beta.length;
  const k = 400 / Math.log(10);
  const out = new Float64Array(beta.length);
  for (let a = 0; a < beta.length; a++) out[a] = base + k * (beta[a] - mean);
  return out;
}

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

const DATASET = "lmarena-ai/arena-human-preference-140k";
const PLAYGROUND_K = 12; // top-K most-active models for interactive playground
const SNAPSHOT_K = 20; // top-K models for the snapshot panel
const PLAYGROUND_VOTE_BUDGET = 3000; // real votes kept for the in-browser slider
const SAMPLE_SEED = 1729;

const ROOT = join(__dirname, "..");
const CACHE_DIR = join(ROOT, ".cache", "arena-140k");
const OUT_DIR = join(ROOT, "data");

const PLAYGROUND_OUT = join(OUT_DIR, "arena-real-playground.json");
const SNAPSHOT_OUT = join(OUT_DIR, "arena-real-snapshot.json");
// The "Real Arena snapshot" overlay in the playground reads this file. We
// regenerate it from the precomputed top-20 fit so the UI shows the same
// real numbers without any code change.
const UI_SNAPSHOT_OUT = join(OUT_DIR, "leaderboard-snapshot.json");

// -----------------------------------------------------------------------------
// Step 1: list parquet shards
// -----------------------------------------------------------------------------

interface ParquetShard {
  url: string;
  filename: string;
  size: number;
}

async function listShards(): Promise<ParquetShard[]> {
  const url = `https://datasets-server.huggingface.co/parquet?dataset=${encodeURIComponent(
    DATASET,
  )}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HF parquet API failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as {
    parquet_files: Array<{ url: string; filename: string; size: number }>;
  };
  return json.parquet_files.map((f) => ({
    url: f.url,
    filename: f.filename,
    size: f.size,
  }));
}

// -----------------------------------------------------------------------------
// Step 2: read columns from each shard
// -----------------------------------------------------------------------------

interface RawRow {
  model_a: string;
  model_b: string;
  winner: string;
}

async function readShard(shard: ParquetShard, idx: number, total: number): Promise<RawRow[]> {
  // Use HTTP range requests against the HF URL. hyparquet's asyncBufferFromUrl
  // performs HEAD → ranged GETs internally; cachedAsyncBuffer memoizes already-
  // fetched byte ranges so each shard's footer + the 3 column chunks we want
  // are only pulled over the wire once.
  const file = cachedAsyncBuffer(
    await asyncBufferFromUrl({ url: shard.url, byteLength: shard.size }),
    { minSize: 1024 },
  );

  const t0 = Date.now();
  const rows = (await parquetReadObjects({
    file,
    columns: ["model_a", "model_b", "winner"],
  })) as RawRow[];
  const dt = Date.now() - t0;

  console.log(
    `  shard ${String(idx + 1).padStart(2)}/${total} ${shard.filename}: ${rows.length} rows in ${dt}ms`,
  );
  return rows;
}

// On-disk cache so re-runs don't re-pull. We persist the parsed rows as a
// minimal JSONL file (one row per line: a\tb\twinner). Tiny and fast to reload.
async function readShardCached(
  shard: ParquetShard,
  idx: number,
  total: number,
): Promise<RawRow[]> {
  const cacheFile = join(CACHE_DIR, `${shard.filename}.tsv`);
  try {
    const st = await stat(cacheFile);
    if (st.size > 0) {
      const txt = await readFile(cacheFile, "utf8");
      const rows: RawRow[] = [];
      const lines = txt.split("\n");
      for (const line of lines) {
        if (!line) continue;
        const [model_a, model_b, winner] = line.split("\t");
        rows.push({ model_a, model_b, winner });
      }
      console.log(`  shard ${String(idx + 1).padStart(2)}/${total} ${shard.filename}: ${rows.length} rows (cached)`);
      return rows;
    }
  } catch {
    // not cached — fall through
  }

  const rows = await readShard(shard, idx, total);
  const tsv = rows
    .map((r) => `${r.model_a}\t${r.model_b}\t${r.winner}`)
    .join("\n");
  await writeFile(cacheFile, tsv);
  return rows;
}

// -----------------------------------------------------------------------------
// Step 3: organisation lookup
// -----------------------------------------------------------------------------

// Map a raw arena model identifier to a human-readable display name +
// organization. Patterns are matched in order; first hit wins. Anything that
// doesn't match falls through to a generic "Other" org and the raw name.
const ORG_PATTERNS: Array<{ test: RegExp; org: string }> = [
  { test: /^gpt-|^o[0-9]|^chatgpt|^openai/i, org: "OpenAI" },
  { test: /^claude/i, org: "Anthropic" },
  { test: /^gemini|^bard|^palm/i, org: "Google DeepMind" },
  { test: /^gemma/i, org: "Google" },
  { test: /^llama|^meta-/i, org: "Meta" },
  { test: /^qwen/i, org: "Alibaba" },
  { test: /^deepseek/i, org: "DeepSeek" },
  { test: /^mistral|^mixtral|^magistral|^codestral|^pixtral/i, org: "Mistral AI" },
  { test: /^command|^c4ai/i, org: "Cohere" },
  { test: /^grok/i, org: "xAI" },
  { test: /^yi-|^01-/i, org: "01.AI" },
  { test: /^glm-|^chatglm/i, org: "Zhipu AI" },
  { test: /^phi-/i, org: "Microsoft" },
  { test: /^reka/i, org: "Reka" },
  { test: /^nova|^amazon\.nova/i, org: "Amazon" },
  { test: /^step-/i, org: "StepFun" },
  { test: /^minimax/i, org: "MiniMax" },
  { test: /^kimi|^moonshot/i, org: "Moonshot AI" },
  { test: /^hunyuan/i, org: "Tencent" },
  { test: /^doubao/i, org: "ByteDance" },
];

function lookupOrg(rawName: string): string {
  for (const { test, org } of ORG_PATTERNS) {
    if (test.test(rawName)) return org;
  }
  return "Other";
}

// Clean up a raw model identifier for display. The dataset uses long ids like
// `claude-3-5-sonnet-20240620`. We keep the substantive part and strip trailing
// version dates for readability.
function displayName(rawName: string): string {
  // Drop a trailing -YYYYMMDD or -YYYY-MM-DD date stamp.
  const stripped = rawName
    .replace(/-(20\d{2})-?(0[1-9]|1[0-2])-?(0[1-9]|[12]\d|3[01])$/i, "")
    .replace(/-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/i, "");
  return stripped;
}

// -----------------------------------------------------------------------------
// Step 4: aggregate, filter, fit
// -----------------------------------------------------------------------------

function tallyBattles(rows: RawRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.model_a, (counts.get(r.model_a) ?? 0) + 1);
    counts.set(r.model_b, (counts.get(r.model_b) ?? 0) + 1);
  }
  return counts;
}

function topModels(counts: Map<string, number>, k: number): string[] {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([name]) => name);
}

function rowToY(winner: string): number | null {
  const w = winner.toLowerCase().trim();
  if (w === "model_a") return 1;
  if (w === "model_b") return 0;
  if (w.startsWith("tie")) return 0.5;
  return null;
}

function buildVotes(
  rows: RawRow[],
  modelToIndex: Map<string, number>,
): Vote[] {
  const votes: Vote[] = [];
  for (const r of rows) {
    const i = modelToIndex.get(r.model_a);
    const j = modelToIndex.get(r.model_b);
    if (i === undefined || j === undefined) continue;
    if (i === j) continue;
    const y = rowToY(r.winner);
    if (y === null) continue;
    votes.push({ i, j, y });
  }
  return votes;
}

// Mulberry32 PRNG, matching lib/math.ts.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sample without replacement using Fisher-Yates partial shuffle.
function sampleWithoutReplacement<T>(arr: T[], k: number, seed: number): T[] {
  const rand = rng(seed);
  const idx = new Int32Array(arr.length);
  for (let i = 0; i < arr.length; i++) idx[i] = i;
  const m = Math.min(k, arr.length);
  for (let i = 0; i < m; i++) {
    const j = i + Math.floor(rand() * (arr.length - i));
    const tmp = idx[i];
    idx[i] = idx[j];
    idx[j] = tmp;
  }
  const out: T[] = new Array(m);
  for (let i = 0; i < m; i++) out[i] = arr[idx[i]];
  return out;
}

// -----------------------------------------------------------------------------
// Output writers
// -----------------------------------------------------------------------------

interface PlaygroundModel {
  name: string; // display name
  rawName: string; // dataset identifier
  organization: string;
  trueBeta: number; // BT estimate from full data on the playground subset
  beta: number; // duplicate of trueBeta — used by the runtime as the "ground-truth" β
  ciLow: number;
  ciHigh: number;
  battles: number; // battles within the K-model subset
  totalBattles: number; // battles across the full dataset
  sampleWeight: number; // proportional to battles, normalised so mean ≈ 1
}

interface PlaygroundFile {
  source: string;
  generatedAt: string;
  modelCount: number;
  totalVotesAvailable: number; // votes between top-K, before subsampling
  voteSampleSize: number;
  description: string;
  models: PlaygroundModel[];
  votes: Array<{ i: number; j: number; y: number }>;
}

interface SnapshotModel {
  rank: number;
  name: string;
  rawName: string;
  organization: string;
  beta: number;
  elo: number;
  ciLow: number; // CI on β (log-strength)
  ciHigh: number;
  ciHalfWidthElo: number; // ±Elo for the snapshot table
  battles: number; // within the K-model subset
  totalBattles: number;
}

interface SnapshotFile {
  source: string;
  generatedAt: string;
  totalRowsScanned: number;
  totalVotesUsed: number;
  modelCount: number;
  models: SnapshotModel[];
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`Fetching parquet shard list for ${DATASET}…`);
  const shards = await listShards();
  console.log(`  ${shards.length} shards, ${(shards.reduce((s, x) => s + x.size, 0) / 1e9).toFixed(2)} GB total`);

  console.log("Reading shards (column-pruned to model_a, model_b, winner)…");
  const allRows: RawRow[] = [];
  for (let i = 0; i < shards.length; i++) {
    const rows = await readShardCached(shards[i], i, shards.length);
    for (const r of rows) allRows.push(r);
  }
  console.log(`Loaded ${allRows.length} rows total.`);

  // Some rows may have nulls in winner / model fields if the row was dropped at
  // collection time. Drop those.
  const cleanRows = allRows.filter(
    (r) => r.model_a && r.model_b && r.winner,
  );
  console.log(`Clean rows: ${cleanRows.length}`);

  // ---------------------------------------------------------------------------
  // Step A: snapshot panel — fit on top-20 models
  // ---------------------------------------------------------------------------
  const fullCounts = tallyBattles(cleanRows);
  console.log(
    `Distinct models: ${fullCounts.size} (snapshot taking top ${SNAPSHOT_K} by battle count)`,
  );

  const top20Names = topModels(fullCounts, SNAPSHOT_K);
  const m20Index = new Map(top20Names.map((n, i) => [n, i]));
  const votes20 = buildVotes(cleanRows, m20Index);
  console.log(
    `Snapshot subset: ${SNAPSHOT_K} models, ${votes20.length} votes between them.`,
  );

  console.log("Fitting BT on snapshot subset…");
  const fit20 = fitBT(votes20, SNAPSHOT_K);
  const ci20 = btCI(fit20);
  const elo20 = toElo(fit20.beta);

  // Per-model battle counts inside the K-model subset.
  const battles20 = new Int32Array(SNAPSHOT_K);
  for (const v of votes20) {
    battles20[v.i]++;
    battles20[v.j]++;
  }

  // Rank by β descending.
  const order20 = Array.from({ length: SNAPSHOT_K }, (_, i) => i);
  order20.sort((a, b) => fit20.beta[b] - fit20.beta[a]);

  const eloHalf = Float64Array.from(ci20.sd, (s) => 1.96 * s * (400 / Math.log(10)));

  const snapshotModels: SnapshotModel[] = order20.map((idx, r) => {
    const raw = top20Names[idx];
    return {
      rank: r + 1,
      name: displayName(raw),
      rawName: raw,
      organization: lookupOrg(raw),
      beta: fit20.beta[idx],
      elo: elo20[idx],
      ciLow: ci20.lower[idx],
      ciHigh: ci20.upper[idx],
      ciHalfWidthElo: eloHalf[idx],
      battles: battles20[idx],
      totalBattles: fullCounts.get(raw) ?? 0,
    };
  });

  const snapshotFile: SnapshotFile = {
    source: `HuggingFace ${DATASET}`,
    generatedAt: new Date().toISOString(),
    totalRowsScanned: cleanRows.length,
    totalVotesUsed: votes20.length,
    modelCount: SNAPSHOT_K,
    models: snapshotModels,
  };

  await writeFile(SNAPSHOT_OUT, JSON.stringify(snapshotFile, null, 2));
  console.log(`Wrote ${SNAPSHOT_OUT}`);

  // ---------------------------------------------------------------------------
  // Step A.5: also write the snapshot in the shape consumed by the existing
  // "Real Arena snapshot" overlay (data/leaderboard-snapshot.json). This file
  // pre-existed before the real-data integration; we now overwrite it with
  // real numbers, fitted offline on the dataset, so the UI is real-data-by-
  // default with no code change in the overlay itself.
  // ---------------------------------------------------------------------------
  const uiSnapshot = {
    fetched_at: new Date().toISOString(),
    source: `Bradley-Terry fit on top-${SNAPSHOT_K} most-active models in HuggingFace ${DATASET}.`,
    note: `Real Chatbot Arena votes from lmarena-ai/arena-human-preference-140k. Bradley-Terry MLE was fit offline on ${votes20.length.toLocaleString()} votes between the ${SNAPSHOT_K} most-active models, then converted to Elo (mean-zero, scale 400/log10). 95% CIs are normal-approximations from the inverse Hessian. Re-run npm run prepare-arena to refresh.`,
    rows: snapshotModels.map((m) => ({
      rank: m.rank,
      model: m.name,
      organization: m.organization,
      score: Math.round(m.elo),
      ci_low: Math.round(m.elo - m.ciHalfWidthElo),
      ci_high: Math.round(m.elo + m.ciHalfWidthElo),
      battles: m.totalBattles,
      license: "n/a",
    })),
  };
  await writeFile(UI_SNAPSHOT_OUT, JSON.stringify(uiSnapshot, null, 2));
  console.log(`Wrote ${UI_SNAPSHOT_OUT}`);

  // ---------------------------------------------------------------------------
  // Step B: playground subset — top-12 models, ~3k votes
  // ---------------------------------------------------------------------------
  const top12Names = topModels(fullCounts, PLAYGROUND_K);
  const m12Index = new Map(top12Names.map((n, i) => [n, i]));
  const votes12Full = buildVotes(cleanRows, m12Index);
  console.log(
    `Playground subset: ${PLAYGROUND_K} models, ${votes12Full.length} votes between them.`,
  );

  console.log("Fitting BT on playground subset (full ~tens-of-k votes)…");
  const fit12 = fitBT(votes12Full, PLAYGROUND_K);
  const ci12 = btCI(fit12);

  const battles12 = new Int32Array(PLAYGROUND_K);
  for (const v of votes12Full) {
    battles12[v.i]++;
    battles12[v.j]++;
  }
  const meanBattles =
    Array.from(battles12).reduce((s, x) => s + x, 0) / PLAYGROUND_K;

  // Down-sample to PLAYGROUND_VOTE_BUDGET for snappy in-browser AMIP.
  const sampleSize = Math.min(PLAYGROUND_VOTE_BUDGET, votes12Full.length);
  const sampledVotes = sampleWithoutReplacement(
    votes12Full,
    sampleSize,
    SAMPLE_SEED,
  );
  console.log(`Subsampled to ${sampledVotes.length} votes for playground.`);

  const playgroundModels: PlaygroundModel[] = top12Names.map((raw, idx) => ({
    name: displayName(raw),
    rawName: raw,
    organization: lookupOrg(raw),
    trueBeta: fit12.beta[idx],
    beta: fit12.beta[idx],
    ciLow: ci12.lower[idx],
    ciHigh: ci12.upper[idx],
    battles: battles12[idx],
    totalBattles: fullCounts.get(raw) ?? 0,
    sampleWeight: battles12[idx] / meanBattles,
  }));

  const playgroundFile: PlaygroundFile = {
    source: `HuggingFace ${DATASET}`,
    generatedAt: new Date().toISOString(),
    modelCount: PLAYGROUND_K,
    totalVotesAvailable: votes12Full.length,
    voteSampleSize: sampledVotes.length,
    description: `Real Chatbot Arena votes between the ${PLAYGROUND_K} most-active models on ${DATASET}. The β / CI on each model is fit on all ${votes12Full.length} votes between them; the in-browser playground operates on a deterministic ${sampledVotes.length}-vote uniform subsample (seed ${SAMPLE_SEED}) so AMIP is responsive on every device.`,
    models: playgroundModels,
    votes: sampledVotes.map((v) => ({ i: v.i, j: v.j, y: v.y })),
  };

  await writeFile(PLAYGROUND_OUT, JSON.stringify(playgroundFile));
  console.log(`Wrote ${PLAYGROUND_OUT} (${(JSON.stringify(playgroundFile).length / 1024).toFixed(1)} KB)`);

  // Quick sanity print so the operator can eyeball the result.
  console.log("\nPlayground top of leaderboard:");
  const playgroundOrder = Array.from({ length: PLAYGROUND_K }, (_, i) => i);
  playgroundOrder.sort((a, b) => fit12.beta[b] - fit12.beta[a]);
  for (let r = 0; r < Math.min(6, PLAYGROUND_K); r++) {
    const idx = playgroundOrder[r];
    const m = playgroundModels[idx];
    console.log(
      `  ${String(r + 1).padStart(2)}. ${m.name.padEnd(28)} β=${m.beta.toFixed(3)}  battles=${m.battles}  org=${m.organization}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

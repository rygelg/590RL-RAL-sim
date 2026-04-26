// Dataset providers for the playground. Two presets:
//   - "arena":  REAL Chatbot Arena votes from
//               lmarena-ai/arena-human-preference-140k (top-12 most-active
//               models, 3,000-vote uniform subsample, β / CI fit on the full
//               15,925 votes between those models offline). Bundled JSON, no
//               runtime network calls.
//   - "mtbench": SYNTHETIC, with deliberately wide score gaps and uniform
//                matchup frequencies, calibrated to mirror the regime of
//                MT-Bench (expert prompts, curated annotators) for contrast.
//
// Both use a deterministic seeded PRNG so reloads reproduce.

import type { Vote } from "./bt";
import { rng, sigmoid } from "./math";
import realArenaData from "@/data/arena-real-playground.json";

export type PresetId = "arena" | "mtbench";

export interface PresetModel {
  name: string;
  organization: string;
  // BT log-strength used to (a) display the "ground-truth" β in the live
  // playground and (b) drive synthetic outcome simulation in the C2 sampler
  // race. For real Arena models this is the offline BT fit on 15.9k votes;
  // for the MT-Bench preset it's an authored value.
  trueBeta: number;
  // Optional sampling weight used by the synthetic matchup generator. Higher
  // -> the model appears more often. For real Arena it's normalised real
  // battle counts; unused for already-real votes but kept on the type so the
  // sampler simulation can match the empirical distribution.
  sampleWeight: number;
}

export interface SyntheticDataset {
  preset: PresetId;
  models: PresetModel[];
  votes: Vote[];
  seed: number;
  description: string;
  // True for the real-Arena preset, false for the synthetic mtbench preset.
  isReal: boolean;
  // Optional source line for footnotes in the UI.
  source?: string;
  // Optional total-votes-available figure (for "showing N of M real votes").
  totalAvailable?: number;
}

// -----------------------------------------------------------------------------
// REAL Chatbot Arena dataset (precomputed offline).
//
// Source: lmarena-ai/arena-human-preference-140k, top-12 most-active models.
// β / CI / sampleWeight are fit/derived on all 15.9k votes between those
// models. The bundled `votes` is a deterministic 3,000-vote uniform subsample
// of those, so AMIP is responsive on every device. See
// scripts/prepare-arena-140k.mts.
// -----------------------------------------------------------------------------

const REAL_ARENA_MODELS: PresetModel[] = realArenaData.models.map((m) => ({
  name: m.name,
  organization: m.organization,
  trueBeta: m.trueBeta,
  sampleWeight: m.sampleWeight,
}));

const REAL_ARENA_VOTES: Vote[] = realArenaData.votes.map((v) => ({
  i: v.i,
  j: v.j,
  y: v.y,
}));

const REAL_ARENA_SOURCE = realArenaData.source;
const REAL_ARENA_TOTAL = realArenaData.totalVotesAvailable;

const MTBENCH_MODELS: PresetModel[] = [
  { name: "Atlas-7", organization: "OpenLab", trueBeta: 1.10, sampleWeight: 1 },
  { name: "Helios-3", organization: "Cosmos AI", trueBeta: 0.85, sampleWeight: 1 },
  { name: "Nimbus-2.6", organization: "OrbitWorks", trueBeta: 0.55, sampleWeight: 1 },
  { name: "Quill-Pro", organization: "Inkwell", trueBeta: 0.30, sampleWeight: 1 },
  { name: "Sable-9", organization: "Onyx Labs", trueBeta: 0.05, sampleWeight: 1 },
  { name: "Crater-M", organization: "Lunar Logic", trueBeta: -0.18, sampleWeight: 1 },
  { name: "Pyrite-2", organization: "Forge AI", trueBeta: -0.40, sampleWeight: 1 },
  { name: "Tessera", organization: "Mosaic Models", trueBeta: -0.65, sampleWeight: 1 },
  { name: "Linnet", organization: "Hedge Research", trueBeta: -0.85, sampleWeight: 1 },
  { name: "Marlow", organization: "Compass Labs", trueBeta: -1.05, sampleWeight: 1 },
  { name: "Driftwood", organization: "Tidepool", trueBeta: -1.30, sampleWeight: 1 },
  { name: "Beacon-1", organization: "Lighthouse", trueBeta: -1.55, sampleWeight: 1 },
];

// Sample a model index proportional to sampleWeight.
function pickWeighted(models: PresetModel[], rand: () => number): number {
  let total = 0;
  for (const m of models) total += m.sampleWeight;
  let r = rand() * total;
  for (let i = 0; i < models.length; i++) {
    r -= models[i].sampleWeight;
    if (r <= 0) return i;
  }
  return models.length - 1;
}

// Deterministic Fisher-Yates partial shuffle, used to sub-sample the bundled
// real-arena vote pool down to whatever size the caller wants without
// disturbing the order seen on previous loads.
function deterministicSubsample(votes: Vote[], k: number, seed: number): Vote[] {
  const m = Math.min(k, votes.length);
  const idx = new Int32Array(votes.length);
  for (let i = 0; i < votes.length; i++) idx[i] = i;
  const rand = rng(seed);
  for (let i = 0; i < m; i++) {
    const j = i + Math.floor(rand() * (votes.length - i));
    const tmp = idx[i];
    idx[i] = idx[j];
    idx[j] = tmp;
  }
  const out: Vote[] = new Array(m);
  for (let i = 0; i < m; i++) {
    const v = votes[idx[i]];
    out[i] = { i: v.i, j: v.j, y: v.y };
  }
  return out;
}

// Real-Arena dataset (default). Bundled JSON, no runtime fetch.
export function loadRealArena(numVotes: number, seed = 1729): SyntheticDataset {
  const votes =
    numVotes >= REAL_ARENA_VOTES.length
      ? REAL_ARENA_VOTES.map((v) => ({ i: v.i, j: v.j, y: v.y }))
      : deterministicSubsample(REAL_ARENA_VOTES, numVotes, seed);
  return {
    preset: "arena",
    models: REAL_ARENA_MODELS,
    votes,
    seed,
    description: `Real Chatbot Arena votes between the 12 most-active models on lmarena-ai/arena-human-preference-140k. β / CI fit on all ${REAL_ARENA_TOTAL.toLocaleString()} votes between them; the in-browser slider runs on a deterministic ${votes.length.toLocaleString()}-vote uniform subsample so AMIP stays responsive.`,
    isReal: true,
    source: REAL_ARENA_SOURCE,
    totalAvailable: REAL_ARENA_TOTAL,
  };
}

// Synthetic MT-Bench-like dataset (kept as a foil to the real Arena).
function generateMTBench(numVotes: number, seed: number): SyntheticDataset {
  const models = MTBENCH_MODELS;
  const rand = rng(seed);
  const votes: Vote[] = [];
  let attempts = 0;
  while (votes.length < numVotes && attempts < numVotes * 10) {
    attempts++;
    const i = pickWeighted(models, rand);
    let j = pickWeighted(models, rand);
    if (j === i) {
      j = (i + 1) % models.length;
    }
    const p = sigmoid(models[i].trueBeta - models[j].trueBeta);
    const r = rand();
    let y: number = r < p ? 1 : 0;
    if (rand() < 0.04) y = 0.5; // ~4% tie rate
    votes.push({ i, j, y });
  }
  return {
    preset: "mtbench",
    models,
    votes,
    seed,
    description:
      "Synthetic MT-Bench-like dataset: wide score gaps, uniform matchup frequencies. Shown as a foil — these are the conditions under which AMIP / RAL are NOT supposed to look fragile.",
    isReal: false,
  };
}

// Public entry. The "arena" preset returns REAL precomputed Chatbot Arena
// votes by default; "mtbench" stays synthetic.
export function generatePreset(
  preset: PresetId,
  numVotes: number,
  seed = 1729,
): SyntheticDataset {
  if (preset === "arena") return loadRealArena(numVotes, seed);
  return generateMTBench(numVotes, seed);
}

export function presetLabel(preset: PresetId): string {
  return preset === "arena" ? "Arena · real votes" : "MT-Bench · synthetic";
}

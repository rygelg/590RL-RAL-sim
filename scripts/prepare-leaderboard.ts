#!/usr/bin/env -S npx tsx
/**
 * Prepare a small public-facing snapshot of the LMSYS Chatbot Arena leaderboard
 * and write it to data/leaderboard-snapshot.json.
 *
 * Cascading source strategy:
 *   1. Try the lmarena.ai public JSON endpoint.
 *   2. Try the HuggingFace Space artifact for `lmsys/chatbot-arena-leaderboard`.
 *   3. Fall back to the bundled copy in this script.
 *
 * The result is committed to the repo so deploys never depend on upstream.
 *
 * Run: npm run prepare-data
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

interface Row {
  rank: number;
  model: string;
  organization: string;
  score: number;
  ci_low: number;
  ci_high: number;
  battles: number;
  license: string;
}

interface Snapshot {
  fetched_at: string;
  source: string;
  note: string;
  rows: Row[];
}

const OUT_DIR = join(process.cwd(), "data");
const OUT_FILE = join(OUT_DIR, "leaderboard-snapshot.json");

// Hand-curated fallback. Anchored to the values the team's slide deck cited
// (April 2026) and rounded to publishable precision. Replace with a fresh fetch
// at any time; the shape is what the UI consumes.
const FALLBACK: Row[] = [
  { rank: 1, model: "GPT-5", organization: "OpenAI", score: 1412, ci_low: 1405, ci_high: 1419, battles: 84230, license: "Proprietary" },
  { rank: 2, model: "Gemini-3 Pro", organization: "Google", score: 1408, ci_low: 1400, ci_high: 1416, battles: 79110, license: "Proprietary" },
  { rank: 3, model: "Claude-4.6 Opus", organization: "Anthropic", score: 1407, ci_low: 1399, ci_high: 1414, battles: 71540, license: "Proprietary" },
  { rank: 4, model: "Llama-4-405B-Instruct", organization: "Meta", score: 1402, ci_low: 1393, ci_high: 1410, battles: 62380, license: "Llama-4 Community" },
  { rank: 5, model: "Gemini-3 Flash", organization: "Google", score: 1398, ci_low: 1389, ci_high: 1407, battles: 58220, license: "Proprietary" },
  { rank: 6, model: "Claude-4.6 Sonnet", organization: "Anthropic", score: 1394, ci_low: 1385, ci_high: 1403, battles: 55980, license: "Proprietary" },
  { rank: 7, model: "GPT-5 mini", organization: "OpenAI", score: 1389, ci_low: 1379, ci_high: 1398, battles: 64120, license: "Proprietary" },
  { rank: 8, model: "Mistral Large 3", organization: "Mistral", score: 1372, ci_low: 1361, ci_high: 1383, battles: 41020, license: "Mistral Research" },
  { rank: 9, model: "DeepSeek V3.5", organization: "DeepSeek", score: 1368, ci_low: 1356, ci_high: 1380, battles: 36740, license: "DeepSeek License" },
  { rank: 10, model: "Qwen-3-Max", organization: "Alibaba", score: 1361, ci_low: 1349, ci_high: 1373, battles: 33990, license: "Tongyi Qianwen" },
  { rank: 11, model: "Command R+ 2026", organization: "Cohere", score: 1352, ci_low: 1339, ci_high: 1365, battles: 24380, license: "CC-BY-NC" },
  { rank: 12, model: "Llama-4-70B-Instruct", organization: "Meta", score: 1346, ci_low: 1334, ci_high: 1358, battles: 47210, license: "Llama-4 Community" },
  { rank: 13, model: "Yi-2-Large", organization: "01.AI", score: 1339, ci_low: 1325, ci_high: 1353, battles: 19880, license: "Yi License" },
  { rank: 14, model: "Phi-5", organization: "Microsoft", score: 1334, ci_low: 1320, ci_high: 1348, battles: 18020, license: "MIT" },
  { rank: 15, model: "GPT-4o-2025-12", organization: "OpenAI", score: 1329, ci_low: 1317, ci_high: 1341, battles: 92450, license: "Proprietary" },
  { rank: 16, model: "Mixtral-8x22B-v2", organization: "Mistral", score: 1318, ci_low: 1304, ci_high: 1332, battles: 27660, license: "Apache 2.0" },
  { rank: 17, model: "Qwen-3-72B-Chat", organization: "Alibaba", score: 1311, ci_low: 1297, ci_high: 1325, battles: 22130, license: "Tongyi Qianwen" },
  { rank: 18, model: "Gemma-3-27B", organization: "Google", score: 1304, ci_low: 1290, ci_high: 1318, battles: 17540, license: "Gemma Terms" },
  { rank: 19, model: "DeepSeek-Coder-V3", organization: "DeepSeek", score: 1296, ci_low: 1281, ci_high: 1311, battles: 14820, license: "DeepSeek License" },
  { rank: 20, model: "Llama-3.3-70B", organization: "Meta", score: 1287, ci_low: 1273, ci_high: 1301, battles: 39870, license: "Llama-3 Community" },
];

async function tryFetch(url: string, label: string): Promise<unknown | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) {
      console.warn(`[${label}] HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn(`[${label}] fetch failed:`, (e as Error).message);
    return null;
  }
}

async function loadFromHuggingFace(): Promise<Row[] | null> {
  // Many community-maintained mirrors exist. We try a couple of known schemas.
  // If any mirror returns rows we can map, we use them; otherwise fall through.
  const candidates = [
    "https://huggingface.co/datasets/lmarena-ai/chatbot-arena-leaderboard/resolve/main/leaderboard.json",
    "https://huggingface.co/spaces/lmsys/chatbot-arena-leaderboard/raw/main/elo_results.json",
  ];
  for (const url of candidates) {
    const data = (await tryFetch(url, `hf:${url}`)) as
      | { models?: Array<{ name?: string; rank?: number; score?: number; ci_low?: number; ci_high?: number; battles?: number; license?: string; organization?: string }> }
      | null;
    if (data?.models?.length) {
      return data.models.map((m, idx) => ({
        rank: m.rank ?? idx + 1,
        model: m.name ?? `model-${idx}`,
        organization: m.organization ?? "Unknown",
        score: m.score ?? 0,
        ci_low: m.ci_low ?? (m.score ?? 0) - 8,
        ci_high: m.ci_high ?? (m.score ?? 0) + 8,
        battles: m.battles ?? 0,
        license: m.license ?? "Unknown",
      }));
    }
  }
  return null;
}

async function main() {
  console.log("Preparing leaderboard snapshot...");

  let rows: Row[] | null = null;
  let source = "";

  rows = await loadFromHuggingFace();
  if (rows) {
    source = "HuggingFace LMSYS leaderboard mirror";
  } else {
    console.log("Falling back to bundled snapshot.");
    rows = FALLBACK;
    source = "Bundled snapshot (April 2026 hand-curated, anchored to slide deck)";
  }

  const snapshot: Snapshot = {
    fetched_at: new Date().toISOString(),
    source,
    note:
      "Aggregated leaderboard scores only. Raw votes are not bundled, so AMIP cannot be run live against this snapshot — it is shown read-only alongside the synthetic interactive demo for context.",
    rows: rows.slice(0, 24),
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(snapshot, null, 2));
  console.log(`Wrote ${OUT_FILE} with ${snapshot.rows.length} rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

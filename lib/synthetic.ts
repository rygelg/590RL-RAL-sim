// Synthetic dataset generators for the playground. Two presets:
//   - "arena": top-cluster tightly packed (~Chatbot Arena), non-uniform pairing
//             so a few high-leverage votes can flip the top.
//   - "mtbench": wide score gaps, evenly distributed matchups (~MT-Bench).
//
// Both use a deterministic seeded PRNG so reloads reproduce.

import type { Vote } from "./bt";
import { rng, sigmoid } from "./math";

export type PresetId = "arena" | "mtbench";

export interface PresetModel {
  name: string;
  organization: string;
  trueBeta: number;
  // Optional sampling weight used by the matchup generator. Higher -> the
  // model appears more often (e.g. Singh et al. asymmetry).
  sampleWeight: number;
}

export interface SyntheticDataset {
  preset: PresetId;
  models: PresetModel[];
  votes: Vote[];
  seed: number;
  description: string;
}

const ARENA_MODELS: PresetModel[] = [
  { name: "Atlas-7", organization: "OpenLab", trueBeta: 0.62, sampleWeight: 1.4 },
  { name: "Helios-3", organization: "Cosmos AI", trueBeta: 0.60, sampleWeight: 1.3 },
  { name: "Nimbus-2.6", organization: "OrbitWorks", trueBeta: 0.59, sampleWeight: 1.2 },
  { name: "Quill-Pro", organization: "Inkwell", trueBeta: 0.57, sampleWeight: 1.1 },
  { name: "Sable-9", organization: "Onyx Labs", trueBeta: 0.40, sampleWeight: 0.9 },
  { name: "Crater-M", organization: "Lunar Logic", trueBeta: 0.36, sampleWeight: 0.85 },
  { name: "Pyrite-2", organization: "Forge AI", trueBeta: 0.30, sampleWeight: 0.8 },
  { name: "Tessera", organization: "Mosaic Models", trueBeta: 0.18, sampleWeight: 0.7 },
  { name: "Linnet", organization: "Hedge Research", trueBeta: 0.05, sampleWeight: 0.6 },
  { name: "Marlow", organization: "Compass Labs", trueBeta: -0.10, sampleWeight: 0.5 },
  { name: "Driftwood", organization: "Tidepool", trueBeta: -0.34, sampleWeight: 0.4 },
  { name: "Beacon-1", organization: "Lighthouse", trueBeta: -0.55, sampleWeight: 0.35 },
];

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

export function generatePreset(
  preset: PresetId,
  numVotes: number,
  seed = 1729,
): SyntheticDataset {
  const models = preset === "arena" ? ARENA_MODELS : MTBENCH_MODELS;
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
    // Probability that i beats j under true BT.
    const p = sigmoid(models[i].trueBeta - models[j].trueBeta);
    const r = rand();
    let y: number;
    if (r < p) y = 1;
    else y = 0;
    // 4% tie rate to mirror Arena.
    if (rand() < 0.04) y = 0.5;
    votes.push({ i, j, y });
  }
  return {
    preset,
    models,
    votes,
    seed,
    description:
      preset === "arena"
        ? "Top-cluster tightly packed, non-uniform matchup frequencies. Calibrated to mirror the score-gap regime of Chatbot Arena."
        : "Wide score gaps and uniform matchup frequencies. Calibrated to mirror the regime of MT-Bench (expert prompts, curated annotators).",
  };
}

export function presetLabel(preset: PresetId): string {
  return preset === "arena" ? "Arena-like" : "MT-Bench-like";
}

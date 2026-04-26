// Three samplers used in the "sampler race" mini chart. All operate on a base
// dataset and a budget of new votes. New votes are simulated using the current
// BT fit's predicted outcome distribution.

import { fitBT, type BTFit, type Vote } from "./bt";
import { alphaFlip } from "./amip";
import { rng, sigmoid } from "./math";

export type SamplerKind = "uniform" | "info" | "influence";

export interface SamplerCurvePoint {
  votesAdded: number;
  alphaFlipTop: number; // alpha_flip on the (rank-1, rank-2) pair after this many adds
}

export interface SamplerCurves {
  uniform: SamplerCurvePoint[];
  info: SamplerCurvePoint[];
  influence: SamplerCurvePoint[];
}

interface SimulateOpts {
  budget?: number;
  step?: number;
  seed?: number;
  // Pair to track. Defaults to the rank-1 vs rank-2 pair from the initial fit.
  pair?: [number, number];
}

function topPair(fit: BTFit): [number, number] {
  const order = Array.from({ length: fit.n }, (_, i) => i);
  order.sort((a, b) => fit.beta[b] - fit.beta[a]);
  return [order[0], order[1]];
}

function pairWeights(
  fit: BTFit,
  votes: Vote[],
  i: number,
  j: number,
  kind: SamplerKind,
): Float64Array {
  const n = fit.n;
  const out = new Float64Array((n * (n - 1)) / 2);

  if (kind === "uniform") {
    out.fill(1);
    return out;
  }

  // For info and influence we need pair-level signals.
  // Info gain: prefer pairs with predicted P(win) close to 0.5 AND few existing battles.
  // Influence gain: prefer pairs adjacent to the top fragile pair (or with high
  // predicted influence on (i, j) gap).
  const battleCount = new Float64Array((n * (n - 1)) / 2);
  for (const v of votes) {
    const a = Math.min(v.i, v.j);
    const b = Math.max(v.i, v.j);
    const idx = pairIndex(a, b, n);
    battleCount[idx] += v.w ?? 1;
  }

  let p = 0;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const z = fit.beta[a] - fit.beta[b];
      const sig = sigmoid(z);
      const closeness = sig * (1 - sig); // peaks at sig=0.5
      const battles = battleCount[p] + 1;
      if (kind === "info") {
        out[p] = closeness / Math.sqrt(battles);
      } else {
        // influence: focus on pairs whose adjacency to (i, j) makes them
        // structural neighbors. Use Hessian-based proxy: 1 / |beta_a - beta_b|
        // weighted by closeness, plus an explicit boost for the (i, j) pair.
        const gap = Math.abs(fit.beta[a] - fit.beta[b]) + 0.05;
        const boost = (a === i && b === j) || (a === j && b === i) ? 5 : 1;
        out[p] = (closeness / gap / Math.sqrt(battles)) * boost;
      }
      p++;
    }
  }
  // Normalize.
  let sum = 0;
  for (let k = 0; k < out.length; k++) sum += out[k];
  if (sum > 0) for (let k = 0; k < out.length; k++) out[k] /= sum;
  return out;
}

function pairIndex(a: number, b: number, n: number): number {
  // a < b
  return (a * (2 * n - a - 1)) / 2 + (b - a - 1);
}

function samplePair(weights: Float64Array, n: number, rand: () => number): [number, number] {
  let r = rand();
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const idx = pairIndex(a, b, n);
      r -= weights[idx];
      if (r <= 0) return [a, b];
    }
  }
  return [0, 1];
}

// Run a sampler against a starting dataset.
// At each "step" we add `step` synthetic votes, refit BT, and record the
// alpha_flip on the tracked pair. Returns the trajectory.
function runSampler(
  base: Vote[],
  n: number,
  kind: SamplerKind,
  pair: [number, number],
  budget: number,
  step: number,
  seed: number,
): SamplerCurvePoint[] {
  const rand = rng(seed);
  const votes = base.map((v) => ({ ...v }));
  let fit = fitBT(votes, n);
  const points: SamplerCurvePoint[] = [];

  // Initial point.
  const a0 = alphaFlip(fit, votes, pair[0], pair[1], { maxFraction: 0.4 }).alpha;
  points.push({ votesAdded: 0, alphaFlipTop: Number.isFinite(a0) ? a0 : 0.4 });

  let added = 0;
  while (added < budget) {
    const w = pairWeights(fit, votes, pair[0], pair[1], kind);
    for (let s = 0; s < step && added < budget; s++) {
      const [a, b] = samplePair(w, n, rand);
      // Simulate the outcome with current BT.
      const z = fit.beta[a] - fit.beta[b];
      const p = sigmoid(z);
      const r = rand();
      const y = r < p ? 1 : 0;
      votes.push({ i: a, j: b, y });
      added++;
    }
    fit = fitBT(votes, n, { init: fit.beta });
    const a1 = alphaFlip(fit, votes, pair[0], pair[1], { maxFraction: 0.4 }).alpha;
    points.push({ votesAdded: added, alphaFlipTop: Number.isFinite(a1) ? a1 : 0.4 });
  }
  return points;
}

export function simulateAllSamplers(
  base: Vote[],
  n: number,
  opts: SimulateOpts = {},
): SamplerCurves {
  const budget = opts.budget ?? 240;
  const step = opts.step ?? 30;
  const seed = opts.seed ?? 99;

  const fit = fitBT(base, n);
  const pair = opts.pair ?? topPair(fit);

  return {
    uniform: runSampler(base, n, "uniform", pair, budget, step, seed),
    info: runSampler(base, n, "info", pair, budget, step, seed + 1),
    influence: runSampler(base, n, "influence", pair, budget, step, seed + 2),
  };
}

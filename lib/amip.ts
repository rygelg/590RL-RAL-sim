// Approximate Maximum Influence Perturbation (AMIP) for BT-based rankings.
// Per the primary paper, the per-vote influence on the score-difference
//   delta_ij(beta) = beta_i - beta_j
// is approximated by the influence function:
//   phi_k = (e_i - e_j)^T  H^{-1}  grad_k
// where grad_k is the per-vote score (gradient) of -log-likelihood.

import { fitBT, type BTFit, type Vote } from "./bt";
import { sigmoid, solve } from "./math";

export interface InfluenceResult {
  // Per-vote influence on (beta_i - beta_j). Same length as votes.
  // Sign convention: phi[k] > 0 means removing vote k INCREASES (beta_i - beta_j).
  phi: Float64Array;
}

// Compute per-vote influence phi[k] = direction^T H^{-1} grad_k for the
// score-difference target between models i and j.
export function influenceForPair(
  fit: BTFit,
  votes: Vote[],
  i: number,
  j: number,
): InfluenceResult {
  const n = fit.n;
  const dir = new Float64Array(n);
  dir[i] = 1;
  dir[j] = -1;

  // Solve H * u = dir once. Then phi_k = u^T grad_k for each vote.
  const u = solve(fit.hessian, dir, n);

  const phi = new Float64Array(votes.length);
  for (let k = 0; k < votes.length; k++) {
    const v = votes[k];
    const w = v.w ?? 1;
    if (w === 0) {
      phi[k] = 0;
      continue;
    }
    const z = fit.beta[v.i] - fit.beta[v.j];
    const p = sigmoid(z);
    const r = w * (v.y - p);
    // grad_k entry for model a = +r if a==v.i, -r if a==v.j, else 0.
    // phi_k = r * (u[v.i] - u[v.j])
    phi[k] = r * (u[v.i] - u[v.j]);
  }
  return { phi };
}

export interface AlphaFlipResult {
  // Smallest fraction in (0, 1] of votes whose removal flips the sign of
  // (beta_i - beta_j). Infinity if no flip up to maxFraction.
  alpha: number;
  // Number of votes dropped to achieve the flip (corresponds to alpha * N).
  dropped: number;
  // Indices into the votes array that were dropped (sorted by decreasing |phi|).
  droppedIdx: Int32Array;
  // Refit beta after dropping (verification, not approximation).
  betaAfter: Float64Array;
  // Original sign of (beta_i - beta_j); the flip target is -sign.
  signBefore: number;
  // Whether a verified flip was achieved (refit confirms).
  flipped: boolean;
  // Influence-ranked vote indices (full list, used for the histogram).
  rankedByInfluence: Int32Array;
  // Influence values aligned with rankedByInfluence for plotting.
  rankedAbsInfluence: Float64Array;
}

// Greedy AMIP: drop votes ranked by influence in the direction that hurts
// the score-difference, then verify by refitting BT on the remaining votes.
// Uses adaptive search: doubling step until flip is detected, then bisection.
export function alphaFlip(
  fit: BTFit,
  votes: Vote[],
  i: number,
  j: number,
  opts: { maxFraction?: number; verifyEvery?: number; minStep?: number } = {},
): AlphaFlipResult {
  const maxFraction = opts.maxFraction ?? 0.5;
  const minStep = opts.minStep ?? 1;
  const N = votes.length;

  const sBefore = Math.sign(fit.beta[i] - fit.beta[j]) || 1;
  const target = -sBefore;

  const { phi } = influenceForPair(fit, votes, i, j);

  // We want to push (beta_i - beta_j) toward target. Removing vote k changes
  // it by approximately -phi[k]. So we want to remove votes whose phi has the
  // SAME sign as (beta_i - beta_j) currently.
  // Equivalently: rank by sBefore * phi descending.
  const order = new Int32Array(N);
  const score = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    order[k] = k;
    score[k] = sBefore * phi[k]; // larger = removing it helps the flip more
  }
  // Sort indices by score descending.
  const idxArr = Array.from(order);
  idxArr.sort((a, b) => score[b] - score[a]);
  const rankedByInfluence = Int32Array.from(idxArr);
  const rankedAbs = new Float64Array(N);
  for (let r = 0; r < N; r++) rankedAbs[r] = Math.abs(phi[rankedByInfluence[r]]);

  // Helper: refit BT with votes[droppedSet] removed (weight 0).
  const tryDrop = (kDrop: number): { flipped: boolean; betaAfter: Float64Array } => {
    if (kDrop <= 0) {
      return { flipped: false, betaAfter: new Float64Array(fit.beta) };
    }
    const masked = votes.map((v, idx) => ({ ...v }));
    for (let r = 0; r < kDrop; r++) {
      masked[rankedByInfluence[r]].w = 0;
    }
    const refit = fitBT(masked, fit.n, { ridge: fit.ridge, init: fit.beta });
    const flipped = Math.sign(refit.beta[i] - refit.beta[j]) === target;
    return { flipped, betaAfter: refit.beta };
  };

  // Doubling search to find an upper bound where flip occurs.
  let lo = 0;
  let hi = Math.max(minStep, 1);
  let lastBeta: Float64Array = new Float64Array(fit.beta);
  let foundFlip = false;
  const limit = Math.min(N, Math.floor(maxFraction * N));

  while (hi <= limit) {
    const r = tryDrop(hi);
    lastBeta = r.betaAfter;
    if (r.flipped) {
      foundFlip = true;
      break;
    }
    lo = hi;
    hi = Math.min(limit, hi * 2);
    if (hi === lo) break;
  }

  if (!foundFlip) {
    return {
      alpha: Infinity,
      dropped: limit,
      droppedIdx: rankedByInfluence.slice(0, limit),
      betaAfter: lastBeta,
      signBefore: sBefore,
      flipped: false,
      rankedByInfluence,
      rankedAbsInfluence: rankedAbs,
    };
  }

  // Bisection between lo (no flip) and hi (flip).
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const r = tryDrop(mid);
    if (r.flipped) {
      hi = mid;
      lastBeta = r.betaAfter;
    } else {
      lo = mid;
    }
  }

  return {
    alpha: hi / N,
    dropped: hi,
    droppedIdx: rankedByInfluence.slice(0, hi),
    betaAfter: lastBeta,
    signBefore: sBefore,
    flipped: true,
    rankedByInfluence,
    rankedAbsInfluence: rankedAbs,
  };
}

// Random-drop alpha_flip: bisection on the fraction of votes drawn uniformly
// at random whose removal flips the sign. Used to contrast with AMIP and
// motivate the "bootstrap CI vs worst-case" distinction.
export function randomDropAlphaFlip(
  fit: BTFit,
  votes: Vote[],
  i: number,
  j: number,
  rngFn: () => number,
  opts: { maxFraction?: number; trials?: number; resolution?: number } = {},
): { medianAlpha: number; flipped: boolean } {
  const maxFraction = opts.maxFraction ?? 0.5;
  const trials = opts.trials ?? 24;
  const resolution = opts.resolution ?? 12;
  const N = votes.length;
  const sBefore = Math.sign(fit.beta[i] - fit.beta[j]) || 1;
  const target = -sBefore;

  // For each trial: bisect over kDrop using a fixed random subset ordering.
  const flipFracs: number[] = [];
  for (let t = 0; t < trials; t++) {
    const order = new Int32Array(N);
    for (let k = 0; k < N; k++) order[k] = k;
    // Fisher-Yates with seeded rng
    for (let k = N - 1; k > 0; k--) {
      const r = Math.floor(rngFn() * (k + 1));
      const tmp = order[k];
      order[k] = order[r];
      order[r] = tmp;
    }
    const limit = Math.min(N, Math.floor(maxFraction * N));
    let foundAt = Infinity;
    // Linear scan in steps to keep this cheap.
    for (let step = 1; step <= resolution; step++) {
      const k = Math.max(1, Math.floor((limit * step) / resolution));
      const masked = votes.map((v) => ({ ...v }));
      for (let r = 0; r < k; r++) masked[order[r]].w = 0;
      const refit = fitBT(masked, fit.n, { ridge: fit.ridge, init: fit.beta });
      if (Math.sign(refit.beta[i] - refit.beta[j]) === target) {
        foundAt = k / N;
        break;
      }
    }
    flipFracs.push(foundAt);
  }
  flipFracs.sort((a, b) => a - b);
  const median = flipFracs[Math.floor(trials / 2)];
  return {
    medianAlpha: median,
    flipped: Number.isFinite(median),
  };
}

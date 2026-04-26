// Influence-capped BT aggregation. After an initial fit, compute influence of
// every vote on the FULL beta vector (in aggregate L2-norm), zero-weight the
// top-tau fraction, refit. Reduces per-vote leverage without changing the
// optimizer architecture.

import { fitBT, type BTFit, type Vote } from "./bt";
import { sigmoid, solve } from "./math";

export interface CappedFitResult {
  fit: BTFit;
  // Boolean mask of votes that were capped (weight set to 0).
  cappedMask: Uint8Array;
  // Aggregate per-vote influence magnitude used for capping.
  influenceMag: Float64Array;
  // Threshold used (L2 norm of phi_k above which votes are dropped).
  threshold: number;
}

// Aggregate per-vote influence: ||H^{-1} grad_k||_2.
// We compute it efficiently by solving once per "hot" model only when needed,
// but for n up to ~16 we just solve H * U = I (n column solves) and then
// phi_k = ||U * grad_k||_2.
function aggregateInfluence(fit: BTFit, votes: Vote[]): Float64Array {
  const n = fit.n;
  const cols: Float64Array[] = [];
  for (let c = 0; c < n; c++) {
    const e = new Float64Array(n);
    e[c] = 1;
    cols.push(solve(fit.hessian, e, n));
  }
  // U[a][b] = (H^{-1})[a, b]
  const phiMag = new Float64Array(votes.length);
  for (let k = 0; k < votes.length; k++) {
    const v = votes[k];
    const w = v.w ?? 1;
    if (w === 0) {
      phiMag[k] = 0;
      continue;
    }
    const z = fit.beta[v.i] - fit.beta[v.j];
    const p = sigmoid(z);
    const r = w * (v.y - p);
    // grad_k has +r at v.i and -r at v.j.
    // (H^{-1} grad_k)[a] = r * (U[v.i][a] - U[v.j][a]).
    // We want the L2 norm of this vector.
    let s2 = 0;
    for (let a = 0; a < n; a++) {
      const d = cols[v.i][a] - cols[v.j][a];
      s2 += d * d;
    }
    phiMag[k] = Math.abs(r) * Math.sqrt(s2);
  }
  return phiMag;
}

// Cap the top-tau fraction of votes by influence magnitude. tau in [0, 1].
export function capAndRefit(
  votes: Vote[],
  n: number,
  tau: number,
  ridge = 0.01,
): CappedFitResult {
  const baseFit = fitBT(votes, n, { ridge });
  if (tau <= 0) {
    return {
      fit: baseFit,
      cappedMask: new Uint8Array(votes.length),
      influenceMag: new Float64Array(votes.length),
      threshold: Infinity,
    };
  }
  const phiMag = aggregateInfluence(baseFit, votes);
  // Find threshold as the (1 - tau) quantile.
  const sorted = Float64Array.from(phiMag).sort();
  const idx = Math.min(sorted.length - 1, Math.floor((1 - tau) * sorted.length));
  const threshold = sorted[idx];
  const cappedMask = new Uint8Array(votes.length);
  const reweighted = votes.map((v, k) => {
    if (phiMag[k] >= threshold && phiMag[k] > 0) {
      cappedMask[k] = 1;
      return { ...v, w: 0 };
    }
    return { ...v };
  });
  const refit = fitBT(reweighted, n, { ridge, init: baseFit.beta });
  return { fit: refit, cappedMask, influenceMag: phiMag, threshold };
}

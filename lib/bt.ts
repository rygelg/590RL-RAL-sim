// Bradley-Terry MLE via Newton-Raphson with a small L2 prior for stability.
// Logistic-regression form: l(beta) = sum_k [ y_k * (b_i - b_j) - log(1 + exp(b_i - b_j)) ].
// Reference: https://www.parasdahal.com/notes/bradley-terry-model

import { invDiag, sigmoid, solve, type Mat, type Vec } from "./math";

export interface Vote {
  i: number; // model_a index
  j: number; // model_b index
  y: number; // 1 if i beats j, 0 if j beats i, 0.5 if tie
  w?: number; // optional per-vote weight (used for influence-capped fits)
}

export interface BTFit {
  beta: Float64Array; // log-strength per model
  nll: number; // negative log-likelihood at MLE (includes prior)
  hessian: Mat; // observed Fisher information (Hessian of -ll), used for CI + influence
  n: number; // number of models
  ridge: number; // L2 penalty used
}

export interface BTConfig {
  tol?: number;
  maxIter?: number;
  ridge?: number; // L2 penalty per coefficient (small, for stability)
  init?: Float64Array;
}

// Newton-Raphson MLE. Pinned: beta_0 = 0 (identifiability) by adding a strong
// L2 ridge to the first coordinate.
export function fitBT(votes: Vote[], n: number, cfg: BTConfig = {}): BTFit {
  const tol = cfg.tol ?? 1e-7;
  const maxIter = cfg.maxIter ?? 50;
  const ridge = cfg.ridge ?? 0.01;

  const beta = cfg.init ? new Float64Array(cfg.init) : new Float64Array(n);
  const grad = new Float64Array(n);
  const H = new Float64Array(n * n);

  let prevNll = Infinity;
  let nll = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    grad.fill(0);
    H.fill(0);
    nll = 0;

    for (let k = 0; k < votes.length; k++) {
      const v = votes[k];
      const w = v.w ?? 1;
      if (w === 0) continue;
      const z = beta[v.i] - beta[v.j];
      const p = sigmoid(z); // P(i beats j)
      const r = v.y - p; // residual (positive when i over-performs)
      grad[v.i] += w * r;
      grad[v.j] -= w * r;
      const wpq = w * p * (1 - p); // Hessian weight
      H[v.i * n + v.i] += wpq;
      H[v.j * n + v.j] += wpq;
      H[v.i * n + v.j] -= wpq;
      H[v.j * n + v.i] -= wpq;
      // negative log-likelihood contribution: -[y*z - log(1+e^z)]
      // log(1+e^z) computed stably below
      const lse = z > 35 ? z : z < -35 ? Math.exp(z) : Math.log1p(Math.exp(z));
      nll += w * (lse - v.y * z);
    }

    // L2 prior. Strong on coord 0 to anchor identifiability, light on the rest.
    for (let a = 0; a < n; a++) {
      const lam = a === 0 ? ridge + 100 : ridge;
      grad[a] -= lam * beta[a];
      H[a * n + a] += lam;
      nll += 0.5 * lam * beta[a] * beta[a];
    }

    if (Math.abs(prevNll - nll) < tol) break;
    prevNll = nll;

    // Newton step: H * delta = grad. We're maximizing log-lik so beta += delta.
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

  // Recompute the Hessian at the final beta for use downstream.
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

  return { beta, nll, hessian: H, n, ridge };
}

// 95% normal-approximation CI half-widths from sqrt(diag(H^{-1})).
export function btCI(fit: BTFit): { lower: Float64Array; upper: Float64Array; sd: Float64Array } {
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

// Convert BT log-strength to Elo (zero-mean), matching Chatbot Arena's display layer.
// Elo_i = 1000 + 400 * (beta_i - mean(beta)) / log(10)
export function toElo(beta: Float64Array, base = 1000): Float64Array {
  let mean = 0;
  for (let a = 0; a < beta.length; a++) mean += beta[a];
  mean /= beta.length;
  const k = 400 / Math.log(10);
  const out = new Float64Array(beta.length);
  for (let a = 0; a < beta.length; a++) out[a] = base + k * (beta[a] - mean);
  return out;
}

// Returns the rank of each model (1 = best, by descending beta).
export function rankFromBeta(beta: Float64Array): Int32Array {
  const n = beta.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((a, b) => beta[b] - beta[a]);
  const rank = new Int32Array(n);
  for (let r = 0; r < n; r++) rank[idx[r]] = r + 1;
  return rank;
}

export function orderFromBeta(beta: Float64Array): number[] {
  const n = beta.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((a, b) => beta[b] - beta[a]);
  return idx;
}

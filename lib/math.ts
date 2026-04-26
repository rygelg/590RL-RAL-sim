// Tiny linear algebra helpers used by BT MLE and AMIP influence scoring.
// All matrices are row-major dense. Sized for 12 to 100 rows max.

export type Vec = Float64Array;
export type Mat = Float64Array; // row-major, n x n

export function zeros(n: number): Vec {
  return new Float64Array(n);
}

export function eye(n: number, scale = 1): Mat {
  const m = new Float64Array(n * n);
  for (let i = 0; i < n; i++) m[i * n + i] = scale;
  return m;
}

export function copyMat(a: Mat): Mat {
  return new Float64Array(a);
}

// Solves H x = b where H is symmetric positive-definite via Cholesky.
// Mutates H. Returns x.
export function choleskySolve(H: Mat, b: Vec, n: number): Vec {
  // In-place Cholesky: L lower-triangular, H -> L (overwrites)
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
  // Forward substitute L y = b
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let v = b[i];
    for (let k = 0; k < i; k++) v -= H[i * n + k] * y[k];
    y[i] = v / H[i * n + i];
  }
  // Back substitute L^T x = y
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let v = y[i];
    for (let k = i + 1; k < n; k++) v -= H[k * n + i] * x[k];
    x[i] = v / H[i * n + i];
  }
  return x;
}

// Returns the diagonal of H^{-1} where H is symmetric positive-definite.
// Used for variance estimates of beta_hat.
export function invDiag(H: Mat, n: number): Vec {
  const out = new Float64Array(n);
  const e = new Float64Array(n);
  // Cholesky factor of a copy so we can solve repeatedly without re-factoring.
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
    // Forward
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let v = e[i];
      for (let k = 0; k < i; k++) v -= L[i * n + k] * y[k];
      y[i] = v / L[i * n + i];
    }
    // Back
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

// Sigmoid in numerically stable form.
export function sigmoid(x: number): number {
  if (x >= 0) {
    const ez = Math.exp(-x);
    return 1 / (1 + ez);
  }
  const ez = Math.exp(x);
  return ez / (1 + ez);
}

// log(1 + exp(x)) without overflow.
export function softplus(x: number): number {
  if (x > 35) return x;
  if (x < -35) return Math.exp(x);
  return Math.log1p(Math.exp(x));
}

// Solves a single linear system H x = b. Does NOT mutate H.
export function solve(H: Mat, b: Vec, n: number): Vec {
  return choleskySolve(copyMat(H), b, n);
}

// Mulberry32 deterministic PRNG so synthetic data is reproducible across reloads.
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

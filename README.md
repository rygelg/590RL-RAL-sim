# RAL · Robustness-Aware LLM Leaderboards

An interactive playground that demonstrates the project at the heart of our MGMT 590 final paper: **diagnosing and repairing the statistical fragility of Arena-style LLM leaderboards**.

> Two preferences out of 57,477 — 0.003% of votes — is enough to flip the top-ranked LLM on Chatbot Arena. Bootstrap confidence intervals don't catch it. We built the leaderboard that does.

Primary paper: [Huang, Burt, Hutter & Broderick (2025) — *Dropping Just a Handful of Preferences Can Change Top Large Language Model Rankings*](https://arxiv.org/abs/2508.11847)
Context paper: [Singh et al. (2025) — *The Leaderboard Illusion*](https://arxiv.org/abs/2504.20879)

Team: Vikhyat Yashvanth Koppal · Lichen Mao · Rygel Ginete

---

## What the playground does

A single scrolled page with one heavy interactive demo at the center:

1. **Hero** — the headline number, motivation, and stat strip.
2. **Primer** — Bradley–Terry in 30 seconds, animated battle to score with the BT formula in KaTeX.
3. **Two failure modes** — statistical fragility (Huang et al.) plus systemic bias (Singh et al.) with mini visualizations of the published numbers.
4. **The killer demo** — a 12-model real Chatbot Arena leaderboard. Drag a slider to pick a drop fraction α; pick AMIP worst-case dropping vs uniform-random dropping; toggle Vanilla vs Influence-capped BT; switch between real Arena votes (default) and a synthetic MT-Bench foil. The leaderboard re-fits in real time, rows reorder via spring physics, the influence histogram lights up the dropped subset, and an `α_flip` column tells you which adjacent ranks are fragile, moderate, or robust.
5. **The proposal** — three RAL components (robustness intervals, influence-gain sampling, influence-capped BT) with an inline Recharts "sampler race" that simulates uniform vs info-gain vs influence-gain on a fresh synthetic dataset.
6. **Evaluation plan** — the three claims (C1 calibration, C2 sampling efficiency, C3 robust aggregation) we'll test against `arena-human-preference-140k`.
7. **Real LMSYS leaderboard panel** — opens from inside the demo. Read-only snapshot of the current Chatbot Arena leaderboard for context.
8. **Credits & papers**.

All BT MLE, AMIP influence scoring, and α_flip binary search runs **client-side in TypeScript**, in single-digit milliseconds. No backend, no API routes, no env vars.

---

## Quick start

```bash
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000).

To refresh the precomputed real-arena dataset from HuggingFace
(`lmarena-ai/arena-human-preference-140k`):

```bash
npm run prepare-arena
```

This downloads only the `model_a`, `model_b`, `winner` columns from each
parquet shard via HTTP range reads (so it's fast — under 10 seconds with a
warm cache), fits a Bradley–Terry model on the votes between the top-12 and
top-20 most-active models offline, and writes:

- `data/arena-real-playground.json` — the 12-model, 3,000-vote subsample
  consumed by the playground and the live evaluation cards.
- `data/arena-real-snapshot.json` — the 20-model fit (β, CI, battles).
- `data/leaderboard-snapshot.json` — the same 20-model fit, in the shape
  consumed by the "Real Arena snapshot" panel UI.

These outputs are committed to the repo, so deploys never depend on
upstream availability. There is also a legacy `npm run prepare-data` for
fetching the LMSYS leaderboard snapshot directly (kept for reference).

---

## Deploy to Vercel

Zero configuration:

```bash
vercel --prod
```

Or click the button:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-team/ral-playground)

The whole app is a static-friendly Next.js 14 build (`output: standalone`-compatible). No environment variables, no database, no server-side compute.

---

## Project layout

```
app/
  layout.tsx            Root layout with Inter + JetBrains Mono fonts
  page.tsx              Single scrolled page; assembles all sections
  globals.css           Design tokens (dark theme, glass, accents)
components/
  Hero.tsx              Opening, headline, stat strip
  Primer.tsx            BT formula + animated battle flow + section helper
  FailureModes.tsx      Two cards: fragility + systemic bias
  Playground.tsx        Killer interactive demo (state, controls, panels)
  FragilityBar.tsx      Per-pair α_flip bar + status helpers
  RAL.tsx               Three-component proposal cards
  SamplerRace.tsx       Recharts line chart for the three samplers
  Evaluation.tsx        C1 / C2 / C3 claim cards
  Credits.tsx           Team + papers + dataset links
  StatCounter.tsx       Reusable count-up number
lib/
  math.ts               Cholesky solve, sigmoid, deterministic PRNG
  bt.ts                 Bradley-Terry MLE via Newton-Raphson + 95% CI
  amip.ts               Per-vote influence + α_flip binary search + verification
  cap.ts                Influence-capped BT aggregation
  synthetic.ts          Real-arena loader (default) + synthetic MT-Bench foil
  sampler.ts            Three samplers (uniform / info / influence)
data/
  snapshot.json                    Published-finding callouts from the slide deck
  arena-real-playground.json       Real top-12 Arena dataset (3k-vote subsample)
  arena-real-snapshot.json         Real top-20 Arena BT fit (β, CI, battles)
  leaderboard-snapshot.json        Same top-20 fit, UI-ready shape
scripts/
  prepare-arena-140k.mts           Precompute all real-arena outputs (HF fetch + BT fit)
  probe-scenarios.ts               Empirically probe the four playground scenarios
  prepare-leaderboard.ts           Legacy LMSYS leaderboard fetch (still works)
types/
  react-katex.d.ts      Type shim
```

---

## Design notes

- **Dark, restrained, research-paper aesthetic.** Near-black background, glass surfaces, three accent colors with semantic meaning: cyan (neutral), amber (fragile), emerald (robust). Numbers always in JetBrains Mono with tabular figures.
- **Motion serves understanding.** Spring-animated rank reorders. Layout transitions on slider drag use `framer-motion`'s `layout` prop, deferred via `useDeferredValue` so the slider stays responsive.
- **No cargo-culted complexity.** No state library, no animation gimmicks, no decorative chrome. Every animated element has a job.
- **Reproducibility.** All synthetic data is seeded. Refreshing the page returns identical numbers. The deterministic PRNG is a Mulberry32.

---

## What this playground does *not* do

- It does **not** bundle the full 140k-vote Arena dataset; we ship a 3,000-vote real subsample of the votes between the top-12 most-active models, plus the 20-model Bradley-Terry fit derived from the larger 37k-vote subset between the top-20. The full-dataset experiments are described in the "stress-testing" section and run offline via `scripts/prepare-arena-140k.mts`.
- It does **not** address adversarial vote rigging (Huang et al. 2025b; Min et al. 2025), prompt-conditional rankings (P2L), or judge heterogeneity. These are flagged as future work in our written report.
- It does **not** require any API keys, accounts, or environment variables. Click and play.

---

## Performance

| Operation | 12 models, 3000 votes | Notes |
|-----------|----------------------|-------|
| BT MLE fit | ~3 ms | Newton-Raphson, 5–10 iterations |
| AMIP per-pair α_flip | ~30 ms | Binary search with verification refits |
| Slider drag refit | ~6 ms | Single BT refit, debounced via `useDeferredValue` |
| Per-vote influence | ~1 ms | One Hessian solve, then dot products |

The whole heavy compute (`computeHeavy`) runs in well under 500 ms on every preset/estimator change. The slider's `computeLight` runs in single-digit milliseconds and is non-blocking thanks to React's deferred-value rendering.

---

## License

MIT. Built for educational purposes as a teaching artifact.

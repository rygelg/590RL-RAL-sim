"use client";

import { SectionHeader } from "./Primer";
import { EvalLive, type ClaimMeta } from "./EvalLive";

const claims: ClaimMeta[] = [
  {
    id: "C1",
    title: "Calibration",
    component: "Robustness intervals",
    statement:
      "α_flip is well-calibrated. Pairs the audit flags as fragile actually flip easier than randomly-perturbed pairs.",
    liveTest:
      "Compute α_flip on the top 5 adjacent pairs under AMIP and under uniform-random drop. AMIP should win on every pair.",
    offlineTest:
      "Train / held-out split on 140k · predict α_flip on train · verify on held-out.",
  },
  {
    id: "C2",
    title: "Sampling efficiency",
    component: "Influence-gain sampling",
    statement:
      "Influence-gain sampling reaches a target α_flip with fewer new votes than information-gain or uniform sampling.",
    liveTest:
      "From the same starting BT fit, each sampler queues 30 matchups its way; we draw each outcome as Bernoulli at σ(β_a−β_b), append, warm-restart BT, and recompute α_flip on the top pair. Repeat 6× for a 180-vote budget — the line that climbs fastest wins.",
    offlineTest:
      "Simulate three samplers on 140k · measure votes-to-target curves on the slowest-tightening pairs.",
  },
  {
    id: "C3",
    title: "Robust aggregation",
    component: "Influence-capped BT",
    statement:
      "Influence-capped BT yields a fit with higher α_flip than vanilla BT, at no cost in held-out predictive log-likelihood.",
    liveTest:
      "Cap the top 0.1% of votes by aggregate AMIP influence, refit BT, recompute α_flip on the top 5 adjacent pairs.",
    offlineTest:
      "Refit both estimators on 140k · compare log-likelihood and α_flip distributions head-to-head.",
  },
];

export function Evaluation() {
  return (
    <section className="px-6 sm:px-10 lg:px-20 py-24 max-w-7xl mx-auto">
      <SectionHeader
        eyebrow="Stress-testing the loop"
        title="Three claims, three live verdicts"
        body={`The loop above only matters if the claims behind it hold. Each component (C1 audit, C2 sampler, C3 fit) maps 1:1 to a testable claim with the same number. The full validation runs offline on the entire lmarena-ai/arena-human-preference-140k dataset; the same code, on a 1.5k-vote real-arena subsample bundled in this app, executes here in your browser the moment you scroll.`}
      />
      <EvalLive claims={claims} />
    </section>
  );
}

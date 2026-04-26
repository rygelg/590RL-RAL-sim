"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Shield } from "lucide-react";
import snapshot from "@/data/snapshot.json";
import { SectionHeader } from "./Primer";

export function FailureModes() {
  const fragility = snapshot.robustnessGap;
  const failures = snapshot.systemicFailures;

  return (
    <section className="px-6 sm:px-10 lg:px-20 py-24 max-w-7xl mx-auto">
      <SectionHeader
        eyebrow="Two failure modes"
        title="Statistical fragility meets systemic bias"
        body="Arena-style leaderboards face two independent reasons to doubt the number on screen. Both happen at the same time. Both compound."
      />

      <div className="grid lg:grid-cols-2 gap-6 mt-14">
        {/* Failure mode 1: fragility */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="glass rounded-2xl p-7 lg:p-9 relative overflow-hidden"
        >
          <div className="flex items-center gap-2 mb-5">
            <AlertTriangle className="w-4 h-4 text-accent-amber" />
            <span className="text-[11px] uppercase tracking-[0.18em] text-accent-amber num">
              Fragility · Huang et al. 2025
            </span>
          </div>
          <h3 className="text-2xl lg:text-3xl font-semibold mb-2">
            Removing 0.003% of votes flips the #1 LLM
          </h3>
          <p className="text-white/55 leading-relaxed mt-3 mb-7">
            Two preferences out of 57,477. AMIP catches it. Bootstrap CIs miss
            it because they assume IID resampling, not adversarial removal.
          </p>

          {/* Fragility bar comparison */}
          <div className="space-y-3 mt-6">
            {fragility.map((f) => (
              <FragilityScale key={f.platform} platform={f.platform} pct={f.alphaFlipPercent} />
            ))}
          </div>

          <div className="mt-7 text-xs text-white/40 num">
            Source: arXiv:2508.11847
          </div>
        </motion.div>

        {/* Failure mode 2: systemic */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="glass rounded-2xl p-7 lg:p-9 relative overflow-hidden"
        >
          <div className="flex items-center gap-2 mb-5">
            <Shield className="w-4 h-4 text-accent-violet" />
            <span className="text-[11px] uppercase tracking-[0.18em] text-accent-violet num">
              Governance · Singh et al. 2025
            </span>
          </div>
          <h3 className="text-2xl lg:text-3xl font-semibold mb-2">
            The Leaderboard Illusion
          </h3>
          <p className="text-white/55 leading-relaxed mt-3 mb-7">
            An audit of {snapshot.dataAsymmetry.audit}. The system itself is
            biased upstream of any statistical fragility — and the two compound.
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            {failures.map((f, i) => (
              <FailureTile
                key={i}
                stat={f.stat}
                statLabel={f.stat_label}
                detail={f.detail}
              />
            ))}
          </div>

          <div className="mt-7 text-xs text-white/40 num">
            Source: arXiv:2504.20879
          </div>
        </motion.div>
      </div>

      {/* Bridge sentence */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.5 }}
        className="mt-12 max-w-3xl mx-auto text-center text-white/55 text-lg leading-relaxed text-pretty"
      >
        These are not independent problems. Selective reporting introduces
        extreme data points; those are precisely the votes AMIP flags as
        high-leverage. Treat α as your{" "}
        <span className="text-white/85">noise budget</span> — the share of
        votes you'd consider unreliable for any reason: voter disagreement,
        prompt drift, rater inconsistency, bot-vote filtering, or selective
        reporting.{" "}
        <span className="text-white/85">
          In the playground below, you'll do the experiment yourself: pick a
          regime, pick how that noise is distributed, then drag α and watch
          the rank flip.
        </span>
      </motion.div>
    </section>
  );
}

function FragilityScale({
  platform,
  pct,
}: {
  platform: string;
  pct: number;
}) {
  // Map percent (0..100) to a log fill so 0.003 vs 18.1 both render meaningfully.
  const log = Math.log10(Math.max(0.0001, pct));
  const tFill = Math.max(0.05, Math.min(1, (log + 4) / 6));
  const isFragile = pct < 1;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm text-white/80">{platform}</span>
        <span
          className={`num text-sm tabular-nums ${
            isFragile ? "text-accent-rose" : "text-accent-emerald"
          }`}
        >
          {pct < 1 ? `${pct.toFixed(3)}%` : `${pct.toFixed(1)}%`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden border border-white/5">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${tFill * 100}%` }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className={`h-full ${
            isFragile
              ? "bg-gradient-to-r from-amber-400/40 to-rose-500/70"
              : "bg-gradient-to-r from-emerald-400/40 to-emerald-500/70"
          }`}
        />
      </div>
    </div>
  );
}

function FailureTile({
  stat,
  statLabel,
  detail,
}: {
  stat: string;
  statLabel: string;
  detail: string;
}) {
  return (
    <div className="bg-ink-950/60 rounded-xl border border-white/5 px-4 py-3.5 hover:border-white/10 transition-colors">
      <div className="num text-2xl font-semibold text-white/95">{stat}</div>
      <div className="text-[11px] uppercase tracking-wider text-accent-violet/80 mt-0.5">
        {statLabel}
      </div>
      <div className="text-xs text-white/50 mt-2 leading-relaxed">{detail}</div>
    </div>
  );
}

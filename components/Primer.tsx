"use client";

import { BlockMath, InlineMath } from "react-katex";
import { motion } from "framer-motion";

export function Primer() {
  return (
    <section className="px-6 sm:px-10 lg:px-20 py-24 max-w-7xl mx-auto">
      <SectionHeader
        eyebrow="Primer"
        title="Bradley–Terry, in 30 seconds"
        body="Most leaderboards (Chatbot Arena, RewardBench, MT-Bench) compress millions of pairwise battles into one number per model. Here is how that compression works."
      />

      <div className="grid lg:grid-cols-2 gap-10 mt-14">
        {/* Left: Animated battle */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="glass rounded-2xl p-7 lg:p-9 relative overflow-hidden"
        >
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/40 mb-5">
            How a vote becomes a score
          </div>
          <BattleFlow />
        </motion.div>

        {/* Right: Math */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="glass rounded-2xl p-7 lg:p-9 flex flex-col gap-5"
        >
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
            The model
          </div>
          <p className="text-white/70 leading-relaxed">
            Each model <InlineMath math="i" /> gets a latent strength{" "}
            <InlineMath math="\beta_i" />. The probability that <InlineMath math="i" />{" "}
            beats <InlineMath math="j" /> is logistic in the gap.
          </p>
          <div className="bg-ink-950/60 rounded-xl py-5 px-5 border border-white/5">
            <BlockMath math={"P(i \\succ j) = \\frac{e^{\\beta_i}}{e^{\\beta_i} + e^{\\beta_j}} = \\sigma(\\beta_i - \\beta_j)"} />
          </div>
          <p className="text-white/70 leading-relaxed">
            Estimate <InlineMath math="\hat{\beta}" /> by maximum likelihood over
            millions of votes. Equivalent to logistic regression on a one-hot
            design. Convergent in seconds.
          </p>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <FactPill label="Wide gaps" value="Robust ranks" tone="emerald" />
            <FactPill label="Narrow gaps" value="Fragile ranks" tone="amber" />
          </div>
          <p className="text-xs text-white/40 leading-relaxed mt-1">
            Below in the playground, the <span className="text-white/65">Dataset preset</span> lever
            switches between real Chatbot Arena votes (narrow gaps, real
            raters) and a synthetic MT-Bench foil (wide gaps, no raters).
          </p>
        </motion.div>
      </div>
    </section>
  );
}

function BattleFlow() {
  const steps = [
    { num: "01", title: "Prompt", body: "User submits a question to two anonymous models, A and B." },
    { num: "02", title: "Two responses", body: "Both responses appear side-by-side, models hidden." },
    { num: "03", title: "Vote", body: "User picks: A wins, B wins, or tie." },
    { num: "04", title: "BT fit", body: "All votes go into one MLE. Each model gets a single score." },
  ];
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <motion.div
          key={s.num}
          initial={{ opacity: 0, x: -8 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: 0.08 * i }}
          className="flex items-start gap-4 p-3 rounded-lg hover:bg-white/[0.02] transition-colors"
        >
          <div className="num text-[11px] text-accent-cyan/80 mt-0.5 tracking-widest tabular-nums">
            {s.num}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white/90 font-medium">{s.title}</div>
            <div className="text-white/50 text-sm mt-0.5">{s.body}</div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function FactPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "amber";
}) {
  const cls = tone === "emerald" ? "text-accent-emerald" : "text-accent-amber";
  return (
    <div className="bg-ink-950/60 rounded-lg border border-white/5 px-3.5 py-3">
      <div className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className={`text-sm font-medium mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="max-w-3xl">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.4 }}
        className="text-[11px] uppercase tracking-[0.18em] text-accent-cyan/80 mb-4 num"
      >
        {eyebrow}
      </motion.div>
      <motion.h2
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.55, delay: 0.05 }}
        className="text-display-2 font-semibold text-balance"
      >
        {title}
      </motion.h2>
      {body && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: 0.12 }}
          className="text-white/55 mt-5 text-lg leading-relaxed text-pretty max-w-2xl"
        >
          {body}
        </motion.p>
      )}
    </div>
  );
}

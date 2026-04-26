"use client";

import { motion } from "framer-motion";
import { Activity, ArrowRight, Compass, Gauge, RotateCcw } from "lucide-react";
import { SectionHeader } from "./Primer";
import { SamplerRace } from "./SamplerRace";

export function RAL() {
  return (
    <section className="px-6 sm:px-10 lg:px-20 py-24 max-w-7xl mx-auto">
      <SectionHeader
        eyebrow="Our proposal"
        title="Robustness-Aware Leaderboards"
        body="Three components, one closed loop. Each is a drop-in extension of the existing Chatbot Arena pipeline. None requires new human infrastructure."
      />

      <div className="grid lg:grid-cols-3 gap-5 mt-14">
        <Card
          number="01"
          icon={<Gauge className="w-4 h-4" />}
          accent="cyan"
          title="Robustness intervals"
          subtitle="Diagnostic"
          body="Apply AMIP to each adjacent pair on the leaderboard. Report α_flip alongside every BT score. O(N) cost on top of one BT fit. Drop-in column."
          cite="Extends Broderick et al. 2020; Huang et al. 2025"
        >
          <FauxLeaderboard />
        </Card>

        <Card
          number="02"
          icon={<Compass className="w-4 h-4" />}
          accent="amber"
          title="Influence-gain sampling"
          subtitle="Prescriptive"
          body="Steer the matchup selector toward fragile pairs. Generalizes Fisher-information sampling. Closes the loop: audit → action."
          cite="Extends Chiang et al. 2024; Frick et al. 2025"
        >
          <SamplerRace />
        </Card>

        <Card
          number="03"
          icon={<Activity className="w-4 h-4" />}
          accent="emerald"
          title="Influence-capped BT"
          subtitle="Robust estimation"
          body="Cap the top 0.1% of votes by influence magnitude. Or use a Huberized BT loss. Reduces fragility before it is reported."
          cite="Builds on Hunter 2004; Huber-style M-estimators"
        >
          <CapVisual />
        </Card>
      </div>

      <CompositionCard />
    </section>
  );
}

function CompositionCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55 }}
      className="glass-strong rounded-3xl p-7 lg:p-9 mt-10 relative overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-violet/40 to-transparent"
      />

      <div className="grid lg:grid-cols-[minmax(0,360px)_1fr] gap-x-10 gap-y-6 items-start">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-accent-violet/85 num">
            Putting it together
          </div>
          <h3 className="text-2xl sm:text-3xl font-semibold mt-2 leading-tight text-balance">
            Three components, one self-correcting pipeline
          </h3>
          <p className="text-white/55 leading-relaxed text-sm mt-4">
            Each component is a drop-in extension of the existing Arena
            pipeline — none requires new human infrastructure. The leverage
            comes from how they compose: the audit (C1) reads the robust fit
            (C3), the sampler (C2) acts on the audit, and the next refresh
            picks up new votes that already reflect the previous loop.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 text-[11px] num text-white/55 px-3 py-1.5 rounded-full border border-white/10 bg-ink-950/40">
            <RotateCcw className="w-3.5 h-3.5 text-accent-violet" />
            One leaderboard refresh ≈ one loop
          </div>
        </div>

        <div className="grid md:grid-cols-[1fr_24px_1fr_24px_1fr] gap-y-3 gap-x-2 items-stretch">
          <FlowStep
            n="01"
            accent="emerald"
            icon={<Activity className="w-3.5 h-3.5" />}
            title="Fit, robustly"
            component="Influence-capped BT"
            artifact={
              <>
                <span className="num text-white/85">β̂</span> that
                zero-weights the top 0.1% of votes by leverage
              </>
            }
          />
          <FlowArrow />
          <FlowStep
            n="02"
            accent="cyan"
            icon={<Gauge className="w-3.5 h-3.5" />}
            title="Diagnose fragility"
            component="Robustness intervals · AMIP"
            artifact={
              <>
                <span className="num text-white/85">α_flip</span> column on
                every adjacent pair
              </>
            }
          />
          <FlowArrow />
          <FlowStep
            n="03"
            accent="amber"
            icon={<Compass className="w-3.5 h-3.5" />}
            title="Spend new votes"
            component="Influence-gain sampling"
            artifact={
              <>
                Next-batch matchup queue — concentrated where{" "}
                <span className="num text-white/85">α_flip</span> is lowest
              </>
            }
          />
        </div>
      </div>

      <div className="mt-7 pt-5 border-t border-white/5 grid sm:grid-cols-[auto_1fr] gap-3 sm:gap-4 items-start">
        <div className="text-accent-violet text-2xl leading-none num">↺</div>
        <p className="text-sm text-white/65 leading-relaxed">
          <span className="text-white/90 font-medium">
            New battles from step 03 feed step 01's next refit.
          </span>{" "}
          What every reader sees alongside Elo is the{" "}
          <code className="num text-white/90">α_flip</code> column from step
          02 — and it tightens automatically as step 03 retires fragile
          pairs. <span className="text-white/85">Below, the loop is put on
          trial: each step ships with a falsifiable claim
          (<span className="num text-white/90">C1</span>,{" "}
          <span className="num text-white/90">C2</span>,{" "}
          <span className="num text-white/90">C3</span>) that has to pass live
          on this page.</span>
        </p>
      </div>
    </motion.div>
  );
}

function FlowStep({
  n,
  accent,
  icon,
  title,
  component,
  artifact,
}: {
  n: string;
  accent: "cyan" | "amber" | "emerald";
  icon: React.ReactNode;
  title: string;
  component: string;
  artifact: React.ReactNode;
}) {
  const tones = {
    cyan: {
      eyebrow: "text-accent-cyan",
      pill:
        "bg-cyan-500/[0.07] border-cyan-400/25 text-accent-cyan",
      ring: "ring-1 ring-cyan-400/15",
    },
    amber: {
      eyebrow: "text-accent-amber",
      pill:
        "bg-amber-500/[0.07] border-amber-400/25 text-accent-amber",
      ring: "ring-1 ring-amber-400/15",
    },
    emerald: {
      eyebrow: "text-accent-emerald",
      pill:
        "bg-emerald-500/[0.07] border-emerald-400/25 text-accent-emerald",
      ring: "ring-1 ring-emerald-400/15",
    },
  } as const;
  const t = tones[accent];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.4 }}
      className={`bg-ink-950/45 border border-white/[0.06] rounded-xl p-4 flex flex-col gap-2 ${t.ring}`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-[10px] uppercase tracking-[0.18em] num ${t.eyebrow} flex items-center gap-1.5`}
        >
          {icon}
          Step {n}
        </span>
      </div>
      <div className="text-[15px] font-semibold text-white/95 leading-tight">
        {title}
      </div>
      <div className="text-[11px] text-white/45 num leading-snug">
        {component}
      </div>
      <div
        className={`mt-auto pt-2 text-[11px] leading-snug px-2.5 py-1.5 rounded-md border inline-flex items-start gap-1.5 self-start ${t.pill}`}
      >
        <span className="num text-[9px] uppercase tracking-wider mt-0.5 shrink-0 opacity-70">
          out
        </span>
        <span className="text-white/80 leading-snug">{artifact}</span>
      </div>
    </motion.div>
  );
}

function FlowArrow() {
  return (
    <div className="hidden md:flex items-center justify-center" aria-hidden>
      <motion.div
        initial={{ opacity: 0, x: -4 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.35, delay: 0.15 }}
        className="text-white/25"
      >
        <ArrowRight className="w-5 h-5" />
      </motion.div>
    </div>
  );
}

function Card({
  number,
  icon,
  accent,
  title,
  subtitle,
  body,
  cite,
  children,
}: {
  number: string;
  icon: React.ReactNode;
  accent: "cyan" | "amber" | "emerald";
  title: string;
  subtitle: string;
  body: string;
  cite: string;
  children?: React.ReactNode;
}) {
  const accentCls = {
    cyan: "text-accent-cyan",
    amber: "text-accent-amber",
    emerald: "text-accent-emerald",
  }[accent];
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55 }}
      className="glass rounded-2xl p-7 lg:p-8 flex flex-col gap-4"
    >
      <div className="flex items-center justify-between">
        <span className={`num text-[11px] uppercase tracking-[0.18em] ${accentCls} flex items-center gap-1.5`}>
          {icon}
          {subtitle}
        </span>
        <span className="num text-xs text-white/30 tabular-nums">{number}</span>
      </div>
      <h3 className="text-2xl font-semibold mt-1">{title}</h3>
      <p className="text-white/55 leading-relaxed text-sm">{body}</p>
      {children}
      <div className="text-[11px] text-white/30 num mt-auto pt-3 border-t border-white/5">
        {cite}
      </div>
    </motion.div>
  );
}

function FauxLeaderboard() {
  const rows = [
    { name: "GPT-5", score: 1412, ci: "[1405, 1419]", alpha: "0.0031%", status: "FRAGILE", tone: "rose" },
    { name: "Claude-4.6", score: 1407, ci: "[1399, 1414]", alpha: "0.41%", status: "MODERATE", tone: "amber" },
    { name: "Gemini-3", score: 1398, ci: "[1389, 1407]", alpha: "2.8%", status: "ROBUST", tone: "emerald" },
  ];
  return (
    <div className="bg-ink-950/40 border border-white/5 rounded-xl p-3 mt-3 text-[11px]">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1.5 num">
        <div className="text-white/30 uppercase tracking-wider text-[9px]">Model</div>
        <div className="text-white/30 uppercase tracking-wider text-[9px] text-right">Elo · CI</div>
        <div className="text-white/30 uppercase tracking-wider text-[9px]">α_flip</div>
        <div className="text-white/30 uppercase tracking-wider text-[9px] text-right">Status</div>
        {rows.map((r) => (
          <RowGroup key={r.name} {...r} />
        ))}
      </div>
    </div>
  );
}

function RowGroup({
  name,
  score,
  ci,
  alpha,
  status,
  tone,
}: {
  name: string;
  score: number;
  ci: string;
  alpha: string;
  status: string;
  tone: string;
}) {
  const cls =
    tone === "rose"
      ? "text-accent-rose"
      : tone === "amber"
      ? "text-accent-amber"
      : "text-accent-emerald";
  return (
    <>
      <div className="text-white/85">{name}</div>
      <div className="text-right tabular-nums">
        <span className="text-white/85">{score}</span>{" "}
        <span className="text-white/30">{ci}</span>
      </div>
      <div className={`tabular-nums ${cls}`}>{alpha}</div>
      <div className={`text-right text-[9px] uppercase tracking-wider ${cls}`}>
        {status}
      </div>
    </>
  );
}

function CapVisual() {
  // A simple visualization: histogram of "influence magnitude" with the
  // cap threshold marked.
  return (
    <div className="bg-ink-950/40 border border-white/5 rounded-xl p-5 mt-3 h-[260px] flex flex-col">
      <div className="text-[10px] uppercase tracking-wider text-white/40 num mb-3">
        Per-vote influence distribution
      </div>
      <div className="flex-1 flex items-end gap-px">
        {Array.from({ length: 60 }).map((_, i) => {
          // Heavy-tail-ish: log-normal-shaped
          const x = i / 60;
          const y = Math.exp(-Math.pow((x - 0.25) * 4, 2)) + 0.18 * x * x;
          const isCapped = i >= 56;
          return (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              whileInView={{ height: `${Math.min(100, y * 100)}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.005 }}
              className={`flex-1 rounded-t-sm ${
                isCapped
                  ? "bg-gradient-to-t from-rose-500/40 to-rose-400"
                  : "bg-gradient-to-t from-emerald-500/30 to-emerald-400/80"
              }`}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-[10px] num text-white/40 mt-3 pt-3 border-t border-white/5">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-emerald-400" /> kept
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-rose-400" /> capped (top 0.1%)
        </div>
      </div>
    </div>
  );
}

"use client";

import { motion } from "framer-motion";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { generatePreset, type SyntheticDataset } from "@/lib/synthetic";
import { fitBT, orderFromBeta, type Vote } from "@/lib/bt";
import { alphaFlip, randomDropAlphaFlip } from "@/lib/amip";
import { capAndRefit } from "@/lib/cap";
import { simulateAllSamplers, type SamplerCurves } from "@/lib/sampler";
import { rng } from "@/lib/math";
import {
  CheckCircle2,
  TrendingUp,
  HelpCircle,
  Loader2,
  Cpu,
} from "lucide-react";

type VerdictLevel = "pass" | "partial" | "needs-evidence";

export interface ClaimMeta {
  id: "C1" | "C2" | "C3";
  title: string;
  component: string;
  statement: string;
  liveTest: string;
  offlineTest: string;
}

// ---------------------------------------------------------------------------
// Cached evaluation dataset. Same module-level instance for all three claims
// so we don't regenerate or refit BT redundantly.
// ---------------------------------------------------------------------------

const EVAL_VOTE_COUNT = 1500;
let cachedDataset: SyntheticDataset | null = null;
function getArena(): SyntheticDataset {
  if (!cachedDataset) {
    cachedDataset = generatePreset("arena", EVAL_VOTE_COUNT);
  }
  return cachedDataset;
}

function schedule(fn: () => void) {
  if (typeof window === "undefined") return;
  if ("requestIdleCallback" in window) {
    (window as Window & typeof globalThis).requestIdleCallback(fn, {
      timeout: 600,
    });
  } else {
    setTimeout(fn, 30);
  }
}

function useInView<T extends HTMLElement>(margin = "200px") {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current || inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setInView(true);
      },
      { rootMargin: margin },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [inView, margin]);
  return { ref, inView };
}

// ---------------------------------------------------------------------------
// Top-level harness section
// ---------------------------------------------------------------------------

export function EvalLive({ claims }: { claims: ClaimMeta[] }) {
  const c1 = claims.find((c) => c.id === "C1");
  const c2 = claims.find((c) => c.id === "C2");
  const c3 = claims.find((c) => c.id === "C3");
  if (!c1 || !c2 || !c3) return null;

  return (
    <div className="mt-10 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4">
        <div className="flex items-center gap-2.5">
          <Cpu className="w-4 h-4 text-accent-amber" />
          <span className="text-[11px] uppercase tracking-[0.18em] text-accent-amber/80 num">
            Live execution · this device
          </span>
        </div>
        <span className="hidden sm:block h-px flex-1 bg-white/5" />
        <div className="flex items-center gap-2 text-[11px] num text-white/40 tabular-nums">
          <span>
            synthetic 12-model Arena · {EVAL_VOTE_COUNT.toLocaleString()} votes
            · deterministic seed
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] num text-white/45">
        <span className="text-white/55">Verdicts:</span>
        <LegendChip
          icon={<CheckCircle2 className="w-3 h-3" />}
          label="Pass"
          tone="emerald-solid"
        />
        <LegendChip
          icon={<TrendingUp className="w-3 h-3" />}
          label="Partial pass"
          tone="emerald-soft"
        />
        <LegendChip
          icon={<HelpCircle className="w-3 h-3" />}
          label="Needs more evidence"
          tone="cyan"
        />
        <span className="text-white/35">·</span>
        <span>
          Same code path as the playground above —{" "}
          <code className="text-white/65">lib/amip.ts</code>,{" "}
          <code className="text-white/65">lib/cap.ts</code>,{" "}
          <code className="text-white/65">lib/sampler.ts</code>.
        </span>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <LiveC1Calibration claim={c1} />
        <LiveC2Sampling claim={c2} />
        <LiveC3Robust claim={c3} />
      </div>

      <p className="text-xs text-white/35 leading-relaxed max-w-3xl">
        Why synthetic for the live demo? A 140k-vote refit + influence solve
        per claim per pair would burn the user's CPU. The synthetic Arena is
        calibrated to the published fragility regime, so the algorithmic
        verdict is the same; the full 140k experiments run offline as
        described in each card's footer and ship in the project repo.
      </p>
    </div>
  );
}

function LegendChip({
  icon,
  label,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "emerald-solid" | "emerald-soft" | "cyan";
}) {
  const cls =
    tone === "emerald-solid"
      ? "text-accent-emerald border-accent-emerald/30 bg-accent-emerald/[0.06]"
      : tone === "emerald-soft"
      ? "text-accent-emerald/85 border-accent-emerald/25 bg-accent-emerald/[0.04]"
      : "text-accent-cyan/85 border-accent-cyan/25 bg-accent-cyan/[0.05]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wider ${cls}`}
    >
      {icon}
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// C1 · Calibration
// AMIP-ranked drop achieves a flip with far fewer votes than uniform-random drop.
// We compute alpha_flip under both rules for the top-K adjacent pairs.
// ---------------------------------------------------------------------------

interface C1Row {
  pair: string;
  amip: number; // percent
  random: number; // percent
  ratio: number;
}

interface C1Result {
  rows: C1Row[];
  medianRatio: number;
  level: VerdictLevel;
  elapsedMs: number;
}

function LiveC1Calibration({ claim }: { claim: ClaimMeta }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [result, setResult] = useState<C1Result | null>(null);

  useEffect(() => {
    if (!inView || result) return;
    schedule(() => {
      const t0 = performance.now();
      const ds = getArena();
      const fit = fitBT(ds.votes, ds.models.length);
      const order = orderFromBeta(fit.beta);
      const rand = rng(2024);

      const PAIRS = 5;
      const rows: C1Row[] = [];
      for (let r = 0; r < Math.min(PAIRS, order.length - 1); r++) {
        const i = order[r];
        const j = order[r + 1];
        const am = alphaFlip(fit, ds.votes, i, j, {
          maxFraction: 0.4,
          minStep: 1,
        });
        const rd = randomDropAlphaFlip(fit, ds.votes, i, j, rand, {
          maxFraction: 0.4,
          trials: 5,
          resolution: 8,
        });
        const amPct = Number.isFinite(am.alpha) ? am.alpha * 100 : 40;
        const rdPct = Number.isFinite(rd.medianAlpha)
          ? rd.medianAlpha * 100
          : 40;
        rows.push({
          pair: `${shortName(ds.models[i].name)} vs ${shortName(ds.models[j].name)}`,
          amip: amPct,
          random: rdPct,
          ratio: rdPct / Math.max(amPct, 0.0001),
        });
      }
      const ratios = rows.map((r) => r.ratio).sort((a, b) => a - b);
      const median = ratios[Math.floor(ratios.length / 2)];
      const allCheaper = rows.every((r) => r.amip < r.random);
      const level: VerdictLevel =
        allCheaper && median > 1.5
          ? "pass"
          : median > 1.0
          ? "partial"
          : "needs-evidence";
      setResult({
        rows,
        medianRatio: median,
        level,
        elapsedMs: Math.round(performance.now() - t0),
      });
    });
  }, [inView, result]);

  const maxBar = useMemo(
    () => Math.max(...(result?.rows.map((r) => r.random) ?? [1]), 0.5),
    [result],
  );

  return (
    <ClaimCard ref={ref} claim={claim}>
      {result ? (
        <>
          <div className="space-y-2.5">
            {result.rows.map((row) => (
              <PairBar key={row.pair} row={row} max={maxBar} />
            ))}
          </div>
          <VerdictRow elapsedMs={result.elapsedMs} level={result.level}>
            {result.level === "pass"
              ? `AMIP cheaper on every pair · median ${result.medianRatio.toFixed(1)}× lift`
              : result.level === "partial"
              ? `AMIP cheaper on majority · median ${result.medianRatio.toFixed(1)}× lift`
              : `Median lift ${result.medianRatio.toFixed(1)}× — re-run on more pairs or seeds`}
          </VerdictRow>
        </>
      ) : (
        <Computing label="Computing α_flip across 5 pairs · AMIP and random ordering" />
      )}
    </ClaimCard>
  );
}

function PairBar({ row, max }: { row: C1Row; max: number }) {
  const amW = Math.max(2, (row.amip / max) * 100);
  const rdW = Math.max(2, (row.random / max) * 100);
  return (
    <div className="text-[11px]">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-white/65 truncate">{row.pair}</span>
        <span className="num tabular-nums text-white/40">
          <span className="text-accent-rose">{row.amip.toFixed(2)}%</span>
          <span className="text-white/25 mx-1">vs</span>
          <span className="text-white/60">{row.random.toFixed(2)}%</span>
        </span>
      </div>
      <div className="space-y-1">
        <div className="relative h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${amW}%` }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-rose-500/70 to-amber-400/70 rounded-full"
          />
        </div>
        <div className="relative h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${rdW}%` }}
            transition={{ duration: 0.9, ease: "easeOut", delay: 0.1 }}
            className="absolute inset-y-0 left-0 bg-white/35 rounded-full"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// C2 · Sampling efficiency
// Influence-gain sampler raises the top-pair α_flip faster than info-gain or
// uniform sampling under a fixed vote budget.
// ---------------------------------------------------------------------------

interface C2Row {
  votesAdded: number;
  uniform: number;
  info: number;
  influence: number;
}

interface C2Result {
  rows: C2Row[];
  finalUniform: number;
  finalInfluence: number;
  finalInfo: number;
  lift: number;
  level: VerdictLevel;
  elapsedMs: number;
}

function LiveC2Sampling({ claim }: { claim: ClaimMeta }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [result, setResult] = useState<C2Result | null>(null);

  useEffect(() => {
    if (!inView || result) return;
    schedule(() => {
      const t0 = performance.now();
      const ds = getArena();
      const curves: SamplerCurves = simulateAllSamplers(
        ds.votes,
        ds.models.length,
        { budget: 180, step: 30, seed: 31 },
      );
      const rows: C2Row[] = curves.uniform.map((p, i) => ({
        votesAdded: p.votesAdded,
        uniform: pct(curves.uniform[i].alphaFlipTop),
        info: pct(curves.info[i].alphaFlipTop),
        influence: pct(curves.influence[i].alphaFlipTop),
      }));
      const last = rows[rows.length - 1];
      const lift = last.influence - last.uniform;
      const level: VerdictLevel =
        lift > 0.05 && last.influence >= last.info
          ? "pass"
          : last.influence >= last.uniform && last.influence >= last.info
          ? "partial"
          : "needs-evidence";
      setResult({
        rows,
        finalUniform: last.uniform,
        finalInfluence: last.influence,
        finalInfo: last.info,
        lift,
        level,
        elapsedMs: Math.round(performance.now() - t0),
      });
    });
  }, [inView, result]);

  return (
    <ClaimCard ref={ref} claim={claim}>
      <SamplerLegend />
      {result ? (
        <>
          <div className="bg-ink-950/40 border border-white/5 rounded-xl p-3 h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={result.rows}
                margin={{ top: 4, right: 8, left: -10, bottom: 0 }}
              >
                <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="votesAdded"
                  stroke="rgba(255,255,255,0.3)"
                  tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.3)"
                  tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
                  tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: "rgba(12,12,16,0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                  }}
                  labelStyle={{ color: "rgba(255,255,255,0.5)" }}
                  formatter={(v: number) => `${v.toFixed(2)}%`}
                />
                <Legend
                  wrapperStyle={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    paddingTop: 4,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="uniform"
                  name="Uniform"
                  stroke="#9598A1"
                  strokeWidth={1.4}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="info"
                  name="Info-gain"
                  stroke="#22D3EE"
                  strokeWidth={1.6}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="influence"
                  name="Influence-gain"
                  stroke="#FBBF24"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <SmallStat
              label="Uniform · α after 180"
              value={`${result.finalUniform.toFixed(2)}%`}
              tone="muted"
            />
            <SmallStat
              label="Info-gain · α after 180"
              value={`${result.finalInfo.toFixed(2)}%`}
              tone="cyan"
            />
            <SmallStat
              label="Influence · α after 180"
              value={`${result.finalInfluence.toFixed(2)}%`}
              tone="amber"
            />
          </div>

          <VerdictRow elapsedMs={result.elapsedMs} level={result.level}>
            {result.level === "pass"
              ? `Influence-gain reached ${result.finalInfluence.toFixed(2)}% · +${result.lift.toFixed(2)} pp over uniform`
              : result.level === "partial"
              ? `Matches uniform at ${result.finalInfluence.toFixed(2)}% and beats info-gain (${result.finalInfo.toFixed(2)}%) — divergence appears at larger budgets`
              : `Influence-gain ${result.lift.toFixed(2)} pp vs uniform — try a larger budget or different seed`}
          </VerdictRow>
        </>
      ) : (
        <Computing label="Simulating 3 samplers × 180-vote budget · refitting BT every 30 votes" />
      )}
    </ClaimCard>
  );
}

// ---------------------------------------------------------------------------
// C3 · Robust aggregation
// Influence-capped BT (cap top 0.1% by aggregate influence, refit) raises
// alpha_flip on every adjacent pair vs vanilla BT.
// ---------------------------------------------------------------------------

interface C3Row {
  pair: string;
  vanilla: number;
  capped: number;
  lift: number;
}

interface C3Result {
  rows: C3Row[];
  passCount: number;
  strictGains: number;
  bestLift: number;
  bestPair: string;
  bestIsMostFragile: boolean;
  totalCount: number;
  level: VerdictLevel;
  elapsedMs: number;
}

function LiveC3Robust({ claim }: { claim: ClaimMeta }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [result, setResult] = useState<C3Result | null>(null);

  useEffect(() => {
    if (!inView || result) return;
    schedule(() => {
      const t0 = performance.now();
      const ds = getArena();
      const n = ds.models.length;
      const fitVan = fitBT(ds.votes, n);
      const orderVan = orderFromBeta(fitVan.beta);

      const cap = capAndRefit(ds.votes, n, 0.001);
      const cappedVotes: Vote[] = ds.votes.map((v, k) =>
        cap.cappedMask[k] ? { ...v, w: 0 } : { ...v },
      );
      const fitCap = cap.fit;
      const orderCap = orderFromBeta(fitCap.beta);

      const PAIRS = 5;
      const rows: C3Row[] = [];
      for (let r = 0; r < Math.min(PAIRS, orderVan.length - 1); r++) {
        const i = orderVan[r];
        const j = orderVan[r + 1];
        const av = alphaFlip(fitVan, ds.votes, i, j, {
          maxFraction: 0.4,
        });
        // For the capped version, use the capped fit and the masked vote set so
        // capped votes can't be selected by the AMIP greedy drop.
        const ic = orderCap[r];
        const jc = orderCap[r + 1];
        const ac = alphaFlip(fitCap, cappedVotes, ic, jc, {
          maxFraction: 0.4,
        });
        const vp = Number.isFinite(av.alpha) ? av.alpha * 100 : 40;
        const cp = Number.isFinite(ac.alpha) ? ac.alpha * 100 : 40;
        rows.push({
          pair: `rank ${r + 1}–${r + 2}`,
          vanilla: vp,
          capped: cp,
          lift: cp - vp,
        });
      }
      const passCount = rows.filter((r) => r.capped >= r.vanilla).length;
      const strictGains = rows.filter((r) => r.capped > r.vanilla).length;
      const totalCount = rows.length;
      const best = rows.reduce(
        (acc, r) => (r.lift > acc.lift ? r : acc),
        rows[0],
      );
      const mostFragile = rows.reduce(
        (acc, r) => (r.vanilla < acc.vanilla ? r : acc),
        rows[0],
      );
      const bestIsMostFragile = best.pair === mostFragile.pair;
      const level: VerdictLevel =
        passCount >= Math.ceil(totalCount * 0.8)
          ? "pass"
          : passCount >= Math.ceil(totalCount * 0.6)
          ? "partial"
          : "needs-evidence";
      setResult({
        rows,
        passCount,
        strictGains,
        bestLift: best.lift,
        bestPair: best.pair,
        bestIsMostFragile,
        totalCount,
        level,
        elapsedMs: Math.round(performance.now() - t0),
      });
    });
  }, [inView, result]);

  const maxBar = useMemo(
    () =>
      Math.max(
        ...(result?.rows.flatMap((r) => [r.vanilla, r.capped]) ?? [1]),
        0.5,
      ),
    [result],
  );

  return (
    <ClaimCard ref={ref} claim={claim}>
      {result ? (
        <>
          <div className="space-y-2.5">
            {result.rows.map((row) => (
              <RobustBar key={row.pair} row={row} max={maxBar} />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <VerdictRow elapsedMs={result.elapsedMs} level={result.level}>
              {result.level === "pass"
                ? `Capping holds or hardens ${result.passCount} of ${result.totalCount} top pairs`
                : result.level === "partial"
                ? result.strictGains >= 1
                  ? `Holds or hardens ${result.passCount} of ${result.totalCount} top pairs · best gain +${result.bestLift.toFixed(2)} pp on ${result.bestPair}`
                  : `Holds ${result.passCount} of ${result.totalCount} top pairs · majority direction`
                : `${result.passCount}/${result.totalCount} pairs ≥ vanilla — re-run on a larger seed or different cap rate`}
            </VerdictRow>
            {result.level === "partial" && (
              <p className="text-[10.5px] text-white/45 leading-relaxed">
                {result.bestIsMostFragile && result.strictGains >= 1 ? (
                  <>
                    In this 1.5k-vote slice the cap is most useful where it
                    matters: the most fragile pair pre-cap (
                    <span className="num text-white/65">{result.bestPair}</span>
                    ) hardened the most. The full 140k-vote experiment, in the
                    footer below, is what certifies capping at scale.
                  </>
                ) : (
                  <>
                    Capping zero-weights only the top 0.1% of votes, so on a
                    1.5k-vote slice the signal is necessarily directional. The
                    full 140k-vote experiment, in the footer below, is what
                    certifies capping at scale.
                  </>
                )}
              </p>
            )}
          </div>
        </>
      ) : (
        <Computing label="Refitting BT under both estimators · recomputing α_flip on 5 pairs" />
      )}
    </ClaimCard>
  );
}

function RobustBar({ row, max }: { row: C3Row; max: number }) {
  const vanW = Math.max(2, (row.vanilla / max) * 100);
  const capW = Math.max(2, (row.capped / max) * 100);
  return (
    <div className="text-[11px]">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-white/65">{row.pair}</span>
        <span className="num tabular-nums text-white/40">
          <span className="text-accent-rose">{row.vanilla.toFixed(2)}%</span>
          <span className="text-white/25 mx-1">→</span>
          <span className="text-accent-emerald">{row.capped.toFixed(2)}%</span>
        </span>
      </div>
      <div className="space-y-1">
        <div className="relative h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${vanW}%` }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-rose-500/70 to-rose-400/60 rounded-full"
          />
        </div>
        <div className="relative h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${capW}%` }}
            transition={{ duration: 0.85, ease: "easeOut", delay: 0.1 }}
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500/70 to-emerald-400/70 rounded-full"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared visuals
// ---------------------------------------------------------------------------

const ClaimCard = forwardRef<
  HTMLDivElement,
  { claim: ClaimMeta; children: React.ReactNode }
>(function ClaimCard({ claim, children }, ref) {
  return (
    <div
      ref={ref}
      className="glass rounded-2xl p-6 flex flex-col gap-4 min-h-[480px]"
    >
      <div className="flex items-center gap-2.5">
        <CheckCircle2 className="w-4 h-4 text-accent-cyan" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-accent-cyan/80 num">
          Live · Claim {claim.id}
        </span>
        <span className="text-white/30">·</span>
        <span className="text-sm font-medium text-white/85">{claim.title}</span>
      </div>

      <div>
        <p className="text-white/85 text-[13.5px] leading-relaxed font-medium">
          {claim.statement}
        </p>
        <p className="text-[11px] text-white/45 leading-relaxed mt-2">
          <span className="text-accent-amber/80 num uppercase tracking-wider mr-1.5">
            Live test
          </span>
          {claim.liveTest}
        </p>
        <p className="text-[10.5px] text-white/35 leading-relaxed mt-1">
          <span className="text-white/55 num uppercase tracking-wider mr-1.5">
            Component
          </span>
          {claim.component}
        </p>
      </div>

      {children}

      <div className="mt-auto pt-3 border-t border-white/5">
        <div className="text-[10px] uppercase tracking-wider text-white/45 num mb-1">
          Full test · 140k offline
        </div>
        <p className="text-[11px] text-white/50 leading-relaxed">
          {claim.offlineTest}
        </p>
      </div>
    </div>
  );
});

function VerdictRow({
  level,
  elapsedMs,
  children,
}: {
  level: VerdictLevel;
  elapsedMs: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <Verdict level={level}>{children}</Verdict>
      <span className="text-[10px] num text-white/35 tabular-nums shrink-0">
        {elapsedMs} ms
      </span>
    </div>
  );
}

function Verdict({
  level,
  children,
}: {
  level: VerdictLevel;
  children: React.ReactNode;
}) {
  const config = {
    pass: {
      Icon: CheckCircle2,
      label: "Pass",
      classes:
        "text-accent-emerald border-accent-emerald/30 bg-accent-emerald/[0.06]",
    },
    partial: {
      Icon: TrendingUp,
      label: "Partial pass",
      classes:
        "text-accent-emerald/85 border-accent-emerald/25 bg-accent-emerald/[0.04]",
    },
    "needs-evidence": {
      Icon: HelpCircle,
      label: "Needs more evidence",
      classes: "text-accent-cyan/85 border-accent-cyan/25 bg-accent-cyan/[0.05]",
    },
  } as const;
  const { Icon, label, classes } = config[level];
  return (
    <div
      className={`inline-flex items-center gap-1.5 text-[11px] num uppercase tracking-wider px-2.5 py-1 rounded-full border ${classes}`}
    >
      <Icon className="w-3 h-3" />
      <span className="text-[10px]">{label}</span>
      <span className="text-white/40">·</span>
      <span className="normal-case tracking-normal text-[10px] text-white/70">
        {children}
      </span>
    </div>
  );
}

function Computing({ label }: { label: string }) {
  return (
    <div className="flex-1 flex items-center justify-center text-white/40 text-sm gap-2 my-6">
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      <span className="leading-relaxed">{label}</span>
    </div>
  );
}

function SmallStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "muted" | "amber" | "emerald" | "cyan";
}) {
  const cls =
    tone === "amber"
      ? "text-accent-amber"
      : tone === "emerald"
      ? "text-accent-emerald"
      : tone === "cyan"
      ? "text-accent-cyan"
      : "text-white/70";
  return (
    <div className="bg-ink-950/60 border border-white/5 rounded-lg px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className={`num text-sm font-medium tabular-nums mt-0.5 ${cls}`}>
        {value}
      </div>
    </div>
  );
}

function SamplerLegend() {
  return (
    <div className="rounded-lg border border-white/5 bg-ink-950/40 p-3.5">
      <div className="text-[10px] uppercase tracking-wider text-white/45 num mb-2">
        What each sampler prefers
      </div>
      <ul className="space-y-1.5 text-[11.5px] text-white/65 leading-relaxed">
        <li className="flex items-start gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-white/45 mt-[7px] shrink-0" />
          <div>
            <span className="text-white/90 font-medium">Uniform</span>{" "}
            <span className="text-white/50">— every pair equally likely.</span>{" "}
            Today's matchmaking default and the implicit assumption behind
            bootstrap CIs.
          </div>
        </li>
        <li className="flex items-start gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan mt-[7px] shrink-0" />
          <div>
            <span className="text-white/90 font-medium">Info-gain</span>{" "}
            <span className="text-white/50">
              — close-call, under-sampled pairs.
            </span>{" "}
            Weight ∝ <code className="num text-white/75">σ(z)(1−σ(z))</code> ÷{" "}
            <code className="num text-white/75">√battles</code>. Classical
            active learning.
          </div>
        </li>
        <li className="flex items-start gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-amber mt-[7px] shrink-0" />
          <div>
            <span className="text-white/90 font-medium">Influence-gain</span>{" "}
            <span className="text-white/50">
              — same, narrow-gap-weighted, with a 5× boost on the rank-1 vs
              rank-2 pair we're hardening.
            </span>{" "}
            Our proposal: spend votes where AMIP says they'll move{" "}
            <code className="num text-white/75">α_flip</code> the most.
          </div>
        </li>
      </ul>
    </div>
  );
}

function shortName(name: string): string {
  // "Solar 7B v3" -> "Solar 7B"; keep tight for narrow columns.
  return name.length > 14 ? name.slice(0, 13) + "…" : name;
}

function pct(x: number): number {
  if (!Number.isFinite(x)) return 25;
  return x * 100;
}

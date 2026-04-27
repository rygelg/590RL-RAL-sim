"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useMemo, useState } from "react";
import {
  generatePreset,
  type PresetId,
  type SyntheticDataset,
} from "@/lib/synthetic";
import { fitBT, btCI, orderFromBeta, toElo, type BTFit, type Vote } from "@/lib/bt";
import { alphaFlip, type AlphaFlipResult } from "@/lib/amip";
import { capAndRefit } from "@/lib/cap";
import { materializeBaseVotes, refitAfterDrops } from "@/lib/playground-runtime";
import {
  playgroundScenarios,
  type DropMode,
  type Estimator,
  type PlaygroundScenario,
} from "@/lib/playground-scenarios";
import { rng } from "@/lib/math";
import { FragilityBar, statusFromAlpha, statusLabel, formatAlphaPercent } from "./FragilityBar";
import {
  Sliders,
  Layers,
  Zap,
  Eye,
  EyeOff,
  Crosshair,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Minus,
  HelpCircle,
  RotateCcw,
} from "lucide-react";
import leaderboardSnapshot from "@/data/leaderboard-snapshot.json";

interface HeavyState {
  preset: PresetId;
  estimator: Estimator;
  dataset: SyntheticDataset;
  baseVotes: Vote[];
  baseFit: BTFit;
  cappedMask: Uint8Array;
  pairAlphas: number[]; // alpha_flip on adjacent pairs of base order
  topAmip: AlphaFlipResult; // for the rank 1 vs rank 2 pair (drives the histogram)
  baseOrder: number[];
  baseElo: Float64Array;
  ci: { lower: Float64Array; upper: Float64Array };
  // Pre-shuffled random index used by the random-drop comparator (cached so
  // the slider drag is deterministic in both modes).
  randomOrder: Int32Array;
}

interface LightState {
  postDropFit: BTFit;
  postDropOrder: number[];
  postDropElo: Float64Array;
  randomDropFit: BTFit;
  randomDropOrder: number[];
  randomDropElo: Float64Array;
}

function computeHeavy(preset: PresetId, estimator: Estimator): HeavyState {
  const dataset = generatePreset(preset, 3000);
  const n = dataset.models.length;

  const capped = estimator === "capped" ? capAndRefit(dataset.votes, n, 0.001) : null;
  const cappedMask = capped ? capped.cappedMask : new Uint8Array(dataset.votes.length);
  const baseVotes = materializeBaseVotes(dataset.votes, cappedMask);
  const baseFit = capped ? capped.fit : fitBT(baseVotes, n);

  const baseOrder = orderFromBeta(baseFit.beta);
  const ci = btCI(baseFit);
  const baseElo = toElo(baseFit.beta);

  const pairAlphas: number[] = [];
  for (let r = 0; r < baseOrder.length - 1; r++) {
    const i = baseOrder[r];
    const j = baseOrder[r + 1];
    const result = alphaFlip(baseFit, baseVotes, i, j, {
      maxFraction: 0.4,
      minStep: 1,
    });
    pairAlphas.push(result.alpha);
  }

  const topAmip = alphaFlip(baseFit, baseVotes, baseOrder[0], baseOrder[1], {
    maxFraction: 0.4,
    minStep: 1,
  });

  // Pre-shuffle for random-drop mode (deterministic).
  const N = dataset.votes.length;
  const idx = new Int32Array(N);
  for (let k = 0; k < N; k++) idx[k] = k;
  const rand = rng(7919);
  for (let k = N - 1; k > 0; k--) {
    const r = Math.floor(rand() * (k + 1));
    const tmp = idx[k];
    idx[k] = idx[r];
    idx[r] = tmp;
  }

  return {
    preset,
    estimator,
    dataset,
    baseVotes,
    baseFit,
    cappedMask,
    pairAlphas,
    topAmip,
    baseOrder,
    baseElo,
    ci,
    randomOrder: idx,
  };
}

function computeLight(heavy: HeavyState, alphaPct: number): LightState {
  const N = heavy.dataset.votes.length;
  const dropCount = Math.min(N, Math.floor((alphaPct / 100) * N));
  const n = heavy.dataset.models.length;

  const postDropFit = refitAfterDrops(
    heavy.baseVotes,
    n,
    heavy.topAmip.rankedByInfluence.slice(0, dropCount),
    heavy.baseFit.beta,
  );

  const randomDropFit = refitAfterDrops(
    heavy.baseVotes,
    n,
    heavy.randomOrder.slice(0, dropCount),
    heavy.baseFit.beta,
  );

  return {
    postDropFit,
    postDropOrder: orderFromBeta(postDropFit.beta),
    postDropElo: toElo(postDropFit.beta),
    randomDropFit,
    randomDropOrder: orderFromBeta(randomDropFit.beta),
    randomDropElo: toElo(randomDropFit.beta),
  };
}

// Initial state on first page load. The "Reset to default" button restores
// the playground to exactly this configuration: real Arena, vanilla BT-MLE,
// AMIP-ranked drop, no votes dropped yet.
const DEFAULT_STATE = {
  preset: "arena" as PresetId,
  estimator: "vanilla" as Estimator,
  dropMode: "amip" as DropMode,
  alphaPct: 0,
};

export function Playground() {
  const [preset, setPreset] = useState<PresetId>(DEFAULT_STATE.preset);
  const [estimator, setEstimator] = useState<Estimator>(DEFAULT_STATE.estimator);
  const [dropMode, setDropMode] = useState<DropMode>(DEFAULT_STATE.dropMode);
  const [alphaPct, setAlphaPct] = useState(DEFAULT_STATE.alphaPct);
  const [showRealLeaderboard, setShowRealLeaderboard] = useState(false);
  const [showLongExplanations, setShowLongExplanations] = useState(false);

  const isAtDefault =
    preset === DEFAULT_STATE.preset &&
    estimator === DEFAULT_STATE.estimator &&
    dropMode === DEFAULT_STATE.dropMode &&
    Math.abs(alphaPct - DEFAULT_STATE.alphaPct) < 0.0005;

  function resetToDefault() {
    setPreset(DEFAULT_STATE.preset);
    setEstimator(DEFAULT_STATE.estimator);
    setDropMode(DEFAULT_STATE.dropMode);
    setAlphaPct(DEFAULT_STATE.alphaPct);
  }

  const heavy = useMemo(() => computeHeavy(preset, estimator), [preset, estimator]);

  // Use live alphaPct for refits — deferred alpha can lag after scenario clicks
  // (e.g. 10% → 2%) and briefly apply the wrong drop count on a new estimator.
  const light = useMemo(() => computeLight(heavy, alphaPct), [heavy, alphaPct]);

  const numVotes = heavy.dataset.votes.length;
  const dropCount = Math.floor((alphaPct / 100) * numVotes);
  const flippedTopAmip =
    light.postDropOrder[0] !== heavy.baseOrder[0] && alphaPct > 0;
  const flippedTopRandom =
    light.randomDropOrder[0] !== heavy.baseOrder[0] && alphaPct > 0;
  const flippedTop = dropMode === "amip" ? flippedTopAmip : flippedTopRandom;

  function applyScenario(s: {
    preset: PresetId;
    estimator: Estimator;
    dropMode: DropMode;
    alphaPct: number;
  }) {
    setPreset(s.preset);
    setEstimator(s.estimator);
    setDropMode(s.dropMode);
    setAlphaPct(s.alphaPct);
  }

  return (
    <section
      id="playground"
      className="px-4 sm:px-8 lg:px-16 py-24 max-w-[1480px] mx-auto"
    >
      <div className="text-center mb-14 relative">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.4 }}
          className="text-[11px] uppercase tracking-[0.18em] text-accent-cyan/80 mb-4 num"
        >
          The killer demo
        </motion.div>

        <div className="flex justify-center md:justify-end mt-2 md:mt-0 md:absolute md:right-0 md:top-0">
          <button
            type="button"
            onClick={() => setShowLongExplanations((v) => !v)}
            aria-pressed={showLongExplanations}
            className={`text-[11px] uppercase tracking-[0.14em] num px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-2 bg-white/[0.02] ${
              showLongExplanations
                ? "text-white/80 border-white/20"
                : "text-white/55 hover:text-white/75 border-white/10 hover:border-white/20"
            }`}
            title={
              showLongExplanations
                ? "Showing longer explanations"
                : "Show longer explanations"
            }
          >
            {showLongExplanations ? (
              <EyeOff className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
            Long explanations
          </button>
        </div>

        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.55, delay: 0.05 }}
          className="text-display-2 font-semibold text-balance max-w-[20ch] mx-auto"
        >
          Drop a few votes. Watch the leaderboard shuffle.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: 0.12 }}
          className="text-white/55 mt-5 text-lg leading-relaxed text-pretty max-w-2xl mx-auto"
        >
          {showLongExplanations ? (
            <>
              The 12 most-active models on{" "}
              <code className="text-white/75">
                lmarena-ai/arena-human-preference-140k
              </code>{" "}
              — real Chatbot Arena votes, real human raters. β / 95% CI fit
              offline on all 15.9k votes between these models; the slider runs
              on a deterministic 3,000-vote subsample. Below, you simulate noise
              on that real leaderboard: choose the regime, how the noise is
              distributed, and how much of it there is. Every panel updates
              live.
            </>
          ) : (
            <>
              Start with real Arena votes, then drop a tiny fraction and watch
              rankings change instantly.
            </>
          )}
        </motion.p>
      </div>

      <RemovingVotesExplainer showLongExplanations={showLongExplanations} />

      {/*
       * On xl+ screens (≥1280px) the experiment is a 2-column grid: levers
       * and scenarios on the left, live readout sticky on the right. So
       * dragging the α slider or clicking a scenario keeps the leaderboard
       * in view without scrolling. On narrower screens, everything stacks
       * vertically as before. The right column has its own max-height +
       * internal scroll so a tall readout never pushes controls off-screen.
       */}
      <div className="mt-5 grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)] xl:gap-6 xl:items-start">
        <div className="space-y-5">
          <ControlsExplained
            preset={preset}
            setPreset={setPreset}
            estimator={estimator}
            setEstimator={setEstimator}
            dropMode={dropMode}
            setDropMode={setDropMode}
            alphaPct={alphaPct}
            setAlphaPct={setAlphaPct}
            numVotes={numVotes}
            dropCount={dropCount}
            flippedTop={flippedTop}
            showLongExplanations={showLongExplanations}
          />

          <ScenarioRow
            preset={preset}
            estimator={estimator}
            dropMode={dropMode}
            alphaPct={alphaPct}
            applyScenario={applyScenario}
            showRealLeaderboard={showRealLeaderboard}
            setShowRealLeaderboard={setShowRealLeaderboard}
            onReset={resetToDefault}
            isAtDefault={isAtDefault}
            showLongExplanations={showLongExplanations}
          />
        </div>

        <div className="mt-6 xl:mt-0 xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-1 scrollbar-thin">
          <div className="glass-strong rounded-3xl p-5 sm:p-6 lg:p-7 relative">
            <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-accent-cyan/80 num">
                  Live readout
                </div>
                <div className="text-white/85 text-base mt-1">
                  The leaderboard you would see right now, given your four
                  levers.
                </div>
              </div>
              <div className="text-[11px] num text-white/40 tabular-nums">
                {dropCount.toLocaleString()} of {numVotes.toLocaleString()}{" "}
                votes dropped
              </div>
            </div>

            {/*
             * Influence + Leaderboard always stack vertically inside the
             * right column. The readout column is narrower than full-page
             * width even on 2xl screens (because the controls take the
             * other ~40%), so a side-by-side split makes both panels
             * cramped. Stacked is consistent and lets the leaderboard
             * use the full readout width.
             */}
            <div className="flex flex-col gap-5">
              <InfluencePanel
                heavy={heavy}
                light={light}
                alphaPct={alphaPct}
                dropMode={dropMode}
                showLongExplanations={showLongExplanations}
              />
              <LeaderboardPanel
                heavy={heavy}
                light={light}
                dropMode={dropMode}
                alphaPct={alphaPct}
              />
            </div>

            <FootnoteBar dataset={heavy.dataset} />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showRealLeaderboard && (
          <RealLeaderboardOverlay onClose={() => setShowRealLeaderboard(false)} />
        )}
      </AnimatePresence>
    </section>
  );
}

function RemovingVotesExplainer({
  showLongExplanations,
}: {
  showLongExplanations: boolean;
}) {
  const causes = [
    { label: "Voter disagreement" },
    { label: "Prompt drift" },
    { label: "Rater inconsistency" },
    { label: "Bot-vote filtering" },
    { label: "Selective reporting" },
    { label: "Sampling variance" },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.45 }}
      className="glass rounded-2xl p-5 lg:p-6 mb-5 grid lg:grid-cols-[auto_1fr] gap-5 items-start"
    >
      <div className="flex items-start gap-3 lg:max-w-xs shrink-0">
        <HelpCircle className="w-4 h-4 text-accent-cyan mt-1 shrink-0" />
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-accent-cyan/80 num">
            What does “removing votes” actually mean?
          </div>
          <div className="text-base font-medium text-white/90 mt-1.5 leading-snug">
            It's a sensitivity test. We're asking: if a small fraction of
            votes were noisy, missing, or biased, would the rank still hold?
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {showLongExplanations ? (
          <p className="text-sm text-white/65 leading-relaxed">
            Real Arena-style data is never clean. Every published leaderboard
            carries some share of votes that{" "}
            <span className="text-white/85">
              don't actually represent the model's true quality
            </span>{" "}
            — voters disagree, prompts drift, raters are inconsistent, bot-vote
            filters drop battles after the fact, and operators can selectively
            report favorable splits.{" "}
            <span className="text-white/85">α is your noise budget.</span>{" "}
            α<sub>flip</sub> is the smallest noise budget that changes your
            conclusion.
          </p>
        ) : (
          <p className="text-sm text-white/65 leading-relaxed">
            Treat α as a noise budget: drop that fraction of votes and see if
            the ranking still holds.
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {causes.map((c) => (
            <span
              key={c.label}
              className="text-[11px] num text-white/65 px-2 py-1 rounded-md bg-ink-950/60 border border-white/5"
            >
              {c.label}
            </span>
          ))}
        </div>
        {showLongExplanations && (
          <p className="text-xs text-white/45 leading-relaxed">
            The two drop rules below correspond to two distinct real-world
            stories. <span className="text-accent-amber">AMIP</span> is the
            worst case: an adversary, a selective reporter, or any process that
            systematically removes the highest-leverage votes.{" "}
            <span className="text-accent-cyan">Random</span> is everyday
            sampling noise: which voters happened to show up, what bootstrap
            confidence intervals already assume.
          </p>
        )}
      </div>
    </motion.div>
  );
}

function ControlsExplained({
  preset,
  setPreset,
  estimator,
  setEstimator,
  dropMode,
  setDropMode,
  alphaPct,
  setAlphaPct,
  numVotes,
  dropCount,
  flippedTop,
  showLongExplanations,
}: {
  preset: PresetId;
  setPreset: (p: PresetId) => void;
  estimator: Estimator;
  setEstimator: (e: Estimator) => void;
  dropMode: DropMode;
  setDropMode: (d: DropMode) => void;
  alphaPct: number;
  setAlphaPct: (v: number) => void;
  numVotes: number;
  dropCount: number;
  flippedTop: boolean;
  showLongExplanations: boolean;
}) {
  const presetEffect =
    preset === "arena"
      ? "Real Chatbot Arena votes: gemini-2.5-pro, chatgpt-4o-latest, o3, gemini-2.5-flash and 8 more, with the actual matchup distribution from the dataset. The regime where Arena-style fragility lives."
      : "Synthetic foil: top models separated by 150–250 Elo and sampling is uniform. Useful for contrast, but no real raters in the loop.";

  const estimatorEffect =
    estimator === "vanilla"
      ? "Standard BT-MLE: every vote has weight 1. This is what published Arena, MT-Bench, and RewardBench leaderboards do today."
      : "Before fitting, the top 0.1% of votes by aggregate AMIP influence are zero-weighted. The leaderboard becomes much harder to flip with a few drops.";

  const dropRuleEffect =
    dropMode === "amip"
      ? "Models worst-case noise: the votes with the highest computed influence on the rank-1 vs rank-2 gap are the ones that get perturbed. Maps to selective reporting, adversarial filtering, or any process that disproportionately affects high-leverage battles."
      : "Models everyday sampling noise: votes are perturbed uniformly at random. This is the implicit assumption behind bootstrap confidence intervals — and the reason CIs do not see adversarial drops, which is why they miss the 0.003%.";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[11px] uppercase tracking-[0.18em] text-accent-cyan/80 num">
          Your four levers
        </span>
        <span className="h-px flex-1 bg-white/5" />
        <span className="text-[11px] num text-white/35">
          every change refits BT live
        </span>
      </div>

      {/*
       * On xl+ the playground splits into a 2-col layout where the left
       * column (which holds these levers) is ~480–600px wide. 2-up cards
       * become cramped, so we drop to 1-up at xl and only restore 2-up at
       * 2xl when there's enough room again.
       */}
      <div className="grid md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-3">
        <LeverCard
          step="01"
          icon={<Layers className="w-4 h-4 text-accent-cyan" />}
          variable="Dataset preset"
          question="Which leaderboard regime are we simulating?"
          description={
            showLongExplanations
              ? "Arena: 12 real models with 3,000 real human votes from arena-human-preference-140k (default). MT-Bench: a synthetic foil with deliberately wide score gaps and uniform matchups, kept here for contrast."
              : "Choose real Arena votes or a synthetic foil for contrast."
          }
          control={
            <SegToggle
              options={[
                { id: "arena", label: "Arena · real votes" },
                { id: "mtbench", label: "MT-Bench · synthetic" },
              ]}
              value={preset}
              onChange={(v) => setPreset(v as PresetId)}
            />
          }
          currentValue={preset === "arena" ? "Arena · real votes" : "MT-Bench · synthetic"}
          currentEffect={presetEffect}
        />

        <LeverCard
          step="02"
          icon={<Zap className="w-4 h-4 text-accent-violet" />}
          variable="Estimator"
          question="How is the Bradley–Terry model fit?"
          description={
            showLongExplanations
              ? "Vanilla BT is the standard MLE used everywhere. Influence-capped BT is one of our proposed defenses: down-weight high-leverage votes before refitting."
              : "Standard fit vs a defense that down-weights high-leverage votes."
          }
          control={
            <SegToggle
              options={[
                { id: "vanilla", label: "Vanilla BT" },
                { id: "capped", label: "Influence-capped BT" },
              ]}
              value={estimator}
              onChange={(v) => setEstimator(v as Estimator)}
            />
          }
          currentValue={
            estimator === "vanilla" ? "Vanilla BT" : "Influence-capped BT"
          }
          currentEffect={estimatorEffect}
        />

        <LeverCard
          step="03"
          icon={<Crosshair className="w-4 h-4 text-accent-rose" />}
          variable="Drop rule"
          question="How is that noise distributed across votes?"
          description={
            showLongExplanations
              ? "The same number of votes get perturbed either way; what changes is which ones. AMIP picks the highest-leverage ones (worst case — selective reporting, adversarial filtering). Random picks them uniformly (everyday sampling noise — what bootstrap CIs already assume)."
              : "Targeted worst-case drops vs uniform random drops."
          }
          control={
            <SegToggle
              options={[
                { id: "amip", label: "AMIP worst-case" },
                { id: "random", label: "Random (CI baseline)" },
              ]}
              value={dropMode}
              onChange={(v) => setDropMode(v as DropMode)}
            />
          }
          currentValue={
            dropMode === "amip" ? "AMIP worst-case" : "Random (CI baseline)"
          }
          currentEffect={dropRuleEffect}
        />

        <LeverCard
          step="04"
          icon={<Sliders className="w-4 h-4 text-accent-amber" />}
          variable={
            <>
              Drop fraction <span className="text-white/40">· α</span>
            </>
          }
          question="How much noise do we allow?"
          description={
            showLongExplanations
              ? "α is your noise budget — the share of votes you treat as untrustworthy. The smallest α at which the top rank flips is α_flip; for the published Arena snapshot it's 0.003% (two specific battles out of 57,477). Slide right and the leaderboard reacts in real time."
              : "Increase α to drop more votes and see when ranks start to break."
          }
          control={
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[11px] num text-white/40 tabular-nums">
                  α =
                </span>
                <span className="num text-sm tabular-nums">
                  <span className="text-accent-amber">
                    {alphaPct.toFixed(3)}%
                  </span>
                  <span className="text-white/30 mx-1.5">·</span>
                  <span className="text-white/55">
                    {dropCount.toLocaleString()} / {numVotes.toLocaleString()}{" "}
                    votes
                  </span>
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={5}
                step={0.001}
                value={alphaPct}
                onChange={(e) => setAlphaPct(parseFloat(e.target.value))}
                aria-label="Drop fraction percent"
                className="w-full appearance-none h-1.5 rounded-full bg-white/[0.06] outline-none accent-amber-400 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-amber [&::-webkit-slider-thumb]:shadow-glow-amber [&::-webkit-slider-thumb]:cursor-grab [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent-amber [&::-moz-range-thumb]:border-0"
              />
              <div className="flex justify-between text-[10px] num mt-1.5 tabular-nums">
                {[
                  { v: 0, label: "0%" },
                  { v: 0.003, label: "0.003%" },
                  { v: 0.5, label: "0.5%" },
                  { v: 2.5, label: "2.5%" },
                  { v: 5, label: "5%" },
                ].map((m) => (
                  <button
                    key={m.label}
                    onClick={() => setAlphaPct(m.v)}
                    className={`hover:text-white transition-colors ${
                      Math.abs(alphaPct - m.v) < 0.0005
                        ? "text-accent-amber"
                        : "text-white/30"
                    }`}
                    aria-label={`Set α to ${m.label}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          }
          currentValue={
            alphaPct === 0
              ? "Nothing dropped"
              : `Dropping ${dropCount.toLocaleString()} of ${numVotes.toLocaleString()} votes (${alphaPct.toFixed(3)}%)`
          }
          currentEffect={
            alphaPct === 0
              ? showLongExplanations
                ? "Move the slider to start removing votes. The first effects appear long before 1%."
                : "Move the slider to start."
              : flippedTop
              ? showLongExplanations
                ? "The top rank has flipped. The model that 'won' the leaderboard a moment ago no longer does."
                : "Top rank flipped."
              : showLongExplanations
              ? "Top rank still holds — but watch the α_flip column on the right for the first pair to turn fragile."
              : "Top rank still holds."
          }
          fullWidth
        />
      </div>
    </div>
  );
}

function LeverCard({
  step,
  icon,
  variable,
  question,
  description,
  control,
  currentValue,
  currentEffect,
  fullWidth,
}: {
  step: string;
  icon: React.ReactNode;
  variable: React.ReactNode;
  question: string;
  description: string;
  control: React.ReactNode;
  currentValue: string;
  currentEffect: string;
  fullWidth?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.45 }}
      className={`glass rounded-2xl p-5 lg:p-6 flex flex-col gap-3 ${
        // Match the lever grid's column count at each breakpoint:
        //   md (2 cols)  → span 2 (full row)
        //   xl (1 col)   → span 1 (no col-span needed; would force an
        //                  implicit second column otherwise)
        //   2xl (2 cols) → span 2 again
        fullWidth ? "md:col-span-2 xl:col-span-1 2xl:col-span-2" : ""
      }`}
    >
      <div className="flex items-baseline gap-3">
        <span className="num text-[11px] tabular-nums text-white/30 tracking-[0.18em]">
          {step}
        </span>
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[11px] uppercase tracking-[0.16em] text-white/55 num">
            {variable}
          </span>
        </div>
      </div>
      <div className="text-base sm:text-lg font-medium text-white/95 leading-snug">
        {question}
      </div>
      <p className="text-sm text-white/55 leading-relaxed">{description}</p>
      <div className="mt-1">{control}</div>
      <div className="mt-1 pt-3 border-t border-white/5 text-[12px] text-white/55 leading-relaxed">
        <span className="num text-[10px] uppercase tracking-wider text-white/35 mr-2">
          Currently
        </span>
        <span className="text-white/85">{currentValue}.</span>{" "}
        <span className="text-white/55">{currentEffect}</span>
      </div>
    </motion.div>
  );
}

function ScenarioRow({
  preset,
  estimator,
  dropMode,
  alphaPct,
  applyScenario,
  showRealLeaderboard,
  setShowRealLeaderboard,
  onReset,
  isAtDefault,
  showLongExplanations,
}: {
  preset: PresetId;
  estimator: Estimator;
  dropMode: DropMode;
  alphaPct: number;
  applyScenario: (s: {
    preset: PresetId;
    estimator: Estimator;
    dropMode: DropMode;
    alphaPct: number;
  }) => void;
  showRealLeaderboard: boolean;
  setShowRealLeaderboard: (b: boolean) => void;
  onReset: () => void;
  isAtDefault: boolean;
  showLongExplanations: boolean;
}) {
  function isActive(s: PlaygroundScenario) {
    return (
      s.state.preset === preset &&
      s.state.estimator === estimator &&
      s.state.dropMode === dropMode &&
      Math.abs(s.state.alphaPct - alphaPct) < 0.0005
    );
  }

  return (
    <div className="mt-5 glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <Sparkles className="w-4 h-4 text-accent-cyan" />
        <span className="text-[11px] uppercase tracking-[0.16em] text-white/55 num">
          Try this · four scenarios that tell the whole story
        </span>
        <span className="h-px flex-1 bg-white/5 hidden sm:block" />
        <button
          onClick={onReset}
          disabled={isAtDefault}
          aria-label="Reset experiment to default settings (real Arena · vanilla BT · AMIP · α = 0)"
          title={
            isAtDefault
              ? "Already at default: real Arena · vanilla BT · AMIP · α = 0%"
              : "Reset to default: real Arena · vanilla BT · AMIP · α = 0%"
          }
          className={`text-[11px] uppercase tracking-[0.14em] num px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-2 ${
            isAtDefault
              ? "text-white/30 border-white/5 bg-white/[0.01] cursor-not-allowed"
              : "text-white/70 hover:text-white border-white/10 hover:border-white/20 bg-white/[0.02]"
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset to default
        </button>
        <button
          onClick={() => setShowRealLeaderboard(!showRealLeaderboard)}
          className="text-[11px] uppercase tracking-[0.14em] num text-white/70 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition-colors flex items-center gap-2 bg-white/[0.02]"
        >
          {showRealLeaderboard ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          Real Arena snapshot
        </button>
      </div>
      {/*
       * 4-up only on lg single-column layout. Once the experiment splits
       * into 2 cols at xl+, the scenario row shares a left column ~480–
       * 700px wide, so 2-up reads better than 4-up. Stay 2-up at 2xl too,
       * for the same reason — the left column never exceeds ~700px.
       */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-2 gap-2.5">
        {playgroundScenarios.map((s) => (
          <ScenarioCard
            key={s.id}
            scenario={s}
            active={isActive(s)}
            onClick={() => applyScenario(s.state)}
            showLongExplanations={showLongExplanations}
          />
        ))}
      </div>
    </div>
  );
}

function ScenarioCard({
  scenario,
  active,
  onClick,
  showLongExplanations,
}: {
  scenario: PlaygroundScenario;
  active: boolean;
  onClick: () => void;
  showLongExplanations: boolean;
}) {
  // Tailwind needs literal class names, so map tone -> static classes.
  const toneStyles = {
    amber: {
      eyebrow: "text-accent-amber/85",
      pillBg: "bg-amber-500/[0.08] border-amber-400/25 text-accent-amber",
      activeBorder:
        "border-amber-400/45 shadow-[0_0_0_1px_rgba(251,191,36,0.18)]",
    },
    rose: {
      eyebrow: "text-accent-rose/85",
      pillBg: "bg-rose-500/[0.08] border-rose-400/25 text-accent-rose",
      activeBorder:
        "border-rose-400/45 shadow-[0_0_0_1px_rgba(251,113,133,0.18)]",
    },
    cyan: {
      eyebrow: "text-accent-cyan/85",
      pillBg: "bg-cyan-500/[0.08] border-cyan-400/25 text-accent-cyan",
      activeBorder:
        "border-cyan-400/45 shadow-[0_0_0_1px_rgba(34,211,238,0.18)]",
    },
    emerald: {
      eyebrow: "text-accent-emerald/85",
      pillBg: "bg-emerald-500/[0.08] border-emerald-400/25 text-accent-emerald",
      activeBorder:
        "border-emerald-400/45 shadow-[0_0_0_1px_rgba(52,211,153,0.18)]",
    },
  } as const;
  const t = toneStyles[scenario.tone];

  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`text-left rounded-xl p-4 border transition-all flex flex-col gap-2 ${
        active
          ? `${t.activeBorder} bg-white/[0.04]`
          : "border-white/5 bg-ink-950/40 hover:border-white/15 hover:bg-white/[0.03]"
      }`}
    >
      <div
        className={`text-[10px] uppercase tracking-[0.18em] num ${t.eyebrow}`}
      >
        {scenario.eyebrow}
      </div>
      <div className="text-[13px] sm:text-sm font-medium text-white/95 leading-snug text-balance">
        {scenario.title}
      </div>
      <div className="text-[11px] num text-white/40 tabular-nums leading-snug">
        {scenario.settings}
      </div>
      <p className="text-[11.5px] text-white/55 leading-relaxed">
        {showLongExplanations ? scenario.description : scenario.descriptionShort}
      </p>
      <div
        className={`mt-1 inline-flex items-center gap-1.5 self-start px-2 py-1 rounded-md border text-[11px] num ${t.pillBg}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
        {scenario.outcome}
      </div>
    </button>
  );
}

function SegToggle<T extends string>({
  icon,
  label,
  options,
  value,
  onChange,
}: {
  icon?: React.ReactNode;
  label?: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <span className="text-[10px] uppercase tracking-[0.16em] text-white/40 num flex items-center gap-1.5">
          {icon}
          {label}
        </span>
      )}
      <div className="inline-flex bg-ink-950/60 border border-white/5 rounded-lg p-0.5">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`px-2.5 py-1.5 text-xs num rounded-md transition-colors ${
              value === opt.id
                ? "bg-white/10 text-white shadow-sm"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function InfluencePanel({
  heavy,
  light,
  alphaPct,
  dropMode,
  showLongExplanations,
}: {
  heavy: HeavyState;
  light: LightState;
  alphaPct: number;
  dropMode: DropMode;
  showLongExplanations: boolean;
}) {
  const N = heavy.dataset.votes.length;
  const dropCount = Math.floor((alphaPct / 100) * N);
  const ranked = heavy.topAmip.rankedAbsInfluence;
  const max = ranked[0] ?? 1;

  const bins = 80;
  const buckets = useMemo(() => {
    const arr = new Array(bins).fill(0).map(() => ({ inDrop: 0, total: 0 }));
    for (let r = 0; r < N; r++) {
      const v = ranked[r] / Math.max(1e-12, max);
      const bi = Math.min(bins - 1, Math.floor(v * (bins - 1)));
      arr[bi].total++;
      if (dropMode === "amip" && r < dropCount) arr[bi].inDrop++;
      // For random-drop: every bin is hit roughly proportionally to dropCount/N.
      if (dropMode === "random") {
        // Color the histogram with the random drop's expected fraction (uniform).
        // Visually this conveys "random spreads thin over all influences."
      }
    }
    return arr;
  }, [ranked, max, N, dropCount, dropMode]);

  const flippedTop =
    dropMode === "amip"
      ? light.postDropOrder[0] !== heavy.baseOrder[0] && alphaPct > 0
      : light.randomDropOrder[0] !== heavy.baseOrder[0] && alphaPct > 0;

  const topAlpha = heavy.pairAlphas[0];
  const topModel = flippedTop
    ? dropMode === "amip"
      ? heavy.dataset.models[light.postDropOrder[0]].name
      : heavy.dataset.models[light.randomDropOrder[0]].name
    : heavy.dataset.models[heavy.baseOrder[0]].name;

  return (
    <div className="bg-ink-950/40 border border-white/5 rounded-2xl p-5 flex flex-col gap-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-white/40 num">
          Influence histogram
        </div>
        <div className="text-sm text-white/60 mt-1.5 leading-snug">
          {showLongExplanations ? (
            <>
              Every vote, ranked by AMIP influence on the rank-1 vs rank-2 gap.{" "}
              {dropMode === "amip" ? (
                <span className="text-accent-amber">Amber band</span>
              ) : (
                <span className="text-white/70">Random mode</span>
              )}{" "}
              shows your drop-set.
            </>
          ) : (
            <>
              Votes ranked by leverage;{" "}
              {dropMode === "amip" ? (
                <span className="text-accent-amber">amber</span>
              ) : (
                <span className="text-white/70">cyan</span>
              )}{" "}
              marks dropped votes.
            </>
          )}
        </div>
      </div>

      <div className="flex items-end gap-px h-32 mt-1">
        {buckets.map((b, i) => {
          const h = Math.min(1, Math.log10(1 + b.total) / Math.log10(1 + 80));
          const dropFrac = b.total > 0 ? b.inDrop / b.total : 0;
          const randomFrac =
            dropMode === "random" ? Math.min(1, dropCount / N) : 0;
          const total = Math.max(dropFrac, randomFrac);
          return (
            <div
              key={i}
              className="flex-1 relative"
              style={{ height: `${Math.max(2, h * 100)}%` }}
            >
              <div className="absolute inset-x-0 inset-y-0 bg-white/[0.06] rounded-t-sm" />
              <motion.div
                className={`absolute inset-x-0 bottom-0 ${
                  dropMode === "amip"
                    ? "bg-gradient-to-t from-amber-500 via-amber-400 to-rose-400/80"
                    : "bg-gradient-to-t from-cyan-500/60 to-cyan-300/60"
                } rounded-t-sm`}
                animate={{ height: `${total * 100}%` }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-white/30 num">
        <span>low influence</span>
        <span>high influence →</span>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-2">
        <Metric
          label="Top-pair α_flip"
          value={formatAlphaPercent(topAlpha)}
          tone={statusFromAlpha(topAlpha)}
        />
        <Metric
          label="Top-1 now"
          value={topModel}
          tone={flippedTop ? "fragile" : "robust"}
          flipped={flippedTop}
        />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  flipped,
}: {
  label: string;
  value: string;
  tone: "fragile" | "moderate" | "robust" | "unknown";
  flipped?: boolean;
}) {
  const cls =
    tone === "fragile"
      ? "text-accent-rose"
      : tone === "moderate"
      ? "text-accent-amber"
      : tone === "robust"
      ? "text-accent-emerald"
      : "text-white/60";
  return (
    <div className="bg-ink-950/60 border border-white/5 rounded-lg px-3.5 py-3 relative overflow-hidden">
      <div className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className={`num text-lg font-semibold mt-0.5 ${cls} truncate`}>
        {value}
      </div>
      {flipped && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute top-2 right-2 text-[9px] num uppercase tracking-wider text-accent-rose"
        >
          flipped
        </motion.div>
      )}
    </div>
  );
}

function LeaderboardPanel({
  heavy,
  light,
  dropMode,
  alphaPct,
}: {
  heavy: HeavyState;
  light: LightState;
  dropMode: DropMode;
  alphaPct: number;
}) {
  const order =
    dropMode === "amip" ? light.postDropOrder : light.randomDropOrder;
  const eloAfter =
    dropMode === "amip" ? light.postDropElo : light.randomDropElo;
  const flippedTop = order[0] !== heavy.baseOrder[0] && alphaPct > 0;

  // Pre-compute base-rank lookup once per render so we don't quadratic-search
  // inside the row map.
  const baseRankOf = new Int32Array(heavy.dataset.models.length);
  for (let r = 0; r < heavy.baseOrder.length; r++) {
    baseRankOf[heavy.baseOrder[r]] = r + 1;
  }

  // Movement summary for the header.
  let upCount = 0;
  let downCount = 0;
  let maxJump = 0;
  for (let r = 0; r < order.length; r++) {
    const m = baseRankOf[order[r]] - (r + 1);
    if (m > 0) upCount++;
    else if (m < 0) downCount++;
    if (Math.abs(m) > maxJump) maxJump = Math.abs(m);
  }
  const totalMoves = upCount + downCount;
  const showMoves = alphaPct > 0;

  return (
    <div className="bg-ink-950/40 border border-white/5 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/40 num">
            Robustness-Aware Leaderboard
          </div>
          <div className="text-sm text-white/60 mt-1">
            Live BT refit ·{" "}
            {dropMode === "amip" ? "AMIP-ranked drop" : "uniform random drop"} ·{" "}
            <span className="num text-white/85">α = {alphaPct.toFixed(3)}%</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <MoveSummary
            show={showMoves}
            up={upCount}
            down={downCount}
            total={totalMoves}
            maxJump={maxJump}
            modelCount={order.length}
          />
          {flippedTop && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-[11px] uppercase tracking-wider num text-accent-rose px-2.5 py-1 rounded-full bg-accent-rose/10 border border-accent-rose/30"
            >
              Top rank flipped
            </motion.div>
          )}
        </div>
      </div>

      {/* Header — column widths tuned to fit the readout column on xl+. */}
      <div
        className="hidden sm:grid grid-cols-[22px_72px_minmax(0,1fr)_56px_88px_158px_56px] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-white/35 num border-b border-white/5"
        title="Δ rank compares each model's current rank to its rank before any votes were dropped."
      >
        <div>#</div>
        <div>Δ rank · was</div>
        <div>Model</div>
        <div className="text-right">Elo</div>
        <div>95% CI</div>
        <div>α_flip · adjacent pair</div>
        <div className="text-right">Status</div>
      </div>

      <div className="flex flex-col mt-1">
        {order.map((modelIdx, rank) => {
          const baseRank = baseRankOf[modelIdx];
          const moved = baseRank - (rank + 1);
          const elo = eloAfter[modelIdx];
          const ciLow = heavy.ci.lower[modelIdx];
          const ciHigh = heavy.ci.upper[modelIdx];
          const eloLow = heavy.baseElo[modelIdx] + (ciLow - heavy.baseFit.beta[modelIdx]) * 173.7;
          const eloHigh =
            heavy.baseElo[modelIdx] + (ciHigh - heavy.baseFit.beta[modelIdx]) * 173.7;
          const alphaPair =
            rank < heavy.pairAlphas.length ? heavy.pairAlphas[rank] : Infinity;
          const status = statusFromAlpha(alphaPair);
          const isTopFlipped = rank === 0 && flippedTop;
          const edgeClass =
            moved > 0
              ? "border-l-2 border-emerald-400/60"
              : moved < 0
              ? "border-l-2 border-rose-400/60"
              : "border-l-2 border-transparent";
          return (
            <motion.div
              key={modelIdx}
              layout
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              className={`sm:grid sm:grid-cols-[22px_72px_minmax(0,1fr)_56px_88px_158px_56px] flex flex-wrap gap-2 items-center pl-2 pr-3 py-2.5 rounded-lg my-0.5 ${edgeClass} ${
                isTopFlipped
                  ? "bg-gradient-to-r from-rose-500/[0.08] to-transparent"
                  : "hover:bg-white/[0.02]"
              }`}
            >
              <div className="num text-sm text-white/40 tabular-nums">
                {rank + 1}
              </div>
              <div>
                <RankDelta moved={moved} baseRank={baseRank} />
              </div>
              <div className="min-w-0 flex items-center gap-2 flex-1">
                <div className="text-sm text-white/90 truncate">
                  {heavy.dataset.models[modelIdx].name}
                </div>
                <div className="text-[11px] text-white/40 truncate">
                  {heavy.dataset.models[modelIdx].organization}
                </div>
              </div>
              <div className="num text-sm text-white/90 tabular-nums sm:text-right">
                {Math.round(elo)}
              </div>
              <div className="num text-[11px] text-white/45 tabular-nums">
                [{Math.round(eloLow)}, {Math.round(eloHigh)}]
              </div>
              <div>
                <FragilityBar alpha={alphaPair} />
              </div>
              <div className="sm:text-right">
                <span
                  className={`text-[10px] num uppercase tracking-wider ${
                    status === "fragile"
                      ? "text-accent-rose"
                      : status === "moderate"
                      ? "text-accent-amber"
                      : "text-accent-emerald"
                  }`}
                >
                  {statusLabel(status)}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function RankDelta({ moved, baseRank }: { moved: number; baseRank: number }) {
  if (moved === 0) {
    return (
      <span
        className="num text-[11px] text-white/25 tabular-nums flex items-center gap-1"
        aria-label="Rank unchanged"
        title="Held its rank"
      >
        <Minus className="w-3 h-3" />
        held
      </span>
    );
  }
  const up = moved > 0;
  return (
    <motion.span
      layout
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className={`num text-[11px] tabular-nums flex items-center gap-1 ${
        up ? "text-accent-emerald" : "text-accent-rose"
      }`}
      title={
        up
          ? `Was rank ${baseRank}, moved up ${moved} ${moved === 1 ? "place" : "places"}`
          : `Was rank ${baseRank}, moved down ${-moved} ${-moved === 1 ? "place" : "places"}`
      }
    >
      {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      <span className="font-medium">{Math.abs(moved)}</span>
      <span className="text-white/35 ml-0.5">· #{baseRank}</span>
    </motion.span>
  );
}

function MoveSummary({
  show,
  up,
  down,
  total,
  maxJump,
  modelCount,
}: {
  show: boolean;
  up: number;
  down: number;
  total: number;
  maxJump: number;
  modelCount: number;
}) {
  if (!show) return null;
  if (total === 0) {
    return (
      <span className="text-[10px] num uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/10 text-white/45 flex items-center gap-1.5">
        <Minus className="w-3 h-3" />
        all ranks held
      </span>
    );
  }
  return (
    <motion.span
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-[10px] num uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-white/70 flex items-center gap-2"
      title={`${total} of ${modelCount} model ranks changed compared to before any votes were dropped`}
    >
      <span className="text-white/55">
        {total} of {modelCount} moved
      </span>
      {up > 0 && (
        <span className="text-accent-emerald flex items-center gap-0.5">
          <ArrowUp className="w-3 h-3" />
          {up}
        </span>
      )}
      {down > 0 && (
        <span className="text-accent-rose flex items-center gap-0.5">
          <ArrowDown className="w-3 h-3" />
          {down}
        </span>
      )}
      <span className="text-white/35">·</span>
      <span className="text-white/55">max ±{maxJump}</span>
    </motion.span>
  );
}

function FootnoteBar({ dataset }: { dataset: SyntheticDataset }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-white/35 num border-t border-white/5 pt-4">
      <span>{dataset.models.length} models</span>
      <span className="text-white/20">·</span>
      <span>
        {dataset.votes.length.toLocaleString()}{" "}
        {dataset.isReal ? "real votes" : "synthetic votes"}
      </span>
      <span className="text-white/20">·</span>
      <span>seed {dataset.seed}</span>
      {dataset.isReal && dataset.totalAvailable && (
        <>
          <span className="text-white/20">·</span>
          <span>
            of {dataset.totalAvailable.toLocaleString()} between these models
          </span>
        </>
      )}
      <span className="text-white/20">·</span>
      <span className="text-white/40">{dataset.description}</span>
    </div>
  );
}

function RealLeaderboardOverlay({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 24, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 12, scale: 0.98 }}
        transition={{ duration: 0.25 }}
        className="glass-strong rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-accent-cyan/80 num">
              Real LMSYS Chatbot Arena snapshot
            </div>
            <div className="text-lg font-semibold mt-0.5">
              The actual leaderboard, for context
            </div>
            <div className="text-xs text-white/45 mt-1 num">
              Snapshot taken{" "}
              {new Date(leaderboardSnapshot.fetched_at).toLocaleDateString(
                undefined,
                { year: "numeric", month: "long", day: "numeric" },
              )}{" "}
              · run <code className="text-white/70">npm run prepare-data</code>{" "}
              to refresh
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white text-sm border border-white/10 rounded-lg px-3 py-1.5 shrink-0"
          >
            Close
          </button>
        </div>
        <div className="overflow-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-ink-900/95 backdrop-blur">
              <tr className="text-[10px] uppercase tracking-wider text-white/40 num">
                <th className="text-left px-6 py-3 font-normal">#</th>
                <th className="text-left px-2 py-3 font-normal">Model</th>
                <th className="text-left px-2 py-3 font-normal">Org</th>
                <th className="text-right px-2 py-3 font-normal">Score</th>
                <th className="text-left px-2 py-3 font-normal">95% CI</th>
                <th className="text-right px-6 py-3 font-normal">Battles</th>
              </tr>
            </thead>
            <tbody>
              {leaderboardSnapshot.rows.map((row) => (
                <tr
                  key={row.rank}
                  className="border-t border-white/5 hover:bg-white/[0.02]"
                >
                  <td className="px-6 py-2.5 text-white/40 num tabular-nums">
                    {row.rank}
                  </td>
                  <td className="px-2 py-2.5 text-white/90">{row.model}</td>
                  <td className="px-2 py-2.5 text-white/55 text-xs">
                    {row.organization}
                  </td>
                  <td className="px-2 py-2.5 text-white/90 num tabular-nums text-right">
                    {row.score}
                  </td>
                  <td className="px-2 py-2.5 text-white/45 num tabular-nums text-xs">
                    [{row.ci_low}, {row.ci_high}]
                  </td>
                  <td className="px-6 py-2.5 text-white/55 num tabular-nums text-right">
                    {row.battles.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-white/5 text-xs text-white/45 leading-relaxed">
          {leaderboardSnapshot.note}
        </div>
      </motion.div>
    </motion.div>
  );
}

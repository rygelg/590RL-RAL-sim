import type { PresetId } from "./synthetic";

export type DropMode = "amip" | "random";
export type Estimator = "vanilla" | "capped";
export type ScenarioTone = "amber" | "rose" | "cyan" | "emerald";

export interface PlaygroundScenario {
  id: string;
  eyebrow: string;
  title: string;
  settings: string;
  description: string;
  outcome: string;
  tone: ScenarioTone;
  state: {
    preset: PresetId;
    estimator: Estimator;
    dropMode: DropMode;
    alphaPct: number;
  };
}

export const playgroundScenarios: PlaygroundScenario[] = [
  {
    id: "min-flip",
    eyebrow: "01 · Min flip",
    title: "60 real votes flip the throne",
    settings: "Arena · vanilla · AMIP · α = 2%",
    description:
      "On this 3,000-vote Arena slice, AMIP puts α_flip for #1 vs #2 near 1.73% (~52 votes). The 2% slider (60 drops) sits just above that: a clean #1↔#2 swap with zero collateral — every other rank holds. That margin is the regime influence-capped BT is meant to blunt.",
    outcome: "Vanilla: gemini-2.5-pro ↔ chatgpt-4o-latest · 60 votes",
    tone: "amber",
    state: {
      preset: "arena",
      estimator: "vanilla",
      dropMode: "amip",
      alphaPct: 2,
    },
  },
  {
    id: "cascade",
    eyebrow: "02 · Cascade",
    title: "Push to 10% · throne falls 5 places",
    settings: "Arena · vanilla · AMIP · α = 10%",
    description:
      "Scale the same AMIP attack to ≈6× α_flip. Instability stops being local: gemini-2.5-pro slides from #1 to #6, and the entire top-6 reorders. A single coordinated noise budget is enough to make half the leaderboard unrecognisable.",
    outcome: "Vanilla: gemini-2.5-pro #1 → #6 · 6 of 12 moved",
    tone: "rose",
    state: {
      preset: "arena",
      estimator: "vanilla",
      dropMode: "amip",
      alphaPct: 10,
    },
  },
  {
    id: "ci-blind",
    eyebrow: "03 · CI blindspot",
    title: "Same 300 votes at random · throne holds",
    settings: "Arena · vanilla · random · α = 10%",
    description:
      "Same dataset, same 300 dropped votes — but uniform-at-random instead of AMIP-targeted. gemini-2.5-pro keeps #1 and the leaderboard stays recognisable: only two adjacent pairs nudge by a single rank. Random-noise intuition is exactly why classical CIs miss scenario 02.",
    outcome: "Random drop: #1 holds · two adjacent ±1 swaps",
    tone: "cyan",
    state: {
      preset: "arena",
      estimator: "vanilla",
      dropMode: "random",
      alphaPct: 10,
    },
  },
  {
    id: "defense-holds",
    eyebrow: "04 · Defense holds",
    title: "Same 2% AMIP budget — #1 holds (capped)",
    settings: "Arena · capped · AMIP · α = 2%",
    description:
      "Replay scenario 01 with influence-capped BT. Capping the top 0.1% by aggregate influence lifts the #1–#2 α_flip from about 1.73% (~52 votes) to about 2.07% (~62 votes). The same 60-vote, 2% AMIP budget still clears vanilla’s bar but sits below the capped one — so gemini-2.5-pro keeps #1 without touching the slider.",
    outcome: "Capped: #1 holds at 2% (60 votes)",
    tone: "emerald",
    state: {
      preset: "arena",
      estimator: "capped",
      dropMode: "amip",
      alphaPct: 2,
    },
  },
];

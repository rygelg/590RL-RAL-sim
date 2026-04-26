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
      "Sit just above AMIP's α_flip on the 3,000-vote real-arena subset (≈1.73%). 60 high-leverage votes is the smallest budget that produces a clean #1↔#2 swap with zero collateral — every other rank holds. This is the exploit influence-capped BT is meant to blunt.",
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
    title: "Same 60 votes no longer flip #1",
    settings: "Arena · capped · AMIP · α = 2%",
    description:
      "Replay scenario 01 with influence-capped BT instead of vanilla BT. Capping the top 0.1% of votes by aggregate influence raises the top-pair α_flip from 1.73% to 2.07%, so the same 60-vote AMIP attack no longer clears the bar and gemini-2.5-pro stays at #1.",
    outcome: "Capped: #1 holds at the same 60-vote budget",
    tone: "emerald",
    state: {
      preset: "arena",
      estimator: "capped",
      dropMode: "amip",
      alphaPct: 2,
    },
  },
];

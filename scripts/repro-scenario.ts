#!/usr/bin/env -S npx tsx
/**
 * Reproduces the exact runtime path of components/Playground.tsx for each
 * preset+dropMode+alpha combination behind a one-click scenario, so we can
 * compare against the rendered UI when something looks off.
 */

import { generatePreset } from "../lib/synthetic";
import { fitBT, orderFromBeta, type Vote } from "../lib/bt";
import { alphaFlip } from "../lib/amip";
import { rng } from "../lib/math";

function reproduceScenario(label: string, opts: {
  preset: "arena" | "mtbench";
  dropMode: "amip" | "random";
  alphaPct: number;
}) {
  const ds = generatePreset(opts.preset, 3000);
  const n = ds.models.length;
  const N = ds.votes.length;
  const baseFit = fitBT(ds.votes, n);
  const baseOrder = orderFromBeta(baseFit.beta);

  const top1 = baseOrder[0];
  const top2 = baseOrder[1];
  const topAmip = alphaFlip(baseFit, ds.votes, top1, top2, {
    maxFraction: 0.4,
    minStep: 1,
  });

  const idx = new Int32Array(N);
  for (let k = 0; k < N; k++) idx[k] = k;
  const rand = rng(7919);
  for (let k = N - 1; k > 0; k--) {
    const r = Math.floor(rand() * (k + 1));
    [idx[k], idx[r]] = [idx[r], idx[k]];
  }

  const dropCount = Math.min(N, Math.floor((opts.alphaPct / 100) * N));
  const dropIdx =
    opts.dropMode === "amip"
      ? Array.from(topAmip.rankedByInfluence.slice(0, dropCount))
      : Array.from(idx.slice(0, dropCount));

  const dropSet = new Set(dropIdx);
  const newVotes: Vote[] = ds.votes.map((v, i) => ({
    ...v,
    w: dropSet.has(i) ? 0 : 1,
  }));
  const newFit = fitBT(newVotes, n, { init: baseFit.beta });
  const newOrder = orderFromBeta(newFit.beta);

  const flipped = newOrder[0] !== baseOrder[0];
  const movements: string[] = [];
  for (let r = 0; r < n; r++) {
    if (newOrder[r] !== baseOrder[r]) {
      const m = newOrder[r];
      const baseR = baseOrder.indexOf(m) + 1;
      movements.push(`#${r + 1} ${ds.models[m].name} (was #${baseR})`);
    }
  }

  console.log(`\n${label}:  ${opts.preset} · ${opts.dropMode} · α=${opts.alphaPct}% (${dropCount} of ${N} votes)`);
  console.log(`  base top: ${ds.models[top1].name} → post-drop top: ${ds.models[newOrder[0]].name}  ${flipped ? "*** FLIP ***" : "(hold)"}`);
  if (movements.length) {
    console.log("  moved:");
    for (const m of movements) console.log(`    ${m}`);
  } else {
    console.log("  no rank changes");
  }
}

// Each one-click scenario as defined in components/Playground.tsx.
reproduceScenario("scenario 01 · min-flip",  { preset: "arena",   dropMode: "amip",   alphaPct: 2  });
reproduceScenario("scenario 02 · cascade",   { preset: "arena",   dropMode: "amip",   alphaPct: 10 });
reproduceScenario("scenario 03 · ci-blind",  { preset: "arena",   dropMode: "random", alphaPct: 10 });
reproduceScenario("scenario 04 · wide-gaps", { preset: "mtbench", dropMode: "amip",   alphaPct: 1  });

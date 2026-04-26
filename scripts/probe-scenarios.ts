#!/usr/bin/env -S npx tsx
/**
 * Empirically probes the Playground at the same dataset / preset / vote count
 * the runtime uses (3,000 votes), so the four "one-click scenarios" can be
 * re-calibrated against REAL Chatbot Arena data.
 *
 * For each candidate α we report:
 *   - rank flips: which models moved, by how much
 *   - did #1 swap?
 *   - net "models moved" count
 * for both AMIP-ordered drop and uniform-random drop.
 *
 * Run:  npx tsx scripts/probe-scenarios.mts
 */

import { generatePreset } from "../lib/synthetic";
import { fitBT, orderFromBeta, type Vote } from "../lib/bt";
import { alphaFlip } from "../lib/amip";
import { rng } from "../lib/math";

const VOTES = 3000;

function summarise(
  baseOrder: number[],
  postOrder: number[],
  modelNames: string[],
): { moved: number; maxDelta: number; topFlipped: boolean; details: string } {
  const baseRank = new Map<number, number>();
  baseOrder.forEach((m, r) => baseRank.set(m, r + 1));
  const postRank = new Map<number, number>();
  postOrder.forEach((m, r) => postRank.set(m, r + 1));

  let moved = 0;
  let maxDelta = 0;
  const movements: string[] = [];
  for (const m of baseOrder) {
    const a = baseRank.get(m)!;
    const b = postRank.get(m)!;
    if (a !== b) {
      moved++;
      maxDelta = Math.max(maxDelta, Math.abs(a - b));
      movements.push(`${modelNames[m]}: ${a}->${b}`);
    }
  }
  return {
    moved,
    maxDelta,
    topFlipped: baseOrder[0] !== postOrder[0],
    details: movements.slice(0, 6).join("  "),
  };
}

function dropAndRefit(votes: Vote[], n: number, dropIdx: number[], baseBeta: Float64Array) {
  const drop = new Set(dropIdx);
  const newVotes: Vote[] = votes.map((v, i) => ({ ...v, w: drop.has(i) ? 0 : 1 }));
  const fit = fitBT(newVotes, n, { init: baseBeta });
  return orderFromBeta(fit.beta);
}

function probe(presetId: "arena" | "mtbench") {
  console.log(`\n=== preset=${presetId} ===`);
  const ds = generatePreset(presetId, VOTES);
  const n = ds.models.length;
  const N = ds.votes.length;
  const baseFit = fitBT(ds.votes, n);
  const baseOrder = orderFromBeta(baseFit.beta);
  const top1 = baseOrder[0];
  const top2 = baseOrder[1];
  const modelNames = ds.models.map((m) => m.name);

  console.log(
    `  ${n} models, ${N} votes. Top: ${modelNames[top1]} vs ${modelNames[top2]}.`,
  );

  // Native α_flip on the top pair.
  const topAmip = alphaFlip(baseFit, ds.votes, top1, top2, {
    maxFraction: 0.4,
    minStep: 1,
  });
  const alphaTopPct = topAmip.alpha * 100;
  console.log(
    `  α_flip(top1,top2) = ${alphaTopPct.toFixed(3)}%  (${Math.ceil(topAmip.alpha * N)} of ${N} votes)`,
  );

  // Pre-shuffle for random-drop comparator.
  const rand = rng(7919);
  const randIdx = new Int32Array(N);
  for (let k = 0; k < N; k++) randIdx[k] = k;
  for (let k = N - 1; k > 0; k--) {
    const r = Math.floor(rand() * (k + 1));
    [randIdx[k], randIdx[r]] = [randIdx[r], randIdx[k]];
  }

  // Sweep α values.
  const sweep = [
    Math.max(alphaTopPct, 0.05),
    alphaTopPct * 1.2,
    0.5,
    1.0,
    2.0,
    3.0,
    5.0,
    8.0,
    10.0,
  ];
  for (const aPct of sweep) {
    const dropCount = Math.floor((aPct / 100) * N);
    if (dropCount <= 0) continue;
    const amipDrop = Array.from(topAmip.rankedByInfluence.slice(0, dropCount));
    const randomDrop = Array.from(randIdx.slice(0, dropCount));
    const aOrder = dropAndRefit(ds.votes, n, amipDrop, baseFit.beta);
    const rOrder = dropAndRefit(ds.votes, n, randomDrop, baseFit.beta);
    const aS = summarise(baseOrder, aOrder, modelNames);
    const rS = summarise(baseOrder, rOrder, modelNames);
    console.log(
      `  α=${aPct.toFixed(2)}% (${dropCount} votes)  ` +
        `AMIP: top=${aS.topFlipped ? "FLIP" : "hold"} moved=${aS.moved}/${n} max±${aS.maxDelta}  ${aS.details}` +
        `\n     random: top=${rS.topFlipped ? "FLIP" : "hold"} moved=${rS.moved}/${n} max±${rS.maxDelta}`,
    );
  }
}

probe("arena");
probe("mtbench");

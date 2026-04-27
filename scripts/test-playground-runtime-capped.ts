import assert from "node:assert/strict";
import { generatePreset } from "../lib/synthetic";
import { fitBT, orderFromBeta } from "../lib/bt";
import { alphaFlip } from "../lib/amip";
import { capAndRefit } from "../lib/cap";
import { materializeBaseVotes, refitAfterDrops } from "../lib/playground-runtime";

const ds = generatePreset("arena", 3000);
const n = ds.models.length;

const vanillaBaseVotes = materializeBaseVotes(ds.votes);
const vanillaFit = fitBT(vanillaBaseVotes, n);
const vanillaOrder = orderFromBeta(vanillaFit.beta);
const vanillaTop = alphaFlip(vanillaFit, vanillaBaseVotes, vanillaOrder[0], vanillaOrder[1], {
  maxFraction: 0.4,
  minStep: 1,
});
const vanillaPost = refitAfterDrops(
  vanillaBaseVotes,
  n,
  vanillaTop.rankedByInfluence.slice(0, 60),
  vanillaFit.beta,
);
const vanillaPostOrder = orderFromBeta(vanillaPost.beta);
assert.notEqual(
  vanillaPostOrder[0],
  vanillaOrder[0],
  "vanilla should still flip at the 60-vote AMIP budget",
);

const cap = capAndRefit(ds.votes, n, 0.001);
const cappedBaseVotes = materializeBaseVotes(ds.votes, cap.cappedMask);
const cappedOrder = orderFromBeta(cap.fit.beta);
const cappedTop = alphaFlip(cap.fit, cappedBaseVotes, cappedOrder[0], cappedOrder[1], {
  maxFraction: 0.4,
  minStep: 1,
});
const cappedPost = refitAfterDrops(
  cappedBaseVotes,
  n,
  cappedTop.rankedByInfluence.slice(0, 60),
  cap.fit.beta,
);
const cappedPostOrder = orderFromBeta(cappedPost.beta);
assert.equal(
  cappedPostOrder[0],
  cappedOrder[0],
  "capped runtime should keep #1 when replaying the 60-vote AMIP attack",
);

console.log("capped runtime preserves the defense scenario");

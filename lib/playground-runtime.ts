import { fitBT, type BTFit, type Vote } from "./bt";

export function materializeBaseVotes(
  votes: Vote[],
  cappedMask?: Uint8Array,
): Vote[] {
  return votes.map((v, i) => ({
    ...v,
    w: cappedMask?.[i] ? 0 : v.w ?? 1,
  }));
}

export function refitAfterDrops(
  baseVotes: Vote[],
  n: number,
  dropIndices: ArrayLike<number>,
  init: Float64Array,
): BTFit {
  const nextVotes = baseVotes.map((v) => ({ ...v }));
  for (let r = 0; r < dropIndices.length; r++) {
    nextVotes[dropIndices[r]].w = 0;
  }
  return fitBT(nextVotes, n, { init });
}

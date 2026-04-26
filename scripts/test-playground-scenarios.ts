import assert from "node:assert/strict";
import { playgroundScenarios } from "../lib/playground-scenarios";

assert.equal(playgroundScenarios.length, 4, "playground should expose exactly four scenarios");

const defense = playgroundScenarios[3];
assert.equal(defense?.id, "defense-holds", "fourth card should be the capped-BT defense");
assert.equal(defense?.state.estimator, "capped", "defense card should use capped BT");
assert.equal(defense?.state.preset, "arena", "defense card should stay on real Arena data");
assert.equal(defense?.state.dropMode, "amip", "defense card should keep the AMIP attack");
assert.equal(defense?.state.alphaPct, 2, "defense card should reuse the 2% / 60-vote budget");
assert.match(
  defense?.title ?? "",
  /hold|resist|no longer flip/i,
  "defense title should make the mitigation explicit",
);
assert.match(
  defense?.outcome ?? "",
  /#1 holds|60 votes/i,
  "defense outcome should summarize the same-budget protection",
);

console.log("playground scenario metadata looks correct");

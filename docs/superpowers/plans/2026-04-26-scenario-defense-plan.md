# Scenario Defense Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the synthetic playground scenario with a real-Arena capped-BT defense scenario and make the four-card story explicitly show the usefulness of influence-capped BT.

**Architecture:** Move the scenario metadata out of `components/Playground.tsx` into a small shared module so it can be checked independently. Add a lightweight assertion script that locks the four-card lineup and the new capped-BT scenario facts against the measured simulation behavior, then point the playground UI at the shared metadata.

**Tech Stack:** Next.js, TypeScript, `tsx`, Node `assert`

---

### Task 1: Lock the intended scenario lineup with a failing check

**Files:**
- Create: `scripts/test-playground-scenarios.ts`
- Test: `scripts/test-playground-scenarios.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { playgroundScenarios } from "../lib/playground-scenarios";

assert.equal(playgroundScenarios.length, 4);
assert.equal(playgroundScenarios[3]?.id, "defense-holds");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-playground-scenarios.ts`
Expected: FAIL because `../lib/playground-scenarios` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export const playgroundScenarios = [];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test-playground-scenarios.ts`
Expected: PASS once the real metadata exists.

- [ ] **Step 5: Commit**

```bash
git add scripts/test-playground-scenarios.ts lib/playground-scenarios.ts components/Playground.tsx
git commit -m "feat: sharpen playground scenario story"
```

### Task 2: Replace the synthetic scenario with the capped-BT defense card

**Files:**
- Create: `lib/playground-scenarios.ts`
- Modify: `components/Playground.tsx`
- Test: `scripts/test-playground-scenarios.ts`

- [ ] **Step 1: Expand the failing test with the expected defense facts**

```ts
const defense = playgroundScenarios[3];
assert.equal(defense?.state.estimator, "capped");
assert.equal(defense?.state.preset, "arena");
assert.equal(defense?.state.dropMode, "amip");
assert.equal(defense?.state.alphaPct, 2);
assert.match(defense?.title ?? "", /holds|resists|no longer flip/i);
assert.match(defense?.outcome ?? "", /#1 holds|60 votes/i);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-playground-scenarios.ts`
Expected: FAIL until the shared metadata and new scenario copy are in place.

- [ ] **Step 3: Write minimal implementation**

```ts
export const playgroundScenarios = [
  // existing scenario objects,
  {
    id: "defense-holds",
    eyebrow: "04 · Defense holds",
    state: { preset: "arena", estimator: "capped", dropMode: "amip", alphaPct: 2 },
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test-playground-scenarios.ts`
Expected: PASS with four scenarios and the new defense card wired in.

- [ ] **Step 5: Commit**

```bash
git add scripts/test-playground-scenarios.ts lib/playground-scenarios.ts components/Playground.tsx
git commit -m "feat: replace synthetic scenario with capped defense"
```

### Task 3: Verify the card copy against the actual simulation behavior

**Files:**
- Modify: `lib/playground-scenarios.ts`
- Test: `scripts/repro-scenario.ts`

- [ ] **Step 1: Run the reproduction script against the updated lineup**

```bash
npx tsx scripts/repro-scenario.ts
```

- [ ] **Step 2: Confirm the scenario text matches measured behavior**

```text
vanilla @ 2% AMIP: top flips
capped @ 2% AMIP: top holds
```

- [ ] **Step 3: Adjust wording if any measured fact disagrees**

```ts
description: "Same 60-vote AMIP attack, but capped BT raises alpha_flip enough that #1 survives."
```

- [ ] **Step 4: Re-run the checks**

Run: `npx tsx scripts/test-playground-scenarios.ts && npx tsx scripts/repro-scenario.ts`
Expected: PASS and scenario outputs consistent with the card copy.

- [ ] **Step 5: Commit**

```bash
git add lib/playground-scenarios.ts components/Playground.tsx scripts/test-playground-scenarios.ts
git commit -m "test: verify playground defense scenario"
```

import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialNeeds, tickNeeds, satisfyNeed, DEFAULT_NEEDS_GROWTH_PROFILE } from "../../creature/state/needs";

test("hunger increases over successive ticks", () => {
  let needs = createInitialNeeds({ hunger: 10 });
  needs = tickNeeds(needs);
  needs = tickNeeds(needs);
  assert.ok(needs.hunger > 10);
});

test("thirst increases over successive ticks", () => {
  let needs = createInitialNeeds({ thirst: 10 });
  needs = tickNeeds(needs);
  assert.ok(needs.thirst > 10);
});

test("sleep pressure increases over successive ticks and is bounded to 100", () => {
  let needs = createInitialNeeds({ sleep: 99 });
  for (let i = 0; i < 20; i++) needs = tickNeeds(needs);
  assert.equal(needs.sleep, 100);
});

test("satisfyNeed reduces a need and clamps at 0", () => {
  const needs = createInitialNeeds({ hunger: 5 });
  const satisfied = satisfyNeed(needs, "hunger", 50);
  assert.equal(satisfied.hunger, 0);
});

test("species-specific growth profile produces different hunger rates for identical starting needs", () => {
  const fastMetabolism = { ...DEFAULT_NEEDS_GROWTH_PROFILE, hunger: 1 };
  const slowMetabolism = { ...DEFAULT_NEEDS_GROWTH_PROFILE, hunger: 0.05 };
  const start = createInitialNeeds({ hunger: 0 });
  const fast = tickNeeds(start, fastMetabolism);
  const slow = tickNeeds(start, slowMetabolism);
  assert.ok(fast.hunger > slow.hunger);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { createEmptyPoliticsState } from "../../politics/contracts";
import { crystallizeCustomsIntoRules, maybeFormalizeLaw, observeCustom } from "../../politics/rules";

test("observeCustom creates a tracker on first sight and accumulates on repeats", () => {
  let politics = createEmptyPoliticsState();
  politics = observeCustom(politics, "settlement-a", "resource_sharing", 1, false);
  const trackers = Object.values(politics.customTrackers);
  assert.equal(trackers.length, 1);
  assert.equal(trackers[0].observedCount, 1);

  politics = observeCustom(politics, "settlement-a", "resource_sharing", 2, true);
  const updated = Object.values(politics.customTrackers)[0];
  assert.equal(updated.observedCount, 2);
  assert.equal(updated.enforcedViolationCount, 1);
});

test("a customary rule only crystallizes once observation AND enforcement thresholds are both met", () => {
  let politics = createEmptyPoliticsState();
  const rng = DeterministicRng.fromSeed("test", 1);

  for (let i = 0; i < 5; i++) {
    politics = observeCustom(politics, "settlement-a", "land_use", i, false); // no enforcement yet
  }
  politics = crystallizeCustomsIntoRules(politics, "settlement-a", 10, rng);
  assert.equal(Object.keys(politics.rules).length, 0, "should not crystallize without enforced violations");

  politics = observeCustom(politics, "settlement-a", "land_use", 11, true);
  politics = observeCustom(politics, "settlement-a", "land_use", 12, true);
  politics = crystallizeCustomsIntoRules(politics, "settlement-a", 13, rng);
  const rules = Object.values(politics.rules);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].status, "customary");
  assert.equal(rules[0].concept, "land_use");
  assert.equal(rules[0].creator, null, "customary law has no single author");
});

test("crystallization is idempotent: a tracker that already produced a rule does not produce a second one", () => {
  let politics = createEmptyPoliticsState();
  const rng = DeterministicRng.fromSeed("test", 2);
  for (let i = 0; i < 8; i++) politics = observeCustom(politics, "s", "hospitality", i, true);
  politics = crystallizeCustomsIntoRules(politics, "s", 20, rng);
  politics = crystallizeCustomsIntoRules(politics, "s", 21, rng);
  assert.equal(Object.keys(politics.rules).length, 1);
});

test("maybeFormalizeLaw only formalizes once population and authority-concentration thresholds are met", () => {
  let politics = createEmptyPoliticsState();
  const rng = DeterministicRng.fromSeed("test", 3);
  for (let i = 0; i < 8; i++) politics = observeCustom(politics, "s", "trade_conduct", i, true);
  politics = crystallizeCustomsIntoRules(politics, "s", 10, rng);
  assert.equal(Object.values(politics.rules)[0].status, "customary");

  politics = maybeFormalizeLaw(politics, "s", 11, 10, 0.9, "leader-1"); // population too low
  assert.equal(Object.values(politics.rules)[0].status, "customary");

  politics = maybeFormalizeLaw(politics, "s", 12, 200, 0.9, "leader-1");
  const rule = Object.values(politics.rules)[0];
  assert.equal(rule.status, "formal");
  assert.equal(rule.creator, "leader-1");

  const lawEvents = politics.history.filter((h) => h.type === "law_created");
  assert.equal(lawEvents.length, 1);
});

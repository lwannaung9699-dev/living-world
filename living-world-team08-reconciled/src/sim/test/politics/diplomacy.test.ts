import { test } from "node:test";
import assert from "node:assert/strict";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { createEmptyPoliticsState } from "../../politics/contracts";
import { establishTerritory, evolveRelation, expireTreaties, findOrInitRelation, recordTreatyViolation, signTreaty, terminateTreaty, transferTerritory } from "../../politics/diplomacy";

test("findOrInitRelation creates a peace relation on first contact and is idempotent for either argument order", () => {
  let politics = createEmptyPoliticsState();
  const first = findOrInitRelation(politics, "polity-a", "polity-b", 1);
  politics = first.politics;
  assert.equal(first.relation.stance, "peace");
  assert.equal(Object.keys(politics.diplomaticRelations).length, 1);

  const second = findOrInitRelation(politics, "polity-b", "polity-a", 2);
  assert.equal(second.relation.relationId, first.relation.relationId, "relation lookup must be order-independent");
  assert.equal(Object.keys(second.politics.diplomaticRelations).length, 1, "must not create a duplicate relation");
});

test("evolveRelation only moves between stances reachable from the current one, and records history on an actual change", () => {
  let politics = createEmptyPoliticsState();
  const init = findOrInitRelation(politics, "a", "b", 0);
  politics = init.politics;

  let sawOnlyReachableStances = true;
  const reachableFromPeace = new Set(["peace", "trade_agreement", "non_aggression_pact", "hostility"]);
  for (let seed = 0; seed < 30; seed++) {
    const result = evolveRelation(politics, init.relation.relationId, 0.1, 1, DeterministicRng.fromSeed("evolve", seed));
    const stance = result.diplomaticRelations[init.relation.relationId].stance;
    if (!reachableFromPeace.has(stance)) sawOnlyReachableStances = false;
  }
  assert.ok(sawOnlyReachableStances, "evolveRelation must never jump to a stance outside the transition graph");

  // Force a change and confirm a history event was recorded when the stance actually differs from before.
  let changed = false;
  let afterState = politics;
  for (let seed = 0; seed < 50 && !changed; seed++) {
    const result = evolveRelation(politics, init.relation.relationId, 0.3, 2, DeterministicRng.fromSeed("force-change", seed));
    if (result.diplomaticRelations[init.relation.relationId].stance !== "peace") {
      changed = true;
      afterState = result;
    }
  }
  assert.ok(changed, "expected at least one seed among 50 trials to produce a stance change");
  assert.ok(afterState.history.some((h) => h.type === "diplomatic_stance_changed" || h.type === "war_declared"));
});

test("trust is clamped into [0,1] by evolveRelation", () => {
  let politics = createEmptyPoliticsState();
  const init = findOrInitRelation(politics, "a", "b", 0);
  politics = init.politics;
  const pushedHigh = evolveRelation(politics, init.relation.relationId, 5, 1, DeterministicRng.fromSeed("t", 1));
  assert.ok(pushedHigh.diplomaticRelations[init.relation.relationId].trust <= 1);
  const pushedLow = evolveRelation(politics, init.relation.relationId, -5, 1, DeterministicRng.fromSeed("t", 2));
  assert.ok(pushedLow.diplomaticRelations[init.relation.relationId].trust >= 0);
});

test("signTreaty records participants/obligations and history; recordTreatyViolation and terminateTreaty are append-only actions", () => {
  let politics = createEmptyPoliticsState();
  const signed = signTreaty(politics, ["polity-a", "polity-b"], ["non_aggression"], { "polity-a": ["no_border_crossing"] }, 100, 5);
  politics = signed.politics;
  assert.equal(politics.history.filter((h) => h.type === "treaty_signed").length, 1);
  assert.equal(politics.treaties[signed.treaty.treatyId].terminatedAtTick, null);

  politics = recordTreatyViolation(politics, signed.treaty.treatyId, "polity-a", "crossed_border", 10);
  assert.equal(politics.treaties[signed.treaty.treatyId].violations.length, 1);
  assert.equal(politics.history.filter((h) => h.type === "treaty_violated").length, 1);

  politics = terminateTreaty(politics, signed.treaty.treatyId, "violated_terms", 12);
  assert.equal(politics.treaties[signed.treaty.treatyId].terminatedAtTick, 12);
  assert.equal(politics.history.filter((h) => h.type === "treaty_terminated").length, 1);

  // Terminating an already-terminated treaty must not overwrite the original reason/tick.
  politics = terminateTreaty(politics, signed.treaty.treatyId, "other_reason", 99);
  assert.equal(politics.treaties[signed.treaty.treatyId].terminatedAtTick, 12);
  assert.equal(politics.treaties[signed.treaty.treatyId].terminationReason, "violated_terms");
});

test("expireTreaties automatically terminates treaties whose duration has elapsed, and leaves indefinite treaties alone", () => {
  let politics = createEmptyPoliticsState();
  const timed = signTreaty(politics, ["a", "b"], ["peace"], {}, 10, 0);
  politics = timed.politics;
  const indefinite = signTreaty(politics, ["a", "c"], ["peace"], {}, null, 0);
  politics = indefinite.politics;

  politics = expireTreaties(politics, 5); // not yet due
  assert.equal(politics.treaties[timed.treaty.treatyId].terminatedAtTick, null);

  politics = expireTreaties(politics, 10); // exactly due
  assert.equal(politics.treaties[timed.treaty.treatyId].terminatedAtTick, 10);
  assert.equal(politics.treaties[indefinite.treaty.treatyId].terminatedAtTick, null, "indefinite treaties never auto-expire");
});

test("establishTerritory and transferTerritory maintain territory control and append history", () => {
  let politics = createEmptyPoliticsState();
  const established = establishTerritory(politics, null, ["region-1", "region-2"], ["settlement", "geography"], 0);
  politics = established.politics;
  assert.equal(politics.territories[established.territory.territoryId].controllingPolityId, null);

  politics = transferTerritory(politics, established.territory.territoryId, "polity-x", 1);
  assert.equal(politics.territories[established.territory.territoryId].controllingPolityId, "polity-x");
  assert.equal(politics.history.filter((h) => h.type === "territory_changed").length, 2);
});

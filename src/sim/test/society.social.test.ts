import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialSocietyState } from "../society/state";
import { syncKinship } from "../society/kinship";
import { getRelationship, generateInteractionEvents, applyInteractionEvents } from "../society/relationships";
import { applyCooperation } from "../society/cooperation";
import { applyConflict } from "../society/conflict";
import { createGroup } from "../society/groups";
import { DeterministicRng } from "../index";
import { testBiologyAdapter as defaultBiologyAdapter, testEcologyAdapter as defaultEcologyAdapter } from "./society.testSupport";
import { buildTestWorldState, makeIndividual } from "./society.testSupport";

test("kinship: syncing a parent/child fact tags the relationship and raises trust/loyalty floors", () => {
  const society = createInitialSocietyState();
  const state = buildTestWorldState({
    seed: "kin-1",
    kinshipFacts: [{ a: "parent1", b: "child1", relation: "parent" }],
  });
  const after = syncKinship(state, society, defaultBiologyAdapter, 5);
  const rel = getRelationship(after, "parent1", "child1");
  assert.ok(rel);
  assert.equal(rel!.kinship, "parent");
  assert.ok(rel!.trust >= 0.4);
  assert.ok(rel!.loyalty >= 0.5);
});

test("kinship: does not lower trust already earned above the kin floor", () => {
  let society = createInitialSocietyState();
  society = applyInteractionEvents(society, [
    { a: "p", b: "c", kind: "cooperative", locationId: "loc", tick: 1 },
  ]);
  // Manually push trust above the kin floor to prove syncKinship doesn't clamp it back down.
  society = {
    ...society,
    relationships: {
      ...society.relationships,
      "c::p": { ...society.relationships["c::p"], trust: 0.9 },
    },
  };
  const state = buildTestWorldState({ seed: "kin-2", kinshipFacts: [{ a: "p", b: "c", relation: "parent" }] });
  const after = syncKinship(state, society, defaultBiologyAdapter, 1);
  assert.equal(getRelationship(after, "p", "c")!.trust, 0.9);
});

test("7. trust changes are driven by interaction events, not re-randomized every tick", () => {
  let society = createInitialSocietyState();
  const events = [{ a: "x", b: "y", kind: "cooperative" as const, locationId: "camp", tick: 3 }];
  const after1 = applyInteractionEvents(society, events);
  const trustAfterOne = getRelationship(after1, "x", "y")!.trust;
  assert.ok(trustAfterOne > 0);

  // Applying an empty event batch must never change trust — no per-tick randomization.
  const after2 = applyInteractionEvents(after1, []);
  assert.equal(getRelationship(after2, "x", "y")!.trust, trustAfterOne);
});

test("7b. interaction event generation only pairs colocated living individuals, deterministically for a fixed seed", () => {
  const society = createInitialSocietyState();
  const individuals = [
    makeIndividual({ id: "i1", locationId: "camp", sociability: 0.9 }),
    makeIndividual({ id: "i2", locationId: "camp", sociability: 0.9 }),
    makeIndividual({ id: "i3", locationId: "far-away", sociability: 0.9 }),
  ];
  const rngA = DeterministicRng.fromSeed("society/interactions", 1234);
  const rngB = DeterministicRng.fromSeed("society/interactions", 1234);
  const eventsA = generateInteractionEvents(individuals, society, 1, rngA);
  const eventsB = generateInteractionEvents(individuals, society, 1, rngB);
  assert.deepEqual(eventsA, eventsB);
  for (const e of eventsA) {
    assert.notEqual(e.a, "i3");
    assert.notEqual(e.b, "i3");
  }
});

test("8. cooperation is emergent: requires shared group membership and positive trust, produces group resource gain and behavior counts", () => {
  let society = createInitialSocietyState();
  const created = createGroup(society, ["h1", "h2"], 0);
  society = created.society;
  const groupId = created.groupId;
  society = applyInteractionEvents(society, [{ a: "h1", b: "h2", kind: "cooperative", locationId: "grove", tick: 1 }]);

  const state = buildTestWorldState({
    seed: "coop-1",
    locationResources: [{ locationId: "grove", abundance: 0.8 }],
  });
  const rng = DeterministicRng.fromSeed("society/cooperation", 7);
  const outcome = applyCooperation(
    society,
    [{ a: "h1", b: "h2", kind: "cooperative", locationId: "grove", tick: 1 }],
    state,
    defaultEcologyAdapter,
    rng,
  );
  assert.equal(outcome.behaviors.length, 1);
  assert.equal(outcome.behaviors[0].groupId, groupId);
  assert.ok(outcome.society.groups[groupId].resources.pooled > 0);
  const behaviorKey = `${groupId}::${outcome.behaviors[0].behavior}`;
  assert.equal(outcome.society.behaviorCounts[behaviorKey], 1);
});

test("8b. cooperation does not fire across individuals with no shared group", () => {
  const society = createInitialSocietyState();
  const state = buildTestWorldState({ seed: "coop-2" });
  const rng = DeterministicRng.fromSeed("society/cooperation", 1);
  const outcome = applyCooperation(
    society,
    [{ a: "lone1", b: "lone2", kind: "cooperative", locationId: "x", tick: 1 }],
    state,
    defaultEcologyAdapter,
    rng,
  );
  assert.equal(outcome.behaviors.length, 0);
});

test("9. conflict produces group tension and history (a collective memory) for severe disputes, never automatic war", () => {
  let society = createInitialSocietyState();
  const created = createGroup(society, ["w1", "w2"], 0);
  society = created.society;
  const groupId = created.groupId;

  const state = buildTestWorldState({
    seed: "conflict-1",
    locationResources: [{ locationId: "scarce-spot", abundance: 0.05 }], // high scarcity -> high severity
  });
  const outcome = applyConflict(
    society,
    [{ a: "w1", b: "w2", kind: "competitive", locationId: "scarce-spot", tick: 42 }],
    state,
    defaultEcologyAdapter,
    42,
  );
  assert.ok(outcome.society.groups[groupId].tension > 0);
  assert.equal(outcome.conflictEvents[0].kind, "resource_conflict");
  const memories = Object.values(outcome.society.collectiveMemories).filter((m) => m.groupId === groupId);
  assert.ok(memories.length >= 1, "severe conflict should be recorded in collective memory");
  // Foundation only: no war/combat state is ever created by this subsystem.
  assert.equal((outcome.society as unknown as { war?: unknown }).war, undefined);
});

test("9b. mild conflict (high abundance) does not reach the collective-memory importance threshold", () => {
  const society = createInitialSocietyState();
  const state = buildTestWorldState({
    seed: "conflict-2",
    locationResources: [{ locationId: "plenty", abundance: 0.95 }],
  });
  const outcome = applyConflict(
    society,
    [{ a: "u1", b: "u2", kind: "competitive", locationId: "plenty", tick: 1 }],
    state,
    defaultEcologyAdapter,
    1,
  );
  assert.equal(Object.keys(outcome.society.collectiveMemories).length, 0);
});

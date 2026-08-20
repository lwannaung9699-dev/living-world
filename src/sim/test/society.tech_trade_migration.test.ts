import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialSocietyState } from "../society/state";
import { createGroup } from "../society/groups";
import { applyInnovation, applyTechnologyDiffusion } from "../society/technology";
import { evaluateTrade } from "../society/economy";
import { evaluateMigration } from "../society/migration";
import { DeterministicRng } from "../index";
import { defaultEcologyAdapter } from "../society/contracts";
import { buildTestWorldState, makeIndividual } from "./society.testSupport";

test("21. innovation is deterministic (not from an AI model / external API) and scales with ambition and scarcity", () => {
  let society = createInitialSocietyState();
  const created = createGroup(society, ["inventor"], 0);
  society = created.society;

  const individuals = [makeIndividual({ id: "inventor", locationId: "harsh", ambition: 1 })];
  const state = buildTestWorldState({ seed: "innov-1", locationResources: [{ locationId: "harsh", abundance: 0.02 }] });

  const rngA = DeterministicRng.fromSeed("society/innovation", 42);
  const rngB = DeterministicRng.fromSeed("society/innovation", 42);
  const resultA = applyInnovation(society, individuals, state, defaultEcologyAdapter, rngA, 1);
  const resultB = applyInnovation(society, individuals, state, defaultEcologyAdapter, rngB, 1);
  assert.deepEqual(resultA, resultB);
});

test("22. technology diffuses between groups only through contact (shared territory or trade) and sufficient trust", () => {
  let society = createInitialSocietyState();
  const gA = createGroup(society, ["a1"], 0);
  society = gA.society;
  const gB = createGroup(society, ["b1"], 0);
  society = gB.society;

  society = {
    ...society,
    technologies: {
      "tech-x": {
        technologyId: "tech-x",
        label: "fire-drill",
        originGroupId: gA.groupId,
        originIndividualId: "a1",
        originTick: 0,
        knownByGroupIds: [gA.groupId],
      },
    },
  };

  // No contact yet: diffusion should not happen even with many attempts.
  let noContact = society;
  const rng1 = DeterministicRng.fromSeed("society/diffusion", 1);
  for (let i = 0; i < 20; i++) noContact = applyTechnologyDiffusion(noContact, rng1);
  assert.deepEqual(noContact.technologies["tech-x"].knownByGroupIds, [gA.groupId]);

  // Shared territory + high trust: diffusion should eventually happen.
  let withContact: import("../society/state").SocietyState = {
    ...society,
    groups: {
      ...society.groups,
      [gA.groupId]: { ...society.groups[gA.groupId], territory: { crossroads: 0.5 } },
      [gB.groupId]: { ...society.groups[gB.groupId], territory: { crossroads: 0.5 } },
    },
    relationships: { "a1::b1": { a: "a1", b: "b1", trust: 0.6, respect: 0, fear: 0, loyalty: 0, friendship: 0, rivalry: 0, obligation: 0, kinship: null, authority: 0, lastEventTick: 0 } },
  };
  const rng2 = DeterministicRng.fromSeed("society/diffusion", 2);
  let diffused = false;
  for (let i = 0; i < 100 && !diffused; i++) {
    withContact = applyTechnologyDiffusion(withContact, rng2);
    diffused = withContact.technologies["tech-x"].knownByGroupIds.includes(gB.groupId);
  }
  assert.ok(diffused, "technology should diffuse to a group in sustained trusted contact");
});

test("23. trade value depends on relative scarcity between groups, not a universal fixed price", () => {
  let society = createInitialSocietyState();
  const gA = createGroup(society, ["a1"], 0);
  society = gA.society;
  const gB = createGroup(society, ["b1"], 0);
  society = gB.society;

  society = {
    ...society,
    groups: {
      ...society.groups,
      [gA.groupId]: { ...society.groups[gA.groupId], territory: { market: 0.5 }, resources: { ...society.groups[gA.groupId].resources, pooled: 10 } },
      [gB.groupId]: { ...society.groups[gB.groupId], territory: { market: 0.5 }, resources: { ...society.groups[gB.groupId].resources, pooled: 0.5 } },
    },
    relationships: { "a1::b1": { a: "a1", b: "b1", trust: 0.5, respect: 0, fear: 0, loyalty: 0, friendship: 0, rivalry: 0, obligation: 0, kinship: null, authority: 0, lastEventTick: 0 } },
  };

  const after = evaluateTrade(society, 10);
  const trades = Object.values(after.trades);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].groupA, gA.groupId); // A is the giver (more abundant)
  assert.equal(trades[0].groupB, gB.groupId);
  assert.ok(after.groups[gA.groupId].resources.pooled < 10);
  assert.ok(after.groups[gB.groupId].resources.pooled > 0.5);
});

test("23b. no trade occurs between groups with no territorial contact", () => {
  let society = createInitialSocietyState();
  const gA = createGroup(society, ["a1"], 0);
  society = gA.society;
  const gB = createGroup(society, ["b1"], 0);
  society = gB.society;
  society = {
    ...society,
    groups: {
      ...society.groups,
      [gA.groupId]: { ...society.groups[gA.groupId], resources: { ...society.groups[gA.groupId].resources, pooled: 10 } },
      [gB.groupId]: { ...society.groups[gB.groupId], resources: { ...society.groups[gB.groupId].resources, pooled: 0 } },
    },
  };
  const after = evaluateTrade(society, 1);
  assert.equal(Object.keys(after.trades).length, 0);
});

test("24. migration is triggered by resource depletion or conflict, and only ever targets an already-known location", () => {
  let society = createInitialSocietyState();
  const created = createGroup(society, ["m1", "m2", "m3"], 0);
  society = created.society;
  const groupId = created.groupId;
  society = {
    ...society,
    groups: {
      ...society.groups,
      [groupId]: { ...society.groups[groupId], territory: { depleted: 0.8, richer: 0.2 } },
    },
  };
  const state = buildTestWorldState({
    seed: "migr-1",
    locationResources: [
      { locationId: "depleted", abundance: 0.05 },
      { locationId: "richer", abundance: 0.6 },
    ],
  });
  const after = evaluateMigration(society, state, defaultEcologyAdapter, 100);
  const migrations = Object.values(after.migrations);
  assert.equal(migrations.length, 1);
  assert.equal(migrations[0].fromLocationId, "depleted");
  assert.equal(migrations[0].toLocationId, "richer");
  assert.equal(migrations[0].reason, "resource_depletion");
});

test("24b. no migration when the current location is not actually depleted relative to population", () => {
  let society = createInitialSocietyState();
  const created = createGroup(society, ["m1"], 0);
  society = created.society;
  const groupId = created.groupId;
  society = {
    ...society,
    groups: { ...society.groups, [groupId]: { ...society.groups[groupId], territory: { plentiful: 0.9 } } },
  };
  const state = buildTestWorldState({ seed: "migr-2", locationResources: [{ locationId: "plentiful", abundance: 0.9 }] });
  const after = evaluateMigration(society, state, defaultEcologyAdapter, 1);
  assert.equal(Object.keys(after.migrations).length, 0);
});

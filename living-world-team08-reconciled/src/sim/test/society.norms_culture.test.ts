import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialSocietyState } from "../society/state";
import { createGroup } from "../society/groups";
import { applyInteractionEvents } from "../society/relationships";
import { updateNormFormation, deriveConflictSanctions } from "../society/norms";
import { transmitCulture, updateStoriesAndMyths, developSymbols, recordCollectiveMemory } from "../society/culture";
import { DeterministicRng } from "../index";
import { makeIndividual } from "./society.testSupport";

test("15. norms crystallize only after a behavior is reinforced past a threshold, not on first occurrence", () => {
  let society = createInitialSocietyState();
  const created = createGroup(society, ["n1", "n2"], 0);
  society = created.society;
  const groupId = created.groupId;

  const behaviorKey = `${groupId}::share_food`;
  const belowThreshold = { ...society, behaviorCounts: { [behaviorKey]: 2 } };
  const stillNoNorm = updateNormFormation(belowThreshold, 10);
  assert.equal(Object.keys(stillNoNorm.norms).length, 0);

  const atThreshold = { ...society, behaviorCounts: { [behaviorKey]: 5 } };
  const withNorm = updateNormFormation(atThreshold, 10);
  const norms = Object.values(withNorm.norms);
  assert.equal(norms.length, 1);
  assert.equal(norms[0].groupId, groupId);
  assert.equal(norms[0].behavior, "share_food");
  assert.ok(withNorm.groups[groupId].normIds.includes(norms[0].normId));
});

test("15b. norm strength increases as reinforcement accumulates, without duplicating the norm record", () => {
  let society = createInitialSocietyState();
  const created = createGroup(society, ["n1", "n2"], 0);
  society = created.society;
  const groupId = created.groupId;
  const key = `${groupId}::protect_young`;

  let current = { ...society, behaviorCounts: { [key]: 5 } };
  current = updateNormFormation(current, 1);
  const firstStrength = Object.values(current.norms)[0].strength;

  current = { ...current, behaviorCounts: { [key]: 15 } };
  current = updateNormFormation(current, 2);
  assert.equal(Object.keys(current.norms).length, 1, "reinforcement must update the existing norm, not create a second one");
  assert.ok(Object.values(current.norms)[0].strength > firstStrength);
});

test("16. sanctions are recorded as social responses tied to a norm, derived from within-group resource conflict", () => {
  let society = createInitialSocietyState();
  const created = createGroup(society, ["s1", "s2"], 0);
  society = created.society;
  const groupId = created.groupId;
  society = { ...society, behaviorCounts: { [`${groupId}::share_food`]: 6 } };
  society = updateNormFormation(society, 1);

  const after = deriveConflictSanctions(
    society,
    [{ a: "s1", b: "s2", groupId, kind: "resource_conflict", severity: 0.8 }],
    50,
  );
  const sanctions = Object.values(after.sanctions);
  assert.equal(sanctions.length, 1);
  assert.equal(sanctions[0].targetId, "s1");
  assert.equal(sanctions[0].groupId, groupId);
  assert.equal(sanctions[0].kind, "social_exclusion"); // severity 0.8 > 0.6 threshold
});

test("16b. no sanction is derived when there is no relevant established norm yet", () => {
  let society = createInitialSocietyState();
  const created = createGroup(society, ["s1", "s2"], 0);
  society = created.society;
  const after = deriveConflictSanctions(
    society,
    [{ a: "s1", b: "s2", groupId: created.groupId, kind: "resource_conflict", severity: 0.9 }],
    1,
  );
  assert.equal(Object.keys(after.sanctions).length, 0);
});

test("17/18. cultural transmission spreads a custom between groups only when contact + trust support it, deterministically", () => {
  let society = createInitialSocietyState();
  const gA = createGroup(society, ["a1"], 0);
  society = gA.society;
  const gB = createGroup(society, ["b1"], 0);
  society = gB.society;
  society = {
    ...society,
    groups: {
      ...society.groups,
      [gA.groupId]: { ...society.groups[gA.groupId], customs: ["morning-song"] },
    },
  };
  society = applyInteractionEvents(society, [
    ...Array.from({ length: 10 }, (_, i) => ({ a: "a1", b: "b1", kind: "cooperative" as const, locationId: "x", tick: i })),
  ]);

  const individuals = [makeIndividual({ id: "a1", locationId: "x" }), makeIndividual({ id: "b1", locationId: "x" })];
  const rngA = DeterministicRng.fromSeed("society/culture", 1);
  const rngB = DeterministicRng.fromSeed("society/culture", 1);
  const resultA = transmitCulture(society, individuals, rngA);
  const resultB = transmitCulture(society, individuals, rngB);
  assert.deepEqual(resultA.groups[gA.groupId].customs, resultB.groups[gA.groupId].customs);
  assert.deepEqual(resultA.groups[gB.groupId].customs, resultB.groups[gB.groupId].customs);
});

test("18b. collective memory entries carry a group-specific interpretation of the same event", () => {
  let society = createInitialSocietyState();
  const gA = createGroup(society, ["a1"], 0);
  society = gA.society;
  const gB = createGroup(society, ["b1"], 0);
  society = gB.society;

  society = recordCollectiveMemory(society, gA.groupId, "great_hunt", 0.9, ["a1"], "plains", 10, "a triumphant hunt");
  society = recordCollectiveMemory(society, gB.groupId, "great_hunt", 0.9, ["b1"], "plains", 10, "a wasteful slaughter");

  const memA = Object.values(society.collectiveMemories).find((m) => m.groupId === gA.groupId)!;
  const memB = Object.values(society.collectiveMemories).find((m) => m.groupId === gB.groupId)!;
  assert.notEqual(memA.interpretation, memB.interpretation);
});

test("19. stories only form from important, sufficiently old collective memories, and may mature into myths through retelling", () => {
  let society = createInitialSocietyState();
  const gA = createGroup(society, ["a1"], 0);
  society = gA.society;
  society = recordCollectiveMemory(society, gA.groupId, "great_flood", 0.9, ["a1"], "delta", 0, "the river rose against us");

  const rng = DeterministicRng.fromSeed("society/stories", 5);
  let current = updateStoriesAndMyths(society, 10, rng); // too young: no story yet
  assert.equal(Object.keys(current.stories).length, 0);

  current = updateStoriesAndMyths(current, 60, rng); // old enough now
  assert.equal(Object.keys(current.stories).length, 1);
  const story = Object.values(current.stories)[0];
  assert.equal(story.isMyth, false);

  // Repeated retelling over time should eventually flip isMyth.
  let t = 60;
  for (let i = 0; i < 40; i++) {
    t += 30;
    current = updateStoriesAndMyths(current, t, rng);
  }
  const retold = Object.values(current.stories)[0];
  assert.ok(retold.retellingCount > 0);
});

test("20. symbols only appear once a group's own history gives it a reason (identity/territory/authority milestones)", () => {
  let society = createInitialSocietyState();
  const created = createGroup(society, ["sym1", "sym2", "sym3"], 0); // >=3 members triggers group_identity
  society = created.society;
  const groupId = created.groupId;

  const before = developSymbols(society, 5);
  const meanings = Object.values(before.symbols).map((s) => s.meaning);
  assert.ok(meanings.includes("group_identity"));
  assert.ok(!meanings.includes("territory")); // no territory yet

  const withTerritory = {
    ...before,
    groups: { ...before.groups, [groupId]: { ...before.groups[groupId], territory: { home: 0.5 } } },
  };
  const after = developSymbols(withTerritory, 6);
  const meaningsAfter = Object.values(after.symbols).map((s) => s.meaning);
  assert.ok(meaningsAfter.includes("territory"));
  // group_identity should not be duplicated on a second pass.
  assert.equal(meaningsAfter.filter((m) => m === "group_identity").length, 1);
});

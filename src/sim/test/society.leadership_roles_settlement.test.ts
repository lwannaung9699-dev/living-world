import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialSocietyState } from "../society/state";
import { createGroup } from "../society/groups";
import { applyInteractionEvents } from "../society/relationships";
import { updateLeadership } from "../society/leadership";
import { updateRoles } from "../society/roles";
import { SOCIAL_ROLES } from "../society/types";
import { classifySharingMode, settleResourcePool } from "../society/economy";
import { updateSettlements, updateTerritory } from "../society/settlement";
import { buildTestWorldState, makeIndividual } from "./society.testSupport";
import { testEcologyAdapter as defaultEcologyAdapter } from "./society.testSupport";

test("10. leadership emerges from multi-factor scoring, not raw strength — an ambitious, trusted member is recognized", () => {
  let society = createInitialSocietyState();
  const created = createGroup(society, ["amb", "shy1", "shy2"], 0);
  society = created.society;
  const groupId = created.groupId;
  // amb is trusted by both others; shy1/shy2 barely interact.
  society = applyInteractionEvents(society, [
    { a: "amb", b: "shy1", kind: "cooperative", locationId: "x", tick: 1 },
    { a: "amb", b: "shy1", kind: "cooperative", locationId: "x", tick: 2 },
    { a: "amb", b: "shy2", kind: "cooperative", locationId: "x", tick: 1 },
    { a: "amb", b: "shy2", kind: "cooperative", locationId: "x", tick: 2 },
  ]);

  const individuals = [
    makeIndividual({ id: "amb", locationId: "x", ambition: 0.9, empathy: 0.6 }),
    makeIndividual({ id: "shy1", locationId: "x", ambition: 0.1 }),
    makeIndividual({ id: "shy2", locationId: "x", ambition: 0.1 }),
  ];
  const after = updateLeadership(society, individuals, 100);
  assert.deepEqual(after.groups[groupId].leaderIds, ["amb"]);
});

test("10b. leadership can recognize multiple close scorers as a council rather than forcing a single chief", () => {
  let society = createInitialSocietyState();
  const created = createGroup(society, ["c1", "c2"], 0);
  society = created.society;
  const groupId = created.groupId;
  society = applyInteractionEvents(society, [
    { a: "c1", b: "c2", kind: "cooperative", locationId: "x", tick: 1 },
    { a: "c1", b: "c2", kind: "cooperative", locationId: "x", tick: 2 },
  ]);
  const individuals = [
    makeIndividual({ id: "c1", locationId: "x", ambition: 0.5, empathy: 0.5 }),
    makeIndividual({ id: "c2", locationId: "x", ambition: 0.5, empathy: 0.5 }),
  ];
  const after = updateLeadership(society, individuals, 100);
  assert.equal(after.groups[groupId].leaderIds.length, 2);
});

test("11. social roles are assigned per trait fit + opportunity, and are never all pre-assigned at creation", () => {
  const society0 = createInitialSocietyState();
  assert.equal(Object.keys(society0.individualRoles).length, 0);

  let society = society0;
  const created = createGroup(society, ["fighter", "healerish"], 0);
  society = created.society;
  const individuals = [
    makeIndividual({ id: "fighter", locationId: "loc1", aggression: 0.9, empathy: 0.1 }),
    makeIndividual({ id: "healerish", locationId: "loc1", aggression: 0.5, empathy: 0.95, sociability: 0.9 }),
  ];
  const state = buildTestWorldState({ seed: "roles-1", locationResources: [{ locationId: "loc1", abundance: 0.5 }] });
  const after = updateRoles(society, individuals, state, defaultEcologyAdapter);
  assert.ok(SOCIAL_ROLES.includes(after.individualRoles["fighter"] as (typeof SOCIAL_ROLES)[number]));
  assert.notEqual(after.individualRoles["fighter"], "healer");
  assert.equal(after.individualRoles["healerish"], "healer");
});

test("12. resource sharing mode is derived from measurable group trust, not hardcoded, and pooled resources settle each tick", () => {
  let society = createInitialSocietyState();
  const created = createGroup(society, ["m1", "m2"], 0);
  society = created.society;
  const groupId = created.groupId;

  const lowTrust = society;
  assert.equal(classifySharingMode(lowTrust, groupId), "private_ownership");

  const highTrust = applyInteractionEvents(society, [
    ...Array.from({ length: 20 }, (_, i) => ({ a: "m1", b: "m2", kind: "cooperative" as const, locationId: "x", tick: i })),
  ]);
  assert.equal(classifySharingMode(highTrust, groupId), "communal_sharing");

  const withPool = {
    ...highTrust,
    groups: {
      ...highTrust.groups,
      [groupId]: { ...highTrust.groups[groupId], resources: { ...highTrust.groups[groupId].resources, pooled: 10 } },
    },
  };
  const settled = settleResourcePool(withPool, 0.3);
  assert.ok(settled.groups[groupId].resources.pooled < 10);
});

test("13. settlements only appear once a group accumulates real presence at a location, and are classified by measurable thresholds", () => {
  let society = createInitialSocietyState();
  const created = createGroup(society, ["settler"], 0);
  society = created.society;
  const groupId = created.groupId;

  let current = society;
  const individuals = [makeIndividual({ id: "settler", locationId: "riverbank" })];
  // Fewer than the camp-founding threshold: no settlement should exist yet.
  for (let t = 0; t < 4; t++) {
    current = updateSettlements(current, individuals, t);
  }
  assert.equal(Object.keys(current.settlements).length, 0);

  // Enough repeated presence: a settlement record should now exist, classified as a camp.
  for (let t = 4; t < 10; t++) {
    current = updateSettlements(current, individuals, t);
  }
  const settlements = Object.values(current.settlements);
  assert.equal(settlements.length, 1);
  assert.equal(settlements[0].groupId, groupId);
  assert.equal(settlements[0].locationId, "riverbank");
  assert.equal(settlements[0].settlementType, "temporary_camp");
});

test("14. territory forms as an irregular influence field from where members actually spend time, and decays when abandoned", () => {
  let society = createInitialSocietyState();
  const created = createGroup(society, ["scout"], 0);
  society = created.society;
  const groupId = created.groupId;

  const individuals = [makeIndividual({ id: "scout", locationId: "hill" })];
  const withPresence = updateTerritory(society, individuals);
  assert.ok(withPresence.groups[groupId].territory["hill"] > 0);

  // No one present anymore: territory should decay, not vanish instantly (irregular field, not a hard border).
  const decayed = updateTerritory(withPresence, []);
  assert.ok(decayed.groups[groupId].territory["hill"] < withPresence.groups[groupId].territory["hill"]);
});

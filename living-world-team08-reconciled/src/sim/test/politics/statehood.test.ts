import { test } from "node:test";
import assert from "node:assert/strict";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { createEmptyPoliticsState } from "../../politics/contracts";
import { createGovernanceSystem } from "../../politics/governance";
import { establishTerritory } from "../../politics/diplomacy";
import {
  canFormState,
  composePolities,
  computeStabilityScore,
  dissolveState,
  foundState,
  isInCrisis,
  rebellionEligible,
  resolveCrisisOutcome,
  splitState,
  triggerRebellion,
  upsertStabilityProfile,
} from "../../politics/statehood";

const baseSignals = { population: 200, wealth: 0.6, inequality: 0.2, cohesion: 0.6, topMilitaryStrength: 0.3, topReligiousStanding: 0.2, topKinship: 0.2 };

const perfectFactors = {
  legitimacy: 1,
  foodSecurity: 1,
  economicHealth: 1,
  eliteCohesion: 1,
  publicSupport: 1,
  militaryLoyalty: 1,
  regionalCohesion: 1,
  institutionalEffectiveness: 1,
};
const zeroFailure = { corruption: 0, nepotism: 0, eliteCapture: 0, administrativeInefficiency: 0, taxEvasion: 0, abuseOfAuthority: 0 };
const maxFailure = { corruption: 1, nepotism: 1, eliteCapture: 1, administrativeInefficiency: 1, taxEvasion: 1, abuseOfAuthority: 1 };

test("stability is never a bare arbitrary number: it always tracks toward 1 with perfect factors/no failure, and drops as failure rises", () => {
  const clean = computeStabilityScore(perfectFactors, zeroFailure);
  const corrupt = computeStabilityScore(perfectFactors, maxFailure);
  assert.ok(clean > 0.9);
  assert.ok(corrupt < clean);
  assert.ok(corrupt >= 0);
});

test("upsertStabilityProfile stores factors, failure, and a derived score consistent with computeStabilityScore", () => {
  let politics = createEmptyPoliticsState();
  politics = upsertStabilityProfile(politics, "polity-1", perfectFactors, zeroFailure, 5);
  const profile = politics.stability["polity-1"];
  assert.equal(profile.stabilityScore, computeStabilityScore(perfectFactors, zeroFailure));
  assert.equal(profile.updatedAtTick, 5);
});

test("canFormState requires population, central authority, stable rules, resource extraction, AND governance stability duration all at once", () => {
  const full = { population: 200, hasCentralAuthority: true, hasStableRules: true, hasResourceExtraction: true, governanceStableTicks: 50 };
  assert.equal(canFormState(full), true);
  assert.equal(canFormState({ ...full, population: 10 }), false);
  assert.equal(canFormState({ ...full, hasCentralAuthority: false }), false);
  assert.equal(canFormState({ ...full, hasStableRules: false }), false);
  assert.equal(canFormState({ ...full, hasResourceExtraction: false }), false);
  assert.equal(canFormState({ ...full, governanceStableTicks: 2 }), false);
});

test("a state is never spawned automatically: foundState requires an explicit call with an already-formed governance system", () => {
  let politics = createEmptyPoliticsState();
  const gov = createGovernanceSystem(politics, "s", baseSignals, 0, DeterministicRng.fromSeed("g", 1));
  politics = gov.politics;
  assert.equal(Object.keys(politics.polities).length, 0, "creating a governance system alone must not create a polity");

  const territory = establishTerritory(politics, null, ["s"], ["settlement"], 0);
  politics = territory.politics;
  const founded = foundState(politics, gov.governance, territory.territory.territoryId, 40);
  politics = founded.politics;

  assert.equal(Object.keys(politics.polities).length, 1);
  assert.equal(founded.polity.governanceId, gov.governance.governanceId);
  assert.equal(founded.polity.name, null, "Team 08 never invents a flavor name for an emergent state");
  assert.equal(politics.history.filter((h) => h.type === "state_founded").length, 1);
});

test("composePolities builds a composite entity without hardcoding a Kingdom/Empire/Republic class, and can mark members subordinate", () => {
  let politics = createEmptyPoliticsState();
  const govA = createGovernanceSystem(politics, "a", baseSignals, 0, DeterministicRng.fromSeed("g", 2));
  politics = govA.politics;
  const territoryA = establishTerritory(politics, null, ["a"], ["settlement"], 0);
  politics = territoryA.politics;
  const foundedA = foundState(politics, govA.governance, territoryA.territory.territoryId, 40);
  politics = foundedA.politics;

  const govB = createGovernanceSystem(politics, "b", baseSignals, 0, DeterministicRng.fromSeed("g", 3));
  politics = govB.politics;
  const territoryB = establishTerritory(politics, null, ["b"], ["settlement"], 0);
  politics = territoryB.politics;
  const foundedB = foundState(politics, govB.governance, territoryB.territory.territoryId, 40);
  politics = foundedB.politics;

  const overallGov = createGovernanceSystem(politics, "composite", baseSignals, 41, DeterministicRng.fromSeed("g", 4));
  politics = overallGov.politics;
  const composite = composePolities(politics, [foundedA.polity.polityId, foundedB.polity.polityId], territoryA.territory.territoryId, overallGov.governance, 41, true);
  politics = composite.politics;

  assert.equal(composite.polity.memberPolityIds.length, 2);
  assert.equal(politics.polities[foundedA.polity.polityId].subordinateOf, composite.polity.polityId);
  assert.equal(politics.polities[foundedB.polity.polityId].subordinateOf, composite.polity.polityId);
});

test("isInCrisis / rebellionEligible are pure threshold predicates and never guarantee a rebellion by themselves", () => {
  assert.equal(isInCrisis(0.1), true);
  assert.equal(isInCrisis(0.9), false);
  assert.equal(rebellionEligible(3), false);
  assert.equal(rebellionEligible(20), true);
});

test("resolveCrisisOutcome is a weighted draw among reform/revolution/collapse — never a fixed outcome for fixed inputs across different seeds", () => {
  const outcomes = new Set<string>();
  for (let seed = 0; seed < 60; seed++) {
    outcomes.add(resolveCrisisOutcome(0.3, 0.5, DeterministicRng.fromSeed("crisis", seed)));
  }
  assert.ok(outcomes.size > 1, "expected more than one distinct outcome across 60 seeds at moderate stability/faction strength");
});

test("triggerRebellion appends a rebellion history event without altering polity records", () => {
  let politics = createEmptyPoliticsState();
  politics = triggerRebellion(politics, "polity-1", 10);
  assert.equal(politics.history.filter((h) => h.type === "rebellion").length, 1);
  assert.equal(Object.keys(politics.polities).length, 0);
});

test("dissolveState marks a polity dissolved exactly once and records state_dissolved", () => {
  let politics = createEmptyPoliticsState();
  const gov = createGovernanceSystem(politics, "s", baseSignals, 0, DeterministicRng.fromSeed("g", 5));
  politics = gov.politics;
  const territory = establishTerritory(politics, null, ["s"], ["settlement"], 0);
  politics = territory.politics;
  const founded = foundState(politics, gov.governance, territory.territory.territoryId, 40);
  politics = founded.politics;

  politics = dissolveState(politics, founded.polity.polityId, "resource_collapse", 50);
  assert.equal(politics.polities[founded.polity.polityId].dissolvedAtTick, 50);
  assert.equal(politics.polities[founded.polity.polityId].dissolutionReason, "resource_collapse");

  politics = dissolveState(politics, founded.polity.polityId, "civil_conflict", 60);
  assert.equal(politics.polities[founded.polity.polityId].dissolvedAtTick, 50, "an already-dissolved polity must not be re-dissolved with a different reason/tick");
});

test("splitState dissolves the original and creates independent successor polities, recording state_split", () => {
  let politics = createEmptyPoliticsState();
  const gov = createGovernanceSystem(politics, "s", baseSignals, 0, DeterministicRng.fromSeed("g", 6));
  politics = gov.politics;
  const territory = establishTerritory(politics, null, ["s"], ["settlement"], 0);
  politics = territory.politics;
  const founded = foundState(politics, gov.governance, territory.territory.territoryId, 40);
  politics = founded.politics;

  const successorGovA = createGovernanceSystem(politics, "s", baseSignals, 41, DeterministicRng.fromSeed("g", 7));
  politics = successorGovA.politics;
  const successorGovB = createGovernanceSystem(politics, "s", baseSignals, 41, DeterministicRng.fromSeed("g", 8));
  politics = successorGovB.politics;

  const split = splitState(
    politics,
    founded.polity.polityId,
    [
      { governance: successorGovA.governance, territoryId: territory.territory.territoryId },
      { governance: successorGovB.governance, territoryId: territory.territory.territoryId },
    ],
    "rebellion",
    42,
  );
  politics = split.politics;

  assert.equal(politics.polities[founded.polity.polityId].dissolvedAtTick, 42);
  assert.equal(split.successors.length, 2);
  for (const successor of split.successors) {
    assert.equal(politics.polities[successor.polityId].dissolvedAtTick, null);
    assert.notEqual(successor.polityId, founded.polity.polityId);
  }
  assert.equal(politics.history.filter((h) => h.type === "state_split").length, 1);
});

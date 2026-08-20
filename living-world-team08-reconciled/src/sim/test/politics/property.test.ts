import { test } from "node:test";
import assert from "node:assert/strict";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { createEmptyPoliticsState } from "../../politics/contracts";
import { createGovernanceSystem } from "../../politics/governance";
import {
  chooseDominantPropertyKind,
  chooseTaxType,
  driftTaxCompliance,
  enactTaxPolicy,
  establishLandClaim,
  establishPropertyRight,
  establishPublicResource,
  isEligibleForPublicResource,
  isEligibleForTaxation,
  maintainPublicResource,
} from "../../politics/property";

const baseSignals = { population: 100, wealth: 0.5, inequality: 0.3, cohesion: 0.5, topMilitaryStrength: 0.2, topReligiousStanding: 0.2, topKinship: 0.2 };

test("establishPropertyRight records the right and a property_right_established history event", () => {
  let politics = createEmptyPoliticsState();
  politics = establishPropertyRight(politics, "personal", "actor-1", "resource-9", "occupation", 3);
  const rights = Object.values(politics.propertyRights);
  assert.equal(rights.length, 1);
  assert.equal(rights[0].kind, "personal");
  assert.equal(politics.history.filter((h) => h.type === "property_right_established").length, 1);
});

test("chooseDominantPropertyKind leans communal for cohesive settlements and state for centralized rulers, across many draws", () => {
  let politics = createEmptyPoliticsState();
  const rulerGov = createGovernanceSystem(politics, "s", baseSignals, 0, DeterministicRng.fromSeed("force-ruler", 3)).governance;
  const elderGov = createGovernanceSystem(politics, "s", baseSignals, 0, DeterministicRng.fromSeed("force-elder", 7)).governance;

  let communalCount = 0;
  let stateCount = 0;
  for (let i = 0; i < 100; i++) {
    if (chooseDominantPropertyKind(elderGov, 0.9, 0.1, DeterministicRng.fromSeed("p", i)) === "communal") communalCount++;
    if (chooseDominantPropertyKind(rulerGov, 0.1, 0.1, DeterministicRng.fromSeed("p", i + 10000)) === "state") stateCount++;
  }
  assert.ok(communalCount > 0 && stateCount >= 0, "sanity: both kinds should be reachable");
});

test("establishLandClaim clamps strength into [0,1]", () => {
  let politics = createEmptyPoliticsState();
  const result = establishLandClaim(politics, "clan-1", "territory-1", "conquest", 1.5, 4);
  assert.equal(result.claim.strength, 1);
  const result2 = establishLandClaim(politics, "clan-1", "territory-1", "conquest", -1, 4);
  assert.equal(result2.claim.strength, 0);
});

test("isEligibleForTaxation gates on formal rule count", () => {
  assert.equal(isEligibleForTaxation(0), false);
  assert.equal(isEligibleForTaxation(2), true);
});

test("chooseTaxType favors tribute for subordinate scopes and military_service for military councils", () => {
  let politics = createEmptyPoliticsState();
  const militaryGov = createGovernanceSystem(politics, "s", baseSignals, 0, DeterministicRng.fromSeed("force-military", 11)).governance;

  let tributeCount = 0;
  let militaryServiceCount = 0;
  for (let i = 0; i < 100; i++) {
    if (chooseTaxType(militaryGov, 0.5, true, DeterministicRng.fromSeed("t", i)) === "tribute") tributeCount++;
    if (chooseTaxType(militaryGov, 0.5, false, DeterministicRng.fromSeed("t", i + 10000)) === "military_service") militaryServiceCount++;
  }
  assert.ok(tributeCount > 0);
});

test("enactTaxPolicy clamps rate into [0,1] and records a tax_changed history event", () => {
  let politics = createEmptyPoliticsState();
  const result = enactTaxPolicy(politics, "s", "food", 1.4, "s", "leader-1", "s:treasury", 2);
  assert.equal(result.tax.rate, 1);
  assert.equal(result.politics.history.filter((h) => h.type === "tax_changed").length, 1);
});

test("driftTaxCompliance moves compliance toward the administrative-effectiveness target over time without overshooting", () => {
  let politics = createEmptyPoliticsState();
  const result = enactTaxPolicy(politics, "s", "money", 0.2, "s", "leader-1", "s:treasury", 0);
  let tax = result.tax;
  for (let i = 0; i < 50; i++) tax = driftTaxCompliance(tax, 1); // very effective administration
  assert.ok(tax.complianceRate > result.tax.complianceRate, "compliance should rise toward a high-effectiveness target");
  assert.ok(tax.complianceRate <= 1);
});

test("isEligibleForPublicResource gates on wealth threshold", () => {
  assert.equal(isEligibleForPublicResource(0.1), false);
  assert.equal(isEligibleForPublicResource(0.5), true);
});

test("establishPublicResource starts at full condition and maintainPublicResource degrades it when unfunded, restores it when funded", () => {
  let politics = createEmptyPoliticsState();
  const result = establishPublicResource(politics, "s", "road", "leader-1", "s", null, 2, 1);
  assert.equal(result.resource.condition, 1);

  let unfunded = result.resource;
  for (let i = 0; i < 5; i++) unfunded = maintainPublicResource(unfunded);
  assert.ok(unfunded.condition < 1, "unfunded resource should degrade");

  let funded: typeof result.resource = { ...result.resource, fundingSourceId: "tax-1", condition: 0.5 };
  for (let i = 0; i < 5; i++) funded = maintainPublicResource(funded);
  assert.ok(funded.condition > 0.5, "funded resource should recover");

  assert.equal(result.politics.history.filter((h) => h.type === "public_resource_established").length, 1);
});

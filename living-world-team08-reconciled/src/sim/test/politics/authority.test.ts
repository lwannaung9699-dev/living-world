import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmptyPoliticsState } from "../../politics/contracts";
import {
  applyLegitimacyBonusToAuthority,
  computeAuthorityConcentration,
  computeAuthorityScore,
  computeLegitimacyProfile,
  deriveAuthorityFactors,
  topAuthorityActor,
  upsertAuthorityProfile,
  upsertLegitimacyProfile,
} from "../../politics/authority";
import type { ActorSnapshot } from "../../politics/adapters/populationAdapter";

function actor(overrides: Partial<ActorSnapshot> = {}): ActorSnapshot {
  return {
    actorId: "a1",
    settlementId: "s",
    influence: 0,
    wealth: 0,
    militaryStrength: 0,
    kinship: 0,
    religiousStanding: 0,
    knowledge: 0,
    trust: 0,
    ...overrides,
  };
}

test("authority is not equal to military strength alone", () => {
  const highMilitaryOnly = deriveAuthorityFactors(actor({ militaryStrength: 1 }), 0);
  const highEverythingElse = deriveAuthorityFactors(
    actor({ influence: 1, wealth: 1, kinship: 1, religiousStanding: 1, knowledge: 1, trust: 1 }),
    1,
  );
  assert.ok(computeAuthorityScore(highEverythingElse) > computeAuthorityScore(highMilitaryOnly));
});

test("a powerful ruler can have low legitimacy, and a weak leader can have high legitimacy", () => {
  const powerfulFactors = deriveAuthorityFactors(actor({ militaryStrength: 1, wealth: 1, influence: 1 }), 0);
  const powerfulScore = computeAuthorityScore(powerfulFactors);

  const lowLegitimacy = computeLegitimacyProfile("ruler", "s", { fear: 1 }, 1);
  const weakFactors = deriveAuthorityFactors(actor({ militaryStrength: 0.05 }), 0);
  const weakScore = computeAuthorityScore(weakFactors);
  const highLegitimacy = computeLegitimacyProfile("weak-leader", "s", { tradition: 1, popular_support: 1, election: 1, performance: 1 }, 1);

  assert.ok(powerfulScore > weakScore, "sanity: the powerful actor really does have higher raw authority");
  assert.ok(lowLegitimacy.legitimacyScore < highLegitimacy.legitimacyScore, "legitimacy is independent of authority");
});

test("legitimacy feeds back into authority only through the sanctioned legitimacyBonus coupling", () => {
  const base = deriveAuthorityFactors(actor(), 0);
  assert.equal(base.legitimacyBonus, 0);
  const boosted = applyLegitimacyBonusToAuthority(base, 0.8);
  assert.equal(boosted.legitimacyBonus, 0.8);
  assert.ok(computeAuthorityScore(boosted) > computeAuthorityScore(base));
});

test("authority concentration reflects the top actor's share of total scoped authority", () => {
  let politics = createEmptyPoliticsState();
  politics = upsertAuthorityProfile(politics, "a1", "s", deriveAuthorityFactors(actor({ influence: 1, wealth: 1, trust: 1 }), 1), 0);
  politics = upsertAuthorityProfile(politics, "a2", "s", deriveAuthorityFactors(actor({ influence: 0.05 }), 0), 0);
  politics = upsertAuthorityProfile(politics, "a3", "s", deriveAuthorityFactors(actor({ influence: 0.05 }), 0), 0);

  const concentration = computeAuthorityConcentration(politics, "s");
  assert.ok(concentration > 0.5, "one dominant actor should yield high concentration");
  assert.equal(topAuthorityActor(politics, "s"), "a1");
});

test("computeAuthorityConcentration returns 0 for an untracked scope", () => {
  const politics = createEmptyPoliticsState();
  assert.equal(computeAuthorityConcentration(politics, "nobody-here"), 0);
  assert.equal(topAuthorityActor(politics, "nobody-here"), null);
});

test("upsertLegitimacyProfile stores per-actor legitimacy independent of other actors", () => {
  let politics = createEmptyPoliticsState();
  const profile = computeLegitimacyProfile("leader-1", "s", { election: 0.9, performance: 0.6 }, 5);
  politics = upsertLegitimacyProfile(politics, profile);
  assert.equal(politics.legitimacies["leader-1"].legitimacyScore, profile.legitimacyScore);
  assert.ok(profile.legitimacyScore > 0 && profile.legitimacyScore < 1);
});

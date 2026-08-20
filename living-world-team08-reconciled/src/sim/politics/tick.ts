/**
 * Team 08 top-level tick — the SubsystemTickFn Team 01's simulation
 * pipeline runs once per tick (see core/simulation/simulation.ts).
 *
 * Per-scope work is iterated in id-sorted order (never raw object/Map
 * iteration order) and every RNG draw goes through a namespace forked
 * per-scope-per-concern (e.g. `politics/governance/<settlementId>`), so
 * adding/removing an unrelated settlement never perturbs another
 * settlement's deterministic sequence, and re-running the same tick always
 * visits entities in the same order (brief §36/§37).
 */

import type { WorldState } from "../core/state/worldState";
import type { RngStreamRegistry } from "../core/rng/rngStreamRegistry";
import { readPopulationSnapshot, type ActorSnapshot, type SettlementSnapshot } from "./adapters/populationAdapter";
import { readPoliticsState, writePoliticsState, ensureContractVersion } from "./state";
import type { GovernanceSystem, PoliticsModuleState } from "./contracts";
import {
  applyLegitimacyBonusToAuthority,
  computeAuthorityConcentration,
  deriveAuthorityFactors,
  topAuthorityActor,
  upsertAuthorityProfile,
} from "./authority";
import { crystallizeCustomsIntoRules, maybeFormalizeLaw, observeCustom } from "./rules";
import {
  assignLeader,
  callElection,
  chooseDecisionMethod,
  createGovernanceSystem,
  formCouncil,
  resolveElection,
  votingMethodForGovernance,
  type GovernanceSignals,
} from "./governance";
import { chooseDominantPropertyKind, chooseTaxType, enactTaxPolicy, establishPropertyRight, isEligibleForPublicResource, isEligibleForTaxation, maintainPublicResource, chooseNextPublicResourceKind, establishPublicResource, driftTaxCompliance } from "./property";
import { chooseResolutionMethod, judgeCase, fileJusticeCase, raiseDispute, resolveDispute } from "./justice";
import { crystallizeFactions, isEligibleForFactions, maybeIgniteConflict } from "./factions";
import { canFormState, computeStabilityScore, dissolveState, foundState, isInCrisis, resolveCrisisOutcome, splitState, triggerRebellion, upsertStabilityProfile } from "./statehood";
import { establishTerritory, evolveRelation, expireTreaties, findOrInitRelation } from "./diplomacy";
import { appendHistory } from "./state";

const CUSTOM_CONCEPT_POOL = ["resource_sharing", "conflict_resolution", "trade_conduct", "land_use", "kinship_obligation", "hospitality", "labor_contribution"] as const;

function maxOf(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

function sortedByKey<T>(items: readonly T[], keyFn: (item: T) => string): readonly T[] {
  return [...items].sort((a, b) => keyFn(a).localeCompare(keyFn(b)));
}

function processSettlement(
  politics: PoliticsModuleState,
  settlement: SettlementSnapshot,
  actors: readonly ActorSnapshot[],
  tick: number,
  rng: RngStreamRegistry,
): PoliticsModuleState {
  const scope = settlement.settlementId;
  let next = politics;
  const sortedActors = sortedByKey(actors, (a) => a.actorId);

  // 1. Authority profiles (legitimacy bonus fed back from any existing profile).
  for (const actor of sortedActors) {
    const existingLegitimacy = next.legitimacies[actor.actorId];
    let factors = deriveAuthorityFactors(actor, 0.1);
    if (existingLegitimacy) factors = applyLegitimacyBonusToAuthority(factors, existingLegitimacy.legitimacyScore);
    next = upsertAuthorityProfile(next, actor.actorId, scope, factors, tick);
  }

  // 2. Customary law: observe one behavioral signal this tick, then check for crystallization.
  const customsStream = rng.fork(`politics/customs/${scope}`);
  if (sortedActors.length > 0) {
    const concept = customsStream.choose(CUSTOM_CONCEPT_POOL);
    const wasEnforcedViolation = customsStream.boolean(0.25 + settlement.inequality * 0.25);
    next = observeCustom(next, scope, concept, tick, wasEnforcedViolation);
  }
  next = crystallizeCustomsIntoRules(next, scope, tick, customsStream);

  // 3. Governance emergence.
  const govStream = rng.fork(`politics/governance/${scope}`);
  let governance: GovernanceSystem | undefined = Object.values(next.governanceSystems).find((g) => g.scope === scope);
  const signals: GovernanceSignals = {
    population: settlement.population,
    wealth: settlement.wealth,
    inequality: settlement.inequality,
    cohesion: settlement.cohesion,
    topMilitaryStrength: maxOf(sortedActors.map((a) => a.militaryStrength)),
    topReligiousStanding: maxOf(sortedActors.map((a) => a.religiousStanding)),
    topKinship: maxOf(sortedActors.map((a) => a.kinship)),
  };
  if (!governance && settlement.population >= 25) {
    const created = createGovernanceSystem(next, scope, signals, tick, govStream);
    next = created.politics;
    governance = created.governance;
  }
  // Signal computed via chooseDecisionMethod is embedded inside createGovernanceSystem; nothing further needed here.
  void chooseDecisionMethod;

  // 4. Formalize customary rules into law once authority is sufficiently concentrated.
  const concentration = computeAuthorityConcentration(next, scope);
  next = maybeFormalizeLaw(next, scope, tick, settlement.population, concentration, governance?.leaderId ?? null);

  // 5. Leadership: council formation / election / direct assignment.
  if (governance && governance.leaderId === null && sortedActors.length > 0) {
    const method = governance.decisionMethod;
    if (method === "elder_council" || method === "merchant_council" || method === "military_council" || method === "religious_authority") {
      let council = Object.values(next.councils).find((c) => c.scope === scope);
      if (!council) {
        const formed = formCouncil(next, scope, governance, sortedActors, tick, govStream);
        next = formed.politics;
        council = formed.council;
        next = { ...next, governanceSystems: { ...next.governanceSystems, [governance.governanceId]: { ...governance, councilId: council.councilId } } };
        governance = next.governanceSystems[governance.governanceId];
      }
      if (council.memberIds.length > 0) {
        next = assignLeader(next, governance.governanceId, council.memberIds[0], tick, "term_end");
        governance = next.governanceSystems[governance.governanceId];
      }
    } else if (method === "majority_vote" || method === "representative_vote") {
      const candidateIds = sortedActors.slice(0, Math.min(5, sortedActors.length)).map((a) => a.actorId);
      const voterIds = sortedActors.map((a) => a.actorId);
      const votingMethod = votingMethodForGovernance(governance);
      const called = callElection(next, scope, "leader", candidateIds, voterIds, votingMethod, tick, 200);
      next = called.politics;
      next = resolveElection(next, called.election.electionId, tick, govStream);
      const resolved = next.elections[called.election.electionId];
      if (resolved?.winnerId) {
        next = assignLeader(next, governance.governanceId, resolved.winnerId, tick, "term_end");
        governance = next.governanceSystems[governance.governanceId];
      }
    } else {
      const top = topAuthorityActor(next, scope);
      if (top) {
        next = assignLeader(next, governance.governanceId, top, tick, "term_end");
        governance = next.governanceSystems[governance.governanceId];
      }
    }
  }

  // 6. Property regime baseline (established once per scope).
  if (governance) {
    const hasBaseline = Object.values(next.propertyRights).some((p) => p.holderId === scope && p.resourceRef === `${scope}:communal-land`);
    if (!hasBaseline) {
      const kind = chooseDominantPropertyKind(governance, settlement.cohesion, settlement.inequality, govStream);
      next = establishPropertyRight(next, kind, scope, `${scope}:communal-land`, "occupation", tick);
    }
  }

  // 7. Taxation.
  const formalRuleCount = Object.values(next.rules).filter((r) => r.scope === scope && r.status === "formal").length;
  const taxStream = rng.fork(`politics/taxation/${scope}`);
  const existingTax = Object.values(next.taxPolicies).find((t) => t.scope === scope);
  if (governance && !existingTax && isEligibleForTaxation(formalRuleCount)) {
    const type = chooseTaxType(governance, settlement.wealth, false, taxStream);
    next = enactTaxPolicy(next, scope, type, 0.1 + settlement.inequality * 0.1, scope, governance.leaderId ?? scope, `${scope}:treasury`, tick).politics;
  } else if (existingTax) {
    const stability = next.stability[scope];
    const administrativeEffectiveness = stability?.factors.institutionalEffectiveness ?? 0.5;
    next = { ...next, taxPolicies: { ...next.taxPolicies, [existingTax.taxId]: driftTaxCompliance(existingTax, administrativeEffectiveness) } };
  }

  // 8. Public resources.
  const publicResourceStream = rng.fork(`politics/public-resources/${scope}`);
  const existingResources = Object.values(next.publicResources).filter((r) => r.scope === scope);
  if (governance && isEligibleForPublicResource(settlement.wealth) && publicResourceStream.boolean(0.05)) {
    const kind = chooseNextPublicResourceKind(new Set(existingResources.map((r) => r.kind)), publicResourceStream);
    const funding = existingTax ?? Object.values(next.taxPolicies).find((t) => t.scope === scope);
    next = establishPublicResource(next, scope, kind, governance.leaderId ?? scope, scope, funding?.taxId ?? null, 1 + publicResourceStream.nextInt(0, 4), tick).politics;
  }
  for (const resource of existingResources) {
    next = { ...next, publicResources: { ...next.publicResources, [resource.resourceId]: maintainPublicResource(resource) } };
  }

  // 9. Disputes & justice (small per-tick chance, resolved same tick — Team 08 keeps a single-tick case lifecycle for now, see Known limitations).
  const justiceStream = rng.fork(`politics/justice/${scope}`);
  if (sortedActors.length >= 2 && justiceStream.boolean(0.08)) {
    const [a, b] = justiceStream.shuffle(sortedActors).slice(0, 2);
    const method = chooseResolutionMethod(governance ?? null, existingResources.some((r) => r.kind === "public_building"));
    const relatedRule = Object.values(next.rules).find((r) => r.scope === scope && r.status === "formal") ?? null;
    if (relatedRule) {
      const filed = fileJusticeCase(next, scope, a.actorId, b.actorId, `dispute:${relatedRule.concept}`, relatedRule, 0.4 + justiceStream.nextFloat() * 0.5, [], method, tick);
      next = filed.politics;
      next = judgeCase(next, filed.justiceCase.caseId, relatedRule, tick, justiceStream);
    } else {
      const raised = raiseDispute(next, scope, [a.actorId, b.actorId], "informal_grievance", method, tick);
      next = raised.politics;
      next = resolveDispute(next, raised.dispute.disputeId, tick, justiceStream);
    }
  }

  // 10. Factions & political conflict.
  const factionStream = rng.fork(`politics/factions/${scope}`);
  if (isEligibleForFactions(settlement.population)) {
    next = crystallizeFactions(next, scope, sortedActors, tick, factionStream);
    next = maybeIgniteConflict(next, scope, tick, factionStream);
  }

  // 11. Stability.
  const scopedFactions = Object.values(next.factions).filter((f) => f.scope === scope);
  const activeConflicts = Object.values(next.conflicts).filter((c) => c.scope === scope && c.resolvedAtTick === null);
  const leaderLegitimacy = governance?.leaderId ? next.legitimacies[governance.leaderId]?.legitimacyScore ?? 0.5 : 0.4;
  const stabilityFactors = {
    legitimacy: leaderLegitimacy,
    foodSecurity: clamp01(1 - settlement.inequality * 0.5),
    economicHealth: settlement.wealth,
    eliteCohesion: settlement.cohesion,
    publicSupport: clamp01(settlement.cohesion - activeConflicts.length * 0.1),
    militaryLoyalty: 0.5 + signals.topMilitaryStrength * 0.3,
    regionalCohesion: settlement.cohesion,
    institutionalEffectiveness: governance ? clamp01(0.4 + formalRuleCount * 0.05) : 0.2,
  };
  const failureFactors = {
    corruption: clamp01(settlement.inequality * 0.4),
    nepotism: clamp01(signals.topKinship * 0.2),
    eliteCapture: clamp01(concentration * 0.3),
    administrativeInefficiency: governance ? 0.1 : 0.3,
    taxEvasion: existingTax ? clamp01(1 - existingTax.complianceRate) : 0,
    abuseOfAuthority: clamp01(scopedFactions.reduce((s, f) => s + f.strength, 0) / Math.max(1, scopedFactions.length) * 0.2),
  };
  next = upsertStabilityProfile(next, scope, stabilityFactors, failureFactors, tick);
  const stabilityScore = computeStabilityScore(stabilityFactors, failureFactors);

  // 12. Statehood: form, or evaluate crisis on an existing polity.
  const existingPolity = Object.values(next.polities).find((p) => p.governanceId === governance?.governanceId && p.dissolvedAtTick === null);
  if (governance && !existingPolity) {
    const conditions = {
      population: settlement.population,
      hasCentralAuthority: governance.leaderId !== null || governance.councilId !== null,
      hasStableRules: formalRuleCount > 0,
      hasResourceExtraction: existingTax !== undefined || Object.values(next.taxPolicies).some((t) => t.scope === scope),
      governanceStableTicks: tick - governance.establishedAtTick,
    };
    if (canFormState(conditions)) {
      let territory = Object.values(next.territories).find((t) => t.controllingPolityId === null && t.memberRegionIds.includes(scope));
      if (!territory) {
        const est = establishTerritory(next, null, [scope], ["settlement", "population"], tick);
        next = est.politics;
        territory = est.territory;
      }
      const founded = foundState(next, governance, territory.territoryId, tick);
      next = founded.politics;
      next = { ...next, territories: { ...next.territories, [territory.territoryId]: { ...territory, controllingPolityId: founded.polity.polityId } } };
    }
  } else if (existingPolity) {
    const crisisStream = rng.fork(`politics/crisis/${scope}`);
    if (isInCrisis(stabilityScore) && crisisStream.boolean(0.15)) {
      next = triggerRebellion(next, existingPolity.polityId, tick);
      const factionStrengthSum = scopedFactions.reduce((s, f) => s + f.strength, 0);
      const outcome = resolveCrisisOutcome(stabilityScore, factionStrengthSum, crisisStream);
      if (outcome === "collapse") {
        next = dissolveState(next, existingPolity.polityId, "resource_collapse", tick);
      } else if (outcome === "revolution" && scopedFactions.length >= 2) {
        // Successor governance systems, one per leading opposed faction, sharing the same territory.
        const successorGovs = scopedFactions.slice(0, 2).map(() => {
          const created = createGovernanceSystem(next, scope, signals, tick, crisisStream);
          next = created.politics;
          return { governance: created.governance, territoryId: existingPolity.territoryId };
        });
        const split = splitState(next, existingPolity.polityId, successorGovs, "rebellion", tick);
        next = split.politics;
      }
      // "reform" outcome: state persists; leader is simply removed so the next tick's leadership step reselects one.
      // (existingPolity's governanceId always traces back to a governance system created above, so this is safe.)
      const activeGovernance = next.governanceSystems[existingPolity.governanceId];
      if (outcome === "reform" && activeGovernance && activeGovernance.leaderId !== null) {
        next = { ...next, governanceSystems: { ...next.governanceSystems, [activeGovernance.governanceId]: { ...activeGovernance, leaderId: null } } };
      }
    }
  }

  return next;
}

/** Evolves diplomatic relations and treaty lifecycles across every currently-active polity pair. */
function processDiplomacy(politics: PoliticsModuleState, tick: number, rng: RngStreamRegistry): PoliticsModuleState {
  let next = expireTreaties(politics, tick);
  const activePolities = sortedByKey(
    Object.values(next.polities).filter((p) => p.dissolvedAtTick === null),
    (p) => p.polityId,
  );
  const diplomacyStream = rng.fork("politics/diplomacy");
  for (let i = 0; i < activePolities.length; i++) {
    for (let j = i + 1; j < activePolities.length; j++) {
      const a = activePolities[i];
      const b = activePolities[j];
      const found = findOrInitRelation(next, a.polityId, b.polityId, tick);
      next = found.politics;
      // Trust drifts by a small deterministic-per-pair amount each tick; real proximity/resource-competition
      // signals belong to Team 02/05 and are not yet available — see Known limitations.
      const pairStream = rng.fork(`politics/diplomacy/${found.relation.relationId}`);
      void diplomacyStream;
      const trustDelta = (pairStream.nextFloat() - 0.5) * 0.05;
      next = evolveRelation(next, found.relation.relationId, trustDelta, tick, pairStream);
    }
  }
  return next;
}

export function politicsTick(state: WorldState, rng: RngStreamRegistry): WorldState {
  const tick = state.tick;
  let politics = ensureContractVersion(readPoliticsState(state));
  const population = readPopulationSnapshot(state, rng);

  const settlements = sortedByKey(population.settlements, (s) => s.settlementId);
  for (const settlement of settlements) {
    const actors = settlement.actorIds.map((id) => population.actorsById[id]).filter((a): a is ActorSnapshot => a !== undefined);
    politics = processSettlement(politics, settlement, actors, tick, rng);
  }

  politics = processDiplomacy(politics, tick, rng);

  return writePoliticsState(state, politics);
}

// Re-exported so tick.test.ts / integration tests can append synthetic history entries without reaching into state.ts.
export { appendHistory as appendPoliticsHistory };

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Diplomacy, treaties, and territory (brief §25–27). Team 08 owns the
 * political decision and diplomatic state; actual war *execution* belongs
 * to a future combat/military team — see brief §25.
 */

import type { DeterministicRng } from "../core/rng/deterministicRng";
import type { DiplomaticRelation, DiplomaticStance, PoliticsModuleState, Territory, Treaty } from "./contracts";
import { appendHistory, mintId } from "./state";

const STANCE_TRANSITIONS: Readonly<Record<DiplomaticStance, readonly DiplomaticStance[]>> = {
  peace: ["trade_agreement", "non_aggression_pact", "hostility"],
  trade_agreement: ["alliance", "peace", "hostility"],
  alliance: ["trade_agreement", "vassal"],
  non_aggression_pact: ["peace", "hostility"],
  tribute: ["vassal", "hostility", "peace"],
  vassal: ["hostility", "peace"],
  hostility: ["war", "peace", "non_aggression_pact"],
  war: ["hostility", "tribute", "vassal"],
};

export function findOrInitRelation(politics: PoliticsModuleState, polityAId: string, polityBId: string, tick: number): { politics: PoliticsModuleState; relation: DiplomaticRelation } {
  const existing = Object.values(politics.diplomaticRelations).find(
    (r) => (r.polityAId === polityAId && r.polityBId === polityBId) || (r.polityAId === polityBId && r.polityBId === polityAId),
  );
  if (existing) return { politics, relation: existing };

  const { id: relationId, idCounters } = mintId(politics, "relation");
  const relation: DiplomaticRelation = { relationId, polityAId, polityBId, stance: "peace", since: tick, trust: 0.5 };
  return { politics: { ...politics, idCounters, diplomaticRelations: { ...politics.diplomaticRelations, [relationId]: relation } }, relation };
}

/**
 * Evaluates a relation for a possible stance transition, driven by trust
 * drift (from `trustDelta`, supplied by the caller from faction
 * pressure/resource competition/proximity signals — Team 08 never invents
 * those signals itself) and a deterministic draw among the stances legally
 * reachable from the current one.
 */
export function evolveRelation(
  politics: PoliticsModuleState,
  relationId: string,
  trustDelta: number,
  tick: number,
  rng: DeterministicRng,
): PoliticsModuleState {
  const relation = politics.diplomaticRelations[relationId];
  if (!relation) return politics;

  const trust = clamp01(relation.trust + trustDelta);
  const reachable = STANCE_TRANSITIONS[relation.stance];
  // Higher trust favors staying/improving; lower trust favors the more hostile reachable options.
  const items = reachable.map((stance) => ({
    value: stance,
    weight: isFriendlier(stance, relation.stance) ? trust : 1 - trust,
  }));
  items.push({ value: relation.stance, weight: 3 }); // inertia: staying put is the common case — diplomatic stances shift over many ticks, not every tick
  const nextStance = rng.weightedChoice(items.map((i) => ({ value: i.value, weight: Math.max(0.01, i.weight) })));

  if (nextStance === relation.stance && trust === relation.trust) return politics;

  const updated: DiplomaticRelation = { ...relation, stance: nextStance, trust };
  let next: PoliticsModuleState = { ...politics, diplomaticRelations: { ...politics.diplomaticRelations, [relationId]: updated } };
  if (nextStance !== relation.stance) {
    next = appendHistory(next, {
      type: nextStance === "war" ? "war_declared" : "diplomatic_stance_changed",
      tick,
      scope: `${relation.polityAId}|${relation.polityBId}`,
      summary: `Diplomatic stance shifted from ${relation.stance} to ${nextStance}.`,
      refs: { relationId },
    });
  }
  return next;
}

function isFriendlier(candidate: DiplomaticStance, current: DiplomaticStance): boolean {
  const rank: Record<DiplomaticStance, number> = {
    war: 0,
    hostility: 1,
    vassal: 2,
    tribute: 2,
    non_aggression_pact: 3,
    peace: 4,
    trade_agreement: 5,
    alliance: 6,
  };
  return rank[candidate] > rank[current];
}

// --------------------------------------------------------------------- //
// Treaties (§26)
// --------------------------------------------------------------------- //

export function signTreaty(
  politics: PoliticsModuleState,
  participantIds: readonly string[],
  terms: readonly string[],
  obligations: Readonly<Record<string, readonly string[]>>,
  durationTicks: number | null,
  tick: number,
): { politics: PoliticsModuleState; treaty: Treaty } {
  const { id: treatyId, idCounters } = mintId(politics, "treaty");
  const treaty: Treaty = {
    treatyId,
    participantIds,
    terms,
    signedAtTick: tick,
    durationTicks,
    obligations,
    violations: [],
    terminatedAtTick: null,
    terminationReason: null,
  };
  let next: PoliticsModuleState = { ...politics, idCounters, treaties: { ...politics.treaties, [treatyId]: treaty } };
  next = appendHistory(next, {
    type: "treaty_signed",
    tick,
    scope: participantIds.join("|"),
    summary: `Treaty signed among ${participantIds.length} parties.`,
    refs: { treatyId },
  });
  return { politics: next, treaty };
}

export function recordTreatyViolation(politics: PoliticsModuleState, treatyId: string, polityId: string, concept: string, tick: number): PoliticsModuleState {
  const treaty = politics.treaties[treatyId];
  if (!treaty || treaty.terminatedAtTick !== null) return politics;
  const updated: Treaty = { ...treaty, violations: [...treaty.violations, { polityId, atTick: tick, concept }] };
  let next: PoliticsModuleState = { ...politics, treaties: { ...politics.treaties, [treatyId]: updated } };
  next = appendHistory(next, {
    type: "treaty_violated",
    tick,
    scope: treaty.participantIds.join("|"),
    summary: `Treaty violated by ${polityId}: ${concept}.`,
    refs: { treatyId },
  });
  return next;
}

export function terminateTreaty(politics: PoliticsModuleState, treatyId: string, reason: string, tick: number): PoliticsModuleState {
  const treaty = politics.treaties[treatyId];
  if (!treaty || treaty.terminatedAtTick !== null) return politics;
  const updated: Treaty = { ...treaty, terminatedAtTick: tick, terminationReason: reason };
  let next: PoliticsModuleState = { ...politics, treaties: { ...politics.treaties, [treatyId]: updated } };
  next = appendHistory(next, {
    type: "treaty_terminated",
    tick,
    scope: treaty.participantIds.join("|"),
    summary: `Treaty terminated: ${reason}.`,
    refs: { treatyId },
  });
  return next;
}

/** Expires treaties whose durationTicks has elapsed. Pure, no RNG. */
export function expireTreaties(politics: PoliticsModuleState, tick: number): PoliticsModuleState {
  let next = politics;
  for (const treaty of Object.values(politics.treaties)) {
    if (treaty.terminatedAtTick !== null || treaty.durationTicks === null) continue;
    if (tick >= treaty.signedAtTick + treaty.durationTicks) {
      next = terminateTreaty(next, treaty.treatyId, "duration_elapsed", tick);
    }
  }
  return next;
}

// --------------------------------------------------------------------- //
// Territory / borders (§27)
// --------------------------------------------------------------------- //

export function establishTerritory(
  politics: PoliticsModuleState,
  controllingPolityId: string | null,
  memberRegionIds: readonly string[],
  basis: Territory["basis"],
  tick: number,
): { politics: PoliticsModuleState; territory: Territory } {
  const { id: territoryId, idCounters } = mintId(politics, "territory");
  const territory: Territory = { territoryId, controllingPolityId, memberRegionIds, basis, establishedAtTick: tick, contested: false };
  let next: PoliticsModuleState = { ...politics, idCounters, territories: { ...politics.territories, [territoryId]: territory } };
  next = appendHistory(next, {
    type: "territory_changed",
    tick,
    scope: controllingPolityId ?? territoryId,
    summary: `Territory established over ${memberRegionIds.length} region(s), basis: ${basis.join(", ")}.`,
    refs: { territoryId },
  });
  return { politics: next, territory };
}

export function transferTerritory(politics: PoliticsModuleState, territoryId: string, newControllerId: string | null, tick: number): PoliticsModuleState {
  const territory = politics.territories[territoryId];
  if (!territory) return politics;
  const updated: Territory = { ...territory, controllingPolityId: newControllerId };
  let next: PoliticsModuleState = { ...politics, territories: { ...politics.territories, [territoryId]: updated } };
  next = appendHistory(next, {
    type: "territory_changed",
    tick,
    scope: newControllerId ?? territoryId,
    summary: `Territory ${territoryId} control transferred${newControllerId ? ` to ${newControllerId}` : " (lost control)"}.`,
    refs: { territoryId },
  });
  return next;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Stability, state formation, fragmentation, transformation, and
 * revolution (brief §28–34). A political state is never spawned
 * automatically — `canFormState` is a necessary-conditions gate; actual
 * formation still requires the caller (tick.ts) to observe those
 * conditions holding for a scope over real accumulated history.
 */

import type { DeterministicRng } from "../core/rng/deterministicRng";
import {
  CRISIS_PERSISTENCE_TICKS_FOR_REBELLION,
  EMERGENCE_THRESHOLDS,
  INSTITUTIONAL_FAILURE_PENALTY,
  STABILITY_CRISIS_THRESHOLD,
  STABILITY_WEIGHTS,
} from "./config";
import type {
  GovernanceSystem,
  InstitutionalFailureFactors,
  PoliticalEntity,
  PoliticalEntityDissolutionReason,
  PoliticsModuleState,
  StabilityFactors,
  StabilityProfile,
} from "./contracts";
import { appendHistory, mintId } from "./state";

// --------------------------------------------------------------------- //
// Stability (§33)
// --------------------------------------------------------------------- //

export function computeStabilityScore(factors: StabilityFactors, failure: InstitutionalFailureFactors): number {
  const weighted =
    factors.legitimacy * STABILITY_WEIGHTS.legitimacy +
    factors.foodSecurity * STABILITY_WEIGHTS.foodSecurity +
    factors.economicHealth * STABILITY_WEIGHTS.economicHealth +
    factors.eliteCohesion * STABILITY_WEIGHTS.eliteCohesion +
    factors.publicSupport * STABILITY_WEIGHTS.publicSupport +
    factors.militaryLoyalty * STABILITY_WEIGHTS.militaryLoyalty +
    factors.regionalCohesion * STABILITY_WEIGHTS.regionalCohesion +
    factors.institutionalEffectiveness * STABILITY_WEIGHTS.institutionalEffectiveness;

  const penalty =
    failure.corruption * INSTITUTIONAL_FAILURE_PENALTY.corruption +
    failure.nepotism * INSTITUTIONAL_FAILURE_PENALTY.nepotism +
    failure.eliteCapture * INSTITUTIONAL_FAILURE_PENALTY.eliteCapture +
    failure.administrativeInefficiency * INSTITUTIONAL_FAILURE_PENALTY.administrativeInefficiency +
    failure.taxEvasion * INSTITUTIONAL_FAILURE_PENALTY.taxEvasion +
    failure.abuseOfAuthority * INSTITUTIONAL_FAILURE_PENALTY.abuseOfAuthority;

  return clamp01(weighted - penalty);
}

export function upsertStabilityProfile(
  politics: PoliticsModuleState,
  polityId: string,
  factors: StabilityFactors,
  failure: InstitutionalFailureFactors,
  tick: number,
): PoliticsModuleState {
  const profile: StabilityProfile = { polityId, factors, failure, stabilityScore: computeStabilityScore(factors, failure), updatedAtTick: tick };
  return { ...politics, stability: { ...politics.stability, [polityId]: profile } };
}

// --------------------------------------------------------------------- //
// State formation (§28)
// --------------------------------------------------------------------- //

export interface StatehoodConditions {
  readonly population: number;
  readonly hasCentralAuthority: boolean; // a governance system with a seated leader/council
  readonly hasStableRules: boolean; // at least one formal (codified) rule
  readonly hasResourceExtraction: boolean; // at least one enacted tax policy
  readonly governanceStableTicks: number; // ticks since the governance system was established
}

export function canFormState(conditions: StatehoodConditions): boolean {
  return (
    conditions.population >= EMERGENCE_THRESHOLDS.statehoodMinPopulation &&
    conditions.hasCentralAuthority &&
    conditions.hasStableRules &&
    conditions.hasResourceExtraction &&
    conditions.governanceStableTicks >= EMERGENCE_THRESHOLDS.statehoodMinStableTicks
  );
}

export function foundState(
  politics: PoliticsModuleState,
  governance: GovernanceSystem,
  territoryId: string,
  tick: number,
): { politics: PoliticsModuleState; polity: PoliticalEntity } {
  const { id: polityId, idCounters } = mintId(politics, "polity");
  const polity: PoliticalEntity = {
    polityId,
    name: null,
    foundedAtTick: tick,
    territoryId,
    governanceId: governance.governanceId,
    memberPolityIds: [],
    subordinateOf: null,
    dissolvedAtTick: null,
    dissolutionReason: null,
  };
  let next: PoliticsModuleState = { ...politics, idCounters, polities: { ...politics.polities, [polityId]: polity } };
  next = appendHistory(next, {
    type: "state_founded",
    tick,
    scope: governance.scope,
    summary: `Political state recognized (decision method: ${governance.decisionMethod}, succession: ${governance.successionMethod}).`,
    refs: { polityId, governanceId: governance.governanceId },
  });
  return { politics: next, polity };
}

/**
 * Composes multiple existing polities into one composite entity (a
 * federation/confederation/empire/vassal-network — the character emerges
 * from `memberPolityIds` + each member's `subordinateOf`, never from a
 * hardcoded class per brief §30).
 */
export function composePolities(
  politics: PoliticsModuleState,
  memberPolityIds: readonly string[],
  territoryId: string,
  governance: GovernanceSystem,
  tick: number,
  subordinateMembers: boolean,
): { politics: PoliticsModuleState; polity: PoliticalEntity } {
  const { id: polityId, idCounters } = mintId(politics, "polity");
  const composite: PoliticalEntity = {
    polityId,
    name: null,
    foundedAtTick: tick,
    territoryId,
    governanceId: governance.governanceId,
    memberPolityIds,
    subordinateOf: null,
    dissolvedAtTick: null,
    dissolutionReason: null,
  };

  let next: PoliticsModuleState = { ...politics, idCounters, polities: { ...politics.polities, [polityId]: composite } };
  if (subordinateMembers) {
    for (const memberId of memberPolityIds) {
      const member = next.polities[memberId];
      if (member) next = { ...next, polities: { ...next.polities, [memberId]: { ...member, subordinateOf: polityId } } };
    }
  }
  next = appendHistory(next, {
    type: "state_founded",
    tick,
    scope: polityId,
    summary: `Composite political entity formed over ${memberPolityIds.length} member polities.`,
    refs: { polityId },
  });
  return { politics: next, polity: composite };
}

// --------------------------------------------------------------------- //
// Fragmentation (§29) & revolution (§31)
// --------------------------------------------------------------------- //

/** Tracks (outside persisted state — caller-owned counter) how many consecutive ticks a polity has been below the crisis threshold. Exposed as a pure predicate so callers can maintain their own counter in whatever form suits their loop. */
export function isInCrisis(stabilityScore: number): boolean {
  return stabilityScore < STABILITY_CRISIS_THRESHOLD;
}

export function rebellionEligible(consecutiveCrisisTicks: number): boolean {
  return consecutiveCrisisTicks >= CRISIS_PERSISTENCE_TICKS_FOR_REBELLION;
}

export function triggerRebellion(politics: PoliticsModuleState, polityId: string, tick: number): PoliticsModuleState {
  return appendHistory(politics, {
    type: "rebellion",
    tick,
    scope: polityId,
    summary: `Sustained institutional crisis triggered a rebellion.`,
    refs: { polityId },
  });
}

export function dissolveState(
  politics: PoliticsModuleState,
  polityId: string,
  reason: PoliticalEntityDissolutionReason,
  tick: number,
): PoliticsModuleState {
  const polity = politics.polities[polityId];
  if (!polity || polity.dissolvedAtTick !== null) return politics;
  const dissolved: PoliticalEntity = { ...polity, dissolvedAtTick: tick, dissolutionReason: reason };
  let next: PoliticsModuleState = { ...politics, polities: { ...politics.polities, [polityId]: dissolved } };
  next = appendHistory(next, {
    type: "state_dissolved",
    tick,
    scope: polityId,
    summary: `State dissolved (${reason}).`,
    refs: { polityId },
  });
  return next;
}

/**
 * Splits a polity into successor polities over a caller-supplied partition
 * of its former territory/governance. `resolveRevolution` decides whether
 * the outcome is a reform (state persists, governance replaced), a full
 * revolution (state splits/replaced), or collapse (dissolved with no
 * successor) — driven by a deterministic weighted draw over the polity's
 * current stability, never fixed.
 */
export function resolveCrisisOutcome(
  stabilityScore: number,
  factionStrengthSum: number,
  rng: DeterministicRng,
): "reform" | "revolution" | "collapse" {
  const items = [
    { value: "reform" as const, weight: clamp01(stabilityScore) + 0.1 },
    { value: "revolution" as const, weight: clamp01(factionStrengthSum) },
    { value: "collapse" as const, weight: clamp01(1 - stabilityScore) * 0.5 },
  ];
  return rng.weightedChoice(items);
}

export function splitState(
  politics: PoliticsModuleState,
  polityId: string,
  successorGovernances: readonly { governance: GovernanceSystem; territoryId: string }[],
  reason: PoliticalEntityDissolutionReason,
  tick: number,
): { politics: PoliticsModuleState; successors: readonly PoliticalEntity[] } {
  let next = dissolveState(politics, polityId, reason, tick);
  const successors: PoliticalEntity[] = [];
  for (const { governance, territoryId } of successorGovernances) {
    const { id: successorId, idCounters } = mintId(next, "polity");
    const successor: PoliticalEntity = {
      polityId: successorId,
      name: null,
      foundedAtTick: tick,
      territoryId,
      governanceId: governance.governanceId,
      memberPolityIds: [],
      subordinateOf: null,
      dissolvedAtTick: null,
      dissolutionReason: null,
    };
    next = { ...next, idCounters, polities: { ...next.polities, [successorId]: successor } };
    successors.push(successor);
  }
  next = appendHistory(next, {
    type: "state_split",
    tick,
    scope: polityId,
    summary: `Former state ${polityId} split into ${successors.length} successor polit${successors.length === 1 ? "y" : "ies"} (${reason}).`,
    refs: { polityId },
  });
  return { politics: next, successors };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Authority (§7) and legitimacy (§8) — deliberately separate models.
 * Authority answers "how much practical sway does this actor have";
 * legitimacy answers "how accepted is that sway". A powerful ruler can
 * have low legitimacy; a weak leader can have high legitimacy — the two
 * scores are never derived from each other.
 */

import { AUTHORITY_WEIGHTS, LEGITIMACY_SOURCE_WEIGHTS } from "./config";
import type { AuthorityFactors, AuthorityProfile, LegitimacyProfile, LegitimacySource, PoliticsModuleState } from "./contracts";
import type { ActorSnapshot } from "./adapters/populationAdapter";

/** Builds AuthorityFactors from whatever raw signals the population adapter provides for this actor. */
export function deriveAuthorityFactors(actor: ActorSnapshot, tenureBonus: number): AuthorityFactors {
  return {
    influence: actor.influence,
    legitimacyBonus: 0, // filled in by combineWithLegitimacy() once a legitimacy profile exists
    trust: actor.trust,
    militaryStrength: actor.militaryStrength,
    wealth: actor.wealth,
    kinship: actor.kinship,
    religiousAuthority: actor.religiousStanding,
    knowledge: actor.knowledge,
    tradition: clamp01(tenureBonus),
    institutionalControl: 0, // filled in once the actor holds a governance seat, see governance.ts
  };
}

export function computeAuthorityScore(factors: AuthorityFactors): number {
  const weighted =
    factors.influence * AUTHORITY_WEIGHTS.influence +
    factors.legitimacyBonus * AUTHORITY_WEIGHTS.legitimacyBonus +
    factors.trust * AUTHORITY_WEIGHTS.trust +
    factors.militaryStrength * AUTHORITY_WEIGHTS.militaryStrength +
    factors.wealth * AUTHORITY_WEIGHTS.wealth +
    factors.kinship * AUTHORITY_WEIGHTS.kinship +
    factors.religiousAuthority * AUTHORITY_WEIGHTS.religiousAuthority +
    factors.knowledge * AUTHORITY_WEIGHTS.knowledge +
    factors.tradition * AUTHORITY_WEIGHTS.tradition +
    factors.institutionalControl * AUTHORITY_WEIGHTS.institutionalControl;
  return clamp01(weighted);
}

export function upsertAuthorityProfile(
  politics: PoliticsModuleState,
  actorId: string,
  scope: string,
  factors: AuthorityFactors,
  tick: number,
): PoliticsModuleState {
  const profile: AuthorityProfile = { actorId, scope, factors, authorityScore: computeAuthorityScore(factors), updatedAtTick: tick };
  return { ...politics, authorities: { ...politics.authorities, [actorId]: profile } };
}

/**
 * Authority concentration for a scope: the top actor's share of total
 * authority among all tracked actors in that scope. High concentration is
 * one of the signals that pushes toward centralized governance/formal law
 * (never the sole cause — see governance.ts / rules.ts).
 */
export function computeAuthorityConcentration(politics: PoliticsModuleState, scope: string): number {
  const scoped = Object.values(politics.authorities).filter((a) => a.scope === scope);
  if (scoped.length === 0) return 0;
  const total = scoped.reduce((sum, a) => sum + a.authorityScore, 0);
  if (total <= 0) return 0;
  const top = Math.max(...scoped.map((a) => a.authorityScore));
  return clamp01(top / total);
}

export function topAuthorityActor(politics: PoliticsModuleState, scope: string): string | null {
  const scoped = Object.values(politics.authorities).filter((a) => a.scope === scope);
  if (scoped.length === 0) return null;
  return scoped.reduce((best, a) => (a.authorityScore > best.authorityScore ? a : best)).actorId;
}

/** Recomputes a legitimacy profile from whichever sources are currently active for the actor. */
export function computeLegitimacyProfile(
  actorId: string,
  scope: string,
  sources: Partial<Record<LegitimacySource, number>>,
  tick: number,
): LegitimacyProfile {
  let score = 0;
  for (const [source, value] of Object.entries(sources) as [LegitimacySource, number][]) {
    score += clamp01(value) * LEGITIMACY_SOURCE_WEIGHTS[source];
  }
  return { actorId, scope, sources, legitimacyScore: clamp01(score), updatedAtTick: tick };
}

export function upsertLegitimacyProfile(politics: PoliticsModuleState, profile: LegitimacyProfile): PoliticsModuleState {
  return { ...politics, legitimacies: { ...politics.legitimacies, [profile.actorId]: profile } };
}

/** Feeds an actor's current legitimacy back into their AuthorityFactors.legitimacyBonus — the one sanctioned coupling between the two models (legitimacy *lends* authority a little; authority never grants legitimacy back). */
export function applyLegitimacyBonusToAuthority(factors: AuthorityFactors, legitimacyScore: number): AuthorityFactors {
  return { ...factors, legitimacyBonus: clamp01(legitimacyScore) };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

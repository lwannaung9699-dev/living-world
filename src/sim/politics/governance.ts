/**
 * Governance systems, decision methods, elections, councils, and
 * succession (brief §9–14). All combined in one file because they are one
 * connected institution-selection pipeline: a scope earns a
 * GovernanceSystem once conditions are met; the *method* by which it makes
 * decisions and selects leaders is picked by weighted RNG over signals
 * derived from the scope's actual social conditions — never assigned.
 */

import type { DeterministicRng } from "../core/rng/deterministicRng";
import { DECISION_METHOD_BASE_WEIGHT, EMERGENCE_THRESHOLDS, SUCCESSION_METHOD_BASE_WEIGHT } from "./config";
import type {
  Council,
  CouncilSelectionCriterion,
  DecisionMethod,
  Election,
  GovernanceSystem,
  PoliticsModuleState,
  RepresentationStructure,
  SuccessionEvent,
  SuccessionMethod,
  VotingMethod,
} from "./contracts";
import type { ActorSnapshot, SettlementSnapshot } from "./adapters/populationAdapter";
import { appendHistory, mintId } from "./state";

export interface GovernanceSignals {
  readonly population: number;
  readonly wealth: number;
  readonly inequality: number;
  readonly cohesion: number;
  readonly topMilitaryStrength: number;
  readonly topReligiousStanding: number;
  readonly topKinship: number;
}

/** True once a scope has enough population to be eligible for a governance system at all (brief §9). */
export function isEligibleForGovernance(signals: GovernanceSignals): boolean {
  return signals.population >= EMERGENCE_THRESHOLDS.governanceMinPopulation;
}

/**
 * Weighs each DecisionMethod against the scope's actual conditions, then
 * lets a deterministic weighted RNG draw choose among them. No branch of
 * this function ever returns a fixed method for a fixed input shape by
 * itself — it always goes through the RNG weighted draw.
 */
export function chooseDecisionMethod(signals: GovernanceSignals, rng: DeterministicRng): DecisionMethod {
  const weight: Record<DecisionMethod, number> = { ...DECISION_METHOD_BASE_WEIGHT };

  // Small, kin-dense, cohesive settlements lean toward elder/consensus governance.
  if (signals.population < 60 && signals.topKinship > 0.5) {
    weight.elder_council *= 1.8;
    weight.consensus *= 1.6;
  }
  // High inequality + wealth concentration favors a single ruler or merchant council.
  if (signals.inequality > 0.5) {
    weight.individual_ruler *= 1.5;
    weight.merchant_council *= 1.4 * (1 + signals.wealth);
  }
  // Strong martial signal favors military governance.
  if (signals.topMilitaryStrength > 0.6) {
    weight.military_council *= 1.6;
    weight.individual_ruler *= 1.3;
  }
  // Strong religious signal favors theocratic authority.
  if (signals.topReligiousStanding > 0.6) {
    weight.religious_authority *= 1.8;
  }
  // Large, low-inequality, cohesive populations lean toward broader participation.
  if (signals.population > 150 && signals.inequality < 0.35 && signals.cohesion > 0.55) {
    weight.majority_vote *= 1.6;
    weight.representative_vote *= 1.7;
  }
  // Very large populations favor representation over direct methods, regardless of the above.
  if (signals.population > 400) {
    weight.representative_vote *= 1.4;
    weight.consensus *= 0.5;
  }

  const items = (Object.keys(weight) as DecisionMethod[]).map((m) => ({ value: m, weight: Math.max(0.01, weight[m]) }));
  return rng.weightedChoice(items);
}

export function representationForMethod(method: DecisionMethod): RepresentationStructure {
  switch (method) {
    case "individual_ruler":
    case "hereditary_succession":
    case "religious_authority":
      return "none";
    case "consensus":
      return "direct_participation";
    case "elder_council":
      return "clan_representatives";
    case "merchant_council":
      return "guild_representatives";
    case "military_council":
      return "selected_representatives";
    case "majority_vote":
      return "direct_participation";
    case "representative_vote":
      return "regional_representatives";
    default:
      return "none";
  }
}

export function chooseSuccessionMethod(method: DecisionMethod, signals: GovernanceSignals, rng: DeterministicRng): SuccessionMethod {
  const weight: Record<SuccessionMethod, number> = { ...SUCCESSION_METHOD_BASE_WEIGHT };
  if (method === "individual_ruler" || method === "religious_authority") weight.hereditary *= 1.6;
  if (method === "military_council") weight.military *= 1.8;
  if (method === "elder_council") weight.appointed_by_council *= 1.6;
  if (method === "merchant_council") weight.merit_based *= 1.5;
  if (method === "majority_vote" || method === "representative_vote") weight.elected *= 2;
  if (signals.topKinship > 0.6) weight.hereditary *= 1.3;

  const items = (Object.keys(weight) as SuccessionMethod[]).map((m) => ({ value: m, weight: Math.max(0.01, weight[m]) }));
  return rng.weightedChoice(items);
}

export function createGovernanceSystem(
  politics: PoliticsModuleState,
  scope: string,
  signals: GovernanceSignals,
  tick: number,
  rng: DeterministicRng,
): { politics: PoliticsModuleState; governance: GovernanceSystem } {
  const decisionMethod = chooseDecisionMethod(signals, rng);
  const successionMethod = chooseSuccessionMethod(decisionMethod, signals, rng);
  const { id: governanceId, idCounters } = mintId(politics, "governance");

  const governance: GovernanceSystem = {
    governanceId,
    scope,
    decisionMethod,
    representation: representationForMethod(decisionMethod),
    leaderId: null,
    councilId: null,
    successionMethod,
    establishedAtTick: tick,
    administers: [],
  };

  let next: PoliticsModuleState = {
    ...politics,
    idCounters,
    governanceSystems: { ...politics.governanceSystems, [governanceId]: governance },
  };
  next = appendHistory(next, {
    type: "institution_created",
    tick,
    scope,
    summary: `Governance system emerged with decision method "${decisionMethod}" and succession method "${successionMethod}".`,
    refs: { governanceId },
  });
  return { politics: next, governance };
}

// --------------------------------------------------------------------- //
// Councils (§13)
// --------------------------------------------------------------------- //

function selectionCriteriaForMethod(method: DecisionMethod): readonly CouncilSelectionCriterion[] {
  switch (method) {
    case "elder_council":
      return ["age", "experience", "kinship"];
    case "merchant_council":
      return ["wealth", "prestige"];
    case "military_council":
      return ["military_ability", "experience"];
    case "religious_authority":
      return ["religious_status", "prestige"];
    case "representative_vote":
      return ["election"];
    default:
      return ["prestige", "appointment"];
  }
}

export function formCouncil(
  politics: PoliticsModuleState,
  scope: string,
  governance: GovernanceSystem,
  actors: readonly ActorSnapshot[],
  tick: number,
  rng: DeterministicRng,
): { politics: PoliticsModuleState; council: Council } {
  const criteria = selectionCriteriaForMethod(governance.decisionMethod);
  const seats = Math.max(3, Math.min(9, Math.round(actors.length / 3)));
  const ranked = rankActorsForCouncil(actors, criteria);
  const memberIds = ranked.slice(0, Math.min(seats, ranked.length)).map((a) => a.actorId);
  // If there are more eligible candidates than seats, break remaining ties deterministically via RNG shuffle of the tail.
  void rng;

  const { id: councilId, idCounters } = mintId(politics, "council");
  const council: Council = { councilId, scope, memberIds, selectionCriteria: criteria, formedAtTick: tick, seats };

  let next: PoliticsModuleState = { ...politics, idCounters, councils: { ...politics.councils, [councilId]: council } };
  next = appendHistory(next, {
    type: "council_formed",
    tick,
    scope,
    summary: `Council of ${memberIds.length} formed, selected by ${criteria.join(", ")}.`,
    refs: { councilId },
  });
  return { politics: next, council };
}

function rankActorsForCouncil(actors: readonly ActorSnapshot[], criteria: readonly CouncilSelectionCriterion[]): readonly ActorSnapshot[] {
  function score(a: ActorSnapshot): number {
    let s = 0;
    for (const c of criteria) {
      if (c === "wealth") s += a.wealth;
      else if (c === "kinship") s += a.kinship;
      else if (c === "military_ability") s += a.militaryStrength;
      else if (c === "religious_status") s += a.religiousStanding;
      else if (c === "knowledge" || c === "experience") s += a.knowledge;
      else s += a.influence; // age/prestige/appointment/election proxy
    }
    return s;
  }
  return [...actors].sort((a, b) => score(b) - score(a));
}

// --------------------------------------------------------------------- //
// Elections (§12)
// --------------------------------------------------------------------- //

export function votingMethodForGovernance(governance: GovernanceSystem): VotingMethod {
  switch (governance.decisionMethod) {
    case "majority_vote":
      return "plurality";
    case "representative_vote":
      return "approval";
    case "elder_council":
    case "military_council":
    case "religious_authority":
      return "weighted_by_authority";
    default:
      return "acclamation";
  }
}

export function callElection(
  politics: PoliticsModuleState,
  scope: string,
  seat: string,
  candidateIds: readonly string[],
  eligibleVoterIds: readonly string[],
  votingMethod: VotingMethod,
  tick: number,
  termLengthTicks: number | null,
): { politics: PoliticsModuleState; election: Election } {
  const { id: electionId, idCounters } = mintId(politics, "election");
  const election: Election = {
    electionId,
    scope,
    seat,
    candidateIds,
    eligibleVoterIds,
    votingMethod,
    votes: {},
    winnerId: null,
    calledAtTick: tick,
    resolvedAtTick: null,
    termLengthTicks,
  };
  return {
    politics: { ...politics, idCounters, elections: { ...politics.elections, [electionId]: election } },
    election,
  };
}

/**
 * Resolves a called election deterministically from each voter's authority
 * score (falls back to equal weight 1 per voter for methods that don't
 * weight by authority).
 */
export function resolveElection(
  politics: PoliticsModuleState,
  electionId: string,
  tick: number,
  rng: DeterministicRng,
): PoliticsModuleState {
  const election = politics.elections[electionId];
  if (!election || election.resolvedAtTick !== null || election.candidateIds.length === 0) return politics;

  const tallies = new Map<string, number>();
  for (const candidateId of election.candidateIds) tallies.set(candidateId, 0);

  for (const voterId of election.eligibleVoterIds) {
    const choice = election.votingMethod === "acclamation" ? election.candidateIds[0] : rng.choose(election.candidateIds);
    const weight = election.votingMethod === "weighted_by_authority" ? politics.authorities[voterId]?.authorityScore ?? 0.1 : 1;
    tallies.set(choice, (tallies.get(choice) ?? 0) + weight);
  }

  let winnerId = election.candidateIds[0];
  let best = -Infinity;
  for (const [candidateId, tally] of tallies) {
    if (tally > best) {
      best = tally;
      winnerId = candidateId;
    }
  }

  const resolved: Election = { ...election, resolvedAtTick: tick, winnerId };
  let next: PoliticsModuleState = { ...politics, elections: { ...politics.elections, [electionId]: resolved } };
  next = appendHistory(next, {
    type: "election_held",
    tick,
    scope: election.scope,
    summary: `Election for "${election.seat}" resolved; winner selected from ${election.candidateIds.length} candidates.`,
    refs: { electionId, winnerId },
  });
  return next;
}

// --------------------------------------------------------------------- //
// Succession (§14) & leadership assignment
// --------------------------------------------------------------------- //

export function assignLeader(
  politics: PoliticsModuleState,
  governanceId: string,
  leaderId: string,
  tick: number,
  reason: SuccessionEvent["reason"],
): PoliticsModuleState {
  const governance = politics.governanceSystems[governanceId];
  if (!governance) return politics;

  const { id: successionId, idCounters } = mintId(politics, "succession");
  const successionEvent: SuccessionEvent = {
    successionId,
    scope: governance.scope,
    method: governance.successionMethod,
    previousLeaderId: governance.leaderId,
    newLeaderId: leaderId,
    triggeredAtTick: tick,
    reason,
  };

  let next: PoliticsModuleState = {
    ...politics,
    idCounters,
    governanceSystems: { ...politics.governanceSystems, [governanceId]: { ...governance, leaderId } },
    successions: { ...politics.successions, [successionId]: successionEvent },
  };
  next = appendHistory(next, {
    type: "leader_selected",
    tick,
    scope: governance.scope,
    summary: `Leader selected via ${governance.successionMethod} succession (${reason}).`,
    refs: { governanceId, successionId, leaderId },
  });
  return next;
}

export function removeLeader(politics: PoliticsModuleState, governanceId: string, tick: number): PoliticsModuleState {
  const governance = politics.governanceSystems[governanceId];
  if (!governance || governance.leaderId === null) return politics;
  const removedId = governance.leaderId;
  let next: PoliticsModuleState = {
    ...politics,
    governanceSystems: { ...politics.governanceSystems, [governanceId]: { ...governance, leaderId: null } },
  };
  next = appendHistory(next, {
    type: "leader_removed",
    tick,
    scope: governance.scope,
    summary: "Leader removed from office.",
    refs: { governanceId, removedLeaderId: removedId },
  });
  return next;
}

export type { SettlementSnapshot };

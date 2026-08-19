/**
 * Justice, dispute resolution, punishment, and rights/obligations
 * (brief §19–22). The same underlying offense can resolve very differently
 * across societies — resolutionMethod is derived from the scope's
 * governance maturity, never fixed.
 */

import type { DeterministicRng } from "../core/rng/deterministicRng";
import type {
  Dispute,
  DisputeResolutionMethod,
  GovernanceSystem,
  JusticeCase,
  Obligation,
  PoliticsModuleState,
  PunishmentKind,
  Right,
  SocialRule,
} from "./contracts";
import { appendHistory, mintId } from "./state";

// --------------------------------------------------------------------- //
// Dispute resolution method selection (§20)
// --------------------------------------------------------------------- //

/**
 * Picks a dispute-resolution method appropriate to how institutionally
 * developed the scope is. `governance` is null for scopes that haven't
 * formed a GovernanceSystem yet — such scopes can still resolve disputes
 * informally.
 */
export function chooseResolutionMethod(governance: GovernanceSystem | null, hasCourtInstitution: boolean): DisputeResolutionMethod {
  if (hasCourtInstitution) return "court";
  if (!governance) return "family_mediation";
  switch (governance.decisionMethod) {
    case "individual_ruler":
    case "hereditary_succession":
      return "ruler";
    case "elder_council":
      return governance.leaderId ? "elder_mediation" : "community_council";
    case "religious_authority":
      return "religious_authority";
    case "merchant_council":
    case "military_council":
    case "majority_vote":
    case "representative_vote":
      return "community_council";
    default:
      return "judge";
  }
}

export function raiseDispute(
  politics: PoliticsModuleState,
  scope: string,
  partyIds: readonly string[],
  concept: string,
  resolutionMethod: DisputeResolutionMethod,
  tick: number,
): { politics: PoliticsModuleState; dispute: Dispute } {
  const { id: disputeId, idCounters } = mintId(politics, "dispute");
  const dispute: Dispute = { disputeId, scope, partyIds, concept, raisedAtTick: tick, resolutionMethod, resolvedAtTick: null, outcome: null };
  return { politics: { ...politics, idCounters, disputes: { ...politics.disputes, [disputeId]: dispute } }, dispute };
}

export function resolveDispute(politics: PoliticsModuleState, disputeId: string, tick: number, rng: DeterministicRng): PoliticsModuleState {
  const dispute = politics.disputes[disputeId];
  if (!dispute || dispute.resolvedAtTick !== null) return politics;

  const outcomes = ["favor_first_party", "favor_second_party", "mutual_compromise"] as const;
  const outcome = dispute.partyIds.length >= 2 ? rng.choose(outcomes) : "mutual_compromise";
  const resolved: Dispute = { ...dispute, resolvedAtTick: tick, outcome };

  let next: PoliticsModuleState = { ...politics, disputes: { ...politics.disputes, [disputeId]: resolved } };
  next = appendHistory(next, {
    type: "dispute_resolved",
    tick,
    scope: dispute.scope,
    summary: `Dispute over "${dispute.concept}" resolved via ${dispute.resolutionMethod} (${outcome}).`,
    refs: { disputeId },
  });
  return next;
}

// --------------------------------------------------------------------- //
// Formal justice cases & punishment (§19, §21)
// --------------------------------------------------------------------- //

export function fileJusticeCase(
  politics: PoliticsModuleState,
  scope: string,
  complaintantId: string,
  accusedId: string,
  accusation: string,
  relatedRule: SocialRule | null,
  evidenceStrength: number,
  witnessIds: readonly string[],
  resolutionMethod: DisputeResolutionMethod,
  tick: number,
): { politics: PoliticsModuleState; justiceCase: JusticeCase } {
  const { id: caseId, idCounters } = mintId(politics, "justice-case");
  const justiceCase: JusticeCase = {
    caseId,
    scope,
    complaintantId,
    accusedId,
    accusation,
    relatedRuleId: relatedRule?.ruleId ?? null,
    evidenceStrength: clamp01(evidenceStrength),
    witnessIds,
    filedAtTick: tick,
    resolutionMethod,
    judgment: "pending",
    punishment: null,
    compensationOwed: null,
    appealOf: null,
    resolvedAtTick: null,
  };
  return { politics: { ...politics, idCounters, justiceCases: { ...politics.justiceCases, [caseId]: justiceCase } }, justiceCase };
}

/**
 * Judges a filed case: guilt is weighted by evidence strength plus witness
 * count (more witnesses raise confidence in either direction, decided by
 * the deterministic draw). Punishment is drawn from the related rule's
 * configured sanctions when one exists, otherwise a generic pool.
 */
export function judgeCase(
  politics: PoliticsModuleState,
  caseId: string,
  relatedRule: SocialRule | null,
  tick: number,
  rng: DeterministicRng,
): PoliticsModuleState {
  const justiceCase = politics.justiceCases[caseId];
  if (!justiceCase || justiceCase.judgment !== "pending") return politics;

  const confidence = clamp01(justiceCase.evidenceStrength + justiceCase.witnessIds.length * 0.05);
  const guilty = rng.boolean(confidence);
  const sanctionPool: readonly PunishmentKind[] = relatedRule && relatedRule.sanctions.length > 0 ? relatedRule.sanctions : ["warning", "fine", "compensation"];
  const punishment = guilty ? rng.choose(sanctionPool) : null;
  const compensationOwed = guilty && (punishment === "fine" || punishment === "compensation") ? rng.nextInt(1, 20) : null;

  const resolved: JusticeCase = {
    ...justiceCase,
    judgment: guilty ? "guilty" : "not_guilty",
    punishment,
    compensationOwed,
    resolvedAtTick: tick,
  };

  let next: PoliticsModuleState = { ...politics, justiceCases: { ...politics.justiceCases, [caseId]: resolved } };
  next = appendHistory(next, {
    type: "justice_case_resolved",
    tick,
    scope: justiceCase.scope,
    summary: `Case "${justiceCase.accusation}" resolved via ${justiceCase.resolutionMethod}: ${resolved.judgment}${punishment ? ` (${punishment})` : ""}.`,
    refs: { caseId },
  });
  return next;
}

export function fileAppeal(
  politics: PoliticsModuleState,
  originalCaseId: string,
  newResolutionMethod: DisputeResolutionMethod,
  tick: number,
): { politics: PoliticsModuleState; appealCase: JusticeCase } | null {
  const original = politics.justiceCases[originalCaseId];
  if (!original || original.judgment === "pending") return null;

  const { id: caseId, idCounters } = mintId(politics, "justice-case");
  const appealCase: JusticeCase = {
    ...original,
    caseId,
    resolutionMethod: newResolutionMethod,
    judgment: "pending",
    punishment: null,
    compensationOwed: null,
    appealOf: originalCaseId,
    filedAtTick: tick,
    resolvedAtTick: null,
  };
  return { politics: { ...politics, idCounters, justiceCases: { ...politics.justiceCases, [caseId]: appealCase } }, appealCase };
}

// --------------------------------------------------------------------- //
// Rights & obligations (§22)
// --------------------------------------------------------------------- //

export function grantRight(politics: PoliticsModuleState, scope: string, holderClass: string, concept: string, tick: number, derivedFromRuleId: string | null): PoliticsModuleState {
  const { id: rightId, idCounters } = mintId(politics, "right");
  const right: Right = { rightId, scope, holderClass, concept, grantedAtTick: tick, derivedFromRuleId };
  return { ...politics, idCounters, rights: { ...politics.rights, [rightId]: right } };
}

export function imposeObligation(politics: PoliticsModuleState, scope: string, bearerClass: string, concept: string, tick: number, derivedFromRuleId: string | null): PoliticsModuleState {
  const { id: obligationId, idCounters } = mintId(politics, "obligation");
  const obligation: Obligation = { obligationId, scope, bearerClass, concept, grantedAtTick: tick, derivedFromRuleId };
  return { ...politics, idCounters, obligations: { ...politics.obligations, [obligationId]: obligation } };
}

/** Derives a baseline right+obligation pair from a newly-formalized rule (a formal rule implies both a permission for some and a duty for others). Purely mechanical, not a judgment call about the rule's content. */
export function deriveRightsAndObligationsFromRule(politics: PoliticsModuleState, rule: SocialRule, tick: number): PoliticsModuleState {
  let next = politics;
  if (rule.permissions.length > 0) {
    next = grantRight(next, rule.scope, "all_members", `permission:${rule.concept}`, tick, rule.ruleId);
  }
  if (rule.requiredActions.length > 0 || rule.prohibitedActions.length > 0) {
    next = imposeObligation(next, rule.scope, "all_members", `comply:${rule.concept}`, tick, rule.ruleId);
  }
  return next;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

import { DeterministicRng } from "../../core/rng/deterministicRng";
import { CreatureState } from "../state/creatureState";
import { Goal, DEFAULT_GOAL_LIBRARY, BuiltinGoalId } from "../goals/goals";
import { Perception } from "../perception/perception";
import { ActionId, ActionProposal, createActionProposal } from "../actions/actions";
import { EcologyProvider } from "../integration/ecologyAdapter";
import { NeedKey } from "../state/needs";

/**
 * A CandidateAction is an (action, goal) pair the utility system will
 * score. Building candidates from perception + needs — rather than a fixed
 * if/else priority chain — is what lets behavior emerge (§3, §11).
 */
export interface CandidateAction {
  readonly actionId: ActionId;
  readonly goalId: string;
  readonly relatedNeed: NeedKey | null;
  readonly targetId?: string;
  readonly targetPosition?: { x: number; y: number };
  readonly distance: number; // 0 if no specific target (e.g. sleep in place)
  readonly riskHint: number; // [0, 1] rough risk estimate before personality/memory modifiers
  readonly energyCostHint: number; // [0, 1]
  readonly expectedRewardHint: number; // [0, 1]
}

export interface UtilityScoreBreakdown {
  readonly needPressure: number;
  readonly goalRelevance: number;
  readonly expectedReward: number;
  readonly risk: number;
  readonly energyCost: number;
  readonly memoryModifier: number;
  readonly personalityModifier: number;
  readonly total: number;
}

/**
 * Builds the candidate action set for a creature from its current
 * perception and needs. This is intentionally exhaustive-ish and generic:
 * it does NOT hardcode "if hungry then eat" priority — every relevant
 * candidate is generated and scoring (below) decides what wins.
 */
export function generateCandidateActions(
  state: CreatureState,
  perception: Perception,
  ecology: EcologyProvider,
  regionId: string,
): CandidateAction[] {
  const candidates: CandidateAction[] = [];
  const pos = state.position;
  const dist = (p: { x: number; y: number }) => Math.hypot(p.x - pos.x, p.y - pos.y);

  // Threat-driven candidates (escape / hide / defend / attack).
  for (const threat of perception.threats) {
    const d = dist(threat.position);
    candidates.push({
      actionId: "flee",
      goalId: "escape",
      relatedNeed: "safety",
      targetId: threat.id,
      targetPosition: threat.position,
      distance: d,
      riskHint: 0.1,
      energyCostHint: 0.4,
      expectedRewardHint: 0.8,
    });
    candidates.push({
      actionId: "hide",
      goalId: "hide",
      relatedNeed: "safety",
      targetId: threat.id,
      distance: d,
      riskHint: 0.2,
      energyCostHint: 0.2,
      expectedRewardHint: 0.6,
    });
    candidates.push({
      actionId: "defend",
      goalId: "protect",
      relatedNeed: "safety",
      targetId: threat.id,
      targetPosition: threat.position,
      distance: d,
      riskHint: 0.7,
      energyCostHint: 0.6,
      expectedRewardHint: 0.5,
    });
  }

  // Food-driven candidates.
  for (const food of perception.potentialFood) {
    const d = dist(food.position);
    candidates.push({
      actionId: "eat",
      goalId: "eat",
      relatedNeed: "hunger",
      targetId: food.id,
      targetPosition: food.position,
      distance: d,
      riskHint: 0.1,
      energyCostHint: Math.min(1, d / 50),
      expectedRewardHint: 0.7,
    });
  }
  const foodAvailability = ecology.getFoodAvailability(regionId);
  candidates.push({
    actionId: "observe",
    goalId: "explore",
    relatedNeed: "curiosity",
    distance: 0,
    riskHint: 0.05,
    energyCostHint: 0.1,
    expectedRewardHint: 0.2 + (1 - foodAvailability) * 0.2,
  });

  // Resource-driven candidates (water assumed among nearbyResources tagged appropriately by caller).
  for (const resource of perception.nearbyResources) {
    const d = dist(resource.position);
    candidates.push({
      actionId: "drink",
      goalId: "drink",
      relatedNeed: "thirst",
      targetId: resource.id,
      targetPosition: resource.position,
      distance: d,
      riskHint: 0.1,
      energyCostHint: Math.min(1, d / 50),
      expectedRewardHint: 0.6,
    });
  }

  // Rest / sleep are always-available candidates (no target needed).
  candidates.push({
    actionId: "rest",
    goalId: "rest",
    relatedNeed: "sleep",
    distance: 0,
    riskHint: perception.threats.length > 0 ? 0.5 : 0.05,
    energyCostHint: 0,
    expectedRewardHint: 0.4,
  });
  candidates.push({
    actionId: "sleep",
    goalId: "sleep",
    relatedNeed: "sleep",
    distance: 0,
    riskHint: perception.threats.length > 0 ? 0.7 : 0.1,
    energyCostHint: 0,
    expectedRewardHint: 0.6,
  });

  // Social candidates.
  for (const social of perception.socialEntities) {
    const d = dist(social.position);
    candidates.push({
      actionId: "approach",
      goalId: "socialize",
      relatedNeed: "social",
      targetId: social.id,
      targetPosition: social.position,
      distance: d,
      riskHint: 0.15,
      energyCostHint: Math.min(1, d / 50),
      expectedRewardHint: 0.4,
    });
  }

  // Exploration is always available as a low-stakes candidate.
  candidates.push({
    actionId: "move",
    goalId: "explore",
    relatedNeed: "curiosity",
    distance: 10,
    riskHint: 0.1,
    energyCostHint: 0.3,
    expectedRewardHint: 0.3,
  });

  // Mate-seeking candidates (§23 — Team 06 only proposes; Team 04/biology decides validity).
  if (state.needs.reproduction > 40) {
    for (const social of perception.socialEntities) {
      if (social.speciesId !== state.speciesId) continue;
      const d = dist(social.position);
      candidates.push({
        actionId: "mate",
        goalId: "reproduce",
        relatedNeed: "reproduction",
        targetId: social.id,
        targetPosition: social.position,
        distance: d,
        riskHint: 0.2,
        energyCostHint: Math.min(1, d / 50),
        expectedRewardHint: 0.5,
      });
    }
  }

  return candidates;
}

function needPressureFor(state: CreatureState, need: NeedKey | null): number {
  if (!need) return 0.2; // goals unrelated to a tracked need get a small flat baseline
  return state.needs[need] / 100;
}

function memoryModifierFor(state: CreatureState, candidate: CandidateAction): number {
  if (!candidate.targetId) return 0;
  let modifier = 0;
  for (const memory of state.memory) {
    if (memory.subject !== candidate.targetId) continue;
    if (memory.type === "danger") modifier -= memory.importance * Math.max(0, -memory.emotionalWeight);
    if (memory.type === "foodSource") modifier += memory.importance * Math.max(0, memory.emotionalWeight);
  }
  return Math.max(-1, Math.min(1, modifier));
}

function personalityModifierFor(state: CreatureState, candidate: CandidateAction): number {
  const p = state.personality;
  switch (candidate.actionId) {
    case "flee":
      return -(p.boldness - p.caution) * 0.2;
    case "hide":
      return p.caution * 0.2;
    case "defend":
    case "attack":
      return (p.aggression - p.caution) * 0.25;
    case "approach":
      return p.sociability * 0.2 - p.independence * 0.1;
    case "move":
      return p.curiosity * 0.2;
    default:
      return 0;
  }
}

/**
 * Scores a single candidate action (§11):
 *
 *   score = needPressure + goalRelevance + expectedReward
 *           - risk - energyCost
 *           + memoryModifier + personalityModifier
 *
 * Every term is bounded so no single factor can dominate arbitrarily,
 * keeping scores comparable across very different candidate types.
 */
export function scoreCandidateAction(state: CreatureState, candidate: CandidateAction): UtilityScoreBreakdown {
  const goal = DEFAULT_GOAL_LIBRARY[candidate.goalId as BuiltinGoalId];
  const goalRelevance = goal ? goal.basePriority : 0.2;

  const needPressure = needPressureFor(state, candidate.relatedNeed);
  const risk = candidate.riskHint * (1 - state.personality.riskTolerance * 0.5);
  const energyCost = candidate.energyCostHint * (state.fatigue / 100 + 0.3);
  const memoryModifier = memoryModifierFor(state, candidate);
  const personalityModifier = personalityModifierFor(state, candidate);

  const total =
    needPressure + goalRelevance + candidate.expectedRewardHint - risk - energyCost + memoryModifier + personalityModifier;

  return {
    needPressure,
    goalRelevance,
    expectedReward: candidate.expectedRewardHint,
    risk,
    energyCost,
    memoryModifier,
    personalityModifier,
    total,
  };
}

export interface DecisionResult {
  readonly proposal: ActionProposal;
  readonly goal: Goal;
  readonly breakdown: UtilityScoreBreakdown;
}

/**
 * Selects the best-scoring candidate action deterministically. Ties are
 * broken via the creature's own deterministic RNG stream (never Math.random,
 * never a shared/global stream — see RNG isolation, §26) so that identical
 * inputs always produce identical decisions.
 */
export function selectBestAction(
  state: CreatureState,
  candidates: readonly CandidateAction[],
  tick: number,
  rng: DeterministicRng,
): DecisionResult | null {
  if (candidates.length === 0) return null;

  let best: { candidate: CandidateAction; breakdown: UtilityScoreBreakdown }[] = [];
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const breakdown = scoreCandidateAction(state, candidate);
    if (breakdown.total > bestScore + 1e-9) {
      bestScore = breakdown.total;
      best = [{ candidate, breakdown }];
    } else if (Math.abs(breakdown.total - bestScore) <= 1e-9) {
      best.push({ candidate, breakdown });
    }
  }

  const chosen = best.length === 1 ? best[0] : rng.choose(best);
  const goal = DEFAULT_GOAL_LIBRARY[chosen.candidate.goalId as BuiltinGoalId] ?? {
    goalId: chosen.candidate.goalId,
    relatedNeed: chosen.candidate.relatedNeed,
    basePriority: 0.2,
  };

  const proposal = createActionProposal({
    creatureId: state.creatureId,
    actionId: chosen.candidate.actionId,
    goalId: chosen.candidate.goalId,
    score: chosen.breakdown.total,
    tick,
    targetId: chosen.candidate.targetId,
    targetPosition: chosen.candidate.targetPosition,
  });

  return { proposal, goal, breakdown: chosen.breakdown };
}

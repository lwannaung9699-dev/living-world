import { Vector2 } from "../perception/perception";

/** Data-driven action type id — not a closed enum (mirrors Goal, §9-10). */
export type ActionId =
  | "move"
  | "eat"
  | "drink"
  | "sleep"
  | "rest"
  | "flee"
  | "hide"
  | "approach"
  | "follow"
  | "observe"
  | "attack"
  | "defend"
  | "communicate"
  | "mate"
  | "gather"
  | "investigate"
  | (string & {});

/**
 * ActionProposal — what Team 06 produces. The world/simulation kernel (a
 * later integration layer, not Team 06) decides whether the proposal is
 * valid given full world rules, and applies consequences (§10, §25).
 */
export interface ActionProposal {
  readonly creatureId: string;
  readonly actionId: ActionId;
  readonly goalId: string;
  readonly targetId?: string;
  readonly targetPosition?: Vector2;
  readonly score: number;
  readonly tick: number;
}

/**
 * ActionResult — the outcome of a previously-applied proposal, as reported
 * back by the world/simulation kernel. Team 06 consumes this to update
 * memory/emotion/relationships (learning, §14) but never mutates world
 * resources or other creatures directly.
 */
export interface ActionResult {
  readonly creatureId: string;
  readonly actionId: ActionId;
  readonly succeeded: boolean;
  readonly tick: number;
  readonly targetId?: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

export function createActionProposal(input: {
  creatureId: string;
  actionId: ActionId;
  goalId: string;
  score: number;
  tick: number;
  targetId?: string;
  targetPosition?: Vector2;
}): ActionProposal {
  return {
    creatureId: input.creatureId,
    actionId: input.actionId,
    goalId: input.goalId,
    targetId: input.targetId,
    targetPosition: input.targetPosition,
    score: input.score,
    tick: input.tick,
  };
}

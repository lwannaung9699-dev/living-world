import { Vector2 } from "../perception/perception";

export type MovementReason = "seekFood" | "seekWater" | "flee" | "explore" | "socialize" | "returnHome" | (string & {});

/**
 * MovementIntent — Team 06's output for "I want to go here, this urgently,
 * for this reason" (§24). Team 06 does NOT implement pathfinding; a future
 * movement/physics system consumes this and resolves the actual path.
 */
export interface MovementIntent {
  readonly creatureId: string;
  readonly destination: Vector2;
  readonly urgency: number; // [0, 1]
  readonly reason: MovementReason;
  readonly desiredSpeed: number; // arbitrary units/tick, species-scaled by caller
  readonly avoidancePreference: "none" | "avoidThreats" | "avoidCreatures" | "preferCover";
}

export function createMovementIntent(input: {
  creatureId: string;
  destination: Vector2;
  urgency: number;
  reason: MovementReason;
  desiredSpeed: number;
  avoidancePreference?: MovementIntent["avoidancePreference"];
}): MovementIntent {
  return {
    creatureId: input.creatureId,
    destination: input.destination,
    urgency: Math.min(1, Math.max(0, input.urgency)),
    reason: input.reason,
    desiredSpeed: input.desiredSpeed,
    avoidancePreference: input.avoidancePreference ?? "none",
  };
}

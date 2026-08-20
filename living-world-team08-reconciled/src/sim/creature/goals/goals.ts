/**
 * Goal — data-driven, NOT a closed enum (Team 06 §9). `id` is a plain
 * string so future teams/species/mods can register new goal ids without
 * touching this file. A small built-in library of common ids is provided
 * below for convenience, but nothing in the decision pipeline requires a
 * goal's id to be one of these.
 */
export interface Goal {
  readonly goalId: string;
  readonly relatedNeed: string | null;
  readonly basePriority: number; // baseline importance before need/context modifiers, [0, 1]
}

export const BUILTIN_GOAL_IDS = [
  "eat",
  "drink",
  "rest",
  "sleep",
  "escape",
  "explore",
  "follow",
  "hunt",
  "hide",
  "socialize",
  "protect",
  "reproduce",
  "migrate",
  "investigate",
] as const;

export type BuiltinGoalId = (typeof BUILTIN_GOAL_IDS)[number];

/** Data-driven goal definition table. Species/config data can extend or override this at runtime. */
export const DEFAULT_GOAL_LIBRARY: Readonly<Record<BuiltinGoalId, Goal>> = {
  eat: { goalId: "eat", relatedNeed: "hunger", basePriority: 0.5 },
  drink: { goalId: "drink", relatedNeed: "thirst", basePriority: 0.5 },
  rest: { goalId: "rest", relatedNeed: "sleep", basePriority: 0.3 },
  sleep: { goalId: "sleep", relatedNeed: "sleep", basePriority: 0.4 },
  escape: { goalId: "escape", relatedNeed: "safety", basePriority: 0.9 },
  explore: { goalId: "explore", relatedNeed: "curiosity", basePriority: 0.2 },
  follow: { goalId: "follow", relatedNeed: "social", basePriority: 0.2 },
  hunt: { goalId: "hunt", relatedNeed: "hunger", basePriority: 0.45 },
  hide: { goalId: "hide", relatedNeed: "safety", basePriority: 0.7 },
  socialize: { goalId: "socialize", relatedNeed: "social", basePriority: 0.25 },
  protect: { goalId: "protect", relatedNeed: "safety", basePriority: 0.6 },
  reproduce: { goalId: "reproduce", relatedNeed: "reproduction", basePriority: 0.35 },
  migrate: { goalId: "migrate", relatedNeed: null, basePriority: 0.15 },
  investigate: { goalId: "investigate", relatedNeed: "curiosity", basePriority: 0.2 },
};

import { MemoryEntry, createMemoryEntry, addMemory } from "../memory/memory";
import { ActionResult } from "../actions/actions";

/**
 * Deterministic, non-ML learning foundation (§14): outcomes of actions
 * create or reinforce memories with a signed `emotionalWeight`, which the
 * utility scorer's `memoryModifier` term (see decision/utilityAI.ts) later
 * reads back to make future visits to the same target more or less likely.
 * No gradient descent, no neural network — this is plain simulation logic.
 */
export function learnFromActionResult(
  memories: readonly MemoryEntry[],
  result: ActionResult,
  tick: number,
): readonly MemoryEntry[] {
  if (!result.targetId) return memories;

  if (result.actionId === "eat" && result.succeeded) {
    return addMemory(
      memories,
      createMemoryEntry({
        memoryId: `food:${result.targetId}:${tick}`,
        type: "foodSource",
        subject: result.targetId,
        importance: 0.6,
        emotionalWeight: 0.7,
        tick,
      }),
    );
  }

  if ((result.actionId === "flee" || result.actionId === "hide") && result.detail?.tookDamage) {
    return addMemory(
      memories,
      createMemoryEntry({
        memoryId: `danger:${result.targetId}:${tick}`,
        type: "danger",
        subject: result.targetId,
        importance: 0.85,
        emotionalWeight: -0.9,
        tick,
      }),
    );
  }

  if (result.actionId === "attack" && !result.succeeded) {
    return addMemory(
      memories,
      createMemoryEntry({
        memoryId: `danger:${result.targetId}:${tick}`,
        type: "danger",
        subject: result.targetId,
        importance: 0.7,
        emotionalWeight: -0.6,
        tick,
      }),
    );
  }

  return memories;
}

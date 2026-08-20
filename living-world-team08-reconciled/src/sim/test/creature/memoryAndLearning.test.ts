import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryEntry, decayMemories, recallMemoriesAbout } from "../../creature/memory/memory";
import { learnFromActionResult } from "../../creature/learning/learning";

test("memory creation: a created memory entry is retrievable by subject", () => {
  const memory = createMemoryEntry({
    memoryId: "m1",
    type: "foodSource",
    subject: "berries-1",
    importance: 0.5,
    emotionalWeight: 0.6,
    tick: 10,
  });
  const found = recallMemoriesAbout([memory], { subject: "berries-1" });
  assert.equal(found.length, 1);
  assert.equal(found[0].memoryId, "m1");
});

test("memory decay: importance shrinks each tick and low-importance memories are eventually forgotten", () => {
  let memories = [
    createMemoryEntry({
      memoryId: "fading",
      type: "event",
      subject: "x",
      importance: 0.05,
      emotionalWeight: 0,
      tick: 0,
      decayRate: 0.5,
    }),
  ];
  assert.equal(memories.length, 1);
  for (let i = 0; i < 10; i++) memories = decayMemories(memories);
  assert.equal(memories.length, 0, "low-importance, high-decay-rate memory should eventually be forgotten");
});

test("memory decay: important memories persist far longer than mundane ones", () => {
  // Explicit decayRate overrides (rather than the default importance-derived
  // formula) so the crossover point is exact and the test isn't sensitive to
  // tuning of defaultDecayRateFor.
  const important = createMemoryEntry({
    memoryId: "important",
    type: "danger",
    subject: "predator-1",
    importance: 0.95,
    emotionalWeight: -0.9,
    tick: 0,
    decayRate: 0.001,
  });
  const mundane = createMemoryEntry({
    memoryId: "mundane",
    type: "event",
    subject: "leaf",
    importance: 0.1,
    emotionalWeight: 0,
    tick: 0,
    decayRate: 0.3,
  });
  let memories = [important, mundane];
  for (let i = 0; i < 30; i++) memories = decayMemories(memories);
  const ids = memories.map((m) => m.memoryId);
  assert.ok(ids.includes("important"), "important, slow-decaying memory should still be retained after 30 ticks");
  assert.ok(!ids.includes("mundane"), "mundane, fast-decaying memory should have decayed away by 30 ticks");
});

test("danger learning: a harmful outcome near a target creates a negative danger memory", () => {
  const memories = learnFromActionResult(
    [],
    { creatureId: "c1", actionId: "flee", succeeded: true, tick: 3, targetId: "predator-1", detail: { tookDamage: true } },
    3,
  );
  assert.equal(memories.length, 1);
  assert.equal(memories[0].type, "danger");
  assert.ok(memories[0].emotionalWeight < 0);
});

test("food-source learning: successfully eating creates a positive food-source memory", () => {
  const memories = learnFromActionResult(
    [],
    { creatureId: "c1", actionId: "eat", succeeded: true, tick: 4, targetId: "berries-1" },
    4,
  );
  assert.equal(memories.length, 1);
  assert.equal(memories[0].type, "foodSource");
  assert.ok(memories[0].emotionalWeight > 0);
});

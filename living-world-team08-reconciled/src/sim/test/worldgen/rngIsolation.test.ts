import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorldSeed, createInitialWorldState, RngStreamRegistry, worldSeedToRngRoot } from "../../index";
import { generateWorldGenesis } from "../../worldgen";

test("Test 3: worldgen RNG streams are isolated from each other and from Team 01 namespaces", () => {
  const seed = createWorldSeed({ seed: "rng-isolation" });
  const base = createInitialWorldState(seed);

  // Consume an unrelated Team 01-style namespace BEFORE running World Genesis.
  const rngRoot = worldSeedToRngRoot(seed);
  const registry = RngStreamRegistry.fromState(rngRoot, base.rng);
  const unrelatedStream = registry.fork("some-future-team/npc-decisions");
  const unrelatedDrawsBefore = [unrelatedStream.nextFloat(), unrelatedStream.nextFloat(), unrelatedStream.nextFloat()];
  const stateWithUnrelatedDraws = { ...base, rng: registry.serialize() };

  const worldWithPriorDraws = generateWorldGenesis(stateWithUnrelatedDraws);
  const worldWithoutPriorDraws = generateWorldGenesis(base);

  // Drawing from an unrelated namespace first must not change any worldgen module's output.
  assert.deepEqual(worldWithPriorDraws.modules.planetary, worldWithoutPriorDraws.modules.planetary);
  assert.deepEqual(worldWithPriorDraws.modules.geology, worldWithoutPriorDraws.modules.geology);
  assert.deepEqual(worldWithPriorDraws.modules.climate, worldWithoutPriorDraws.modules.climate);

  // And the unrelated stream's own sequence must be exactly reproducible, untouched by worldgen forking ten of its own streams afterward.
  const registryAfter = RngStreamRegistry.fromState(rngRoot, worldWithPriorDraws.rng);
  const unrelatedStreamAfter = registryAfter.fork("some-future-team/npc-decisions");
  const unrelatedDrawsAfter = [unrelatedStreamAfter.nextFloat(), unrelatedStreamAfter.nextFloat(), unrelatedStreamAfter.nextFloat()];

  // Re-derive what those next three draws *should* be by continuing the original stream.
  const expectedContinuation = [unrelatedStream.nextFloat(), unrelatedStream.nextFloat(), unrelatedStream.nextFloat()];
  assert.deepEqual(unrelatedDrawsAfter, expectedContinuation);
  assert.notDeepEqual(unrelatedDrawsAfter, unrelatedDrawsBefore);
});

test("Test 3b: each worldgen subsystem stream is independently derived (order of forking doesn't matter)", () => {
  const seed = createWorldSeed({ seed: "rng-isolation-order" });
  const rngRoot = worldSeedToRngRoot(seed);

  const freshRegistryReverse = RngStreamRegistry.create(rngRoot);
  const habitatsFirst = freshRegistryReverse.fork("worldgen/habitats@0.1.0").getState();
  const planetaryLast = freshRegistryReverse.fork("worldgen/planetary@0.1.0").getState();

  const freshRegistryForward = RngStreamRegistry.create(rngRoot);
  const planetaryFirst = freshRegistryForward.fork("worldgen/planetary@0.1.0").getState();
  const habitatsLast = freshRegistryForward.fork("worldgen/habitats@0.1.0").getState();

  assert.deepEqual(planetaryFirst, planetaryLast, "planetary stream's initial state must not depend on fork order");
  assert.deepEqual(habitatsFirst, habitatsLast, "habitats stream's initial state must not depend on fork order");
});

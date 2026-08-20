import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorldSeed, serializeWorldState, deserializeWorldState, computeStateHash, validateWorldState } from "../../index";
import { createGenesisWorldState, generateChunk } from "../../worldgen";

test("Test 10: a genesis-populated WorldState serializes and deserializes without loss", () => {
  const seed = createWorldSeed({ seed: "worldgen-serialization" });
  const world = createGenesisWorldState(seed);

  const json = serializeWorldState(world);
  const restored = deserializeWorldState(json);

  assert.doesNotThrow(() => validateWorldState(restored));
  assert.deepEqual(restored.modules, world.modules);
  assert.equal(computeStateHash(restored), computeStateHash(world));

  // Chunk generation from the restored state must match chunk generation
  // from the original state exactly — proving the round trip preserved
  // everything World Genesis actually depends on (seed, rng, modules).
  const originalChunk = generateChunk(world, { cx: 1, cy: 1 });
  const restoredChunk = generateChunk(restored, { cx: 1, cy: 1 });
  assert.deepEqual(originalChunk, restoredChunk);
});

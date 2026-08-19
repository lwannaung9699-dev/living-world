import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorldSeed, computeStateHash } from "../../index";
import { createGenesisWorldState, generateChunk, WORLD_GENERATION_VERSION } from "../../worldgen";

test("Test 1: same seed produces an identical world (full state hash)", () => {
  const seedA1 = createWorldSeed({ seed: "genesis-alpha", createdAt: "2024-01-01T00:00:00.000Z" });
  const seedA2 = createWorldSeed({ seed: "genesis-alpha", createdAt: "2024-01-01T00:00:00.000Z" });

  const worldA1 = createGenesisWorldState(seedA1);
  const worldA2 = createGenesisWorldState(seedA2);

  assert.equal(computeStateHash(worldA1), computeStateHash(worldA2));
  assert.deepEqual(worldA1.modules.planetary, worldA2.modules.planetary);
  assert.deepEqual(worldA1.modules.geology, worldA2.modules.geology);

  const chunkA1 = generateChunk(worldA1, { cx: 3, cy: -2 });
  const chunkA2 = generateChunk(worldA2, { cx: 3, cy: -2 });
  assert.deepEqual(chunkA1, chunkA2);
});

test("Test 2: a different seed produces a meaningfully different world", () => {
  const seedA = createWorldSeed({ seed: "genesis-alpha" });
  const seedB = createWorldSeed({ seed: "genesis-bravo" });

  const worldA = createGenesisWorldState(seedA);
  const worldB = createGenesisWorldState(seedB);

  assert.notEqual(computeStateHash(worldA), computeStateHash(worldB));

  const chunkA = generateChunk(worldA, { cx: 0, cy: 0 });
  const chunkB = generateChunk(worldB, { cx: 0, cy: 0 });

  let differingCells = 0;
  for (let y = 0; y < chunkA.chunkSize; y++) {
    for (let x = 0; x < chunkA.chunkSize; x++) {
      if (chunkA.cells[y][x].elevation01 !== chunkB.cells[y][x].elevation01) differingCells++;
    }
  }
  assert.ok(differingCells > chunkA.chunkSize * chunkA.chunkSize * 0.5, "expected most cells to differ between seeds");
});

test("Test 11: world hash determinism holds across independent generation runs", () => {
  const seed = createWorldSeed({ seed: "hash-determinism-check" });
  const hashes = new Set<string>();
  for (let i = 0; i < 3; i++) {
    hashes.add(computeStateHash(createGenesisWorldState(seed)));
  }
  assert.equal(hashes.size, 1, "regenerating from the same seed must always produce the same state hash");
});

test("Test 12: generation version is tracked on every module and folded into the RNG root", () => {
  const seed = createWorldSeed({ seed: "version-tracking" });
  const world = createGenesisWorldState(seed);

  for (const key of ["planetary", "geology", "geography", "hydrology", "climate", "weather", "soil", "resources", "biomes", "habitats"] as const) {
    const module = world.modules[key] as { version: string };
    assert.equal(module.version, WORLD_GENERATION_VERSION);
  }

  const chunk = generateChunk(world, { cx: 0, cy: 0 });
  assert.equal(chunk.version, WORLD_GENERATION_VERSION);
});

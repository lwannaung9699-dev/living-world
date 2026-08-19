import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorldSeed } from "../../index";
import { createGenesisWorldState, generateChunk } from "../../worldgen";

test("Test 4: generating the same chunk twice is byte-identical", () => {
  const world = createGenesisWorldState(createWorldSeed({ seed: "chunk-determinism" }));

  const chunk1 = generateChunk(world, { cx: 5, cy: 7 });
  const chunk2 = generateChunk(world, { cx: 5, cy: 7 });

  assert.deepEqual(chunk1, chunk2);
  assert.equal(JSON.stringify(chunk1), JSON.stringify(chunk2));
});

test("Test 5: chunk generation order does not affect any individual chunk's contents", () => {
  const world = createGenesisWorldState(createWorldSeed({ seed: "chunk-order-independence" }));

  const coords = [
    { cx: 0, cy: 0 },
    { cx: 1, cy: 0 },
    { cx: 0, cy: 1 },
    { cx: -2, cy: 3 },
  ];

  const orderA = coords.map((c) => generateChunk(world, c));

  const shuffledCoords = [coords[3], coords[0], coords[2], coords[1]];
  const orderBShuffled = shuffledCoords.map((c) => generateChunk(world, c));
  const orderB = coords.map((c) => orderBShuffled.find((chunk) => chunk.coord.cx === c.cx && chunk.coord.cy === c.cy)!);

  for (let i = 0; i < coords.length; i++) {
    assert.deepEqual(orderA[i], orderB[i], `chunk (${coords[i].cx},${coords[i].cy}) differed based on generation order`);
  }
});

test("Test 5b: a chunk generated in isolation matches the same chunk generated alongside many neighbors", () => {
  const world = createGenesisWorldState(createWorldSeed({ seed: "chunk-isolation" }));
  const target = { cx: 10, cy: -4 };

  const isolatedChunk = generateChunk(world, target);

  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      generateChunk(world, { cx: target.cx + dx, cy: target.cy + dy });
    }
  }
  const chunkAfterNeighbors = generateChunk(world, target);

  assert.deepEqual(isolatedChunk, chunkAfterNeighbors);
});

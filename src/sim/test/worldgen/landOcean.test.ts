import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorldSeed } from "../../index";
import { createGenesisWorldState, generateChunk } from "../../worldgen";

test("Test 6: land/ocean classification is consistent with elevation and sea level", () => {
  const seed = createWorldSeed({ seed: "land-ocean-consistency" });
  const world = createGenesisWorldState(seed);
  const seaLevel = (world.modules.geography as { seaLevel: number }).seaLevel;

  let oceanCells = 0;
  let landCells = 0;

  for (let cy = 0; cy < 4; cy++) {
    for (let cx = 0; cx < 4; cx++) {
    const chunk = generateChunk(world, { cx, cy });
    for (const row of chunk.cells) {
      for (const cell of row) {
        if (cell.landform === "ocean") {
          assert.ok(cell.elevation01 < seaLevel, "ocean cell must be below sea level");
          assert.equal(cell.biomeId, "ocean");
          assert.equal(cell.waterAvailability01, 1);
          oceanCells++;
        } else {
          assert.ok(cell.elevation01 >= seaLevel, "non-ocean cell must be at/above sea level");
          assert.notEqual(cell.biomeId, "ocean", "a land cell must never be classified with the ocean biome");
          landCells++;
        }
      }
    }
    }
  }

  assert.ok(oceanCells > 0, "expected at least some ocean cells across the sampled chunks");
  assert.ok(landCells > 0, "expected at least some land cells across the sampled chunks");
});

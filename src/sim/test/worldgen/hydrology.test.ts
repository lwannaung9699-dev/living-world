import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorldSeed } from "../../index";
import { createGenesisWorldState, generateChunk } from "../../worldgen";

test("Test 7: rivers only occupy land above sea level, and river/lake are mutually exclusive", () => {
  const seed = createWorldSeed({ seed: "river-flow-constraints" });
  const world = createGenesisWorldState(seed);
  const seaLevel = (world.modules.geography as { seaLevel: number }).seaLevel;

  let riverCells = 0;
  let lakeCells = 0;

  for (let cy = 0; cy < 5; cy++) {
    for (let cx = 0; cx < 5; cx++) {
      const chunk = generateChunk(world, { cx, cy });
      for (const row of chunk.cells) {
        for (const cell of row) {
          if (cell.isRiver) {
            riverCells++;
            assert.ok(cell.elevation01 >= seaLevel, "river cell must be on land, at/above sea level");
            assert.ok(!cell.isLake, "a cell must not be classified as both river and lake");
            assert.ok(cell.waterAvailability01 >= 0.5, "river cells should read as high water availability");
          }
          if (cell.isLake) {
            lakeCells++;
            assert.ok(cell.elevation01 >= seaLevel, "lake cell must be on land, at/above sea level");
            assert.equal(cell.waterAvailability01, 1, "lake cells must read as full water availability");
          }
        }
      }
    }
  }

  assert.ok(riverCells > 0, "expected at least some river cells across the sampled region");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorldSeed } from "../../index";
import { createGenesisWorldState, generateChunk } from "../../worldgen";

test("Test 8: biome classification respects the environmental hard constraints it claims to follow", () => {
  const seed = createWorldSeed({ seed: "biome-environment-consistency" });
  const world = createGenesisWorldState(seed);

  const biomeIdsSeen = new Set<string>();
  let coldCellCount = 0;
  let hotDryCellCount = 0;

  for (let cy = 0; cy < 6; cy++) {
    for (let cx = 0; cx < 6; cx++) {
      const chunk = generateChunk(world, { cx, cy });
      for (const row of chunk.cells) {
        for (const cell of row) {
          biomeIdsSeen.add(cell.biomeId);

          // Ocean biome <=> ocean landform, exactly (already covered in landOcean.test.ts;
          // re-asserted here because biome classification is a separate code path).
          if (cell.landform === "ocean") {
            assert.equal(cell.biomeId, "ocean");
          } else {
            assert.notEqual(cell.biomeId, "ocean");
          }

          // Tundra/ice sheet cells should never be classified in genuinely hot conditions.
          if (cell.biomeId === "tundra" || cell.biomeId === "iceSheet") {
            coldCellCount++;
            assert.ok(cell.climate.meanTemperatureC < 10, `${cell.biomeId} cell had implausibly warm mean temperature ${cell.climate.meanTemperatureC}`);
          }

          // Desert cells should never be classified in genuinely wet conditions.
          if (cell.biomeId === "desert") {
            hotDryCellCount++;
            assert.ok(cell.climate.annualPrecipitationMm < 700, `desert cell had implausibly high precipitation ${cell.climate.annualPrecipitationMm}mm`);
          }

          // Tropical rainforest should never be classified somewhere cold.
          if (cell.biomeId === "tropicalRainforest") {
            assert.ok(cell.climate.meanTemperatureC > 10, "tropical rainforest cell had implausibly cold mean temperature");
          }
        }
      }
    }
  }

  assert.ok(biomeIdsSeen.size >= 3, "expected reasonable biome diversity across a 6x6 chunk region");
});

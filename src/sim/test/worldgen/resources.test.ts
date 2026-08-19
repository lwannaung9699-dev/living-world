import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorldSeed } from "../../index";
import { createGenesisWorldState, generateChunk } from "../../worldgen";

test("Test 9: resources never appear in the ocean and correlate with the geology that should produce them", () => {
  const seed = createWorldSeed({ seed: "resource-geology-consistency" });
  const world = createGenesisWorldState(seed);

  let rareMineralsOnHighActivity = 0;
  let rareMineralsTotal = 0;
  let totalDeposits = 0;

  for (let cy = 0; cy < 6; cy++) {
    for (let cx = 0; cx < 6; cx++) {
      const chunk = generateChunk(world, { cx, cy });
      for (const row of chunk.cells) {
        for (const cell of row) {
          if (cell.landform === "ocean") {
            assert.equal(cell.resources.length, 0, "ocean cells must never carry resource deposits");
            continue;
          }
          for (const deposit of cell.resources) {
            totalDeposits++;
            assert.ok(deposit.density01 >= 0 && deposit.density01 <= 1);
            assert.ok(["shallow", "moderate", "deep"].includes(deposit.depthBand));

            if (deposit.resourceId === "rareMinerals") {
              rareMineralsTotal++;
              // rareMinerals has a strong activityAffinity — it should show up
              // disproportionately on cells whose habitat data implies richer
              // geology (we approximate "high activity" via resource density,
              // since activity itself isn't exposed on CellData directly).
              if (deposit.density01 > 0.45) rareMineralsOnHighActivity++;
            }
          }
        }
      }
    }
  }

  assert.ok(totalDeposits > 0, "expected at least some resource deposits across the sampled region");
  if (rareMineralsTotal > 0) {
    assert.ok(
      rareMineralsOnHighActivity / rareMineralsTotal > 0.3,
      "expected a meaningful share of rareMinerals deposits to correlate with higher geological activity/density",
    );
  }
});

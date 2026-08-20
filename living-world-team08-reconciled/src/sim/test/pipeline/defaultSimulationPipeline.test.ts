import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultSimulationPipeline,
  createInitialWorldState,
  createWorldSeed,
  computeStateHash,
  tickN,
} from "../../index";

test("createDefaultSimulationPipeline attaches all implemented Team 04–08 module slices", () => {
  const seed = createWorldSeed({ seed: "default-pipeline-modules" });
  const result = tickN(createInitialWorldState(seed), 3, createDefaultSimulationPipeline());

  assert.equal(result.tick, 3);
  assert.ok(result.modules.biology, "Team 04 biology module should be attached");
  assert.ok(result.modules.ecology, "Team 05 ecology module should be attached");
  assert.ok(result.modules.creature, "Team 06 creature module should be attached");
  assert.ok(result.modules.society, "Team 07 society module should be attached");
  assert.ok(result.modules.politics, "Team 08 politics module should be attached");
});

test("createDefaultSimulationPipeline is deterministic for the same seed and configuration", () => {
  const seedA = createWorldSeed({ seed: "default-pipeline-determinism" });
  const seedB = createWorldSeed({ seed: "default-pipeline-determinism" });
  const resultA = tickN(createInitialWorldState(seedA), 8, createDefaultSimulationPipeline());
  const resultB = tickN(createInitialWorldState(seedB), 8, createDefaultSimulationPipeline());

  assert.equal(computeStateHash(resultA), computeStateHash(resultB));
});

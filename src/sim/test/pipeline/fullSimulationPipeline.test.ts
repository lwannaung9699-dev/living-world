import assert from "node:assert/strict";
import test from "node:test";
import {
  computeStateHash,
  createFullSimulationPipeline,
  createWorldSeed,
} from "../../index";

test("createFullSimulationPipeline runs Team 02 bootstrap and Team 03–08 tick stages", () => {
  let materialsStageCalls = 0;
  const pipeline = createFullSimulationPipeline({
    materialsObjectsStep: (state) => {
      materialsStageCalls += 1;
      return state;
    },
  });

  const result = pipeline.run(createWorldSeed({ seed: "full-team-pipeline" }), 4);

  assert.equal(result.tick, 4);
  assert.equal(materialsStageCalls, 4);
  assert.ok(result.modules.planetary, "Team 02 planetary genesis module should exist");
  assert.ok(result.modules.biology, "Team 04 biology module should exist");
  assert.ok(result.modules.ecology, "Team 05 ecology module should exist");
  assert.ok(result.modules.creature, "Team 06 creature module should exist");
  assert.ok(result.modules.society, "Team 07 society module should exist");
  assert.ok(result.modules.politics, "Team 08 politics module should exist");
});

test("createFullSimulationPipeline is deterministic from the same genesis seed", () => {
  const seedA = createWorldSeed({ seed: "full-team-determinism" });
  const seedB = createWorldSeed({ seed: "full-team-determinism" });
  const resultA = createFullSimulationPipeline().run(seedA, 3);
  const resultB = createFullSimulationPipeline().run(seedB, 3);

  assert.equal(computeStateHash(resultA), computeStateHash(resultB));
});

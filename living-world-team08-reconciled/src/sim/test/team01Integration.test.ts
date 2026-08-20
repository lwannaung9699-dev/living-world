import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createWorldSeed,
  worldSeedToRngRoot,
  RngStreamRegistry,
  generateTree,
  generateRock,
  createDefaultMaterialRegistry,
  runSimulation,
} from "../index";

const materials = createDefaultMaterialRegistry();

test("Team 03 object generation derives its RNG root from Team 01's WorldSeed, not a standalone seed", () => {
  const seed = createWorldSeed({ seed: "integration-world-1" });
  const rngRoot = worldSeedToRngRoot(seed);
  const registry = RngStreamRegistry.create(rngRoot);

  const tree = generateTree(
    { seedNamespace: "world-oak-1", trunkMaterialId: "oak_wood", minHeight: 5, maxHeight: 9, minBranches: 2, maxBranches: 4 },
    registry,
    materials,
  );

  // Re-deriving from the same WorldSeed must reproduce the same object exactly.
  const registry2 = RngStreamRegistry.create(worldSeedToRngRoot(seed));
  const tree2 = generateTree(
    { seedNamespace: "world-oak-1", trunkMaterialId: "oak_wood", minHeight: 5, maxHeight: 9, minBranches: 2, maxBranches: 4 },
    registry2,
    materials,
  );
  assert.deepEqual(tree, tree2);
});

test("a different WorldSeed changes Team 03's generated attributes, proving the dependency is real (not coincidental)", () => {
  const seedA = createWorldSeed({ seed: "integration-world-a" });
  const seedB = createWorldSeed({ seed: "integration-world-b" });

  const treeA = generateTree(
    { seedNamespace: "same-namespace", trunkMaterialId: "oak_wood", minHeight: 5, maxHeight: 9, minBranches: 2, maxBranches: 4 },
    RngStreamRegistry.create(worldSeedToRngRoot(seedA)),
    materials,
  );
  const treeB = generateTree(
    { seedNamespace: "same-namespace", trunkMaterialId: "oak_wood", minHeight: 5, maxHeight: 9, minBranches: 2, maxBranches: 4 },
    RngStreamRegistry.create(worldSeedToRngRoot(seedB)),
    materials,
  );
  assert.notDeepEqual(treeA, treeB);
  assert.equal(treeA.id, treeB.id, "object id is content-hash derived from the descriptor namespace, independent of world seed");
});

test("Team 03 never creates a competing global RNG: RngStreamRegistry.fork is the only randomness source used by generation.ts", () => {
  // Behavioral proof rather than source-scan: forking the same namespace from two independently-created
  // registries rooted at the same seed always yields bit-identical draws, which is only possible if
  // generation.ts routes every random draw through RngStreamRegistry rather than e.g. Math.random().
  const registryA = RngStreamRegistry.create("shared-root");
  const registryB = RngStreamRegistry.create("shared-root");
  const rockA = generateRock({ seedNamespace: "boulder-x", materialId: "granite", minRadius: 0.2, maxRadius: 2 }, registryA, materials);
  const rockB = generateRock({ seedNamespace: "boulder-x", materialId: "granite", minRadius: 0.2, maxRadius: 2 }, registryB, materials);
  assert.deepEqual(rockA, rockB);
});

test("Team 03 material/object subsystems coexist with a running Team 01 simulation without interfering with tick/hash determinism", () => {
  const seed = createWorldSeed({ seed: "coexistence-check" });
  const before = runSimulation(seed, 50);

  // Exercise Team 03 code in between — must not touch any Team 01 global state.
  generateTree(
    { seedNamespace: "coexistence-oak", trunkMaterialId: "oak_wood", minHeight: 5, maxHeight: 9, minBranches: 2, maxBranches: 4 },
    RngStreamRegistry.create(worldSeedToRngRoot(seed)),
    materials,
  );

  const after = runSimulation(seed, 50);
  assert.deepEqual(after, before, "Team 01's simulation replay must be unaffected by any Team 03 activity");
});

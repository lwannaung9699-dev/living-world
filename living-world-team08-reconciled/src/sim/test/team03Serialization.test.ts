import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultMaterialRegistry,
  createDefaultTransformationRegistry,
  MaterialRegistry,
  TransformationRegistry,
  generateTree,
  generateRock,
  validateObjectData,
  RngStreamRegistry,
  InvalidStateError,
} from "../index";

const materials = createDefaultMaterialRegistry();

test("MaterialRegistry round-trips through JSON.stringify/parse exactly", () => {
  const registry = createDefaultMaterialRegistry();
  const roundTripped = MaterialRegistry.fromState(JSON.parse(JSON.stringify(registry.serialize())));
  assert.deepEqual(roundTripped.serialize(), registry.serialize());
});

test("TransformationRegistry round-trips through JSON.stringify/parse exactly", () => {
  const registry = createDefaultTransformationRegistry();
  const roundTripped = TransformationRegistry.fromState(JSON.parse(JSON.stringify(registry.serialize())));
  assert.deepEqual(roundTripped.serialize(), registry.serialize());
});

test("a generated ObjectData round-trips through JSON.stringify/parse and remains valid", () => {
  const tree = generateTree(
    { seedNamespace: "serialization-oak", trunkMaterialId: "oak_wood", minHeight: 5, maxHeight: 8, minBranches: 1, maxBranches: 3 },
    RngStreamRegistry.create("s"),
    materials,
  );
  const roundTripped = JSON.parse(JSON.stringify(tree));
  assert.deepEqual(roundTripped, tree);
  assert.doesNotThrow(() => validateObjectData(roundTripped));
});

test("a generated rock ObjectData round-trips through JSON.stringify/parse and remains valid", () => {
  const rock = generateRock(
    { seedNamespace: "serialization-rock", materialId: "granite", minRadius: 0.4, maxRadius: 0.9 },
    RngStreamRegistry.create("s"),
    materials,
  );
  const roundTripped = JSON.parse(JSON.stringify(rock));
  assert.deepEqual(roundTripped, rock);
  assert.doesNotThrow(() => validateObjectData(roundTripped));
});

test("validateObjectData rejects an object with materials proportions summing above 1", () => {
  const tree = generateTree(
    { seedNamespace: "invalid-oak", trunkMaterialId: "oak_wood", minHeight: 5, maxHeight: 8, minBranches: 1, maxBranches: 1 },
    RngStreamRegistry.create("s"),
    materials,
  );
  const corrupted = {
    ...tree,
    parts: [
      { ...tree.parts[0], materials: [{ materialId: "oak_wood", proportion: 0.7 }, { materialId: "plank", proportion: 0.6 }] },
      ...tree.parts.slice(1),
    ],
  };
  assert.throws(() => validateObjectData(corrupted), InvalidStateError);
});

test("validateObjectData rejects a negative volume", () => {
  const tree = generateTree(
    { seedNamespace: "invalid-oak-2", trunkMaterialId: "oak_wood", minHeight: 5, maxHeight: 8, minBranches: 1, maxBranches: 1 },
    RngStreamRegistry.create("s"),
    materials,
  );
  const corrupted = { ...tree, parts: [{ ...tree.parts[0], volume: -1 }, ...tree.parts.slice(1)] };
  assert.throws(() => validateObjectData(corrupted), InvalidStateError);
});

test("validateObjectData rejects an unknown category", () => {
  const tree = generateTree(
    { seedNamespace: "invalid-oak-3", trunkMaterialId: "oak_wood", minHeight: 5, maxHeight: 8, minBranches: 1, maxBranches: 1 },
    RngStreamRegistry.create("s"),
    materials,
  );
  assert.throws(() => validateObjectData({ ...tree, category: "spaceship" }), InvalidStateError);
});

test("validateObjectData rejects durability.integrity exceeding maxIntegrity", () => {
  const tree = generateTree(
    { seedNamespace: "invalid-oak-4", trunkMaterialId: "oak_wood", minHeight: 5, maxHeight: 8, minBranches: 1, maxBranches: 1 },
    RngStreamRegistry.create("s"),
    materials,
  );
  const corrupted = {
    ...tree,
    parts: [{ ...tree.parts[0], durability: { maxIntegrity: 1, integrity: 5 } }, ...tree.parts.slice(1)],
  };
  assert.throws(() => validateObjectData(corrupted), InvalidStateError);
});

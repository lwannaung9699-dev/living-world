import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateTree,
  generateRock,
  RngStreamRegistry,
  createDefaultMaterialRegistry,
  InvalidStateError,
  validateObjectData,
} from "../index";

const materials = createDefaultMaterialRegistry();

const treeDescriptor = {
  seedNamespace: "oak-grove-1",
  trunkMaterialId: "oak_wood",
  minHeight: 4,
  maxHeight: 10,
  minBranches: 2,
  maxBranches: 5,
};

const rockDescriptor = { seedNamespace: "boulder-field-1", materialId: "granite", minRadius: 0.3, maxRadius: 1.5 };

test("generateTree produces a structurally valid ObjectData", () => {
  const tree = generateTree(treeDescriptor, RngStreamRegistry.create("world-a"), materials);
  assert.doesNotThrow(() => validateObjectData(tree));
  assert.equal(tree.category, "tree");
  assert.ok(tree.parts.length >= 2, "expected a trunk plus at least one branch on average");
});

test("generateRock produces a structurally valid ObjectData", () => {
  const rock = generateRock(rockDescriptor, RngStreamRegistry.create("world-a"), materials);
  assert.doesNotThrow(() => validateObjectData(rock));
  assert.equal(rock.category, "rock");
  assert.equal(rock.parts.length, 1);
});

test("same master seed + same descriptor produces byte-identical objects (seed reproducibility)", () => {
  const a = generateTree(treeDescriptor, RngStreamRegistry.create("shared-seed"), materials);
  const b = generateTree(treeDescriptor, RngStreamRegistry.create("shared-seed"), materials);
  assert.deepEqual(a, b);
});

test("different master seeds produce different attribute draws for the same descriptor", () => {
  const a = generateTree(treeDescriptor, RngStreamRegistry.create("seed-alpha"), materials);
  const b = generateTree(treeDescriptor, RngStreamRegistry.create("seed-beta"), materials);
  assert.notDeepEqual(a, b);
});

test("object ids are independent of RNG draw order/execution order: generating a rock first never changes the tree's id", () => {
  const registryA = RngStreamRegistry.create("order-test-seed");
  const treeFirst = generateTree(treeDescriptor, registryA, materials);

  const registryB = RngStreamRegistry.create("order-test-seed");
  generateRock(rockDescriptor, registryB, materials); // consume a different stream first
  const treeSecond = generateTree(treeDescriptor, registryB, materials);

  assert.equal(treeFirst.id, treeSecond.id);
  assert.deepEqual(treeFirst, treeSecond, "forking an unrelated namespace first must not perturb this tree's own stream");
});

test("generateTree rejects an unknown trunk material id", () => {
  assert.throws(
    () => generateTree({ ...treeDescriptor, trunkMaterialId: "unobtainium" }, RngStreamRegistry.create("s"), materials),
    InvalidStateError,
  );
});

test("generateTree rejects an inverted height range", () => {
  assert.throws(
    () => generateTree({ ...treeDescriptor, minHeight: 10, maxHeight: 5 }, RngStreamRegistry.create("s"), materials),
    InvalidStateError,
  );
});

test("generateRock rejects an unknown material id", () => {
  assert.throws(
    () => generateRock({ ...rockDescriptor, materialId: "unobtainium" }, RngStreamRegistry.create("s"), materials),
    InvalidStateError,
  );
});

test("two distinct seedNamespaces never collide on object id", () => {
  const a = generateTree({ ...treeDescriptor, seedNamespace: "grove-a" }, RngStreamRegistry.create("s"), materials);
  const b = generateTree({ ...treeDescriptor, seedNamespace: "grove-b" }, RngStreamRegistry.create("s"), materials);
  assert.notEqual(a.id, b.id);
  const partIdsA = new Set(a.parts.map((p) => p.id));
  const partIdsB = b.parts.map((p) => p.id);
  for (const id of partIdsB) assert.equal(partIdsA.has(id), false, "part ids must not collide across distinct trees");
});

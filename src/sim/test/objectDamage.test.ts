import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateTree,
  applyDamageToObject,
  computeAggregateIntegrity,
  RngStreamRegistry,
  createDefaultMaterialRegistry,
} from "../index";

const materials = createDefaultMaterialRegistry();
const treeDescriptor = {
  seedNamespace: "damage-oak-1",
  trunkMaterialId: "oak_wood",
  minHeight: 6,
  maxHeight: 6,
  minBranches: 2,
  maxBranches: 2,
};

test("applyDamageToObject reduces every part's integrity according to its own material", () => {
  const tree = generateTree(treeDescriptor, RngStreamRegistry.create("s"), materials);
  const burned = applyDamageToObject(tree, materials, { type: "fire", amount: 0.4 });
  for (const part of burned.parts) {
    assert.ok(part.durability.integrity < tree.parts.find((p) => p.id === part.id)!.durability.integrity);
  }
});

test("applyDamageToObject transitions object.state from intact -> damaged -> destroyed as integrity drops", () => {
  const tree = generateTree(treeDescriptor, RngStreamRegistry.create("s"), materials);
  assert.equal(tree.state, "intact");

  const lightlyBurned = applyDamageToObject(tree, materials, { type: "fire", amount: 0.1 });
  const heavilyBurned = applyDamageToObject(lightlyBurned, materials, { type: "fire", amount: 0.3 });
  const obliterated = applyDamageToObject(heavilyBurned, materials, { type: "fire", amount: 1 });

  assert.equal(obliterated.state, "destroyed");
  assert.equal(computeAggregateIntegrity(obliterated.parts), 0);
});

test("applyDamageToObject never mutates the original object", () => {
  const tree = generateTree(treeDescriptor, RngStreamRegistry.create("s"), materials);
  const snapshot = JSON.parse(JSON.stringify(tree));
  applyDamageToObject(tree, materials, { type: "impact", amount: 0.5 });
  assert.deepEqual(tree, snapshot);
});

test("applyDamageToObject is deterministic given identical inputs", () => {
  const tree = generateTree(treeDescriptor, RngStreamRegistry.create("s"), materials);
  const a = applyDamageToObject(tree, materials, { type: "impact", amount: 0.3 });
  const b = applyDamageToObject(tree, materials, { type: "impact", amount: 0.3 });
  assert.deepEqual(a, b);
});

test("computeAggregateIntegrity returns 1 for a freshly generated, undamaged object", () => {
  const tree = generateTree(treeDescriptor, RngStreamRegistry.create("s"), materials);
  assert.equal(computeAggregateIntegrity(tree.parts), 1);
});

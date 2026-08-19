import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateTree,
  generateRock,
  extractResources,
  RngStreamRegistry,
  createDefaultMaterialRegistry,
  InvalidStateError,
} from "../index";

const materials = createDefaultMaterialRegistry();

const treeDescriptor = {
  seedNamespace: "extraction-oak-1",
  trunkMaterialId: "oak_wood",
  minHeight: 6,
  maxHeight: 6,
  minBranches: 3,
  maxBranches: 3,
};
const rockDescriptor = { seedNamespace: "extraction-rock-1", materialId: "granite", minRadius: 0.5, maxRadius: 0.5 };

test("extractResources yields the tree's own material(s), sorted by materialId", () => {
  const tree = generateTree(treeDescriptor, RngStreamRegistry.create("s"), materials);
  const result = extractResources(tree, materials, { action: "chop", tool: "axe" });
  assert.equal(result.length, 1);
  assert.equal(result[0].materialId, "oak_wood");
  assert.ok(result[0].quantity > 0);
});

test("extractResources scales linearly with the efficiency parameter", () => {
  const rock = generateRock(rockDescriptor, RngStreamRegistry.create("s"), materials);
  const low = extractResources(rock, materials, { action: "mine", efficiency: 0.2 });
  const high = extractResources(rock, materials, { action: "mine", efficiency: 0.8 });
  assert.ok(high[0].quantity > low[0].quantity);
  // Exactly 4x: 0.8 / 0.2 (loose tolerance to absorb the 6-decimal rounding applied to each yield).
  assert.ok(Math.abs(high[0].quantity / low[0].quantity - 4) < 1e-4);
});

test("extractResources yields nothing extra from a fully destroyed part (zero durability)", () => {
  const rock = generateRock(rockDescriptor, RngStreamRegistry.create("s"), materials);
  const destroyed = {
    ...rock,
    parts: rock.parts.map((p) => ({ ...p, durability: { ...p.durability, integrity: 0 } })),
  };
  const result = extractResources(destroyed, materials, { action: "mine" });
  assert.deepEqual(result, []);
});

test("extractResources is deterministic given identical inputs", () => {
  const tree = generateTree(treeDescriptor, RngStreamRegistry.create("s"), materials);
  const a = extractResources(tree, materials, { action: "chop", tool: "axe", efficiency: 0.7 });
  const b = extractResources(tree, materials, { action: "chop", tool: "axe", efficiency: 0.7 });
  assert.deepEqual(a, b);
});

test("extractResources rejects an invalid context (missing action)", () => {
  const rock = generateRock(rockDescriptor, RngStreamRegistry.create("s"), materials);
  assert.throws(() => extractResources(rock, materials, {} as never), InvalidStateError);
});

test("extractResources rejects an out-of-range efficiency", () => {
  const rock = generateRock(rockDescriptor, RngStreamRegistry.create("s"), materials);
  assert.throws(() => extractResources(rock, materials, { action: "mine", efficiency: 1.5 }), InvalidStateError);
});

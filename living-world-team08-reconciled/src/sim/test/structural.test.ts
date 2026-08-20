import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeMass,
  computeCenterOfMass,
  buildStructuralProperties,
  applyLoad,
  hasFractured,
  createDefaultMaterialRegistry,
  IDENTITY_TRANSFORM,
} from "../index";

const materials = createDefaultMaterialRegistry();

function part(id: string, materialId: string, volume: number, x = 0) {
  return {
    id,
    name: id,
    materials: [{ materialId, proportion: 1 }],
    volume,
    transform: { ...IDENTITY_TRANSFORM, position: { x, y: 0, z: 0 } },
    durability: { maxIntegrity: 1, integrity: 1 },
  };
}

test("computeMass sums volume * proportion * density across parts and materials", () => {
  const parts = [part("a", "granite", 1), part("b", "oak_wood", 1)];
  const mass = computeMass(parts, materials);
  const expected = materials.get("granite").density * 1 + materials.get("oak_wood").density * 1;
  assert.equal(mass, expected);
});

test("computeMass is independent of part ordering", () => {
  const parts1 = [part("a", "granite", 1), part("b", "oak_wood", 2)];
  const parts2 = [part("b", "oak_wood", 2), part("a", "granite", 1)];
  assert.equal(computeMass(parts1, materials), computeMass(parts2, materials));
});

test("computeCenterOfMass is the mass-weighted average of part positions", () => {
  // Two equal-mass parts at x=-1 and x=1 should balance exactly at x=0.
  const parts = [part("a", "granite", 1, -1), part("b", "granite", 1, 1)];
  const com = computeCenterOfMass(parts, materials);
  assert.ok(Math.abs(com.x) < 1e-9);
});

test("buildStructuralProperties starts unloaded: zero stress, full stability and integrity", () => {
  const parts = [part("beam", "oak_wood", 0.5)];
  const structural = buildStructuralProperties(parts, materials, [{ x: 0, y: 0, z: 0 }]);
  assert.equal(structural.stress, 0);
  assert.equal(structural.stability, 1);
  assert.equal(structural.integrity, 1);
  assert.ok(structural.loadCapacity > 0);
});

test("applyLoad below capacity keeps the object stable and undamaged", () => {
  const parts = [part("beam", "iron", 0.2)];
  const structural = buildStructuralProperties(parts, materials, [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]);
  const light = applyLoad(structural, structural.loadCapacity * 0.3);
  assert.ok(light.stress < 1);
  assert.equal(light.integrity, 1);
  assert.equal(hasFractured(light), false);
});

test("applyLoad beyond capacity increases stress past 1 and reduces integrity (beam -> load -> stress -> deformation)", () => {
  const parts = [part("beam", "clay", 0.2)];
  const structural = buildStructuralProperties(parts, materials, [{ x: 0, y: 0, z: 0 }]);
  const overloaded = applyLoad(structural, structural.loadCapacity * 3);
  assert.ok(overloaded.stress > 1);
  assert.ok(overloaded.integrity < structural.integrity);
  assert.equal(overloaded.stability, 0);
});

test("repeated heavy overload eventually fractures a low-fractureThreshold object", () => {
  const parts = [part("beam", "clay", 0.05)];
  let structural = buildStructuralProperties(parts, materials, [{ x: 0, y: 0, z: 0 }], 0.5);
  for (let i = 0; i < 10 && !hasFractured(structural); i++) {
    structural = applyLoad(structural, structural.loadCapacity * 5);
  }
  assert.equal(hasFractured(structural), true);
});

test("applyLoad is deterministic given identical inputs", () => {
  const parts = [part("beam", "iron", 0.2)];
  const structural = buildStructuralProperties(parts, materials, [{ x: 0, y: 0, z: 0 }]);
  const a = applyLoad(structural, 50);
  const b = applyLoad(structural, 50);
  assert.deepEqual(a, b);
});

test("more support points increase load capacity for an otherwise identical object", () => {
  const parts = [part("beam", "iron", 0.2)];
  const onePoint = buildStructuralProperties(parts, materials, [{ x: 0, y: 0, z: 0 }]);
  const fourPoints = buildStructuralProperties(
    parts,
    materials,
    [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 },
    ],
  );
  assert.ok(fourPoints.loadCapacity > onePoint.loadCapacity);
});

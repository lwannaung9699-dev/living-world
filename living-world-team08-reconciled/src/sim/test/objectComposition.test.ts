import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createObjectData,
  attachChild,
  detachChild,
  getDescendants,
  isDescendantOf,
  deriveObjectId,
  IDENTITY_TRANSFORM,
  createDefaultMaterialRegistry,
  buildStructuralProperties,
  InvalidStateError,
} from "../index";

const materials = createDefaultMaterialRegistry();

function makeSimpleObject(id: string, materialId = "plank") {
  const parts = [
    {
      id: `${id}-part`,
      name: "part",
      materials: [{ materialId, proportion: 1 }],
      volume: 0.1,
      transform: IDENTITY_TRANSFORM,
      durability: { maxIntegrity: 1, integrity: 1 },
    },
  ];
  const structural = buildStructuralProperties(parts, materials, [{ x: 0, y: 0, z: 0 }]);
  return createObjectData({ id, category: "building_component", name: id, parts, structural });
}

test("deriveObjectId is deterministic and depends only on (parentId, localKey)", () => {
  assert.equal(deriveObjectId("root-1", "wall-1"), deriveObjectId("root-1", "wall-1"));
  assert.notEqual(deriveObjectId("root-1", "wall-1"), deriveObjectId("root-1", "wall-2"));
  assert.notEqual(deriveObjectId("root-1", "wall-1"), deriveObjectId("root-2", "wall-1"));
});

test("attachChild links parent -> child and sets child.parentId", () => {
  const house = makeSimpleObject("house");
  const wall = makeSimpleObject("wall-1");
  const { parent, child } = attachChild(house, wall);
  assert.equal(child.parentId, "house");
  assert.deepEqual(parent.childIds, ["wall-1"]);
});

test("attachChild is idempotent for the same child and keeps childIds sorted/deduplicated", () => {
  const house = makeSimpleObject("house");
  const wallA = makeSimpleObject("wall-a");
  const wallB = makeSimpleObject("wall-b");
  let { parent } = attachChild(house, wallA);
  ({ parent } = attachChild(parent, wallB));
  ({ parent } = attachChild(parent, wallA));
  assert.deepEqual(parent.childIds, ["wall-a", "wall-b"]);
});

test("attachChild refuses to re-parent a child that already belongs to a different parent", () => {
  const houseA = makeSimpleObject("house-a");
  const houseB = makeSimpleObject("house-b");
  const wall = makeSimpleObject("wall-1");
  const { child: attachedWall } = attachChild(houseA, wall);
  assert.throws(() => attachChild(houseB, attachedWall), InvalidStateError);
});

test("detachChild removes a child id and is idempotent", () => {
  const house = makeSimpleObject("house");
  const wall = makeSimpleObject("wall-1");
  const { parent } = attachChild(house, wall);
  const detached = detachChild(parent, "wall-1");
  assert.deepEqual(detached.childIds, []);
  assert.deepEqual(detachChild(detached, "wall-1").childIds, []);
});

test("getDescendants walks a multi-level hierarchy deterministically", () => {
  const house = makeSimpleObject("house");
  const wall = makeSimpleObject("wall-1");
  const door = makeSimpleObject("door-1");

  // house -> wall-1 -> door-1
  const step1 = attachChild(house, wall);
  const step2 = attachChild(step1.child, door);

  const objects = new Map([
    [step1.parent.id, step1.parent],
    [step2.parent.id, step2.parent], // updated wall-1, now with door-1 as a child
    [step2.child.id, step2.child],
  ]);
  const descendants = getDescendants(objects, "house").map((o) => o.id);
  assert.deepEqual(descendants.sort(), ["door-1", "wall-1"]);
});

test("getDescendants throws explicitly when a referenced child id is missing from the map", () => {
  const house = makeSimpleObject("house");
  const wall = makeSimpleObject("wall-1");
  const { parent } = attachChild(house, wall);
  const objects = new Map([[parent.id, parent]]); // wall-1 intentionally omitted
  assert.throws(() => getDescendants(objects, "house"), InvalidStateError);
});

test("isDescendantOf correctly walks up the parent chain, including self", () => {
  const house = makeSimpleObject("house");
  const wall = makeSimpleObject("wall-1");
  const { parent, child } = attachChild(house, wall);
  const objects = new Map([
    [parent.id, parent],
    [child.id, child],
  ]);
  assert.equal(isDescendantOf(objects, "wall-1", "house"), true);
  assert.equal(isDescendantOf(objects, "house", "house"), true);
  assert.equal(isDescendantOf(objects, "house", "wall-1"), false);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createMaterialData,
  validateMaterialData,
  MaterialRegistry,
  createDefaultMaterialRegistry,
  DEFAULT_MATERIALS,
  InvalidStateError,
} from "../index";

const VALID_INPUT = {
  id: "test_wood",
  name: "Test Wood",
  category: "wood" as const,
  density: 600,
  hardness: 0.4,
  strength: 0.5,
  toughness: 0.5,
  elasticity: 0.3,
  flammability: 0.6,
  thermalConductivity: 0.2,
  thermalCapacity: 0.4,
  waterResistance: 0.3,
  corrosionResistance: 1,
  decayRate: 0.01,
  friction: 0.5,
  colorDescriptor: "brown",
  state: "solid" as const,
  temperatureRange: { minC: -40, maxC: 300 },
};

test("createMaterialData builds a valid, versioned MaterialData", () => {
  const material = createMaterialData(VALID_INPUT);
  assert.equal(material.id, "test_wood");
  assert.equal(material.contractVersion, "1.0.0");
  assert.doesNotThrow(() => validateMaterialData(material));
});

test("validateMaterialData rejects an out-of-range unit-interval field", () => {
  assert.throws(() => createMaterialData({ ...VALID_INPUT, hardness: 1.5 }), InvalidStateError);
  assert.throws(() => createMaterialData({ ...VALID_INPUT, flammability: -0.1 }), InvalidStateError);
});

test("validateMaterialData rejects a non-positive density", () => {
  assert.throws(() => createMaterialData({ ...VALID_INPUT, density: 0 }), InvalidStateError);
  assert.throws(() => createMaterialData({ ...VALID_INPUT, density: -5 }), InvalidStateError);
});

test("validateMaterialData rejects an invalid category or state", () => {
  assert.throws(() => createMaterialData({ ...VALID_INPUT, category: "lava" as never }), InvalidStateError);
  assert.throws(() => createMaterialData({ ...VALID_INPUT, state: "plasma" as never }), InvalidStateError);
});

test("validateMaterialData rejects an inverted temperature range", () => {
  assert.throws(
    () => createMaterialData({ ...VALID_INPUT, temperatureRange: { minC: 100, maxC: -100 } }),
    InvalidStateError,
  );
});

test("MaterialRegistry lookup is deterministic and order-independent", () => {
  const a = MaterialRegistry.create([VALID_INPUT, { ...VALID_INPUT, id: "test_stone", category: "stone" }]);
  const b = MaterialRegistry.create([{ ...VALID_INPUT, id: "test_stone", category: "stone" }, VALID_INPUT]);
  assert.deepEqual(a.serialize(), b.serialize());
  assert.deepEqual(
    a.list().map((m) => m.id),
    b.list().map((m) => m.id),
  );
});

test("MaterialRegistry.get throws explicitly for an unknown id", () => {
  const registry = MaterialRegistry.create([VALID_INPUT]);
  assert.throws(() => registry.get("does_not_exist"), InvalidStateError);
  assert.equal(registry.has("does_not_exist"), false);
});

test("MaterialRegistry serialize/fromState round-trips exactly", () => {
  const registry = createDefaultMaterialRegistry();
  const state = registry.serialize();
  const restored = MaterialRegistry.fromState(state);
  assert.deepEqual(restored.serialize(), state);
});

test("MaterialRegistry.fromState rejects a state whose key does not match the material's own id", () => {
  assert.throws(
    () => MaterialRegistry.fromState({ wrong_key: createMaterialData(VALID_INPUT) }),
    InvalidStateError,
  );
});

test("the default catalog covers every declared MaterialCategory used in the transformation examples", () => {
  const registry = createDefaultMaterialRegistry();
  for (const material of DEFAULT_MATERIALS) {
    assert.doesNotThrow(() => registry.get(material.id));
  }
  assert.ok(DEFAULT_MATERIALS.length >= 10, "expected a reasonably-sized starter catalog");
});

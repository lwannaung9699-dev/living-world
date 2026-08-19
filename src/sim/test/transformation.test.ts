import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyTransformation,
  createDefaultTransformationRegistry,
  TransformationRegistry,
  TransformationContext,
  InvalidStateError,
} from "../index";

const registry = createDefaultTransformationRegistry();

function baseContext(overrides: Partial<TransformationContext> = {}): TransformationContext {
  return {
    availableTools: [],
    availableTechnology: [],
    temperatureC: 20,
    waterAvailable: false,
    fireAvailable: false,
    inventory: {},
    ...overrides,
  };
}

test("applyTransformation succeeds when every precondition is met", () => {
  const t = registry.get("wood_to_plank");
  const result = applyTransformation(t, baseContext({ availableTools: ["saw"], inventory: { oak_wood: 2 } }));
  assert.equal(result.success, true);
  assert.deepEqual(result.consumed, t.inputs);
  assert.deepEqual(result.produced, t.outputs);
});

test("applyTransformation fails with missing_tool when a required tool is absent", () => {
  const t = registry.get("wood_to_plank");
  const result = applyTransformation(t, baseContext({ inventory: { oak_wood: 2 } }));
  assert.equal(result.success, false);
  assert.equal(result.failureReason, "missing_tool");
});

test("applyTransformation fails with missing_input when the input material is entirely absent from inventory", () => {
  const t = registry.get("wood_to_plank");
  const result = applyTransformation(t, baseContext({ availableTools: ["saw"], inventory: {} }));
  assert.equal(result.success, false);
  assert.equal(result.failureReason, "missing_input");
});

test("applyTransformation fails with insufficient_quantity when there isn't enough of an input", () => {
  const t = registry.get("ore_to_metal");
  const result = applyTransformation(
    t,
    baseContext({
      availableTools: ["furnace"],
      availableTechnology: ["smelting"],
      fireAvailable: true,
      temperatureC: 1300,
      inventory: { iron_ore: 1, charcoal: 1 }, // needs 2 iron_ore
    }),
  );
  assert.equal(result.success, false);
  assert.equal(result.failureReason, "insufficient_quantity");
});

test("applyTransformation fails with missing_technology when required tech is unavailable", () => {
  const t = registry.get("sand_to_glass");
  const result = applyTransformation(
    t,
    baseContext({ availableTools: ["furnace"], fireAvailable: true, temperatureC: 1500, inventory: { sand: 1 } }),
  );
  assert.equal(result.success, false);
  assert.equal(result.failureReason, "missing_technology");
});

test("applyTransformation enforces minimum temperature conditions", () => {
  const t = registry.get("wood_to_charcoal");
  const tooCold = applyTransformation(t, baseContext({ fireAvailable: true, temperatureC: 50, inventory: { oak_wood: 1 } }));
  assert.equal(tooCold.success, false);
  assert.equal(tooCold.failureReason, "temperature_too_low");

  const hotEnough = applyTransformation(t, baseContext({ fireAvailable: true, temperatureC: 400, inventory: { oak_wood: 1 } }));
  assert.equal(hotEnough.success, true);
});

test("applyTransformation enforces requiresFire/requiresWater conditions independently of temperature", () => {
  const t = registry.get("wood_to_charcoal");
  const noFire = applyTransformation(t, baseContext({ temperatureC: 400, inventory: { oak_wood: 1 } }));
  assert.equal(noFire.success, false);
  assert.equal(noFire.failureReason, "fire_required");
});

test("applyTransformation is a pure, deterministic function of its inputs", () => {
  const t = registry.get("fiber_to_rope");
  const context = baseContext({ inventory: { plant_fiber: 5 } });
  const a = applyTransformation(t, context);
  const b = applyTransformation(t, context);
  assert.deepEqual(a, b);
});

test("applyTransformation never mutates the context it is given", () => {
  const t = registry.get("fiber_to_rope");
  const context = baseContext({ inventory: { plant_fiber: 5 } });
  const snapshot = JSON.parse(JSON.stringify(context));
  applyTransformation(t, context);
  assert.deepEqual(context, snapshot);
});

test("TransformationRegistry.findByInput returns every recipe that consumes a given material, sorted by id", () => {
  const localRegistry = TransformationRegistry.create(createDefaultTransformationRegistry().list());
  const consumers = localRegistry.findByInput("oak_wood");
  assert.deepEqual(
    consumers.map((c) => c.id),
    ["wood_to_charcoal", "wood_to_plank"],
  );
});

test("TransformationRegistry serialize/fromState round-trips exactly", () => {
  const state = registry.serialize();
  const restored = TransformationRegistry.fromState(state);
  assert.deepEqual(restored.serialize(), state);
});

test("TransformationRegistry.get throws explicitly for an unknown id", () => {
  assert.throws(() => registry.get("not_a_real_transformation"), InvalidStateError);
});

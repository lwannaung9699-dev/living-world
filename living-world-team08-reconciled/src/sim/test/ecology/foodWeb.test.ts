import { test } from "node:test";
import assert from "node:assert/strict";
import { createFoodWeb, validateFoodWeb, getConsumersOf, getConsumedBy, estimateTrophicLevels, foodWebConnectivity } from "../../ecology";
import { InvalidStateError } from "../../core/errors";

test("createFoodWeb builds a valid graph from nodes and edges", () => {
  const web = createFoodWeb(
    [
      { id: "grass", kind: "resource" },
      { id: "deer", kind: "population" },
      { id: "wolf", kind: "population" },
    ],
    [
      { from: "deer", to: "grass", interactionType: "herbivory", strength: 0.5 },
      { from: "wolf", to: "deer", interactionType: "predation", strength: 0.3 },
    ],
  );
  assert.equal(web.nodes.length, 3);
  assert.equal(web.edges.length, 2);
});

test("validateFoodWeb rejects an edge referencing an unknown node", () => {
  assert.throws(
    () =>
      validateFoodWeb({
        nodes: [{ id: "grass", kind: "resource" }],
        edges: [{ from: "deer", to: "grass", interactionType: "herbivory", strength: 0.5 }],
      }),
    InvalidStateError,
  );
});

test("getConsumersOf / getConsumedBy read edges in the correct direction", () => {
  const web = createFoodWeb(
    [
      { id: "grass", kind: "resource" },
      { id: "deer", kind: "population" },
      { id: "wolf", kind: "population" },
    ],
    [
      { from: "deer", to: "grass", interactionType: "herbivory", strength: 0.5 },
      { from: "wolf", to: "deer", interactionType: "predation", strength: 0.3 },
    ],
  );
  assert.deepEqual(getConsumersOf(web, "grass"), ["deer"]);
  assert.deepEqual(getConsumedBy(web, "wolf"), ["deer"]);
});

test("the food web graph supports cycles (e.g. omnivory/scavenging loops) without crashing", () => {
  const web = createFoodWeb(
    [
      { id: "a", kind: "population" },
      { id: "b", kind: "population" },
    ],
    [
      { from: "a", to: "b", interactionType: "predation", strength: 0.5 },
      { from: "b", to: "a", interactionType: "scavenging", strength: 0.1 },
    ],
  );
  assert.doesNotThrow(() => estimateTrophicLevels(web));
  const levels = estimateTrophicLevels(web);
  assert.ok(Number.isFinite(levels.a));
  assert.ok(Number.isFinite(levels.b));
});

test("estimateTrophicLevels increases with each step above a basal resource", () => {
  const web = createFoodWeb(
    [
      { id: "grass", kind: "resource" },
      { id: "deer", kind: "population" },
      { id: "wolf", kind: "population" },
    ],
    [
      { from: "deer", to: "grass", interactionType: "herbivory", strength: 0.5 },
      { from: "wolf", to: "deer", interactionType: "predation", strength: 0.3 },
    ],
  );
  const levels = estimateTrophicLevels(web);
  assert.ok(levels.grass < levels.deer);
  assert.ok(levels.deer < levels.wolf);
});

test("foodWebConnectivity is 0 for an edgeless graph and grows with more edges", () => {
  const empty = createFoodWeb(
    [
      { id: "a", kind: "population" },
      { id: "b", kind: "population" },
    ],
    [],
  );
  const connected = createFoodWeb(
    [
      { id: "a", kind: "population" },
      { id: "b", kind: "population" },
    ],
    [{ from: "a", to: "b", interactionType: "predation", strength: 0.5 }],
  );
  assert.equal(foodWebConnectivity(empty), 0);
  assert.ok(foodWebConnectivity(connected) > 0);
});

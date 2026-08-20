import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyDisturbanceToResource,
  applyDisturbanceToPopulation,
  tickDisturbanceDuration,
  validateDisturbance,
  createResource,
  createPopulation,
} from "../../ecology";
import { InvalidStateError } from "../../core/errors";

test("validateDisturbance rejects intensity outside [0, 1]", () => {
  assert.throws(
    () => validateDisturbance({ disturbanceId: "d1", type: "drought", location: "meadow", intensity: 1.5 }),
    InvalidStateError,
  );
});

test("applyDisturbanceToResource reduces availableAmount proportional to intensity, only at the matching location", () => {
  const resource = createResource({ resourceId: "grass", resourceType: "plant", location: "meadow", availableAmount: 200, capacity: 1000, regenerationRate: 0.1 });
  const drought = { disturbanceId: "d1", type: "drought", location: "meadow", intensity: 0.5 };
  const affected = applyDisturbanceToResource(resource, drought);
  assert.ok(affected.availableAmount < resource.availableAmount);

  const elsewhere = { ...drought, location: "forest" };
  const unaffected = applyDisturbanceToResource(resource, elsewhere);
  assert.equal(unaffected.availableAmount, resource.availableAmount);
});

test("applyDisturbanceToPopulation reduces health and count, only at the matching location", () => {
  const population = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 100, health: 1 });
  const fire = { disturbanceId: "d2", type: "fire", location: "meadow", intensity: 0.6 };
  const result = applyDisturbanceToPopulation(population, fire);
  assert.ok(result.population.health < 1);
  assert.ok(result.deaths > 0);
  assert.ok(result.population.count < 100);

  const elsewhere = applyDisturbanceToPopulation(population, { ...fire, location: "forest" });
  assert.equal(elsewhere.deaths, 0);
  assert.equal(elsewhere.population.count, 100);
});

test("higher-intensity disturbances cause more damage than lower-intensity ones", () => {
  const population = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 100, health: 1 });
  const mild = applyDisturbanceToPopulation(population, { disturbanceId: "d1", type: "drought", location: "meadow", intensity: 0.1 });
  const severe = applyDisturbanceToPopulation(population, { disturbanceId: "d1", type: "drought", location: "meadow", intensity: 0.9 });
  assert.ok(severe.deaths > mild.deaths);
});

test("tickDisturbanceDuration counts down and eventually expires (returns undefined)", () => {
  let disturbance: ReturnType<typeof tickDisturbanceDuration> = { disturbanceId: "d1", type: "cold_period", location: "meadow", intensity: 0.4, remainingTicks: 2 };
  disturbance = tickDisturbanceDuration(disturbance!);
  assert.ok(disturbance);
  assert.equal(disturbance!.remainingTicks, 1);
  disturbance = tickDisturbanceDuration(disturbance!);
  assert.equal(disturbance, undefined);
});

test("a disturbance with no remainingTicks persists indefinitely", () => {
  const disturbance = { disturbanceId: "d1", type: "habitat_destruction", location: "meadow", intensity: 0.4 };
  const next = tickDisturbanceDuration(disturbance);
  assert.deepEqual(next, disturbance);
});

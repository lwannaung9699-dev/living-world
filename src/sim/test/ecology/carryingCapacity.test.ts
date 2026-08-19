import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCarryingCapacity, createResource, DEFAULT_ECOLOGICAL_ENVIRONMENT, EcologicalNiche } from "../../ecology";

const niche: EcologicalNiche = {
  speciesId: "deer",
  temperatureRange: [5, 25],
  humidityRange: [0.3, 0.8],
  waterRequirement: 0.3,
  foodRequirements: ["plant"],
  habitatRequirements: ["forest"],
};

const goodEnvironment = { ...DEFAULT_ECOLOGICAL_ENVIRONMENT, temperature: 15, humidity: 0.55, waterAvailability: 1, habitatQuality: 1 };

test("computeCarryingCapacity scales with available food biomass", () => {
  const smallFood = [
    createResource({ resourceId: "grass", resourceType: "plant", location: "meadow", availableAmount: 100, capacity: 1000, regenerationRate: 0.1 }),
  ];
  const largeFood = [
    createResource({ resourceId: "grass", resourceType: "plant", location: "meadow", availableAmount: 1000, capacity: 1000, regenerationRate: 0.1 }),
  ];
  const small = computeCarryingCapacity({ niche, environment: goodEnvironment, availableResources: smallFood, perCapitaResourceRequirement: 1 });
  const large = computeCarryingCapacity({ niche, environment: goodEnvironment, availableResources: largeFood, perCapitaResourceRequirement: 1 });
  assert.ok(large > small);
});

test("computeCarryingCapacity is reduced by predation, competition, and disease pressure", () => {
  const food = [
    createResource({ resourceId: "grass", resourceType: "plant", location: "meadow", availableAmount: 1000, capacity: 1000, regenerationRate: 0.1 }),
  ];
  const base = computeCarryingCapacity({ niche, environment: goodEnvironment, availableResources: food, perCapitaResourceRequirement: 1 });
  const pressured = computeCarryingCapacity({
    niche,
    environment: goodEnvironment,
    availableResources: food,
    perCapitaResourceRequirement: 1,
    predationPressure: 0.8,
    competitionPressure: 0.8,
    diseasePressure: 0.8,
  });
  assert.ok(pressured < base, `expected pressured capacity (${pressured}) < base capacity (${base})`);
  assert.ok(pressured >= 0);
});

test("computeCarryingCapacity is zero when the environment is entirely unsuitable", () => {
  const food = [
    createResource({ resourceId: "grass", resourceType: "plant", location: "meadow", availableAmount: 1000, capacity: 1000, regenerationRate: 0.1 }),
  ];
  const hostile = { ...goodEnvironment, temperature: -273, humidity: 0, waterAvailability: 0, habitatQuality: 0 };
  const capacity = computeCarryingCapacity({ niche, environment: hostile, availableResources: food, perCapitaResourceRequirement: 1 });
  assert.ok(capacity < 1, `expected near-zero capacity, got ${capacity}`);
});

test("computeCarryingCapacity does not force a fixed maximum -- it derives from inputs, so identical species differ by environment", () => {
  const food = [
    createResource({ resourceId: "grass", resourceType: "plant", location: "meadow", availableAmount: 500, capacity: 1000, regenerationRate: 0.1 }),
  ];
  const capacityA = computeCarryingCapacity({ niche, environment: goodEnvironment, availableResources: food, perCapitaResourceRequirement: 1 });
  const drier = { ...goodEnvironment, waterAvailability: 0.1 };
  const capacityB = computeCarryingCapacity({ niche, environment: drier, availableResources: food, perCapitaResourceRequirement: 1 });
  assert.notEqual(capacityA, capacityB);
});

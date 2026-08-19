import { test } from "node:test";
import assert from "node:assert/strict";
import { computeEcosystemMetrics, createPopulation, createResource, createFoodWeb } from "../../ecology";

test("speciesDiversity is 0 for a single-species ecosystem and positive for a multi-species one", () => {
  const singleSpecies = [createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 50 })];
  const multiSpecies = [
    createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 50 }),
    createPopulation({ populationId: "b", speciesId: "wolf", location: "forest", count: 10 }),
  ];
  const web = createFoodWeb([], []);

  const single = computeEcosystemMetrics({ populations: singleSpecies, resources: [], foodWeb: web, interactions: [], carryingCapacityByPopulation: {} });
  const multi = computeEcosystemMetrics({ populations: multiSpecies, resources: [], foodWeb: web, interactions: [], carryingCapacityByPopulation: {} });

  assert.equal(single.speciesDiversity, 0);
  assert.ok(multi.speciesDiversity > 0);
});

test("resourceStability reflects average fullness (availableAmount/capacity) across resources", () => {
  const resources = [
    createResource({ resourceId: "a", resourceType: "plant", location: "meadow", availableAmount: 100, capacity: 100, regenerationRate: 0.1 }),
    createResource({ resourceId: "b", resourceType: "water", location: "meadow", availableAmount: 0, capacity: 100, regenerationRate: 0.1 }),
  ];
  const web = createFoodWeb([], []);
  const metrics = computeEcosystemMetrics({ populations: [], resources, foodWeb: web, interactions: [], carryingCapacityByPopulation: {} });
  assert.ok(Math.abs(metrics.resourceStability - 0.5) < 1e-9);
});

test("totalBiomass sums every population's count", () => {
  const populations = [
    createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 30 }),
    createPopulation({ populationId: "b", speciesId: "wolf", location: "forest", count: 5 }),
  ];
  const web = createFoodWeb([], []);
  const metrics = computeEcosystemMetrics({ populations, resources: [], foodWeb: web, interactions: [], carryingCapacityByPopulation: {} });
  assert.equal(metrics.totalBiomass, 35);
});

test("ecosystemPressure averages count/carryingCapacity ratios, not a fixed placeholder number", () => {
  const populations = [
    createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 90 }),
    createPopulation({ populationId: "b", speciesId: "wolf", location: "forest", count: 5 }),
  ];
  const web = createFoodWeb([], []);
  const lowPressure = computeEcosystemMetrics({
    populations,
    resources: [],
    foodWeb: web,
    interactions: [],
    carryingCapacityByPopulation: { a: 1000, b: 1000 },
  });
  const highPressure = computeEcosystemMetrics({
    populations,
    resources: [],
    foodWeb: web,
    interactions: [],
    carryingCapacityByPopulation: { a: 100, b: 5 },
  });
  assert.notEqual(lowPressure.ecosystemPressure, highPressure.ecosystemPressure);
  assert.ok(highPressure.ecosystemPressure > lowPressure.ecosystemPressure);
});

test("predatorPreyBalance uses predation interactions to classify predator vs prey biomass", () => {
  const populations = [
    createPopulation({ populationId: "wolf", speciesId: "wolf", location: "forest", count: 10 }),
    createPopulation({ populationId: "deer", speciesId: "deer", location: "forest", count: 100 }),
  ];
  const interactions = [{ interactionId: "i1", type: "predation" as const, sourceId: "wolf", targetId: "deer", strength: 0.3 }];
  const web = createFoodWeb([], []);
  const metrics = computeEcosystemMetrics({ populations, resources: [], foodWeb: web, interactions, carryingCapacityByPopulation: {} });
  assert.ok(Math.abs(metrics.predatorPreyBalance - 0.1) < 1e-9);
});

test("metrics are entirely empty/neutral for an empty ecosystem, never NaN", () => {
  const web = createFoodWeb([], []);
  const metrics = computeEcosystemMetrics({ populations: [], resources: [], foodWeb: web, interactions: [], carryingCapacityByPopulation: {} });
  for (const value of Object.values(metrics)) {
    assert.ok(Number.isFinite(value), `expected finite metric, got ${value}`);
  }
});

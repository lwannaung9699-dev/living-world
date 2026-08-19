import { test } from "node:test";
import assert from "node:assert/strict";
import { updatePopulation, createPopulation } from "../../ecology";
import { RngStreamRegistry } from "../../core/rng/rngStreamRegistry";

function rngFor(seed: string) {
  return RngStreamRegistry.create(seed).fork("test");
}

test("a population well below carrying capacity, in a suitable environment, grows", () => {
  const population = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 20, birthRate: 0.3, deathRate: 0.05 });
  const result = updatePopulation(
    {
      population,
      carryingCapacity: 1000,
      environmentSuitability: 1,
      competitionPressure: 0,
      predationLosses: 0,
      diseaseMortalityFraction: 0,
      energyGainedPerCapita: 0,
    },
    rngFor("growth-test"),
  );
  assert.ok(result.population.count > population.count, `expected growth, got ${result.population.count}`);
});

test("a population above carrying capacity declines", () => {
  const population = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 500, birthRate: 0.1, deathRate: 0.05 });
  const result = updatePopulation(
    {
      population,
      carryingCapacity: 100,
      environmentSuitability: 1,
      competitionPressure: 0,
      predationLosses: 0,
      diseaseMortalityFraction: 0,
      energyGainedPerCapita: 0,
    },
    rngFor("decline-test"),
  );
  assert.ok(result.population.count < population.count, `expected decline, got ${result.population.count}`);
});

test("predation losses directly reduce next-tick count beyond natural mortality", () => {
  const population = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 100, birthRate: 0.05, deathRate: 0.02 });
  const withoutPredation = updatePopulation(
    { population, carryingCapacity: 200, environmentSuitability: 1, competitionPressure: 0, predationLosses: 0, diseaseMortalityFraction: 0, energyGainedPerCapita: 0 },
    rngFor("predation-a"),
  );
  const withPredation = updatePopulation(
    { population, carryingCapacity: 200, environmentSuitability: 1, competitionPressure: 0, predationLosses: 30, diseaseMortalityFraction: 0, energyGainedPerCapita: 0 },
    rngFor("predation-a"),
  );
  assert.ok(withPredation.population.count < withoutPredation.population.count);
  assert.ok(withPredation.deaths >= 30);
});

test("a population at zero count stays at zero and produces no births", () => {
  const population = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 0 });
  const result = updatePopulation(
    { population, carryingCapacity: 100, environmentSuitability: 1, competitionPressure: 0, predationLosses: 0, diseaseMortalityFraction: 0, energyGainedPerCapita: 0 },
    rngFor("zero-test"),
  );
  assert.equal(result.population.count, 0);
  assert.equal(result.births, 0);
});

test("updatePopulation is deterministic given the same rng state", () => {
  const population = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 40, birthRate: 0.2, deathRate: 0.05 });
  const inputs = { population, carryingCapacity: 100, environmentSuitability: 0.8, competitionPressure: 0.1, predationLosses: 2, diseaseMortalityFraction: 0.01, energyGainedPerCapita: 0.1 };
  const a = updatePopulation(inputs, rngFor("determinism-check"));
  const b = updatePopulation(inputs, rngFor("determinism-check"));
  assert.deepEqual(a, b);
});

test("count never goes negative even under extreme combined mortality", () => {
  const population = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 10, deathRate: 0.9 });
  const result = updatePopulation(
    { population, carryingCapacity: 1, environmentSuitability: 0, competitionPressure: 1, predationLosses: 50, diseaseMortalityFraction: 1, energyGainedPerCapita: 0 },
    rngFor("extreme-mortality"),
  );
  assert.ok(result.population.count >= 0);
});

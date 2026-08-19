import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateMigrationPressure, createPopulation, DEFAULT_ECOLOGICAL_ENVIRONMENT, EcologicalNiche } from "../../ecology";

const niche: EcologicalNiche = {
  speciesId: "deer",
  temperatureRange: [5, 25],
  humidityRange: [0.3, 0.8],
  waterRequirement: 0.5,
  foodRequirements: ["plant"],
  habitatRequirements: ["forest"],
};

test("high population density relative to carrying capacity raises migration pressure", () => {
  const population = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 190 });
  const proposal = evaluateMigrationPressure({
    population,
    niche,
    environment: { ...DEFAULT_ECOLOGICAL_ENVIRONMENT, temperature: 15, humidity: 0.5, waterAvailability: 1, habitatQuality: 1 },
    carryingCapacity: 100,
    predationPressure: 0,
  });
  assert.ok(proposal.pressure > 0.1, `expected elevated pressure, got ${proposal.pressure}`);
  assert.ok(proposal.reasons.includes("high_population_density"));
});

test("a population well within capacity, in a suitable environment, has low migration pressure", () => {
  const population = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 10 });
  const proposal = evaluateMigrationPressure({
    population,
    niche,
    environment: { ...DEFAULT_ECOLOGICAL_ENVIRONMENT, temperature: 15, humidity: 0.5, waterAvailability: 1, habitatQuality: 1 },
    carryingCapacity: 100,
    predationPressure: 0,
  });
  assert.ok(proposal.pressure < 0.2, `expected low pressure, got ${proposal.pressure}`);
});

test("water scarcity relative to the niche's requirement is flagged as a reason", () => {
  const population = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 10 });
  const proposal = evaluateMigrationPressure({
    population,
    niche,
    environment: { ...DEFAULT_ECOLOGICAL_ENVIRONMENT, temperature: 15, humidity: 0.5, waterAvailability: 0.05, habitatQuality: 1 },
    carryingCapacity: 100,
    predationPressure: 0,
  });
  assert.ok(proposal.reasons.includes("water_scarcity"));
});

test("high predation pressure is flagged as a reason and increases pressure", () => {
  const population = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 10 });
  const environment = { ...DEFAULT_ECOLOGICAL_ENVIRONMENT, temperature: 15, humidity: 0.5, waterAvailability: 1, habitatQuality: 1 };
  const low = evaluateMigrationPressure({ population, niche, environment, carryingCapacity: 100, predationPressure: 0 });
  const high = evaluateMigrationPressure({ population, niche, environment, carryingCapacity: 100, predationPressure: 0.9 });
  assert.ok(high.pressure > low.pressure);
  assert.ok(high.reasons.includes("predation_pressure"));
});

test("proposedFraction respects the population's own migrationRate", () => {
  const sedentary = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 190, migrationRate: 0.01 });
  const mobile = createPopulation({ populationId: "b", speciesId: "deer", location: "meadow", count: 190, migrationRate: 0.5 });
  const environment = { ...DEFAULT_ECOLOGICAL_ENVIRONMENT, temperature: 15, humidity: 0.5, waterAvailability: 1, habitatQuality: 1 };
  const sedentaryProposal = evaluateMigrationPressure({ population: sedentary, niche, environment, carryingCapacity: 100, predationPressure: 0 });
  const mobileProposal = evaluateMigrationPressure({ population: mobile, niche, environment, carryingCapacity: 100, predationPressure: 0 });
  assert.ok(mobileProposal.proposedFraction > sedentaryProposal.proposedFraction);
});

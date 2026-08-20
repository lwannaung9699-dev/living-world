import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCompetitionPressure, createPopulation } from "../../ecology";

test("intraspecific pressure rises as a population approaches its own carrying capacity", () => {
  const population = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 90 });
  const result = computeCompetitionPressure({ population, carryingCapacity: 100, competitors: [] });
  assert.ok(result.intraspecificPressure > 0.8, `expected high pressure, got ${result.intraspecificPressure}`);
});

test("intraspecific pressure is low when the population is far below carrying capacity", () => {
  const population = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 5 });
  const result = computeCompetitionPressure({ population, carryingCapacity: 1000, competitors: [] });
  assert.ok(result.intraspecificPressure < 0.1);
});

test("interspecific pressure grows with overlap-weighted density of competing species", () => {
  const population = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 10 });
  const rival = createPopulation({ populationId: "b", speciesId: "elk", location: "meadow", count: 200 });

  const noOverlap = computeCompetitionPressure({
    population,
    carryingCapacity: 100,
    competitors: [{ population: rival, overlap: 0 }],
  });
  const highOverlap = computeCompetitionPressure({
    population,
    carryingCapacity: 100,
    competitors: [{ population: rival, overlap: 1 }],
  });
  assert.ok(highOverlap.interspecificPressure > noOverlap.interspecificPressure);
});

test("members of the same species in the competitors list do not count toward interspecific pressure", () => {
  const population = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 10 });
  const sameSpecies = createPopulation({ populationId: "b", speciesId: "deer", location: "meadow", count: 200 });
  const result = computeCompetitionPressure({
    population,
    carryingCapacity: 100,
    competitors: [{ population: sameSpecies, overlap: 1 }],
  });
  assert.equal(result.interspecificPressure, 0);
});

test("totalPressure combines intraspecific and interspecific pressure without exceeding 1", () => {
  const population = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 95 });
  const rival = createPopulation({ populationId: "b", speciesId: "elk", location: "meadow", count: 500 });
  const result = computeCompetitionPressure({
    population,
    carryingCapacity: 100,
    competitors: [{ population: rival, overlap: 1 }],
  });
  assert.ok(result.totalPressure <= 1);
  assert.ok(result.totalPressure >= result.intraspecificPressure);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSelectionFeedback, createPopulation } from "../../ecology";

test("a population that grew scores a fitness signal above 0.5", () => {
  const previous = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 100 });
  const next = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 120 });
  const signal = computeSelectionFeedback({ previousPopulation: previous, nextPopulation: next, environmentSuitability: 0.8, tick: 5 });
  assert.ok(signal.fitnessSignal > 0.5);
  assert.ok(signal.realizedGrowthRate > 0);
});

test("a population that declined scores a fitness signal below 0.5", () => {
  const previous = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 100 });
  const next = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 60 });
  const signal = computeSelectionFeedback({ previousPopulation: previous, nextPopulation: next, environmentSuitability: 0.3, tick: 5 });
  assert.ok(signal.fitnessSignal < 0.5);
  assert.ok(signal.realizedGrowthRate < 0);
});

test("a population that held steady scores near 0.5", () => {
  const previous = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 100 });
  const next = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 100 });
  const signal = computeSelectionFeedback({ previousPopulation: previous, nextPopulation: next, environmentSuitability: 1, tick: 5 });
  assert.equal(signal.fitnessSignal, 0.5);
});

test("fitnessSignal is always clamped within [0, 1] even for extreme growth/decline", () => {
  const previous = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 10 });
  const boomed = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 10000 });
  const crashed = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 0 });
  const boomSignal = computeSelectionFeedback({ previousPopulation: previous, nextPopulation: boomed, environmentSuitability: 1, tick: 1 });
  const crashSignal = computeSelectionFeedback({ previousPopulation: previous, nextPopulation: crashed, environmentSuitability: 0, tick: 1 });
  assert.equal(boomSignal.fitnessSignal, 1);
  assert.equal(crashSignal.fitnessSignal, 0);
});

test("the signal carries populationId, speciesId, and tick through unchanged, for Team 04 to key on", () => {
  const previous = createPopulation({ populationId: "wolf-7", speciesId: "wolf", location: "forest", count: 5 });
  const next = createPopulation({ populationId: "wolf-7", speciesId: "wolf", location: "forest", count: 6 });
  const signal = computeSelectionFeedback({ previousPopulation: previous, nextPopulation: next, environmentSuitability: 0.6, tick: 42 });
  assert.equal(signal.populationId, "wolf-7");
  assert.equal(signal.speciesId, "wolf");
  assert.equal(signal.tick, 42);
});

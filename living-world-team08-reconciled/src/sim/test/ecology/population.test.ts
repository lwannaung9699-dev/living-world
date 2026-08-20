import { test } from "node:test";
import assert from "node:assert/strict";
import { createPopulation, validatePopulation, isExtinct, clampPopulationVitals } from "../../ecology";
import { InvalidStateError } from "../../core/errors";

test("createPopulation builds a valid population with sensible defaults", () => {
  const population = createPopulation({
    populationId: "deer-1",
    speciesId: "deer",
    location: "meadow",
    count: 100,
  });
  assert.equal(population.count, 100);
  assert.equal(population.sexRatio, 0.5);
  assert.equal(population.health, 1);
  assert.equal(population.energy, 1);
  assert.equal(population.generation, 0);
  assert.doesNotThrow(() => validatePopulation(population));
});

test("createPopulation honors explicit overrides", () => {
  const population = createPopulation({
    populationId: "wolf-1",
    speciesId: "wolf",
    location: "forest",
    count: 12,
    birthRate: 0.2,
    deathRate: 0.08,
    migrationRate: 0.1,
    ageStructure: { juvenile: 4, adult: 8 },
  });
  assert.equal(population.birthRate, 0.2);
  assert.equal(population.deathRate, 0.08);
  assert.deepEqual(population.ageStructure, { juvenile: 4, adult: 8 });
});

test("validatePopulation rejects a negative count", () => {
  assert.throws(
    () =>
      validatePopulation({
        populationId: "x",
        speciesId: "y",
        location: "z",
        count: -1,
        ageStructure: {},
        sexRatio: 0.5,
        averageTraits: {},
        traitVariance: {},
        health: 1,
        energy: 1,
        birthRate: 0.1,
        deathRate: 0.1,
        migrationRate: 0.1,
        generation: 0,
      }),
    InvalidStateError,
  );
});

test("validatePopulation rejects an out-of-range health value", () => {
  const population = createPopulation({ populationId: "a", speciesId: "b", location: "c", count: 5 });
  assert.throws(() => validatePopulation({ ...population, health: 1.5 }), InvalidStateError);
});

test("isExtinct is true only at zero count", () => {
  const population = createPopulation({ populationId: "a", speciesId: "b", location: "c", count: 0 });
  assert.equal(isExtinct(population), true);
  assert.equal(isExtinct({ ...population, count: 1 }), false);
});

test("clampPopulationVitals clamps count/health/energy into valid ranges", () => {
  const population = createPopulation({ populationId: "a", speciesId: "b", location: "c", count: 5 });
  const clamped = clampPopulationVitals({ ...population, count: -3, health: 1.4, energy: -0.2 });
  assert.equal(clamped.count, 0);
  assert.equal(clamped.health, 1);
  assert.equal(clamped.energy, 0);
});

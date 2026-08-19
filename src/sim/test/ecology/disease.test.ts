import { test } from "node:test";
import assert from "node:assert/strict";
import { updateDiseasePressure, diseaseMortalityFraction, validateDiseaseState, createPopulation, DEFAULT_ECOLOGICAL_ENVIRONMENT, DiseaseState } from "../../ecology";
import { InvalidStateError } from "../../core/errors";

function disease(overrides: Partial<DiseaseState> = {}): DiseaseState {
  return {
    diseaseId: "flu",
    populationId: "deer-1",
    infectionPressure: 0.1,
    transmissionRate: 0.3,
    resistance: 0.2,
    mortalityRate: 0.1,
    recoveryRate: 0.1,
    ...overrides,
  };
}

test("validateDiseaseState rejects out-of-range fields", () => {
  assert.throws(() => validateDiseaseState(disease({ infectionPressure: 1.5 })), InvalidStateError);
});

test("infection pressure rises with higher population density", () => {
  const lowDensity = createPopulation({ populationId: "deer-1", speciesId: "deer", location: "meadow", count: 5 });
  const highDensity = createPopulation({ populationId: "deer-1", speciesId: "deer", location: "meadow", count: 500 });
  const env = DEFAULT_ECOLOGICAL_ENVIRONMENT;
  const afterLow = updateDiseasePressure(disease(), lowDensity, env);
  const afterHigh = updateDiseasePressure(disease(), highDensity, env);
  assert.ok(afterHigh.infectionPressure > afterLow.infectionPressure);
});

test("higher resistance suppresses infection spread", () => {
  const population = createPopulation({ populationId: "deer-1", speciesId: "deer", location: "meadow", count: 200 });
  const env = DEFAULT_ECOLOGICAL_ENVIRONMENT;
  const susceptible = updateDiseasePressure(disease({ resistance: 0 }), population, env);
  const resistant = updateDiseasePressure(disease({ resistance: 0.9 }), population, env);
  assert.ok(resistant.infectionPressure < susceptible.infectionPressure);
});

test("recovery pulls infection pressure back down over time with no reinforcing density", () => {
  const population = createPopulation({ populationId: "deer-1", speciesId: "deer", location: "meadow", count: 1 });
  const env = DEFAULT_ECOLOGICAL_ENVIRONMENT;
  let state = disease({ infectionPressure: 0.9, transmissionRate: 0, recoveryRate: 0.5 });
  state = updateDiseasePressure(state, population, env);
  assert.ok(state.infectionPressure < 0.9);
});

test("diseaseMortalityFraction scales with infection pressure and mortality rate, reduced by resistance", () => {
  const mild = diseaseMortalityFraction(disease({ infectionPressure: 0.2, mortalityRate: 0.1, resistance: 0 }));
  const severe = diseaseMortalityFraction(disease({ infectionPressure: 0.9, mortalityRate: 0.5, resistance: 0 }));
  assert.ok(severe > mild);
  const withResistance = diseaseMortalityFraction(disease({ infectionPressure: 0.9, mortalityRate: 0.5, resistance: 0.8 }));
  assert.ok(withResistance < severe);
});

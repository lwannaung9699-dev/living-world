import { test } from "node:test";
import assert from "node:assert/strict";
import { nicheSuitability, validateNiche, DEFAULT_ECOLOGICAL_ENVIRONMENT, EcologicalNiche } from "../../ecology";
import { InvalidStateError } from "../../core/errors";

const niche: EcologicalNiche = {
  speciesId: "deer",
  temperatureRange: [5, 25],
  humidityRange: [0.3, 0.8],
  waterRequirement: 0.3,
  foodRequirements: ["plant"],
  habitatRequirements: ["forest"],
};

test("nicheSuitability is high at the midpoint of the niche's ranges", () => {
  const environment = { ...DEFAULT_ECOLOGICAL_ENVIRONMENT, temperature: 15, humidity: 0.55, waterAvailability: 1, habitatQuality: 1 };
  const suitability = nicheSuitability(niche, environment);
  assert.ok(suitability > 0.9, `expected high suitability, got ${suitability}`);
});

test("nicheSuitability drops for temperatures well outside the range", () => {
  const environment = { ...DEFAULT_ECOLOGICAL_ENVIRONMENT, temperature: -40, humidity: 0.55, waterAvailability: 1, habitatQuality: 1 };
  const suitability = nicheSuitability(niche, environment);
  assert.ok(suitability < 0.2, `expected low suitability, got ${suitability}`);
});

test("nicheSuitability is 0..1 across a range of arbitrary environments", () => {
  const samples = [-50, -10, 0, 10, 20, 30, 60];
  for (const temperature of samples) {
    const suitability = nicheSuitability(niche, { ...DEFAULT_ECOLOGICAL_ENVIRONMENT, temperature });
    assert.ok(suitability >= 0 && suitability <= 1, `suitability out of range at temp=${temperature}: ${suitability}`);
  }
});

test("validateNiche rejects an inverted temperature range", () => {
  assert.throws(() => validateNiche({ ...niche, temperatureRange: [30, 10] }), InvalidStateError);
});

test("validateNiche accepts a well-formed niche", () => {
  assert.doesNotThrow(() => validateNiche(niche));
});

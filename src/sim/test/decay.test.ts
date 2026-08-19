import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyDecay,
  computeDecayRate,
  createInitialDecayState,
  createDefaultMaterialRegistry,
  NEUTRAL_MATERIAL_ENVIRONMENT,
  InvalidStateError,
} from "../index";

const materials = createDefaultMaterialRegistry();
const wood = materials.get("oak_wood");
const stone = materials.get("granite");

test("createInitialDecayState starts fully intact", () => {
  const state = createInitialDecayState();
  assert.equal(state.integrity, 1);
  assert.equal(state.elapsedSeconds, 0);
});

test("applyDecay reduces integrity over simulated time under neutral conditions", () => {
  const start = createInitialDecayState();
  const oneWeekLater = applyDecay(start, wood, NEUTRAL_MATERIAL_ENVIRONMENT, 7 * 86_400);
  assert.ok(oneWeekLater.integrity < 1);
  assert.equal(oneWeekLater.elapsedSeconds, 7 * 86_400);
});

test("applyDecay is deterministic: identical inputs always produce an identical result", () => {
  const start = createInitialDecayState();
  const a = applyDecay(start, wood, { humidity: 0.8, waterExposure: 0.5, temperatureC: 35 }, 10_000);
  const b = applyDecay(start, wood, { humidity: 0.8, waterExposure: 0.5, temperatureC: 35 }, 10_000);
  assert.deepEqual(a, b);
});

test("higher humidity/water exposure accelerates decay relative to a dry environment", () => {
  const start = createInitialDecayState();
  const dry = applyDecay(start, wood, { humidity: 0.1, waterExposure: 0 }, 30 * 86_400);
  const wet = applyDecay(start, wood, { humidity: 0.9, waterExposure: 0.9 }, 30 * 86_400);
  assert.ok(wet.integrity < dry.integrity);
});

test("stone decays far slower than wood under identical conditions", () => {
  const start = createInitialDecayState();
  const woodDecayed = applyDecay(start, wood, NEUTRAL_MATERIAL_ENVIRONMENT, 365 * 86_400);
  const stoneDecayed = applyDecay(start, stone, NEUTRAL_MATERIAL_ENVIRONMENT, 365 * 86_400);
  assert.ok(stoneDecayed.integrity > woodDecayed.integrity);
});

test("existing damage accelerates further decay", () => {
  const start = createInitialDecayState();
  const undamaged = computeDecayRate(wood, NEUTRAL_MATERIAL_ENVIRONMENT, 0);
  const damaged = computeDecayRate(wood, NEUTRAL_MATERIAL_ENVIRONMENT, 0.8);
  assert.ok(damaged > undamaged);
  void start;
});

test("applyDecay clamps integrity at 0 rather than going negative", () => {
  const start = createInitialDecayState();
  const farFuture = applyDecay(start, wood, { humidity: 1, waterExposure: 1, temperatureC: 500 }, 1000 * 365 * 86_400);
  assert.equal(farFuture.integrity, 0);
});

test("applyDecay rejects a negative deltaSeconds", () => {
  assert.throws(() => applyDecay(createInitialDecayState(), wood, {}, -1), InvalidStateError);
});

test("applyDecay accumulates elapsedSeconds across repeated calls, independent of chunking", () => {
  const start = createInitialDecayState();
  const inOneStep = applyDecay(start, wood, NEUTRAL_MATERIAL_ENVIRONMENT, 1000);
  const inTwoSteps = applyDecay(applyDecay(start, wood, NEUTRAL_MATERIAL_ENVIRONMENT, 400), wood, NEUTRAL_MATERIAL_ENVIRONMENT, 600);
  assert.equal(inOneStep.elapsedSeconds, inTwoSteps.elapsedSeconds);
  // Rate is state-independent (a pure function of material+environment+damage), so chunking never changes the result.
  assert.ok(Math.abs(inOneStep.integrity - inTwoSteps.integrity) < 1e-9);
});

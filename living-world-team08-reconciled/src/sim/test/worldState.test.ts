import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createWorldSeed,
  createInitialWorldState,
  validateWorldState,
  InvalidStateError,
} from "../index";

test("createInitialWorldState builds a valid tick-zero state", () => {
  const seed = createWorldSeed({ seed: "state-test" });
  const state = createInitialWorldState(seed);
  assert.equal(state.tick, 0);
  assert.equal(state.simulationTime.tick, 0);
  assert.equal(state.simulationTime.simulatedSeconds, 0);
  assert.deepEqual(state.rng, {});
  assert.deepEqual(state.modules, {});
  assert.doesNotThrow(() => validateWorldState(state));
});

test("two initial states built from the same seed are deeply equal", () => {
  const seed = createWorldSeed({ seed: "state-equal", createdAt: "2024-01-01T00:00:00.000Z" });
  const a = createInitialWorldState(seed);
  const b = createInitialWorldState(seed);
  assert.deepEqual(a, b);
});

test("validateWorldState rejects a negative tick", () => {
  const seed = createWorldSeed({ seed: "bad-tick" });
  const state = createInitialWorldState(seed);
  assert.throws(() => validateWorldState({ ...state, tick: -1 }), InvalidStateError);
});

test("validateWorldState rejects a non-integer tick", () => {
  const seed = createWorldSeed({ seed: "bad-tick-2" });
  const state = createInitialWorldState(seed);
  assert.throws(() => validateWorldState({ ...state, tick: 1.5 }), InvalidStateError);
});

test("validateWorldState rejects a missing modules field", () => {
  const seed = createWorldSeed({ seed: "bad-modules" });
  const state = createInitialWorldState(seed);
  const broken: Record<string, unknown> = { ...state };
  delete broken.modules;
  assert.throws(() => validateWorldState(broken), InvalidStateError);
});

test("validateWorldState rejects an invalid embedded seed", () => {
  const seed = createWorldSeed({ seed: "bad-seed-embed" });
  const state = createInitialWorldState(seed);
  assert.throws(() => validateWorldState({ ...state, seed: { seed: "" } }));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createWorldSeed,
  createInitialWorldState,
  tick,
  tickN,
  DEFAULT_TICK_DURATION_SECONDS,
} from "../index";
import type { SubsystemTickFn } from "../index";

test("tick() advances the tick counter and simulation time deterministically", () => {
  const seed = createWorldSeed({ seed: "tick-basic" });
  const state0 = createInitialWorldState(seed);
  const state1 = tick(state0);
  assert.equal(state1.tick, 1);
  assert.equal(state1.simulationTime.tick, 1);
  assert.equal(state1.simulationTime.simulatedSeconds, DEFAULT_TICK_DURATION_SECONDS);
});

test("tickN(state, N) equals calling tick() N times", () => {
  const seed = createWorldSeed({ seed: "tick-n" });
  const state0 = createInitialWorldState(seed);
  let manual = state0;
  for (let i = 0; i < 7; i++) manual = tick(manual);
  const bulk = tickN(state0, 7);
  assert.equal(manual.tick, bulk.tick);
  assert.equal(manual.simulationTime.simulatedSeconds, bulk.simulationTime.simulatedSeconds);
});

test("tickN rejects a negative tick count", () => {
  const seed = createWorldSeed({ seed: "tick-negative" });
  const state0 = createInitialWorldState(seed);
  assert.throws(() => tickN(state0, -1));
});

test("subsystems registered on SimulationContext run every tick and can read/write their own module namespace", () => {
  const seed = createWorldSeed({ seed: "subsystem-hook" });
  const state0 = createInitialWorldState(seed);

  const countingSubsystem: SubsystemTickFn = (state) => {
    const previous = (state.modules.demoCounter as number | undefined) ?? 0;
    return { ...state, modules: { ...state.modules, demoCounter: previous + 1 } };
  };

  const result = tickN(state0, 5, { subsystems: [countingSubsystem] });
  assert.equal(result.modules.demoCounter, 5);
  assert.equal(result.tick, 5);
});

test("subsystem tick functions receive a working RngStreamRegistry wired to the world's own rng state", () => {
  const seed = createWorldSeed({ seed: "subsystem-rng" });
  const state0 = createInitialWorldState(seed);

  const rollingSubsystem: SubsystemTickFn = (state, rng) => {
    const stream = rng.fork("demo/rolls");
    const roll = stream.nextInt(1, 6);
    const rolls = (state.modules.rolls as number[] | undefined) ?? [];
    return { ...state, modules: { ...state.modules, rolls: [...rolls, roll] } };
  };

  const resultA = tickN(state0, 5, { subsystems: [rollingSubsystem] });
  const resultB = tickN(state0, 5, { subsystems: [rollingSubsystem] });

  assert.deepEqual(resultA.modules.rolls, resultB.modules.rolls);
  assert.equal((resultA.modules.rolls as number[]).length, 5);
});

test("simulation time is independent of how ticks are chunked (no real-time/frame-rate dependency)", () => {
  const seed = createWorldSeed({ seed: "frame-independence" });
  const state0 = createInitialWorldState(seed);

  const allAtOnce = tickN(state0, 10);

  let chunked = state0;
  chunked = tickN(chunked, 3);
  chunked = tickN(chunked, 4);
  chunked = tickN(chunked, 3);

  assert.equal(allAtOnce.tick, chunked.tick);
  assert.equal(allAtOnce.simulationTime.simulatedSeconds, chunked.simulationTime.simulatedSeconds);
});

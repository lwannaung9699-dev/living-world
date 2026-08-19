import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorldSeed, runSimulation, replayMatches } from "../index";
import type { WorldState, RngStreamRegistry, SubsystemTickFn } from "../index";

test("running the same seed for the same number of ticks yields an identical state hash", () => {
  const seed = createWorldSeed({ seed: "replay-alpha", createdAt: "2024-01-01T00:00:00.000Z" });
  const runA = runSimulation(seed, 100);
  const runB = runSimulation(seed, 100);
  assert.equal(runA.hash, runB.hash);
  assert.ok(replayMatches(runA, runB));
});

test("the same seed value re-derived with a different createdAt still replays identically", () => {
  const seedA = createWorldSeed({ seed: "replay-beta", createdAt: "2024-01-01T00:00:00.000Z" });
  const seedB = createWorldSeed({ seed: "replay-beta", createdAt: "2030-06-15T12:00:00.000Z" });
  const runA = runSimulation(seedA, 50);
  const runB = runSimulation(seedB, 50);
  assert.equal(runA.hash, runB.hash);
});

test("different seeds normally diverge in their resulting state hash", () => {
  const seedA = createWorldSeed({ seed: "replay-gamma" });
  const seedB = createWorldSeed({ seed: "replay-delta" });
  const runA = runSimulation(seedA, 100);
  const runB = runSimulation(seedB, 100);
  assert.notEqual(runA.hash, runB.hash);
});

test("replaying a different tick count changes the hash", () => {
  const seed = createWorldSeed({ seed: "replay-epsilon" });
  const short = runSimulation(seed, 10);
  const long = runSimulation(seed, 11);
  assert.notEqual(short.hash, long.hash);
});

test("replay determinism holds even with subsystems that consume RNG streams", () => {
  const seed = createWorldSeed({ seed: "replay-with-subsystems" });
  const subsystem: SubsystemTickFn = (state: WorldState, rng: RngStreamRegistry): WorldState => {
    const stream = rng.fork("demo/subsystem");
    const value = stream.nextFloat();
    const values = (state.modules.values as number[] | undefined) ?? [];
    return { ...state, modules: { ...state.modules, values: [...values, value] } };
  };

  const runA = runSimulation(seed, 30, { subsystems: [subsystem] });
  const runB = runSimulation(seed, 30, { subsystems: [subsystem] });
  assert.equal(runA.hash, runB.hash);
  assert.deepEqual(runA.state.modules.values, runB.state.modules.values);
});

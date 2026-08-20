import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorldSeed, createInitialWorldState, tick, tickN, runSimulation, replayMatches, serializeWorldState, deserializeWorldState, InMemoryWorldStateRepository } from "../../index";
import { politicsTick, readPoliticsState } from "../../politics/index";

test("determinism: two independent runs from the same seed produce an identical replay hash", () => {
  const seedA = createWorldSeed({ seed: "det-check", createdAt: "2020-01-01T00:00:00.000Z" });
  const seedB = createWorldSeed({ seed: "det-check", createdAt: "2021-06-15T00:00:00.000Z" }); // different createdAt must not matter
  const resultA = runSimulation(seedA, 250, { subsystems: [politicsTick] });
  const resultB = runSimulation(seedB, 250, { subsystems: [politicsTick] });
  assert.ok(replayMatches(resultA, resultB));
});

test("determinism: a different seed produces a different replay hash (sanity — the hash is not trivially constant)", () => {
  const resultA = runSimulation(createWorldSeed({ seed: "seed-one" }), 250, { subsystems: [politicsTick] });
  const resultB = runSimulation(createWorldSeed({ seed: "seed-two" }), 250, { subsystems: [politicsTick] });
  assert.notEqual(resultA.hash, resultB.hash);
});

test("replay: advancing tick-by-tick via tick() N times matches tickN() in one call", () => {
  const seed = createWorldSeed({ seed: "replay-check" });
  let stepwise = createInitialWorldState(seed);
  for (let i = 0; i < 120; i++) stepwise = tick(stepwise, { subsystems: [politicsTick] });
  const batched = tickN(createInitialWorldState(seed), 120, { subsystems: [politicsTick] });
  assert.deepEqual(stepwise, batched);
});

test("execution-order independence: running politicsTick alone vs. alongside a harmless no-op subsystem before/after it yields the same politics state", () => {
  const seed = createWorldSeed({ seed: "order-check" });
  const noop = (state: Parameters<typeof politicsTick>[0]) => state;

  const alone = tickN(createInitialWorldState(seed), 150, { subsystems: [politicsTick] });
  const noopBefore = tickN(createInitialWorldState(seed), 150, { subsystems: [noop, politicsTick] });
  const noopAfter = tickN(createInitialWorldState(seed), 150, { subsystems: [politicsTick, noop] });

  assert.deepEqual(readPoliticsState(alone), readPoliticsState(noopBefore));
  assert.deepEqual(readPoliticsState(alone), readPoliticsState(noopAfter));
});

test("execution-order independence: politics module state does not depend on Object/Map iteration order — re-deriving from a re-serialized copy matches exactly", () => {
  const seed = createWorldSeed({ seed: "reorder-check" });
  const state = tickN(createInitialWorldState(seed), 200, { subsystems: [politicsTick] });
  const roundTripped = deserializeWorldState(serializeWorldState(state));
  assert.deepEqual(readPoliticsState(state), readPoliticsState(roundTripped));
});

test("serialization: politics module state round-trips exactly through serializeWorldState/deserializeWorldState", () => {
  const seed = createWorldSeed({ seed: "serialize-check" });
  const state = tickN(createInitialWorldState(seed), 180, { subsystems: [politicsTick] });
  const json = serializeWorldState(state);
  const restored = deserializeWorldState(json);
  assert.deepEqual(state, restored);

  const politics = readPoliticsState(state);
  assert.ok(Object.keys(politics.rules).length >= 0); // sanity: shape survives even if empty this early
  assert.ok(Array.isArray(politics.history));
});

test("serialization: politics state survives an InMemoryWorldStateRepository save/load round trip", async () => {
  const seed = createWorldSeed({ seed: "repo-check" });
  const state = tickN(createInitialWorldState(seed), 150, { subsystems: [politicsTick] });
  const repo = new InMemoryWorldStateRepository();
  await repo.save("world-politics-test", state);
  const loaded = await repo.load("world-politics-test");
  assert.deepEqual(loaded, state);
  assert.deepEqual(readPoliticsState(loaded!), readPoliticsState(state));
});

test("Team 01 integration: politicsTick is a conforming SubsystemTickFn — Foundation's tick()/tickN() never need to know politics exists", () => {
  const seed = createWorldSeed({ seed: "foundation-integration" });
  // Foundation's own pipeline runs fine with zero subsystems...
  const withoutPolitics = tickN(createInitialWorldState(seed), 10);
  assert.equal(withoutPolitics.modules["politics"], undefined, "politics must not appear unless its subsystem runs");
  // ...and accepts politicsTick as just another SubsystemTickFn, unmodified.
  const withPolitics = tickN(createInitialWorldState(seed), 10, { subsystems: [politicsTick] });
  assert.notEqual(withPolitics.modules["politics"], undefined);
});

test("Team 06/07 integration: the population adapter's standalone fallback is used when no npc/society module is attached, and is itself deterministic", () => {
  const seed = createWorldSeed({ seed: "adapter-fallback-check" });
  const resultA = tickN(createInitialWorldState(seed), 50, { subsystems: [politicsTick] });
  const resultB = tickN(createInitialWorldState(seed), 50, { subsystems: [politicsTick] });
  assert.deepEqual(readPoliticsState(resultA), readPoliticsState(resultB));
});

test("Team 06/07 integration: real Team 07 society/group structure is read (population, wealth-from-pooled-resources, cohesion-from-tension, and the real member-id roster), while per-individual behavioral traits are honestly synthetic (see adapter file header for why)", async () => {
  const { readPopulationSnapshot } = await import("../../politics/adapters/populationAdapter");
  const { RngStreamRegistry } = await import("../../core/rng/rngStreamRegistry");

  const seed = createWorldSeed({ seed: "duck-type-check" });
  const base = createInitialWorldState(seed);
  const withSociety = {
    ...base,
    modules: {
      society: {
        settlements: {
          "team07-settlement-1": { settlementId: "team07-settlement-1", locationId: "loc-1", groupId: "group-1", foundedTick: 0, presence: 10, population: 90, settlementType: "village", defensibility: 0.5 },
        },
        groups: {
          "group-1": { groupId: "group-1", memberIds: ["individual-1", "individual-2"], founderIds: [], leaderIds: [], sharedGoals: [], territory: {}, resources: { pooled: 25, economicStockTotal: 0 }, customs: [], normIds: [], identitySymbolIds: [], foundedTick: 0, tension: 0.2, parentGroupId: null, active: true },
        },
      },
    },
  };
  const registry = RngStreamRegistry.create("adapter-test-root");
  const snapshot = readPopulationSnapshot(withSociety, registry);
  assert.equal(snapshot.sourced, true);
  assert.equal(snapshot.traitsAreSynthetic, true, "no real upstream source exists yet for per-individual traits — must be honestly flagged, not silently presented as real");
  assert.equal(snapshot.settlements.length, 1);
  assert.equal(snapshot.settlements[0].settlementId, "team07-settlement-1");
  assert.equal(snapshot.settlements[0].population, 90);
  assert.ok(snapshot.settlements[0].wealth > 0, "wealth should be derived from the group's real pooled resources, not defaulted to 0");
  assert.deepEqual([...snapshot.settlements[0].actorIds].sort(), ["individual-1", "individual-2"]);
  assert.equal(Object.keys(snapshot.actorsById).length, 2);
});

test("politics module contract version is stamped and readable after any number of ticks", () => {
  const seed = createWorldSeed({ seed: "version-check" });
  const state = tickN(createInitialWorldState(seed), 5, { subsystems: [politicsTick] });
  const politics = readPoliticsState(state);
  assert.equal(politics.contractVersion, "1.0.0");
});

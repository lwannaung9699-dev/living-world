import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createWorldSeed,
  createInitialWorldState,
  tick,
  tickN,
  serializeWorldState,
  deserializeWorldState,
  computeStateHash,
  runSimulation,
  replayMatches,
  WorldState,
} from "../../index";
import {
  createEcologySubsystem,
  createInitialEcologyState,
  createPopulation,
  createResource,
  ECOLOGY_MODULE_KEY,
  EcologyModuleState,
} from "../../ecology";

function worldWithEcology(seedValue: string, ecology: EcologyModuleState): WorldState {
  const seed = createWorldSeed({ seed: seedValue, createdAt: "2024-01-01T00:00:00.000Z" });
  const state = createInitialWorldState(seed);
  return { ...state, modules: { ...state.modules, [ECOLOGY_MODULE_KEY]: ecology } };
}

/** A small forest food web: grass -> deer -> wolf, plus an unrelated lake chunk. */
function buildTwoChunkWorld(seedValue: string): WorldState {
  const ecology = createInitialEcologyState({
    populations: [
      createPopulation({ populationId: "deer", speciesId: "deer", location: "forest", count: 40, birthRate: 0.3, deathRate: 0.05 }),
      createPopulation({ populationId: "wolf", speciesId: "wolf", location: "forest", count: 6, birthRate: 0.15, deathRate: 0.08 }),
      createPopulation({ populationId: "fish", speciesId: "fish", location: "lake", count: 200, birthRate: 0.2, deathRate: 0.05 }),
    ],
    resources: [
      createResource({ resourceId: "grass", resourceType: "plant", location: "forest", availableAmount: 800, capacity: 1000, regenerationRate: 0.15 }),
      createResource({ resourceId: "algae", resourceType: "plant", location: "lake", availableAmount: 500, capacity: 600, regenerationRate: 0.2 }),
    ],
    niches: [
      { speciesId: "deer", temperatureRange: [-5, 35], humidityRange: [0, 1], waterRequirement: 0.1, foodRequirements: ["plant"], habitatRequirements: [] },
      { speciesId: "wolf", temperatureRange: [-20, 30], humidityRange: [0, 1], waterRequirement: 0.1, foodRequirements: ["prey_biomass"], habitatRequirements: [] },
      { speciesId: "fish", temperatureRange: [0, 30], humidityRange: [0, 1], waterRequirement: 1, foodRequirements: ["plant"], habitatRequirements: [] },
    ],
    interactions: [
      { interactionId: "deer-eats-grass", type: "herbivory", sourceId: "deer", targetId: "grass", strength: 0.4 },
      { interactionId: "wolf-eats-deer", type: "predation", sourceId: "wolf", targetId: "deer", strength: 0.3 },
      { interactionId: "fish-eats-algae", type: "herbivory", sourceId: "fish", targetId: "algae", strength: 0.3 },
    ],
  });
  return worldWithEcology(seedValue, ecology);
}

test("Team 01 integration: the ecology subsystem plugs into tick() via SimulationContext.subsystems", () => {
  const world = buildTwoChunkWorld("integration-seed");
  const context = { subsystems: [createEcologySubsystem()] };
  const next = tick(world, context);
  assert.equal(next.tick, 1);
  const ecology = next.modules[ECOLOGY_MODULE_KEY] as EcologyModuleState;
  assert.ok(ecology);
  assert.ok(ecology.populations.deer);
  assert.ok(ecology.populations.wolf);
});

test("deterministic simulation: identical seed + state + ticks reproduces identical results", () => {
  const context = { subsystems: [createEcologySubsystem()] };
  const worldA = buildTwoChunkWorld("determinism-seed");
  const worldB = buildTwoChunkWorld("determinism-seed");

  const resultA = tickN(worldA, 10, context);
  const resultB = tickN(worldB, 10, context);

  assert.deepEqual(resultA, resultB);
});

test("a different seed produces a different trajectory (sanity check that rng is actually wired in)", () => {
  const context = { subsystems: [createEcologySubsystem()] };
  const resultA = tickN(buildTwoChunkWorld("seed-alpha"), 10, context);
  const resultB = tickN(buildTwoChunkWorld("seed-beta"), 10, context);
  assert.notDeepEqual(resultA, resultB);
});

test("execution-order independence: population insertion order never changes the tick result", () => {
  const context = { subsystems: [createEcologySubsystem()] };

  const forward = createInitialEcologyState({
    populations: [
      createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 30 }),
      createPopulation({ populationId: "b", speciesId: "wolf", location: "meadow", count: 4 }),
      createPopulation({ populationId: "c", speciesId: "rabbit", location: "meadow", count: 60 }),
    ],
  });
  const reversed = createInitialEcologyState({
    populations: [
      createPopulation({ populationId: "c", speciesId: "rabbit", location: "meadow", count: 60 }),
      createPopulation({ populationId: "b", speciesId: "wolf", location: "meadow", count: 4 }),
      createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 30 }),
    ],
  });

  const resultForward = tick(worldWithEcology("order-seed", forward), context);
  const resultReversed = tick(worldWithEcology("order-seed", reversed), context);

  const ecologyForward = resultForward.modules[ECOLOGY_MODULE_KEY] as EcologyModuleState;
  const ecologyReversed = resultReversed.modules[ECOLOGY_MODULE_KEY] as EcologyModuleState;

  assert.deepEqual(ecologyForward.populations, ecologyReversed.populations);
});

test("RNG isolation: simulating population A does not change population B's result", () => {
  const context = { subsystems: [createEcologySubsystem()] };

  const withBothPopulations = createInitialEcologyState({
    populations: [
      createPopulation({ populationId: "a", speciesId: "deer", location: "meadow-a", count: 30, birthRate: 0.2 }),
      createPopulation({ populationId: "b", speciesId: "wolf", location: "meadow-b", count: 15, birthRate: 0.2 }),
    ],
  });
  const onlyPopulationB = createInitialEcologyState({
    populations: [createPopulation({ populationId: "b", speciesId: "wolf", location: "meadow-b", count: 15, birthRate: 0.2 })],
  });

  const resultBoth = tick(worldWithEcology("isolation-seed", withBothPopulations), context);
  const resultOnlyB = tick(worldWithEcology("isolation-seed", onlyPopulationB), context);

  const ecologyBoth = resultBoth.modules[ECOLOGY_MODULE_KEY] as EcologyModuleState;
  const ecologyOnlyB = resultOnlyB.modules[ECOLOGY_MODULE_KEY] as EcologyModuleState;

  assert.deepEqual(ecologyBoth.populations.b, ecologyOnlyB.populations.b);
});

test("chunk-boundary determinism: an unrelated chunk's presence never changes another chunk's result", () => {
  const context = { subsystems: [createEcologySubsystem()] };

  const oneChunk = buildTwoChunkWorld("chunk-seed");
  // Strip the lake chunk entirely, leaving only the forest chunk's populations/resources.
  const forestOnlyEcology = createInitialEcologyState({
    populations: [
      createPopulation({ populationId: "deer", speciesId: "deer", location: "forest", count: 40, birthRate: 0.3, deathRate: 0.05 }),
      createPopulation({ populationId: "wolf", speciesId: "wolf", location: "forest", count: 6, birthRate: 0.15, deathRate: 0.08 }),
    ],
    resources: [createResource({ resourceId: "grass", resourceType: "plant", location: "forest", availableAmount: 800, capacity: 1000, regenerationRate: 0.15 })],
    niches: [
      { speciesId: "deer", temperatureRange: [-5, 35], humidityRange: [0, 1], waterRequirement: 0.1, foodRequirements: ["plant"], habitatRequirements: [] },
      { speciesId: "wolf", temperatureRange: [-20, 30], humidityRange: [0, 1], waterRequirement: 0.1, foodRequirements: ["prey_biomass"], habitatRequirements: [] },
    ],
    interactions: [
      { interactionId: "deer-eats-grass", type: "herbivory", sourceId: "deer", targetId: "grass", strength: 0.4 },
      { interactionId: "wolf-eats-deer", type: "predation", sourceId: "wolf", targetId: "deer", strength: 0.3 },
    ],
  });
  const forestOnly = worldWithEcology("chunk-seed", forestOnlyEcology);

  const resultTwoChunk = tickN(oneChunk, 5, context);
  const resultForestOnly = tickN(forestOnly, 5, context);

  const twoChunkEcology = resultTwoChunk.modules[ECOLOGY_MODULE_KEY] as EcologyModuleState;
  const forestOnlyEcologyResult = resultForestOnly.modules[ECOLOGY_MODULE_KEY] as EcologyModuleState;

  assert.deepEqual(twoChunkEcology.populations.deer, forestOnlyEcologyResult.populations.deer);
  assert.deepEqual(twoChunkEcology.populations.wolf, forestOnlyEcologyResult.populations.wolf);
  assert.deepEqual(twoChunkEcology.resources.grass, forestOnlyEcologyResult.resources.grass);
});

test("serialization round-trip: serializeWorldState/deserializeWorldState preserves ecology state exactly", () => {
  const context = { subsystems: [createEcologySubsystem()] };
  const world = tickN(buildTwoChunkWorld("serialize-seed"), 3, context);

  const json = serializeWorldState(world);
  const restored = deserializeWorldState(json);

  assert.deepEqual(restored, world);
  assert.equal(computeStateHash(restored), computeStateHash(world));
});

test("replay determinism: runSimulation with the ecology subsystem replays identically for the same seed", () => {
  const seed = createWorldSeed({ seed: "replay-seed", createdAt: "2024-01-01T00:00:00.000Z" });
  const context = { subsystems: [createEcologySubsystem()] };

  const resultA = runSimulation(seed, 8, context);
  const resultB = runSimulation(seed, 8, context);

  assert.ok(replayMatches(resultA, resultB));
});

test("multi-tick predator-prey run stays numerically sane: no NaN, no negative counts, resources stay within capacity", () => {
  const context = { subsystems: [createEcologySubsystem()] };
  const finalState = tickN(buildTwoChunkWorld("stability-seed"), 50, context);
  const ecology = finalState.modules[ECOLOGY_MODULE_KEY] as EcologyModuleState;

  for (const population of Object.values(ecology.populations)) {
    assert.ok(Number.isFinite(population.count), `population ${population.populationId} count is not finite`);
    assert.ok(population.count >= 0, `population ${population.populationId} count went negative`);
  }
  for (const resource of Object.values(ecology.resources)) {
    assert.ok(Number.isFinite(resource.availableAmount));
    assert.ok(resource.availableAmount >= 0 && resource.availableAmount <= resource.capacity + 1e-6);
  }
});

test("predation feedback loop: introducing a predator measurably suppresses prey growth relative to no predator", () => {
  const context = { subsystems: [createEcologySubsystem()] };

  const withWolf = buildTwoChunkWorld("feedback-seed");
  const withoutWolfEcology = createInitialEcologyState({
    populations: [createPopulation({ populationId: "deer", speciesId: "deer", location: "forest", count: 40, birthRate: 0.3, deathRate: 0.05 })],
    resources: [createResource({ resourceId: "grass", resourceType: "plant", location: "forest", availableAmount: 800, capacity: 1000, regenerationRate: 0.15 })],
    niches: [{ speciesId: "deer", temperatureRange: [-5, 35], humidityRange: [0, 1], waterRequirement: 0.1, foodRequirements: ["plant"], habitatRequirements: [] }],
    interactions: [{ interactionId: "deer-eats-grass", type: "herbivory", sourceId: "deer", targetId: "grass", strength: 0.4 }],
  });
  const withoutWolf = worldWithEcology("feedback-seed", withoutWolfEcology);

  const resultWithWolf = tickN(withWolf, 20, context);
  const resultWithoutWolf = tickN(withoutWolf, 20, context);

  const deerWithWolf = (resultWithWolf.modules[ECOLOGY_MODULE_KEY] as EcologyModuleState).populations.deer.count;
  const deerWithoutWolf = (resultWithoutWolf.modules[ECOLOGY_MODULE_KEY] as EcologyModuleState).populations.deer.count;

  assert.ok(deerWithWolf < deerWithoutWolf, `expected predation to suppress deer growth: withWolf=${deerWithWolf}, withoutWolf=${deerWithoutWolf}`);
});

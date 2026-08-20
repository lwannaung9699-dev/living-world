import { test } from "node:test";
import assert from "node:assert/strict";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { RngStreamRegistry } from "../../core/rng/rngStreamRegistry";
import { createWorldSeed } from "../../core/seed/worldSeed";
import { createInitialWorldState } from "../../core/state/worldState";
import { tick, tickN } from "../../core/simulation/simulation";
import { serializeWorldState, deserializeWorldState } from "../../core/serialization/worldStateSerializer";
import { computeStateHash } from "../../core/serialization/stateHash";

import { createInitialCreatureState } from "../../creature/state/creatureState";
import { generatePersonality } from "../../creature/personality/personality";
import {
  createCreatureSubsystemTick,
  upsertCreature,
  getCreatureModuleState,
  EnvironmentQuery,
  tickCreature,
} from "../../creature/tick/creatureTick";
import { StaticBiologyProvider } from "../../creature/integration/biologyAdapter";
import { StaticEcologyProvider } from "../../creature/integration/ecologyAdapter";
import { PerceivableEntity } from "../../creature/perception/perception";

function makeCreature(id: string, seed: number, position = { x: 0, y: 0 }) {
  const rng = DeterministicRng.fromSeed(`personality/${id}`, seed);
  return createInitialCreatureState({
    creatureId: id,
    speciesId: "test-species",
    position,
    personality: generatePersonality(rng),
    needs: { hunger: 50, thirst: 30 },
  });
}

class FoodNearbyEnvironment implements EnvironmentQuery {
  getNearbyEntities(): readonly PerceivableEntity[] {
    return [{ id: "berries", kind: "resource", position: { x: 2, y: 0 }, isFood: true }];
  }
  getAmbientEvents() {
    return [];
  }
  getRegionId() {
    return "region-1";
  }
  getEnvironmentalConditions() {
    return {};
  }
}

test("movement intent: a creature deciding to move toward a target produces a MovementIntent with matching destination", () => {
  const creature = makeCreature("mover-1", 1);
  const rng = DeterministicRng.fromSeed("decision/mover-1", 1);
  const result = tickCreature(
    creature,
    1,
    rng,
    new StaticBiologyProvider(),
    new StaticEcologyProvider(),
    new FoodNearbyEnvironment(),
  );
  assert.ok(result.movementIntent, "expected a movement intent when the chosen action targets a position");
  assert.deepEqual(result.movementIntent!.destination, { x: 2, y: 0 });
  assert.equal(result.movementIntent!.creatureId, "mover-1");
});

test("RNG isolation: two creatures' decision streams never affect each other, regardless of processing order", () => {
  const registry = RngStreamRegistry.create("isolation-root");
  const rngA1 = registry.fork("creature/a/decision");
  const drawsA = [rngA1.nextFloat(), rngA1.nextFloat(), rngA1.nextFloat()];

  const registry2 = RngStreamRegistry.create("isolation-root");
  const rngA2 = registry2.fork("creature/a/decision");
  // Interleave draws from a completely different creature's stream in between.
  const rngB2 = registry2.fork("creature/b/decision");
  const interleavedA: number[] = [];
  interleavedA.push(rngA2.nextFloat());
  rngB2.nextFloat();
  rngB2.nextFloat();
  interleavedA.push(rngA2.nextFloat());
  rngB2.nextFloat();
  interleavedA.push(rngA2.nextFloat());

  assert.deepEqual(interleavedA, drawsA, "creature A's RNG sequence must be unaffected by creature B's draws");
});

test("execution-order independence: ticking creatures in a different order yields identical per-creature results", () => {
  const species = new StaticBiologyProvider();
  const ecology = new StaticEcologyProvider();
  const environment = new FoodNearbyEnvironment();
  const subsystem = createCreatureSubsystemTick(species, ecology, environment);

  const seed = createWorldSeed({ seed: "order-independence", createdAt: "2024-01-01T00:00:00.000Z" });
  let stateAB = createInitialWorldState(seed);
  stateAB = upsertCreature(stateAB, makeCreature("alpha", 1, { x: 0, y: 0 }));
  stateAB = upsertCreature(stateAB, makeCreature("beta", 2, { x: 10, y: 10 }));

  // Object.entries order follows insertion order for string keys, so build a second
  // state where beta was inserted first, simulating a different processing order.
  let stateBA = createInitialWorldState(seed);
  stateBA = upsertCreature(stateBA, makeCreature("beta", 2, { x: 10, y: 10 }));
  stateBA = upsertCreature(stateBA, makeCreature("alpha", 1, { x: 0, y: 0 }));

  const resultAB = tick(stateAB, { subsystems: [subsystem] });
  const resultBA = tick(stateBA, { subsystems: [subsystem] });

  const modAB = getCreatureModuleState(resultAB);
  const modBA = getCreatureModuleState(resultBA);

  assert.deepEqual(modAB.creatures["alpha"], modBA.creatures["alpha"]);
  assert.deepEqual(modAB.creatures["beta"], modBA.creatures["beta"]);
});

test("Team 01 integration: creature subsystem plugs into tick()/tickN() and advances WorldState.modules.creature", () => {
  const species = new StaticBiologyProvider();
  const ecology = new StaticEcologyProvider();
  const subsystem = createCreatureSubsystemTick(species, ecology, new FoodNearbyEnvironment());

  const seed = createWorldSeed({ seed: "team01-integration" });
  let state = createInitialWorldState(seed);
  state = upsertCreature(state, makeCreature("c1", 1));

  const next = tickN(state, 5, { subsystems: [subsystem] });
  assert.equal(next.tick, 5);
  const mod = getCreatureModuleState(next);
  assert.ok(mod.creatures["c1"]);
  assert.equal(mod.creatures["c1"].age, 5);
});

test("serialization/replay: WorldState with creature module round-trips through serialize/deserialize and replays deterministically", () => {
  const species = new StaticBiologyProvider();
  const ecology = new StaticEcologyProvider();
  const subsystem = createCreatureSubsystemTick(species, ecology, new FoodNearbyEnvironment());

  const seed = createWorldSeed({ seed: "replay-check", createdAt: "2024-01-01T00:00:00.000Z" });
  let state = createInitialWorldState(seed);
  state = upsertCreature(state, makeCreature("replay-1", 1));

  const afterTicks = tickN(state, 3, { subsystems: [subsystem] });
  const json = serializeWorldState(afterTicks);
  const restored = deserializeWorldState(json);
  assert.deepEqual(restored, afterTicks);

  // Full replay from tick 0 twice must produce identical hashes.
  const runOnce = () => {
    let s = createInitialWorldState(seed);
    s = upsertCreature(s, makeCreature("replay-1", 1));
    return tickN(s, 3, { subsystems: [subsystem] });
  };
  const hashA = computeStateHash(runOnce());
  const hashB = computeStateHash(runOnce());
  assert.equal(hashA, hashB);
});

import assert from "node:assert/strict";
import test from "node:test";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import {
  createInitialEconomyState,
  validateEconomyState,
  EconomyState,
} from "../../economy/state";
import { harvestForSettlements, totalStockOf } from "../../economy/production";
import { decayStocks } from "../../economy/storage";
import { HarvestableResourceSnapshot, SettlementSnapshot } from "../../economy/contracts";
import {
  createDefaultSimulationPipeline,
  createInitialWorldState,
  createWorldSeed,
  computeStateHash,
  tickN,
  upsertCreature,
  createInitialCreatureState,
  generatePersonality,
  ECONOMY_MODULE_KEY,
} from "../../index";

function assertConserved(economy: EconomyState, resourceTypes: readonly string[]): void {
  for (const resourceType of resourceTypes) {
    const harvested = economy.harvestedTotal[resourceType] ?? 0;
    const decayed = economy.decayedTotal[resourceType] ?? 0;
    const inStock = totalStockOf(economy, resourceType);
    assert.ok(
      Math.abs(harvested - decayed - inStock) < 1e-9,
      `resourceType "${resourceType}": harvested(${harvested}) - decayed(${decayed}) should equal total stock(${inStock})`,
    );
  }
}

test("harvestForSettlements adds to stock and harvestedTotal, and never exceeds the availability/population caps", () => {
  const settlements: SettlementSnapshot[] = [
    { settlementId: "s1", locationId: "loc-a", population: 20 },
    { settlementId: "s2", locationId: "loc-a", population: 5 },
  ];
  const harvestable: HarvestableResourceSnapshot[] = [
    { locationId: "loc-a", resourceType: "grain", availableAmount: 100 },
  ];

  const economy = harvestForSettlements(
    createInitialEconomyState(),
    settlements,
    harvestable,
    DeterministicRng.fromSeed("test/harvest", 1),
  );

  validateEconomyState(economy);
  assertConserved(economy, ["grain"]);

  const s1Grain = economy.stocks["s1"]?.["grain"] ?? 0;
  const s2Grain = economy.stocks["s2"]?.["grain"] ?? 0;
  assert.ok(s1Grain > 0, "s1 should have harvested some grain");
  assert.ok(s2Grain > 0, "s2 should have harvested some grain");
  // s1 has 4x the population of s2, so (before availability capping) should harvest more.
  assert.ok(s1Grain > s2Grain, "settlement with more population should harvest more, all else equal");

  const totalHarvested = s1Grain + s2Grain;
  assert.ok(totalHarvested <= 100, "combined harvest must never exceed what was available at the location");
});

test("harvestForSettlements is a no-op when availableAmount is zero or population is zero", () => {
  const settlements: SettlementSnapshot[] = [{ settlementId: "s1", locationId: "loc-a", population: 0 }];
  const harvestable: HarvestableResourceSnapshot[] = [
    { locationId: "loc-a", resourceType: "grain", availableAmount: 0 },
  ];

  const economy = harvestForSettlements(
    createInitialEconomyState(),
    settlements,
    harvestable,
    DeterministicRng.fromSeed("test/harvest-zero", 1),
  );

  assert.deepEqual(economy.stocks, {});
  assert.deepEqual(economy.harvestedTotal, {});
});

test("decayStocks removes a bounded fraction and records it in decayedTotal, preserving conservation", () => {
  let economy = createInitialEconomyState();
  economy = {
    ...economy,
    stocks: { s1: { grain: 100 }, s2: { grain: 50 } },
    harvestedTotal: { grain: 150 },
  };
  validateEconomyState(economy);

  const decayed = decayStocks(economy, { defaultDecayFraction: 0.1 });
  validateEconomyState(decayed);

  assert.ok(Math.abs((decayed.stocks.s1!.grain ?? 0) - 90) < 1e-9);
  assert.ok(Math.abs((decayed.stocks.s2!.grain ?? 0) - 45) < 1e-9);
  assert.ok(Math.abs((decayed.decayedTotal.grain ?? 0) - 15) < 1e-9);
  assertConserved(decayed, ["grain"]);
});

test("decayStocks never drives a stock negative even with an out-of-range fraction", () => {
  let economy = createInitialEconomyState();
  economy = { ...economy, stocks: { s1: { grain: 10 } }, harvestedTotal: { grain: 10 } };

  const decayed = decayStocks(economy, { defaultDecayFraction: 5 });
  validateEconomyState(decayed);
  assert.ok((decayed.stocks.s1!.grain ?? 0) >= 0);
  assertConserved(decayed, ["grain"]);
});

test("harvest + decay repeated over many synthetic ticks stays conserved and deterministic for the same seed", () => {
  const settlements: SettlementSnapshot[] = [
    { settlementId: "s1", locationId: "loc-a", population: 30 },
    { settlementId: "s2", locationId: "loc-b", population: 12 },
  ];
  const harvestable: HarvestableResourceSnapshot[] = [
    { locationId: "loc-a", resourceType: "grain", availableAmount: 1000 },
    { locationId: "loc-b", resourceType: "water", availableAmount: 500 },
  ];

  function run(seedValue: number): EconomyState {
    let economy = createInitialEconomyState();
    const rng = DeterministicRng.fromSeed("test/long-run", seedValue);
    for (let t = 0; t < 25; t++) {
      economy = harvestForSettlements(economy, settlements, harvestable, rng, { maxFractionOfAvailable: 0.05 });
      economy = decayStocks(economy, { defaultDecayFraction: 0.02 });
      validateEconomyState(economy);
      assertConserved(economy, ["grain", "water"]);
    }
    return economy;
  }

  const resultA = run(42);
  const resultB = run(42);
  assert.deepEqual(resultA, resultB, "same seed should produce byte-identical economy state");

  const resultC = run(43);
  assert.notDeepEqual(resultA, resultC, "different seed should (with overwhelming probability) diverge");
});

test("createDefaultSimulationPipeline attaches the Team 09 economy module and keeps it conserved end-to-end", () => {
  const seed = createWorldSeed({ seed: "economy-pipeline-integration" });
  let state = createInitialWorldState(seed);

  // Seed a small population so Team 07 settlements can plausibly form, and
  // Team 09 has someone to harvest on behalf of. Mirrors the approach used
  // in defaultSimulationPipeline.test.ts's Team06<->07 wiring test.
  for (let i = 0; i < 8; i++) {
    const personality = generatePersonality(DeterministicRng.fromSeed(`economy-pipeline-p${i}`, i));
    state = upsertCreature(
      state,
      createInitialCreatureState({
        creatureId: `economy-pipeline-creature-${i}`,
        speciesId: "human",
        position: { x: 0, y: 0 },
        personality,
      }),
    );
  }

  const result = tickN(state, 80, createDefaultSimulationPipeline());

  const economy = result.modules[ECONOMY_MODULE_KEY] as EconomyState | undefined;
  assert.ok(economy, "Team 09 economy module should be attached");
  validateEconomyState(economy!);

  const allResourceTypes = new Set([
    ...Object.keys(economy!.harvestedTotal),
    ...Object.keys(economy!.decayedTotal),
  ]);
  assertConserved(economy!, [...allResourceTypes]);
});

test("createDefaultSimulationPipeline including Team 09 is deterministic for the same seed", () => {
  const seedA = createWorldSeed({ seed: "economy-pipeline-determinism" });
  const seedB = createWorldSeed({ seed: "economy-pipeline-determinism" });
  const resultA = tickN(createInitialWorldState(seedA), 10, createDefaultSimulationPipeline());
  const resultB = tickN(createInitialWorldState(seedB), 10, createDefaultSimulationPipeline());

  assert.equal(computeStateHash(resultA), computeStateHash(resultB));
});

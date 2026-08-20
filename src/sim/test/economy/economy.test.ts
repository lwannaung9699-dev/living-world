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
  ECOLOGY_MODULE_KEY,
  SOCIETY_MODULE_KEY,
  createResource,
  createInitialEcologyState,
  writeEconomyState,
  EcologyModuleState,
  SocietyState,
  createInitialSocietyState,
  createGroup,
  reconcileEconomicStock,
  EconomyAdapter,
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
    { resourceId: "res-grain-a", locationId: "loc-a", resourceType: "grain", availableAmount: 100 },
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

  const pending = economy.pendingConsumptionByResourceId["res-grain-a"] ?? 0;
  assert.ok(
    Math.abs(pending - totalHarvested) < 1e-9,
    "pendingConsumptionByResourceId for the harvested resourceId should equal the total amount harvested this tick",
  );
});

test("harvestForSettlements is a no-op when availableAmount is zero or population is zero", () => {
  const settlements: SettlementSnapshot[] = [{ settlementId: "s1", locationId: "loc-a", population: 0 }];
  const harvestable: HarvestableResourceSnapshot[] = [
    { resourceId: "res-grain-a", locationId: "loc-a", resourceType: "grain", availableAmount: 0 },
  ];

  const economy = harvestForSettlements(
    createInitialEconomyState(),
    settlements,
    harvestable,
    DeterministicRng.fromSeed("test/harvest-zero", 1),
  );

  assert.deepEqual(economy.stocks, {});
  assert.deepEqual(economy.harvestedTotal, {});
  assert.deepEqual(economy.pendingConsumptionByResourceId, {});
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
    { resourceId: "res-grain-a", locationId: "loc-a", resourceType: "grain", availableAmount: 1000 },
    { resourceId: "res-water-b", locationId: "loc-b", resourceType: "water", availableAmount: 500 },
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

test("Team 09 settlement harvesting actually depletes Team 05's ecology resource pool, one tick later, via the pipeline's default external-demand bridge (gap #1)", () => {
  const seed = createWorldSeed({ seed: "economy-ecology-depletion" });
  let state = createInitialWorldState(seed);

  // Seed one ecology resource directly at a known location...
  const resource = createResource({
    resourceId: "res-grain-loc-x",
    resourceType: "grain",
    location: "loc-x",
    availableAmount: 1000,
    capacity: 1000,
    regenerationRate: 0, // isolate depletion from regeneration for a clean assertion
  });
  state = {
    ...state,
    modules: {
      ...state.modules,
      [ECOLOGY_MODULE_KEY]: createInitialEcologyState({ resources: [resource] }),
    },
  };

  // ...and a settlement-shaped population large enough to guarantee a
  // non-trivial harvest, via Team 06 creatures at that location (mirrors the
  // approach in the existing pipeline integration test above).
  for (let i = 0; i < 8; i++) {
    const personality = generatePersonality(DeterministicRng.fromSeed(`economy-ecology-depletion-p${i}`, i));
    state = upsertCreature(
      state,
      createInitialCreatureState({
        creatureId: `economy-ecology-depletion-creature-${i}`,
        speciesId: "human",
        position: { x: 0, y: 0 },
        personality,
      }),
    );
  }

  const pipeline = createDefaultSimulationPipeline();

  // Run long enough for Team 07 to form a settlement at loc-x and for Team 09
  // to harvest against it at least once (settlement formation is emergent,
  // not scheduled, hence the generous tick budget).
  state = tickN(state, 150, pipeline);

  const ecologyAfter = state.modules[ECOLOGY_MODULE_KEY] as EcologyModuleState;
  const economyAfter = state.modules[ECONOMY_MODULE_KEY] as { pendingConsumptionByResourceId?: Record<string, number> } | undefined;

  const remaining = ecologyAfter.resources["res-grain-loc-x"]?.availableAmount ?? 1000;
  const everRequested = Object.keys(economyAfter?.pendingConsumptionByResourceId ?? {}).length > 0;

  if (everRequested) {
    // If Economy ever harvested this resourceId, Ecology must have actually
    // subtracted it from availableAmount -- proving the bridge, not just the
    // request, actually moves resource out of Team 05's pool.
    assert.ok(
      remaining < 1000,
      `expected res-grain-loc-x.availableAmount to drop below 1000 once Economy harvested it, got ${remaining}`,
    );
  } else {
    // No settlement ever formed at loc-x in this run (emergent society
    // formation isn't guaranteed within 150 ticks) -- fall back to directly
    // exercising the same bridge the pipeline uses, so the mechanism itself
    // is still proven deterministically.
    let direct = state;
    direct = {
      ...direct,
      modules: writeEconomyState(direct.modules, {
        contractVersion: "1.0.0",
        stocks: {},
        harvestedTotal: {},
        decayedTotal: {},
        pendingConsumptionByResourceId: { "res-grain-loc-x": 40 },
      }),
    };
    direct = tickN(direct, 1, pipeline);
    const ecologyDirect = direct.modules[ECOLOGY_MODULE_KEY] as EcologyModuleState;
    const remainingDirect = ecologyDirect.resources["res-grain-loc-x"]?.availableAmount ?? 1000;
    assert.ok(
      remainingDirect < 1000,
      `expected a manually-set pendingConsumptionByResourceId to deplete res-grain-loc-x the following tick, got ${remainingDirect}`,
    );
  }
});

test("createDefaultSimulationPipeline including Team 09 is deterministic for the same seed", () => {
  const seedA = createWorldSeed({ seed: "economy-pipeline-determinism" });
  const seedB = createWorldSeed({ seed: "economy-pipeline-determinism" });
  const resultA = tickN(createInitialWorldState(seedA), 10, createDefaultSimulationPipeline());
  const resultB = tickN(createInitialWorldState(seedB), 10, createDefaultSimulationPipeline());

  assert.equal(computeStateHash(resultA), computeStateHash(resultB));
});

test("reconcileEconomicStock sums Team 09 settlement stocks per owning group into resources.economicStockTotal, leaves pooled untouched, and zeroes groups that own no settlement (gap #2)", () => {
  let society = createInitialSocietyState();
  const g1 = createGroup(society, ["m1"], 0);
  society = g1.society;
  const g2 = createGroup(society, ["m2"], 0);
  society = g2.society;

  // Give group 1 a nonzero `pooled` figure up front, to prove reconciliation never reads or writes it.
  society = {
    ...society,
    groups: {
      ...society.groups,
      [g1.groupId]: {
        ...society.groups[g1.groupId],
        resources: { ...society.groups[g1.groupId].resources, pooled: 7 },
      },
    },
    settlements: {
      "settlement-a": {
        settlementId: "settlement-a",
        locationId: "loc-a",
        groupId: g1.groupId,
        foundedTick: 0,
        presence: 100,
        population: 10,
        settlementType: "hamlet",
        defensibility: 0,
      },
      "settlement-b": {
        settlementId: "settlement-b",
        locationId: "loc-b",
        groupId: g1.groupId,
        foundedTick: 0,
        presence: 100,
        population: 5,
        settlementType: "hamlet",
        defensibility: 0,
      },
      // group 2 deliberately owns no settlement -> its economicStockTotal must come out to 0.
    },
  };

  const adapter: EconomyAdapter = {
    listSettlementStocks: () => [
      { settlementId: "settlement-a", totalStock: 30 },
      { settlementId: "settlement-b", totalStock: 12 },
      // A stock for a settlement that doesn't exist in this society snapshot must be ignored, not crash.
      { settlementId: "settlement-does-not-exist", totalStock: 999 },
    ],
  };

  const worldState = createInitialWorldState(createWorldSeed({ seed: "gap2-unit" }));
  const reconciled = reconcileEconomicStock(society, worldState, adapter);

  assert.equal(
    reconciled.groups[g1.groupId].resources.economicStockTotal,
    42, // settlement-a (30) + settlement-b (12); settlement-does-not-exist is ignored
    "group 1's economicStockTotal should be the sum of every settlement it owns' stock",
  );
  assert.equal(
    reconciled.groups[g1.groupId].resources.pooled,
    7,
    "pooled must be left completely untouched by reconciliation",
  );
  assert.equal(
    reconciled.groups[g2.groupId].resources.economicStockTotal,
    0,
    "group 2 owns no settlement, so its economicStockTotal must come out to 0, not undefined or stale",
  );
});

test("Team 07's SocialGroup.resources.economicStockTotal reflects the CURRENT tick's Team 09 settlement stock (no one-tick lag), via the pipeline's post-economy reconciliation step (gap #2)", () => {
  const seed = createWorldSeed({ seed: "society-economy-reconciliation" });
  let state = createInitialWorldState(seed);

  let society = createInitialSocietyState();
  const created = createGroup(society, ["m1"], 0);
  society = created.society;
  const groupId = created.groupId;

  society = {
    ...society,
    settlements: {
      "settlement-x": {
        settlementId: "settlement-x",
        locationId: "loc-x",
        groupId,
        foundedTick: 0,
        presence: 100,
        population: 10,
        settlementType: "hamlet",
        defensibility: 0,
      },
    },
  };

  state = {
    ...state,
    modules: {
      ...state.modules,
      [SOCIETY_MODULE_KEY]: society,
      [ECONOMY_MODULE_KEY]: {
        contractVersion: "1.0.0",
        stocks: { "settlement-x": { grain: 40, water: 5 } },
        harvestedTotal: { grain: 40, water: 5 },
        decayedTotal: {},
        pendingConsumptionByResourceId: {},
      },
    },
  };

  // Force a deliberate, known decay this tick, so a correctly-wired
  // (lag-free) reconciliation is numerically distinguishable from a
  // stale/lagged one: pre-tick total is 45 (40 grain + 5 water); with a
  // 20% decay fraction and no harvest (no ecology resources seeded), the
  // expected post-tick total is exactly 36.
  const pipeline = createDefaultSimulationPipeline({
    economyOptions: { decay: { defaultDecayFraction: 0.2 } },
  });
  state = tickN(state, 1, pipeline);

  const economyAfter = state.modules[ECONOMY_MODULE_KEY] as { stocks: Record<string, Record<string, number>> };
  const societyAfter = state.modules[SOCIETY_MODULE_KEY] as SocietyState;

  const settlementXStockAfter = economyAfter.stocks["settlement-x"] ?? {};
  const expectedTotal = Object.values(settlementXStockAfter).reduce((sum, quantity) => sum + quantity, 0);

  assert.ok(
    Math.abs(expectedTotal - 36) < 1e-9,
    `sanity check on the test's own setup: expected settlement-x's post-decay total to be 36, got ${expectedTotal}`,
  );
  assert.ok(
    Math.abs(societyAfter.groups[groupId].resources.economicStockTotal - 36) < 1e-9,
    `expected economicStockTotal (${societyAfter.groups[groupId].resources.economicStockTotal}) to equal ` +
      `settlement-x's THIS-tick post-decay total (36) — a stale one-tick-lagged reconciliation would instead ` +
      `read the pre-tick value (45)`,
  );
});

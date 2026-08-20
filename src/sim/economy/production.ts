/**
 * Team 09 (Economy & Trade) — extraction / production.
 *
 * Each settlement extracts a bounded amount of each resource type
 * harvestable at its location, scaled by population, and adds it to its
 * own stock. Every unit added is also added to `harvestedTotal` in the
 * same step, so the conservation ledger always balances (see
 * economy.test.ts).
 *
 * RESOLVED GAP (previously documented as open in README.md gap #1): this
 * still only reads Team 05's `EcologicalResource.availableAmount` as a
 * ceiling — Economy still never calls ecology's own `consumeResource` or
 * writes into `state.modules.ecology` directly (Team 09's brief still rules
 * that out: "Economy must not directly cross into and mutate NPC/Society/
 * World state"). Instead, every amount harvested this tick is now also
 * recorded per Team 05 `resourceId` into `EconomyState.
 * pendingConsumptionByResourceId` (replacing, not accumulating, each tick).
 * The pipeline's composition root (defaultSimulationPipeline.ts) feeds that
 * record into Team 05's ecology subsystem as an external consumption demand
 * the *following* tick (Ecology runs before Economy each tick, so this is
 * the earliest point a single-writer-per-module pipeline can apply it),
 * where it is resolved fairly alongside herbivory/predation demands via
 * ecology's own `resolveConsumption` + `consumeResource`. Team 05 remains
 * the only writer of `state.modules.ecology`; Team 09 remains the only
 * writer of `state.modules.economy`.
 */

import { DeterministicRng } from "../core/rng/deterministicRng";
import { EconomyState, sortedEntries } from "./state";
import { HarvestableResourceSnapshot, SettlementSnapshot } from "./contracts";

export interface HarvestOptions {
  /** Fraction of a location's availableAmount a single settlement may draw from in one tick, before population scaling. Default 0.1 (10%). */
  readonly maxFractionOfAvailable?: number;
  /** Upper bound on how much one unit of population can extract of a single resourceType in one tick. Default 0.05. */
  readonly perCapitaHarvestCap?: number;
  /** Multiplicative jitter range applied per (settlement, resourceType) draw, e.g. 0.1 = ±10%. Default 0.1. */
  readonly jitterFraction?: number;
}

const DEFAULT_OPTIONS: Required<HarvestOptions> = {
  maxFractionOfAvailable: 0.1,
  perCapitaHarvestCap: 0.05,
  jitterFraction: 0.1,
};

/**
 * Deterministically harvests resources for every settlement (processed in
 * sorted settlementId order; resources within a location in sorted
 * resourceType order), so outcomes never depend on adapter/iteration order.
 */
export function harvestForSettlements(
  economy: EconomyState,
  settlements: readonly SettlementSnapshot[],
  harvestable: readonly HarvestableResourceSnapshot[],
  rng: DeterministicRng,
  options: HarvestOptions = {},
): EconomyState {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const byLocation = new Map<string, HarvestableResourceSnapshot[]>();
  for (const resource of harvestable) {
    const list = byLocation.get(resource.locationId) ?? [];
    list.push(resource);
    byLocation.set(resource.locationId, list);
  }

  let stocks = economy.stocks;
  let harvestedTotal = economy.harvestedTotal;
  // This tick's draw per Team 05 resourceId, fresh each call (not merged with
  // the previous tick's economy.pendingConsumptionByResourceId) — it reports
  // only what THIS tick harvested, for ecology to apply as external demand.
  let pendingConsumptionByResourceId: Record<string, number> = {};

  const sortedSettlements = [...settlements].sort((a, b) => a.settlementId.localeCompare(b.settlementId));

  for (const settlement of sortedSettlements) {
    const resourcesHere = (byLocation.get(settlement.locationId) ?? [])
      .slice()
      .sort((a, b) => a.resourceType.localeCompare(b.resourceType));

    for (const resource of resourcesHere) {
      if (resource.availableAmount <= 0) continue;

      const populationCap = settlement.population * opts.perCapitaHarvestCap;
      const availabilityCap = resource.availableAmount * opts.maxFractionOfAvailable;
      const baseAmount = Math.min(populationCap, availabilityCap);
      if (baseAmount <= 0) continue;

      const jitter = 1 + (rng.nextFloat() * 2 - 1) * opts.jitterFraction;
      const amount = Math.max(0, Math.min(baseAmount * jitter, resource.availableAmount));
      if (amount <= 0) continue;

      const currentStock = stocks[settlement.settlementId] ?? {};
      stocks = {
        ...stocks,
        [settlement.settlementId]: {
          ...currentStock,
          [resource.resourceType]: (currentStock[resource.resourceType] ?? 0) + amount,
        },
      };
      harvestedTotal = {
        ...harvestedTotal,
        [resource.resourceType]: (harvestedTotal[resource.resourceType] ?? 0) + amount,
      };
      pendingConsumptionByResourceId = {
        ...pendingConsumptionByResourceId,
        [resource.resourceId]: (pendingConsumptionByResourceId[resource.resourceId] ?? 0) + amount,
      };
    }
  }

  return { ...economy, stocks, harvestedTotal, pendingConsumptionByResourceId };
}

/** Sum of a single resourceType's quantity across every settlement's stock. Used by production and by conservation tests. */
export function totalStockOf(economy: EconomyState, resourceType: string): number {
  let total = 0;
  for (const [, byResource] of sortedEntries(economy.stocks)) {
    total += byResource[resourceType] ?? 0;
  }
  return total;
}

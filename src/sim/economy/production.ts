/**
 * Team 09 (Economy & Trade) — extraction / production.
 *
 * Each settlement extracts a bounded amount of each resource type
 * harvestable at its location, scaled by population, and adds it to its
 * own stock. Every unit added is also added to `harvestedTotal` in the
 * same step, so the conservation ledger always balances (see
 * economy.test.ts).
 *
 * KNOWN GAP (documented, not hidden): this reads Team 05's
 * `EcologicalResource.availableAmount` only as a ceiling on how much a
 * settlement *could* plausibly extract this tick — it does not call
 * ecology's own `consumeResource` to actually deplete Team 05's copy,
 * because doing so would mean Economy mutating another team's module
 * state, which the project brief for Team 09 explicitly rules out
 * ("Economy must not directly cross into and mutate NPC/Society/World
 * state"). The result: Team 09's own stocks are fully conserved and
 * tested, but extraction is not yet actually subtracted from Team 05's
 * regenerating resource pool. Wiring that up (likely via a new consumption
 * request/adapter Team 05 accepts, mirroring how Team 06/07 individuals
 * already consume ecology resources) is real, still-open follow-up work —
 * see README.md.
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
    }
  }

  return { ...economy, stocks, harvestedTotal };
}

/** Sum of a single resourceType's quantity across every settlement's stock. Used by production and by conservation tests. */
export function totalStockOf(economy: EconomyState, resourceType: string): number {
  let total = 0;
  for (const [, byResource] of sortedEntries(economy.stocks)) {
    total += byResource[resourceType] ?? 0;
  }
  return total;
}

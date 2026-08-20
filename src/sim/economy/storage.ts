/**
 * Team 09 (Economy & Trade) — storage decay (spoilage/loss over time).
 *
 * A simple bounded-fraction decay per resourceType per tick. This is
 * intentionally its own model rather than reusing Team 03's
 * MaterialData/DecayState (which tracks structural integrity of a single
 * object, not a fungible stock quantity) — sourcing per-resourceType
 * spoilage rates from Team 03 material data is a real, still-open
 * integration opportunity, not done in this slice (see README.md).
 *
 * Every unit removed by decay is also added to `decayedTotal`, so the
 * conservation ledger balances: for any resourceType,
 * `harvestedTotal - decayedTotal === sum of that resourceType across all
 * settlement stocks`, always — see economy.test.ts.
 */

import { EconomyState, sortedEntries } from "./state";

export interface DecayOptions {
  /** Fraction of each stock quantity lost per tick, per resourceType. Types absent from this map are not decayed. */
  readonly decayFractionByResourceType?: Readonly<Record<string, number>>;
  /** Fallback decay fraction used for resourceTypes not present in decayFractionByResourceType. Default 0 (no decay). */
  readonly defaultDecayFraction?: number;
}

export function decayStocks(economy: EconomyState, options: DecayOptions = {}): EconomyState {
  const decayFractionByResourceType = options.decayFractionByResourceType ?? {};
  const defaultDecayFraction = options.defaultDecayFraction ?? 0;

  let stocks = economy.stocks;
  let decayedTotal = economy.decayedTotal;

  for (const [settlementId, byResource] of sortedEntries(economy.stocks)) {
    let nextByResource = byResource;
    for (const [resourceType, quantity] of sortedEntries(byResource)) {
      if (quantity <= 0) continue;
      const fraction = decayFractionByResourceType[resourceType] ?? defaultDecayFraction;
      if (fraction <= 0) continue;

      const lost = Math.min(quantity, quantity * fraction);
      if (lost <= 0) continue;

      nextByResource = { ...nextByResource, [resourceType]: quantity - lost };
      decayedTotal = { ...decayedTotal, [resourceType]: (decayedTotal[resourceType] ?? 0) + lost };
    }
    if (nextByResource !== byResource) {
      stocks = { ...stocks, [settlementId]: nextByResource };
    }
  }

  return { ...economy, stocks, decayedTotal };
}

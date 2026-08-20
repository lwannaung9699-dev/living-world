/**
 * Team 09 (Economy & Trade) — module state.
 *
 * Scope of this first slice (see src/sim/economy/README.md for the honest
 * status of the rest of the spec): concrete, typed resource stocks per
 * settlement, produced by extraction from Team 05's ecological resources
 * and lost to storage decay over time — with a conservation ledger so every
 * unit that ever enters or leaves a stock is accounted for and testable.
 *
 * Explicitly NOT yet built (do not assume these exist): labor/wages,
 * markets/pricing, trade routes/transportation, taxation, or
 * crisis/famine/collapse dynamics. Team 07 already has an abstract, single-
 * number `SocialGroup.resources.pooled` trade stub (society/economy.ts) —
 * this module does not read or write that; reconciling the two is a real,
 * currently-undone integration gap (see README).
 */

import { InvalidStateError } from "../core/errors";

export const ECONOMY_MODULE_KEY = "economy";
export const ECONOMY_STATE_CONTRACT_VERSION = "1.0.0";

/** settlementId -> resourceType -> quantity currently held in storage. */
export type ResourceStockRecord = Readonly<Record<string, Readonly<Record<string, number>>>>;

/**
 * Cumulative, monotonically-increasing totals since world genesis, keyed by
 * resourceType. Used only to prove conservation in tests: for any
 * resourceType, `harvested - decayed` must always equal the sum of that
 * resourceType's quantity across every settlement's stock (see
 * economy.test.ts's conservation test) — nothing is ever created or
 * destroyed outside of these two accounted paths.
 */
export type ResourceLedgerRecord = Readonly<Record<string, number>>;

export interface EconomyState {
  readonly contractVersion: string;
  readonly stocks: ResourceStockRecord;
  readonly harvestedTotal: ResourceLedgerRecord;
  readonly decayedTotal: ResourceLedgerRecord;
  /**
   * This tick's harvested amount per Team 05 `resourceId` (replaced, not
   * accumulated, every tick — it represents "what Economy drew this tick",
   * not a running total). Team 05's ecology subsystem reads this (one tick
   * later, via the pipeline's externalDemandsProvider — see
   * defaultSimulationPipeline.ts) as external consumption demand against its
   * own resource pool, so extraction is actually subtracted from the
   * regenerating source instead of only being reflected in Economy's own
   * stocks. See production.ts and README.md gap #1 (now resolved).
   */
  readonly pendingConsumptionByResourceId: ResourceLedgerRecord;
}

export function createInitialEconomyState(): EconomyState {
  return {
    contractVersion: ECONOMY_STATE_CONTRACT_VERSION,
    stocks: {},
    harvestedTotal: {},
    decayedTotal: {},
    pendingConsumptionByResourceId: {},
  };
}

export function validateEconomyState(value: unknown): asserts value is EconomyState {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("EconomyState must be an object");
  }
  const state = value as Partial<EconomyState>;
  if (typeof state.contractVersion !== "string" || state.contractVersion.length === 0) {
    throw new InvalidStateError("EconomyState.contractVersion must be a non-empty string");
  }
  for (const [key, label] of [
    [state.stocks, "stocks"],
    [state.harvestedTotal, "harvestedTotal"],
    [state.decayedTotal, "decayedTotal"],
    [state.pendingConsumptionByResourceId, "pendingConsumptionByResourceId"],
  ] as const) {
    if (typeof key !== "object" || key === null) {
      throw new InvalidStateError(`EconomyState.${label} must be an object`);
    }
  }
  for (const [settlementId, byResource] of Object.entries(state.stocks!)) {
    if (typeof byResource !== "object" || byResource === null) {
      throw new InvalidStateError(`EconomyState.stocks["${settlementId}"] must be an object`);
    }
    for (const [resourceType, quantity] of Object.entries(byResource)) {
      if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 0) {
        throw new InvalidStateError(
          `EconomyState.stocks["${settlementId}"]["${resourceType}"] must be a non-negative finite number, got ${String(quantity)}`,
        );
      }
    }
  }
  for (const [label, record] of [
    ["harvestedTotal", state.harvestedTotal!],
    ["decayedTotal", state.decayedTotal!],
    ["pendingConsumptionByResourceId", state.pendingConsumptionByResourceId!],
  ] as const) {
    for (const [resourceType, total] of Object.entries(record)) {
      if (typeof total !== "number" || !Number.isFinite(total) || total < 0) {
        throw new InvalidStateError(
          `EconomyState.${label}["${resourceType}"] must be a non-negative finite number, got ${String(total)}`,
        );
      }
    }
  }
}

export function readEconomyState(modules: Readonly<Record<string, unknown>>): EconomyState {
  const existing = modules[ECONOMY_MODULE_KEY];
  if (existing === undefined) return createInitialEconomyState();
  validateEconomyState(existing);
  return existing;
}

export function writeEconomyState(
  modules: Readonly<Record<string, unknown>>,
  economy: EconomyState,
): Readonly<Record<string, unknown>> {
  return { ...modules, [ECONOMY_MODULE_KEY]: economy };
}

/** Deterministic key iteration helper (mirrors society/state.ts's sortedEntries) so no subsystem here ever depends on Record insertion order. */
export function sortedEntries<T>(record: Readonly<Record<string, T>>): Array<[string, T]> {
  return Object.keys(record)
    .sort()
    .map((key) => [key, record[key]] as [string, T]);
}

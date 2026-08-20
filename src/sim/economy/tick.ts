/**
 * Team 09 top-level tick composition.
 *
 * `createEconomySubsystemTick` returns a Foundation `SubsystemTickFn` (see
 * core/simulation/simulation.ts): `(state, rng) => state`. It is meant to
 * be appended to `SimulationContext.subsystems` after Team 07's society
 * tick (it reads settlements, which Team 07 owns). It never touches
 * anything outside `state.modules.economy` (reads Team 05/07 only through
 * the adapters in contracts.ts) and never uses `Math.random` — every draw
 * goes through a namespaced fork of the shared RngStreamRegistry.
 */

import { WorldState } from "../core/state/worldState";
import { RngStreamRegistry } from "../core/rng/rngStreamRegistry";
import { EconomyAdapters, defaultEconomyAdapters } from "./contracts";
import { readEconomyState, writeEconomyState } from "./state";
import { harvestForSettlements, HarvestOptions } from "./production";
import { decayStocks, DecayOptions } from "./storage";

export interface EconomyTickOptions {
  readonly adapters?: EconomyAdapters;
  readonly harvest?: HarvestOptions;
  readonly decay?: DecayOptions;
}

export function createEconomySubsystemTick(options: EconomyTickOptions = {}) {
  const adapters = options.adapters ?? defaultEconomyAdapters;

  return function economyTick(state: WorldState, rng: RngStreamRegistry): WorldState {
    let economy = readEconomyState(state.modules);

    const settlements = adapters.settlements.listSettlements(state);
    const harvestable = adapters.ecology.listHarvestableResources(state);

    economy = harvestForSettlements(economy, settlements, harvestable, rng.fork("economy/harvest"), options.harvest);
    economy = decayStocks(economy, options.decay);

    return { ...state, modules: writeEconomyState(state.modules, economy) };
  };
}

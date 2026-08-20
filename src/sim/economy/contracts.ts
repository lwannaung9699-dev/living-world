/**
 * Team 09 (Economy & Trade) — external adapter contracts.
 *
 * Per project rule (see politics/adapters/populationAdapter.ts and
 * society/contracts.ts for precedent): Economy never mutates or reaches
 * into Team 05 (ecology) or Team 07 (society) state directly. It reads a
 * minimal, typed snapshot through its own adapters and only ever writes
 * `state.modules.economy`.
 *
 * Both default adapters below read the REAL, already-merged Team 05/07
 * module shapes (confirmed by reading src/sim/ecology/state.ts,
 * src/sim/ecology/resources.ts, and src/sim/society/state.ts,
 * src/sim/society/types.ts directly — not guessed) rather than a
 * placeholder duck-typed shape, since both teams are already in the repo.
 */

import { WorldState } from "../core/state/worldState";
import { ECOLOGY_MODULE_KEY, EcologyModuleState } from "../ecology/state";
import { SOCIETY_MODULE_KEY, SocietyState } from "../society/state";

/* ---------------------------------------------------------------------- */
/* Team 05 — ecological resource adapter                                   */
/* ---------------------------------------------------------------------- */

export interface HarvestableResourceSnapshot {
  /** Team 05's resourceId — carried through so extraction can be reported back as a consumption request (see production.ts / state.ts pendingConsumptionByResourceId). */
  readonly resourceId: string;
  readonly locationId: string;
  readonly resourceType: string;
  readonly availableAmount: number;
}

export interface EcologyResourceAdapter {
  listHarvestableResources(state: WorldState): readonly HarvestableResourceSnapshot[];
}

export const defaultEcologyResourceAdapter: EcologyResourceAdapter = {
  listHarvestableResources(state: WorldState): readonly HarvestableResourceSnapshot[] {
    const ecology = state.modules[ECOLOGY_MODULE_KEY] as EcologyModuleState | undefined;
    if (!ecology) return [];
    return Object.values(ecology.resources)
      .map((resource) => ({
        resourceId: resource.resourceId,
        locationId: resource.location,
        resourceType: resource.resourceType,
        availableAmount: resource.availableAmount,
      }))
      .sort((a, b) => `${a.locationId}:${a.resourceType}`.localeCompare(`${b.locationId}:${b.resourceType}`));
  },
};

/* ---------------------------------------------------------------------- */
/* Team 07 — settlement adapter                                            */
/* ---------------------------------------------------------------------- */

export interface SettlementSnapshot {
  readonly settlementId: string;
  readonly locationId: string;
  readonly population: number;
}

export interface SettlementAdapter {
  listSettlements(state: WorldState): readonly SettlementSnapshot[];
}

export const defaultSettlementAdapter: SettlementAdapter = {
  listSettlements(state: WorldState): readonly SettlementSnapshot[] {
    const society = state.modules[SOCIETY_MODULE_KEY] as SocietyState | undefined;
    if (!society) return [];
    return Object.values(society.settlements)
      .map((settlement) => ({
        settlementId: settlement.settlementId,
        locationId: settlement.locationId,
        population: settlement.population,
      }))
      .sort((a, b) => a.settlementId.localeCompare(b.settlementId));
  },
};

export interface EconomyAdapters {
  readonly ecology: EcologyResourceAdapter;
  readonly settlements: SettlementAdapter;
}

export const defaultEconomyAdapters: EconomyAdapters = {
  ecology: defaultEcologyResourceAdapter,
  settlements: defaultSettlementAdapter,
};

/**
 * Team 09 (Economy & Trade) — external adapter contracts.
 *
 * Per project rule (see politics/adapters/populationAdapter.ts and
 * society/contracts.ts for precedent): Economy never mutates or reaches
 * into Team 05 (ecology), Team 06 (creature), or Team 07 (society) state
 * directly. It reads a minimal, typed snapshot through its own adapters
 * and only ever writes `state.modules.economy`.
 *
 * All three default adapters below read the REAL, already-merged Team
 * 05/06/07 module shapes (confirmed by reading src/sim/ecology/state.ts,
 * src/sim/ecology/resources.ts, src/sim/society/state.ts,
 * src/sim/society/types.ts, and src/sim/creature/tick/creatureTick.ts,
 * src/sim/creature/state/creatureState.ts directly — not guessed) rather
 * than a placeholder duck-typed shape, since all three teams are already
 * in the repo. See society/contracts.ts's header for a documented example
 * of what happens when an adapter guesses instead of reading the real
 * shape — this file's Team 06 labor adapter (added 2026-08-21) was
 * written after reading Team 06's actual public API specifically to avoid
 * repeating that mistake.
 */

import { WorldState } from "../core/state/worldState";
import { ECOLOGY_MODULE_KEY, EcologyModuleState } from "../ecology/state";
import { SOCIETY_MODULE_KEY, SocietyState } from "../society/state";
import { locationIdFromPosition } from "../society/contracts";
import { getCreatureModuleState } from "../creature/tick/creatureTick";
import { CreatureState } from "../creature/state/creatureState";

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

/* ---------------------------------------------------------------------- */
/* Team 06 — individual labor adapter                                      */
/* ---------------------------------------------------------------------- */

/**
 * Real per-individual labor signal, read from Team 06's actual
 * `CreatureState` (via its own public `getCreatureModuleState` helper —
 * no guessed module key or shape, unlike the bug documented in
 * society/contracts.ts's header).
 *
 * "Who works, what they produce" (README.md §Next actual steps #3) is
 * scoped, honestly, to what Team 06 actually models: there is no
 * employment/skill/wage system anywhere upstream, so this does not invent
 * one. What Team 06 *does* model is a creature currently proposing/
 * performing a `"gather"` action (see actions/actions.ts's `ActionId`) —
 * that is the one real, literal "this individual is doing labor right
 * now" signal available. `effort` is a deterministic, per-creature
 * derived value from real state (`energy`/`fatigue`, both already
 * [0,100] fields on `CreatureState`) — not a random draw, and not a
 * synthetic constant.
 */
export interface LaborerSnapshot {
  readonly creatureId: string;
  /** Same `cell:x,y` bucketing as society/contracts.ts's IndividualSnapshot.locationId — see locationIdFromPosition's export comment for why this must stay in sync. */
  readonly locationId: string;
  /** [0,1] — derived from real energy/fatigue; how much this individual's current "gather" action contributes. */
  readonly effort: number;
}

export interface LaborAdapter {
  listLaborers(state: WorldState): readonly LaborerSnapshot[];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Real per-creature effort derived from energy/fatigue (both [0,100] on CreatureState) — high energy and low fatigue means more effective labor this tick. */
function effortFromCreature(creature: CreatureState): number {
  return clamp01((creature.energy / 100) * (1 - creature.fatigue / 100));
}

export const defaultLaborAdapter: LaborAdapter = {
  listLaborers(state: WorldState): readonly LaborerSnapshot[] {
    const { creatures } = getCreatureModuleState(state);
    const out: LaborerSnapshot[] = [];
    for (const creature of Object.values(creatures)) {
      if (creature.currentAction?.actionId !== "gather") continue;
      out.push({
        creatureId: creature.creatureId,
        locationId: locationIdFromPosition(creature.position),
        effort: effortFromCreature(creature),
      });
    }
    return out.sort((a, b) => a.creatureId.localeCompare(b.creatureId));
  },
};

export interface EconomyAdapters {
  readonly ecology: EcologyResourceAdapter;
  readonly settlements: SettlementAdapter;
  readonly labor: LaborAdapter;
}

export const defaultEconomyAdapters: EconomyAdapters = {
  ecology: defaultEcologyResourceAdapter,
  settlements: defaultSettlementAdapter,
  labor: defaultLaborAdapter,
};

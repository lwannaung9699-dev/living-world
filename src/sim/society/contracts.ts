/**
 * Team 07 (Society & Civilization) — external adapter contracts.
 *
 * Team 07 does NOT own individuals, kinship biology, or resource ecology.
 * Those belong to Team 06 (NPC/creature intelligence), Team 04 (biology),
 * and Team 05 (ecology) respectively. As of this snapshot none of those
 * teams have landed real modules under `state.modules`, so — per the
 * project rule "do not wait for other teams; create clean interfaces/
 * adapters instead" — Team 07 defines the minimal shape it needs from each
 * of them, plus a safe default adapter that duck-types against
 * `state.modules.<name>` if present and degrades to "no data" otherwise.
 *
 * When Team 04/05/06 land their real modules, only the default adapters in
 * this file need to change (to read the real shapes) — no subsystem logic
 * in society/** depends on how the data got here.
 */

import { WorldState } from "../core/state/worldState";
import { ECONOMY_MODULE_KEY, EconomyState } from "../economy/state";

/* ---------------------------------------------------------------------- */
/* Team 06 — NPC / individual adapter                                      */
/* ---------------------------------------------------------------------- */

/** The minimal per-individual facts Team 07's social simulation needs. */
export interface IndividualSnapshot {
  readonly id: string;
  readonly alive: boolean;
  /** Abstract location/region key. Owned by Team 02 world-gen; Team 07 treats it as an opaque string. */
  readonly locationId: string;
  readonly traits: {
    /** [0,1] tendency to seek and value social interaction. */
    readonly sociability: number;
    /** [0,1] tendency toward hostile/competitive behavior. */
    readonly aggression: number;
    /** [0,1] drive to seek status, resources, influence. */
    readonly ambition: number;
    /** [0,1] tendency to value others' wellbeing. */
    readonly empathy: number;
  };
}

export interface NpcAdapter {
  listIndividuals(state: WorldState): readonly IndividualSnapshot[];
}

function isIndividualSnapshot(value: unknown): value is IndividualSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<IndividualSnapshot>;
  return (
    typeof v.id === "string" &&
    typeof v.alive === "boolean" &&
    typeof v.locationId === "string" &&
    typeof v.traits === "object" &&
    v.traits !== null &&
    typeof (v.traits as Record<string, unknown>).sociability === "number" &&
    typeof (v.traits as Record<string, unknown>).aggression === "number" &&
    typeof (v.traits as Record<string, unknown>).ambition === "number" &&
    typeof (v.traits as Record<string, unknown>).empathy === "number"
  );
}

/**
 * Default NPC adapter: reads `state.modules.npc.individuals` if Team 06 has
 * populated it in a compatible shape; otherwise returns an empty list so
 * Team 07's subsystems are all safe, deterministic no-ops.
 */
export const defaultNpcAdapter: NpcAdapter = {
  listIndividuals(state: WorldState): readonly IndividualSnapshot[] {
    const npcModule = state.modules["npc"] as { individuals?: unknown } | undefined;
    const raw = npcModule?.individuals;
    if (!Array.isArray(raw)) return [];
    return raw.filter(isIndividualSnapshot);
  },
};

/* ---------------------------------------------------------------------- */
/* Team 04 — biology / kinship adapter                                     */
/* ---------------------------------------------------------------------- */

export type KinshipRelation = "parent" | "child" | "sibling" | "mate";

export interface KinshipFact {
  readonly a: string;
  readonly b: string;
  readonly relation: KinshipRelation;
}

export interface BiologyAdapter {
  listKinshipFacts(state: WorldState): readonly KinshipFact[];
}

function isKinshipFact(value: unknown): value is KinshipFact {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<KinshipFact>;
  return (
    typeof v.a === "string" &&
    typeof v.b === "string" &&
    (v.relation === "parent" || v.relation === "child" || v.relation === "sibling" || v.relation === "mate")
  );
}

export const defaultBiologyAdapter: BiologyAdapter = {
  listKinshipFacts(state: WorldState): readonly KinshipFact[] {
    const bioModule = state.modules["biology"] as { kinshipFacts?: unknown } | undefined;
    const raw = bioModule?.kinshipFacts;
    if (!Array.isArray(raw)) return [];
    return raw.filter(isKinshipFact);
  },
};

/* ---------------------------------------------------------------------- */
/* Team 05 — ecology / resource adapter                                    */
/* ---------------------------------------------------------------------- */

export interface LocationResourceSnapshot {
  readonly locationId: string;
  /** Relative resource abundance at this location, [0,1]. */
  readonly abundance: number;
}

export interface EcologyAdapter {
  listLocationResources(state: WorldState): readonly LocationResourceSnapshot[];
}

function isLocationResourceSnapshot(value: unknown): value is LocationResourceSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<LocationResourceSnapshot>;
  return typeof v.locationId === "string" && typeof v.abundance === "number";
}

/** Neutral abundance assumed for any location Team 05 hasn't reported on yet. */
export const DEFAULT_ABUNDANCE = 0.5;

export const defaultEcologyAdapter: EcologyAdapter = {
  listLocationResources(state: WorldState): readonly LocationResourceSnapshot[] {
    const ecoModule = state.modules["ecology"] as { locationResources?: unknown } | undefined;
    const raw = ecoModule?.locationResources;
    if (!Array.isArray(raw)) return [];
    return raw.filter(isLocationResourceSnapshot);
  },
};

export function abundanceAt(resources: readonly LocationResourceSnapshot[], locationId: string): number {
  const found = resources.find((r) => r.locationId === locationId);
  return found ? found.abundance : DEFAULT_ABUNDANCE;
}

/* ---------------------------------------------------------------------- */
/* Team 09 — economy / settlement stock adapter (read-only, gap #2)        */
/* ---------------------------------------------------------------------- */

/**
 * NOT part of `SocietyAdapters` / the main `societyTick` — Society runs
 * *before* Economy each pipeline tick (see defaultSimulationPipeline.ts),
 * so reading Team 09's state from inside `societyTick` would always be one
 * tick stale. Instead this adapter is consumed by a separate reconciliation
 * step (`reconcileEconomicStock`, see ./economyReconciliation.ts) that the
 * composition root appends to the pipeline *after* Economy, so the figure
 * reflects the current tick. Per project convention (see economy/
 * contracts.ts), this reads the real, already-merged Team 09 module shape
 * directly rather than a placeholder duck-typed shape, since Team 09 is
 * already in the repo.
 */
export interface SettlementStockSnapshot {
  readonly settlementId: string;
  /** Sum of every resourceType this settlement holds in Team 09's EconomyState.stocks. */
  readonly totalStock: number;
}

export interface EconomyAdapter {
  listSettlementStocks(state: WorldState): readonly SettlementStockSnapshot[];
}

export const defaultEconomyAdapter: EconomyAdapter = {
  listSettlementStocks(state: WorldState): readonly SettlementStockSnapshot[] {
    const economy = state.modules[ECONOMY_MODULE_KEY] as EconomyState | undefined;
    if (!economy) return [];
    return Object.keys(economy.stocks)
      .sort()
      .map((settlementId) => ({
        settlementId,
        totalStock: Object.values(economy.stocks[settlementId]).reduce((sum, quantity) => sum + quantity, 0),
      }));
  },
};

/** Bundle of all three adapters, so subsystems take one parameter instead of three. */
export interface SocietyAdapters {
  readonly npc: NpcAdapter;
  readonly biology: BiologyAdapter;
  readonly ecology: EcologyAdapter;
}

export const defaultSocietyAdapters: SocietyAdapters = {
  npc: defaultNpcAdapter,
  biology: defaultBiologyAdapter,
  ecology: defaultEcologyAdapter,
};

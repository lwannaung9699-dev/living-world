/**
 * Team 07 (Society & Civilization) — external adapter contracts.
 *
 * Team 07 does NOT own individuals, kinship biology, or resource ecology.
 * Those belong to Team 06 (NPC/creature intelligence), Team 04 (biology),
 * and Team 05 (ecology) respectively. Per the project rule "do not wait
 * for other teams; create clean interfaces/adapters instead", Team 07
 * defines the minimal shape it needs from each of them, plus a default
 * adapter that duck-types against `state.modules.<name>` if present and
 * degrades to "no data" otherwise.
 *
 * RECONCILED 2026-08-21: all three default adapters below (`npc`,
 * `biology`, `ecology`) were reading placeholder keys/shapes that Team
 * 04/05/06's real modules never actually produce — despite each team's
 * own real module having landed in the repo and this file's own header
 * claiming otherwise. Concretely, `state.modules.npc.individuals`,
 * `state.modules.biology.kinshipFacts`, and
 * `state.modules.ecology.locationResources` were all always `undefined`,
 * so every one of these adapters always silently returned `[]` / fell
 * back to `DEFAULT_ABUNDANCE` — passing 491/491 tests the whole time,
 * because nothing in the suite asserted on cross-team data actually
 * flowing through (only on safe-empty-input behavior). This is the same
 * bug class Team 08's populationAdapter.ts documents having fixed for its
 * *own* `npc` guess (see that file's header) — but that fix only patched
 * Team 08's adapter; it never touched the identical guess sitting here in
 * Team 07's own contracts.ts, which is what actually populates the
 * `SocialGroup.memberIds` that Team 08 reads through
 * `Settlement.groupId` — so Team 08's individually-correct adapter was
 * still being fed nothing.
 *
 * Real shapes now read:
 *  - `npc`: `state.modules.creature.creatures` (Team 06's real
 *    `CreatureModuleState`, see creature/tick/creatureTick.ts).
 *  - `biology`: `state.modules.biology.entities` (Team 04's real
 *    `BiologyModuleState`, see biology/tick/biologyModuleState.ts) —
 *    kinship is derived from each `BioEntity.parentIds`.
 *  - `ecology`: `state.modules.ecology.resources` (Team 05's real
 *    `EcologyModuleState`, see ecology/state.ts) — abundance is derived
 *    from each `EcologicalResource.availableAmount / .capacity`.
 * See each adapter below for the full field-by-field mapping.
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Grid cell size (world units) used to bucket a creature's continuous
 * position into an opaque location key. See file header — Team 02 doesn't
 * expose a real chunk-key module yet, this is a Team 07-side heuristic.
 * Exported so any other team deriving a location key from a Team 06
 * position (e.g. Team 09's labor adapter) uses the exact same bucketing —
 * `Settlement.locationId` is itself sourced from `IndividualSnapshot
 * .locationId` (see settlement.ts), so staying in sync here is what lets
 * a labor signal actually land on the right settlement.
 */
export const GRID_CELL_SIZE = 20;

export function locationIdFromPosition(position: unknown): string {
  if (!isPlainObject(position) || typeof position["x"] !== "number" || typeof position["y"] !== "number") {
    return "unknown";
  }
  const cx = Math.floor((position["x"] as number) / GRID_CELL_SIZE);
  const cy = Math.floor((position["y"] as number) / GRID_CELL_SIZE);
  return `cell:${cx},${cy}`;
}

function numOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Real per-creature composite proxy for a trait Team 06's personality model doesn't name directly. See file header. */
function ambitionFromPersonality(p: Record<string, unknown>): number {
  return clamp01((numOr(p["riskTolerance"], 0.5) + numOr(p["independence"], 0.5) + numOr(p["boldness"], 0.5)) / 3);
}

/** Real per-creature composite proxy for a trait Team 06's personality model doesn't name directly. See file header. */
function empathyFromPersonality(p: Record<string, unknown>): number {
  return clamp01(
    (numOr(p["patience"], 0.5) + (1 - numOr(p["territoriality"], 0.5)) + (1 - numOr(p["aggression"], 0.5))) / 3,
  );
}

/** Duck-typed read of one entry in `state.modules.creature.creatures` into an IndividualSnapshot. Returns null if the entry doesn't look like a real CreatureState. */
function creatureToIndividualSnapshot(creatureId: string, raw: unknown): IndividualSnapshot | null {
  if (!isPlainObject(raw) || !isPlainObject(raw["personality"])) return null;
  const personality = raw["personality"] as Record<string, unknown>;
  if (typeof personality["sociability"] !== "number" || typeof personality["aggression"] !== "number") return null;

  return {
    id: creatureId,
    alive: true, // presence in `creatures` is Team 06's liveness signal (it removes dead creatures via `removeCreature`) — see file header.
    locationId: locationIdFromPosition(raw["position"]),
    traits: {
      sociability: clamp01(personality["sociability"] as number),
      aggression: clamp01(personality["aggression"] as number),
      ambition: ambitionFromPersonality(personality),
      empathy: empathyFromPersonality(personality),
    },
  };
}

/**
 * Default NPC adapter: reads `state.modules.creature.creatures` (Team 06's
 * real module) if attached in a compatible shape; otherwise returns an
 * empty list so Team 07's subsystems are all safe, deterministic no-ops.
 * See file header for the full field-by-field mapping and its rationale.
 */
export const defaultNpcAdapter: NpcAdapter = {
  listIndividuals(state: WorldState): readonly IndividualSnapshot[] {
    const creatureModule = state.modules["creature"] as { creatures?: unknown } | undefined;
    const raw = creatureModule?.creatures;
    if (!isPlainObject(raw)) return [];

    const out: IndividualSnapshot[] = [];
    for (const [id, value] of Object.entries(raw)) {
      const snapshot = creatureToIndividualSnapshot(id, value);
      if (snapshot && isIndividualSnapshot(snapshot)) out.push(snapshot);
    }
    return out;
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

/**
 * Derives kinship facts from Team 04's real per-entity `parentIds`. Emits
 * one directional `parent` fact per parent->child edge (`a` = parent,
 * `b` = child; Team 07's relationship storage is undirected per pair — see
 * `pairKey` in relationships.ts — so a single fact per edge is sufficient),
 * plus `sibling` facts for any two entities sharing a non-empty parent set.
 * There is no "mate"/pair-bond field anywhere in Team 04's real data, so
 * `mate` facts are never emitted — an honest gap, not a guess. See file
 * header.
 */
function deriveKinshipFactsFromBiologyEntities(entities: Readonly<Record<string, unknown>>): KinshipFact[] {
  const facts: KinshipFact[] = [];
  const parentIdsByEntity: Record<string, string[]> = {};

  for (const [id, raw] of Object.entries(entities)) {
    if (!isPlainObject(raw) || !Array.isArray(raw["parentIds"])) continue;
    const parentIds = (raw["parentIds"] as unknown[]).filter((p): p is string => typeof p === "string");
    parentIdsByEntity[id] = parentIds;
    for (const parentId of parentIds) {
      facts.push({ a: parentId, b: id, relation: "parent" });
    }
  }

  const entityIds = Object.keys(parentIdsByEntity).sort();
  for (let i = 0; i < entityIds.length; i++) {
    for (let j = i + 1; j < entityIds.length; j++) {
      const a = entityIds[i];
      const b = entityIds[j];
      const parentsA = parentIdsByEntity[a];
      const parentsB = parentIdsByEntity[b];
      if (parentsA.length === 0 || parentsB.length === 0) continue;
      if (parentsA.some((p) => parentsB.includes(p))) {
        facts.push({ a, b, relation: "sibling" });
        facts.push({ a: b, b: a, relation: "sibling" });
      }
    }
  }
  return facts;
}

/**
 * Default biology adapter: derives kinship facts from
 * `state.modules.biology.entities` (Team 04's real module) if attached in
 * a compatible shape; otherwise returns an empty list. See file header.
 */
export const defaultBiologyAdapter: BiologyAdapter = {
  listKinshipFacts(state: WorldState): readonly KinshipFact[] {
    const bioModule = state.modules["biology"] as { entities?: unknown } | undefined;
    const entities = bioModule?.entities;
    if (!isPlainObject(entities)) return [];
    return deriveKinshipFactsFromBiologyEntities(entities).filter(isKinshipFact);
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

/** Neutral abundance assumed for any location Team 05 hasn't reported on yet. */
export const DEFAULT_ABUNDANCE = 0.5;

/**
 * Default ecology adapter: reads `state.modules.ecology.resources` (Team
 * 05's real module) if attached in a compatible shape, averaging
 * `availableAmount / capacity` across every resource sharing a `location`;
 * otherwise returns an empty list. See file header.
 */
export const defaultEcologyAdapter: EcologyAdapter = {
  listLocationResources(state: WorldState): readonly LocationResourceSnapshot[] {
    const ecoModule = state.modules["ecology"] as { resources?: unknown } | undefined;
    const raw = ecoModule?.resources;
    if (!isPlainObject(raw)) return [];

    const sums: Record<string, { total: number; count: number }> = {};
    for (const value of Object.values(raw)) {
      if (!isPlainObject(value)) continue;
      const locationId = typeof value["location"] === "string" ? (value["location"] as string) : null;
      const available = typeof value["availableAmount"] === "number" ? (value["availableAmount"] as number) : null;
      const capacity = typeof value["capacity"] === "number" ? (value["capacity"] as number) : null;
      if (locationId === null || available === null || capacity === null || capacity <= 0) continue;
      const entry = sums[locationId] ?? { total: 0, count: 0 };
      entry.total += clamp01(available / capacity);
      entry.count += 1;
      sums[locationId] = entry;
    }

    return Object.entries(sums).map(([locationId, { total, count }]) => ({
      locationId,
      abundance: count > 0 ? total / count : DEFAULT_ABUNDANCE,
    }));
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

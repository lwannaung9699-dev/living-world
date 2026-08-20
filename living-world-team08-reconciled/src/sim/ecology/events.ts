import { PopulationData, isExtinct, lineageOf } from "./population";
import { EcologicalResource } from "./resources";
import { FoodWeb } from "./foodWeb";
import { EcologicalInteraction, isConsumptiveInteraction } from "./interactions";

export interface PopulationExtinctionEvent {
  readonly type: "PopulationExtinction";
  readonly tick: number;
  readonly populationId: string;
  readonly speciesId: string;
  readonly location: string;
  /** Ancestry chain of this population, oldest first, for historical/provenance tracking (see population.ts lineageOf). */
  readonly lineage: readonly string[];
}

/**
 * SpeciationSignal — a *signal only*: Team 05 flags that a population's
 * accumulated trait divergence has crossed a configurable threshold and
 * may warrant treatment as a distinct species. Team 05 never performs the
 * split itself (that is Team 04's genome/lineage authority); this event
 * simply carries enough provenance for Team 04 (or a future lineage
 * system) to act on.
 */
export interface SpeciationSignalEvent {
  readonly type: "SpeciationSignal";
  readonly tick: number;
  readonly populationId: string;
  readonly speciesId: string;
  readonly lineage: readonly string[];
  readonly reason: string;
  /** 0..1 magnitude of the divergence signal that triggered this event (e.g. average trait variance). */
  readonly divergence: number;
}

export interface ResourceCollapseEvent {
  readonly type: "ResourceCollapse";
  readonly tick: number;
  readonly resourceId: string;
  readonly location: string;
}

export interface FoodWebDisruptionEvent {
  readonly type: "FoodWebDisruption";
  readonly tick: number;
  readonly nodeId: string;
  readonly affectedConsumerIds: readonly string[];
}

export interface EcosystemShiftEvent {
  readonly type: "EcosystemShift";
  readonly tick: number;
  readonly description: string;
}

export type EcologicalEvent =
  | PopulationExtinctionEvent
  | ResourceCollapseEvent
  | FoodWebDisruptionEvent
  | EcosystemShiftEvent
  | SpeciationSignalEvent;

/** Populations that hit zero count this tick, as PopulationExtinction events. Historical info is never deleted by this function -- it only reports. */
export function detectExtinctions(populations: readonly PopulationData[], tick: number): PopulationExtinctionEvent[] {
  return populations.filter(isExtinct).map((p) => ({
    type: "PopulationExtinction" as const,
    tick,
    populationId: p.populationId,
    speciesId: p.speciesId,
    location: p.location,
    lineage: lineageOf(p),
  }));
}

/** Resources that have permanently bottomed out (zero available, zero capacity to regenerate into), as ResourceCollapse events. */
export function detectResourceCollapse(resources: readonly EcologicalResource[], tick: number): ResourceCollapseEvent[] {
  return resources
    .filter((r) => r.availableAmount <= 0 && r.capacity <= 0)
    .map((r) => ({ type: "ResourceCollapse" as const, tick, resourceId: r.resourceId, location: r.location }));
}

/**
 * Detects broken food-web dependencies: a node (population or resource)
 * that consumers depended on has gone extinct/collapsed this tick, leaving
 * those consumers without that food source.
 */
export function detectFoodWebDisruption(
  foodWeb: FoodWeb,
  extinctPopulationIds: readonly string[],
  collapsedResourceIds: readonly string[],
  tick: number,
): FoodWebDisruptionEvent[] {
  const lostNodeIds = new Set([...extinctPopulationIds, ...collapsedResourceIds]);
  const events: FoodWebDisruptionEvent[] = [];

  for (const nodeId of lostNodeIds) {
    const affectedConsumerIds = foodWeb.edges.filter((e) => e.to === nodeId).map((e) => e.from);
    if (affectedConsumerIds.length > 0) {
      events.push({ type: "FoodWebDisruption", tick, nodeId, affectedConsumerIds });
    }
  }
  return events;
}

/** True if a set of consumption interactions still references a now-lost target — used to flag interactions needing cleanup/reassignment by future systems, without Team 05 deleting historical data. */
export function findOrphanedInteractions(
  interactions: readonly EcologicalInteraction[],
  lostNodeIds: ReadonlySet<string>,
): EcologicalInteraction[] {
  return interactions.filter((i) => isConsumptiveInteraction(i.type) && lostNodeIds.has(i.targetId));
}

/** A coarse ecosystem-level narrative event, for large collective shifts (e.g. many extinctions/collapses in one tick). Future History systems can render this into narrative text. */
export function ecosystemShiftEvent(tick: number, description: string): EcosystemShiftEvent {
  return { type: "EcosystemShift", tick, description };
}

/**
 * Emits a SpeciationSignal when a population's average trait divergence
 * (traitVariance) crosses a configurable threshold -- a proxy for
 * "this population has drifted enough from its founding lineage that a
 * geneticist (Team 04) might reasonably treat it as diverging into a new
 * species". Team 05 supplies only the signal and provenance; it never
 * creates the new species/population itself.
 */
export function detectSpeciationSignal(
  population: PopulationData,
  tick: number,
  divergenceThreshold = 0.5,
): SpeciationSignalEvent | undefined {
  const varianceValues = Object.values(population.traitVariance);
  if (varianceValues.length === 0) return undefined;

  const divergence = varianceValues.reduce((sum, v) => sum + v, 0) / varianceValues.length;
  if (divergence < divergenceThreshold) return undefined;

  return {
    type: "SpeciationSignal",
    tick,
    populationId: population.populationId,
    speciesId: population.speciesId,
    lineage: lineageOf(population),
    reason: "trait_divergence_threshold_exceeded",
    divergence,
  };
}

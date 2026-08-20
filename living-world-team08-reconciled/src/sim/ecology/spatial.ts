import { PopulationData } from "./population";
import { EcologicalResource } from "./resources";

/**
 * Spatial/region partitioning for ecology updates.
 *
 * "Location" (PopulationData.location / EcologicalResource.location) is
 * Team 05's chunk/region key -- owned and defined by whichever team
 * generates the world's spatial layout (Team 02), Team 05 only reads it
 * as an opaque string. Every cross-entity ecology computation (competition
 * overlap, predation/herbivory targeting, carrying capacity's resource
 * pool) is restricted to entities sharing a location, and this module is
 * what makes that restriction O(region-size) instead of an O(world-size)
 * scan repeated per population: build one index per tick, then look up a
 * region's members in O(1).
 */
export interface RegionIndex {
  /** location -> populationIds present there. */
  readonly populationsByLocation: Readonly<Record<string, readonly string[]>>;
  /** location -> resourceIds present there. */
  readonly resourcesByLocation: Readonly<Record<string, readonly string[]>>;
}

export function buildRegionIndex(
  populations: readonly PopulationData[],
  resources: readonly EcologicalResource[],
): RegionIndex {
  const populationsByLocation: Record<string, string[]> = {};
  for (const population of populations) {
    (populationsByLocation[population.location] ??= []).push(population.populationId);
  }

  const resourcesByLocation: Record<string, string[]> = {};
  for (const resource of resources) {
    (resourcesByLocation[resource.location] ??= []).push(resource.resourceId);
  }

  return { populationsByLocation, resourcesByLocation };
}

/** Population ids sharing a location with the given population, excluding itself. Empty array (not a scan) when the region has no other members. */
export function populationsInSameRegion(index: RegionIndex, population: PopulationData): readonly string[] {
  const members = index.populationsByLocation[population.location] ?? [];
  return members.filter((id) => id !== population.populationId);
}

/** Resource ids located in the same region as the given population. */
export function resourcesInRegion(index: RegionIndex, location: string): readonly string[] {
  return index.resourcesByLocation[location] ?? [];
}

/**
 * Per-region aggregate summary, useful both as a cheap ecosystem-metrics
 * building block and as the unit of work for a future LOD/aggregate-tier
 * simulation (project rule #23: near player = detailed, far = aggregate).
 */
export interface RegionAggregate {
  readonly location: string;
  readonly totalBiomass: number;
  readonly speciesCounts: Readonly<Record<string, number>>;
  readonly populationCount: number;
  readonly totalResourceAvailable: number;
}

export function aggregateByRegion(
  populations: readonly PopulationData[],
  resources: readonly EcologicalResource[],
): Readonly<Record<string, RegionAggregate>> {
  const byLocation: Record<string, { totalBiomass: number; speciesCounts: Record<string, number>; populationCount: number; totalResourceAvailable: number }> = {};

  for (const population of populations) {
    const bucket = (byLocation[population.location] ??= {
      totalBiomass: 0,
      speciesCounts: {},
      populationCount: 0,
      totalResourceAvailable: 0,
    });
    bucket.totalBiomass += population.count;
    bucket.speciesCounts[population.speciesId] = (bucket.speciesCounts[population.speciesId] ?? 0) + population.count;
    bucket.populationCount += 1;
  }

  for (const resource of resources) {
    const bucket = (byLocation[resource.location] ??= {
      totalBiomass: 0,
      speciesCounts: {},
      populationCount: 0,
      totalResourceAvailable: 0,
    });
    bucket.totalResourceAvailable += resource.availableAmount;
  }

  const result: Record<string, RegionAggregate> = {};
  for (const location of Object.keys(byLocation).sort()) {
    const bucket = byLocation[location];
    result[location] = { location, ...bucket };
  }
  return result;
}

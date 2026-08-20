import { clamp } from "./contracts";
import { PopulationData } from "./population";
import { EcologicalResource } from "./resources";
import { InvalidStateError } from "../core/errors";

/**
 * EcologicalDisturbance — a generic environmental shock Team 05 *consumes*
 * but never generates (per project rule #18; future weather/history/geology
 * teams are the source). Free-form `type` string ("drought", "flood",
 * "fire", "cold_period", "heat_period", "resource_collapse",
 * "habitat_destruction", or any future type) so Team 05 never needs to know
 * about a new disturbance kind in advance.
 */
export interface EcologicalDisturbance {
  readonly disturbanceId: string;
  readonly type: string;
  readonly location: string;
  /** 0..1 severity. */
  readonly intensity: number;
  /** Ticks remaining before the disturbance ends; undefined means it persists until externally removed. */
  readonly remainingTicks?: number;
}

export function validateDisturbance(value: unknown): asserts value is EcologicalDisturbance {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("EcologicalDisturbance must be an object");
  }
  const d = value as Partial<EcologicalDisturbance>;
  if (typeof d.disturbanceId !== "string" || d.disturbanceId.length === 0) {
    throw new InvalidStateError("EcologicalDisturbance.disturbanceId must be a non-empty string");
  }
  if (typeof d.type !== "string" || d.type.length === 0) {
    throw new InvalidStateError("EcologicalDisturbance.type must be a non-empty string");
  }
  if (typeof d.location !== "string" || d.location.length === 0) {
    throw new InvalidStateError("EcologicalDisturbance.location must be a non-empty string");
  }
  if (typeof d.intensity !== "number" || d.intensity < 0 || d.intensity > 1) {
    throw new InvalidStateError("EcologicalDisturbance.intensity must be within [0, 1]");
  }
}

/** Applies one tick of a disturbance to a resource at its location (reduces available amount and/or capacity headroom). */
export function applyDisturbanceToResource(
  resource: EcologicalResource,
  disturbance: EcologicalDisturbance,
): EcologicalResource {
  if (resource.location !== disturbance.location) return resource;
  const loss = resource.availableAmount * disturbance.intensity * 0.5;
  return { ...resource, availableAmount: clamp(resource.availableAmount - loss, 0, resource.capacity) };
}

/** Applies one tick of a disturbance to a population at its location (reduces health, a mild direct mortality effect). */
export function applyDisturbanceToPopulation(
  population: PopulationData,
  disturbance: EcologicalDisturbance,
): { population: PopulationData; deaths: number } {
  if (population.location !== disturbance.location) return { population, deaths: 0 };

  const healthLoss = disturbance.intensity * 0.3;
  const mortalityFraction = disturbance.intensity * 0.1;
  const deaths = population.count * mortalityFraction;

  return {
    population: {
      ...population,
      health: clamp(population.health - healthLoss),
      count: Math.max(0, population.count - deaths),
    },
    deaths,
  };
}

/** Advances a disturbance's remaining duration by one tick; returns undefined once it has expired (caller should drop it). */
export function tickDisturbanceDuration(disturbance: EcologicalDisturbance): EcologicalDisturbance | undefined {
  if (disturbance.remainingTicks === undefined) return disturbance;
  const remainingTicks = disturbance.remainingTicks - 1;
  if (remainingTicks <= 0) return undefined;
  return { ...disturbance, remainingTicks };
}

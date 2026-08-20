import { clamp } from "./contracts";
import { PopulationData } from "./population";

export interface CompetitorOverlap {
  readonly population: PopulationData;
  /** 0..1 how much this competitor's resource/habitat/space use overlaps with the focal population's. */
  readonly overlap: number;
}

export interface CompetitionInput {
  readonly population: PopulationData;
  readonly carryingCapacity: number;
  /** Other populations sharing food/water/space/habitat with the focal population, with an overlap weight each. */
  readonly competitors: readonly CompetitorOverlap[];
}

export interface CompetitionResult {
  /** 0..1 pressure from members of the population's own species competing with each other. */
  readonly intraspecificPressure: number;
  /** 0..1 pressure from other species competing for the same niche. */
  readonly interspecificPressure: number;
  /** Combined 0..1 competition pressure, used by carrying capacity / population dynamics. */
  readonly totalPressure: number;
}

/**
 * Computes intraspecific and interspecific competition pressure for a
 * population. Intraspecific pressure grows with density relative to
 * carrying capacity (self-thinning); interspecific pressure grows with the
 * overlap-weighted density of competing populations sharing the same
 * resources/habitat/space.
 */
export function computeCompetitionPressure(input: CompetitionInput): CompetitionResult {
  const intraspecificPressure =
    input.carryingCapacity > 0 ? clamp(input.population.count / input.carryingCapacity) : input.population.count > 0 ? 1 : 0;

  const interspecificLoad = input.competitors
    .filter((c) => c.population.speciesId !== input.population.speciesId)
    .reduce((sum, c) => sum + clamp(c.overlap) * c.population.count, 0);

  const referenceScale = Math.max(input.carryingCapacity, 1);
  const interspecificPressure = clamp(interspecificLoad / referenceScale);

  const totalPressure = clamp(1 - (1 - intraspecificPressure) * (1 - interspecificPressure));

  return { intraspecificPressure, interspecificPressure, totalPressure };
}

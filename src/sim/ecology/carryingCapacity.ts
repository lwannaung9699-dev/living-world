import { clamp, EcologicalEnvironment } from "./contracts";
import { EcologicalNiche, nicheSuitability } from "./niche";
import { EcologicalResource } from "./resources";

export interface CarryingCapacityInput {
  readonly niche: EcologicalNiche;
  readonly environment: EcologicalEnvironment;
  /** Resources this population can feed on (already filtered to matching resourceType/location by the caller). */
  readonly availableResources: readonly EcologicalResource[];
  /** Biomass/food units required to sustain one individual per tick. */
  readonly perCapitaResourceRequirement: number;
  /** 0..1 pressure from predators hunting this population (0 = none, 1 = severe). */
  readonly predationPressure?: number;
  /** 0..1 pressure from competing populations (0 = none, 1 = severe). */
  readonly competitionPressure?: number;
  /** 0..1 pressure from disease (0 = none, 1 = severe). */
  readonly diseasePressure?: number;
}

/**
 * Derives the ecological carrying capacity for a population from actual
 * environmental/resource state, rather than an author-set fixed maximum.
 *
 * Base capacity = total available food biomass / per-capita requirement,
 * scaled down by how well the environment fits the species' niche, and
 * further reduced by predation, competition, and disease pressure.
 */
export function computeCarryingCapacity(input: CarryingCapacityInput): number {
  const suitability = nicheSuitability(input.niche, input.environment);
  if (suitability <= 0) return 0;

  const totalFood = input.availableResources.reduce((sum, r) => sum + r.availableAmount, 0);
  if (input.perCapitaResourceRequirement <= 0) return 0;

  const foodLimitedCapacity = totalFood / input.perCapitaResourceRequirement;

  const predationPressure = clamp(input.predationPressure ?? 0);
  const competitionPressure = clamp(input.competitionPressure ?? 0);
  const diseasePressure = clamp(input.diseasePressure ?? 0);

  // Each pressure independently shrinks the sustainable population size;
  // combined multiplicatively so no single pressure alone can zero out
  // capacity unless it is itself at maximum severity.
  const pressureFactor =
    (1 - predationPressure * 0.6) * (1 - competitionPressure * 0.5) * (1 - diseasePressure * 0.7);

  return Math.max(0, foodLimitedCapacity * suitability * clamp(pressureFactor, 0, 1));
}

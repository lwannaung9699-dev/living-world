import { clamp, EcologicalEnvironment } from "./contracts";
import { PopulationData } from "./population";
import { EcologicalNiche, nicheSuitability } from "./niche";

/**
 * MigrationProposal — Team 05's output when migration pressure builds up
 * for a population. This is a *proposal*, not a movement: world
 * navigation/pathfinding and the actual relocation of individuals belong to
 * a future team. Team 05 only decides "this population wants to move, and
 * how badly", plus a human-readable reason trail for diagnostics/history.
 */
export interface MigrationProposal {
  readonly populationId: string;
  readonly fromLocation: string;
  /** 0..1 overall migration pressure. */
  readonly pressure: number;
  /** 0..1 fraction of the population this pressure would move, if pressure crosses the population's own threshold. */
  readonly proposedFraction: number;
  readonly reasons: readonly string[];
}

export interface MigrationInputs {
  readonly population: PopulationData;
  readonly niche: EcologicalNiche;
  readonly environment: EcologicalEnvironment;
  readonly carryingCapacity: number;
  /** 0..1, from predation.ts / dynamics.ts aggregation for this population this tick. */
  readonly predationPressure: number;
}

/**
 * Evaluates migration pressure for a population from food/water scarcity,
 * density, habitat quality, temperature suitability, and predation
 * pressure -- exactly the factors listed in the project spec. Any factor
 * exceeding a mild threshold contributes to pressure and is recorded as a
 * reason.
 */
export function evaluateMigrationPressure(inputs: MigrationInputs): MigrationProposal {
  const { population, niche, environment, carryingCapacity, predationPressure } = inputs;
  const reasons: string[] = [];

  const densityPressure =
    carryingCapacity > 0 ? clamp(population.count / carryingCapacity - 1, 0, 1) : population.count > 0 ? 1 : 0;
  if (densityPressure > 0.1) reasons.push("high_population_density");

  const suitability = nicheSuitability(niche, environment);
  const suitabilityPressure = clamp(1 - suitability);
  if (suitabilityPressure > 0.4) reasons.push("poor_habitat_suitability");

  const waterPressure = clamp(1 - environment.waterAvailability / Math.max(niche.waterRequirement, 0.0001));
  if (niche.waterRequirement > 0 && waterPressure > 0.4) reasons.push("water_scarcity");

  if (predationPressure > 0.4) reasons.push("predation_pressure");

  const pressure = clamp(
    densityPressure * 0.3 + suitabilityPressure * 0.3 + Math.max(waterPressure, 0) * 0.2 + predationPressure * 0.2,
  );

  const proposedFraction = clamp(pressure * population.migrationRate * 2);

  return {
    populationId: population.populationId,
    fromLocation: population.location,
    pressure,
    proposedFraction,
    reasons,
  };
}

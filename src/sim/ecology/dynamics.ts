import { clamp } from "./contracts";
import { DeterministicRng } from "../core/rng/deterministicRng";
import { PopulationData, clampPopulationVitals } from "./population";

/**
 * All the pressures/inputs that feed into a single tick's population
 * update. Every field is a pre-aggregated 0..1 (or ratio) signal computed
 * earlier in the tick by the other ecology subsystems (competition.ts,
 * predation.ts/consumption.ts, disease.ts, disturbance.ts, niche.ts) —
 * dynamics.ts itself never re-derives them, it only combines them into the
 * births/deaths update. This keeps population dynamics extensible (rule
 * #13): a future pressure source just needs to contribute one more 0..1
 * number here, never a rewrite of this function.
 */
export interface PopulationUpdateInputs {
  readonly population: PopulationData;
  readonly carryingCapacity: number;
  /** 0..1 niche/environment suitability (see niche.ts). */
  readonly environmentSuitability: number;
  /** 0..1 combined intra+interspecific competition pressure (see competition.ts). */
  readonly competitionPressure: number;
  /** Individuals lost this tick to predation, already resolved via consumption.ts (a count, not a fraction). */
  readonly predationLosses: number;
  /** 0..1 fraction of the population lost this tick to disease (see disease.ts). */
  readonly diseaseMortalityFraction: number;
  /** Energy gained this tick from successful feeding (predation/herbivory), roughly 0..1+ per capita. */
  readonly energyGainedPerCapita: number;
  /** Fraction of the population proposed to leave via migration this tick (see migration.ts); subtracted from count, never a death. */
  readonly migrationLossFraction?: number;
}

export interface PopulationUpdateResult {
  readonly population: PopulationData;
  readonly births: number;
  readonly deaths: number;
  readonly migrated: number;
}

/**
 * Advances one population by one tick. NOT a simplistic `count +=
 * fixedNumber`: births and deaths both scale with density relative to
 * carrying capacity, environment suitability, competition, predation,
 * disease, and the population's own current health/energy — and a small
 * deterministic stochastic term (drawn from this population's own RNG
 * stream) keeps population-level outcomes from being perfectly smooth
 * formulas.
 */
export function updatePopulation(inputs: PopulationUpdateInputs, rng: DeterministicRng): PopulationUpdateResult {
  const { population, carryingCapacity, environmentSuitability, competitionPressure } = inputs;

  if (population.count <= 0) {
    return { population: clampPopulationVitals(population), births: 0, deaths: 0, migrated: 0 };
  }

  // Density-dependent growth term: 1 at zero density, shrinking toward 0 at
  // carrying capacity, and negative beyond it (overshoot drives decline).
  const densityFactor = carryingCapacity > 0 ? 1 - population.count / carryingCapacity : -1;

  const birthModifier = clamp(environmentSuitability * (1 - competitionPressure) * population.health, 0, 1);
  const stochasticBirth = clamp(1 + rng.gaussian(0, 0.05), 0.7, 1.3);
  const expectedBirths = Math.max(0, population.count * population.birthRate * Math.max(densityFactor, 0) * birthModifier * stochasticBirth);

  const baseDeathPressure = population.deathRate * (1 + Math.max(-densityFactor, 0));
  const environmentalDeathPressure = (1 - environmentSuitability) * 0.5;
  const competitionDeathPressure = competitionPressure * 0.3;
  const stochasticDeath = clamp(1 + rng.gaussian(0, 0.05), 0.7, 1.3);

  const naturalDeaths =
    population.count * clamp(baseDeathPressure + environmentalDeathPressure + competitionDeathPressure, 0, 1) * stochasticDeath;

  const predationLosses = Math.min(population.count, Math.max(0, inputs.predationLosses));
  const diseaseDeaths = population.count * clamp(inputs.diseaseMortalityFraction);

  const totalDeaths = Math.min(population.count, naturalDeaths + predationLosses + diseaseDeaths);

  const migrationLossFraction = clamp(inputs.migrationLossFraction ?? 0);
  const migrated = Math.max(0, population.count - totalDeaths) * migrationLossFraction;

  const nextCount = Math.max(0, population.count + expectedBirths - totalDeaths - migrated);

  const energyDelta = clamp(inputs.energyGainedPerCapita, -1, 1) * 0.2;
  const nextEnergy = clamp(population.energy + energyDelta - (1 - environmentSuitability) * 0.05);
  const nextHealth = clamp(population.health + (environmentSuitability - 0.5) * 0.05 - competitionPressure * 0.02);

  const nextPopulation: PopulationData = clampPopulationVitals({
    ...population,
    count: nextCount,
    energy: nextEnergy,
    health: nextHealth,
    generation: expectedBirths > 0 ? population.generation + 1 : population.generation,
  });

  return { population: nextPopulation, births: expectedBirths, deaths: totalDeaths, migrated };
}

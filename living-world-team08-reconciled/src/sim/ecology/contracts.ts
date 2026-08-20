/**
 * External contracts consumed by Team 05 (Ecology + Ecosystem Dynamics).
 *
 * Per the project rules, Team 05 must NOT import Team 02's or Team 04's
 * concrete implementations (they may not exist yet, and even once they do,
 * Team 05 must stay decoupled from their internals). Instead we define the
 * minimal abstract shapes we need here, as adapters. When Team 02/Team 04
 * ship real modules, the integration layer only needs to produce values
 * that satisfy these shapes -- nothing in src/sim/ecology needs to change.
 */

/**
 * EcologicalEnvironment — abstract environmental context for one location,
 * as it will eventually be supplied by Team 02 (Geography/Climate).
 *
 * All fields are intentionally generic numeric/string values, never
 * real-world biome names or hardcoded climate models.
 */
export interface EcologicalEnvironment {
  /** Arbitrary temperature unit, consistent across the world (e.g. Celsius). */
  readonly temperature: number;
  /** 0..1 relative humidity. */
  readonly humidity: number;
  /** 0..1 normalized water availability. */
  readonly waterAvailability: number;
  /** Free-form season label (e.g. "spring"), meaningful only to niche data. */
  readonly season: string;
  /** 0..1 overall habitat quality (cover, terrain suitability, etc). */
  readonly habitatQuality: number;
  /** 0..1 normalized general resource abundance signal for this location. */
  readonly resourceAvailability: number;
  /** 0..1 optional ambient disturbance intensity (fire risk, instability, ...). */
  readonly disturbance?: number;
}

/** Neutral fallback environment, used only when Team 02 has not supplied one for a location yet. */
export const DEFAULT_ECOLOGICAL_ENVIRONMENT: EcologicalEnvironment = {
  temperature: 20,
  humidity: 0.5,
  waterAvailability: 0.5,
  season: "unknown",
  habitatQuality: 0.5,
  resourceAvailability: 0.5,
  disturbance: 0,
};

/**
 * BiologicalTraits — an opaque bag of named numeric trait values, as they
 * will eventually be supplied by Team 04 (Genetics/Phenotype). Team 05
 * never interprets specific trait names beyond reading them generically
 * (e.g. as multipliers via `traitMultiplier`).
 */
export interface BiologicalTraits {
  readonly [traitName: string]: number;
}

/** BiologicalFitness — an aggregate 0..1 fitness score, as Team 04 will eventually compute it. */
export interface BiologicalFitness {
  readonly value: number;
}

/**
 * BiologicalPopulation — the minimal biological adapter shape Team 05 reads
 * per population. Team 04 owns trait inheritance, mutation, and fitness
 * computation; Team 05 only consumes the resulting summary values.
 */
export interface BiologicalPopulation {
  readonly populationId: string;
  readonly speciesId: string;
  readonly averageTraits: BiologicalTraits;
  readonly fitness: BiologicalFitness;
}

/** Neutral fallback biological summary, used only when Team 04 has not supplied one for a population yet. */
export function defaultBiologicalPopulation(populationId: string, speciesId: string): BiologicalPopulation {
  return {
    populationId,
    speciesId,
    averageTraits: {},
    fitness: { value: 0.5 },
  };
}

/** Reads a named trait from a BiologicalTraits bag, falling back to a default when absent/invalid. */
export function traitValue(traits: BiologicalTraits, name: string, fallback = 1): number {
  const value = traits[name];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Clamps a value into [min, max]. Shared numeric helper used throughout the ecology module. */
export function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

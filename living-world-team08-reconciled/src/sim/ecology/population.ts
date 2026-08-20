import { clamp } from "./contracts";
import { InvalidStateError } from "../core/errors";

/**
 * PopulationData — a group of organisms of one species at one location,
 * tracked at the population-statistics level (counts, rates, averages)
 * rather than per-individual. The architecture also supports individual-
 * level simulation (see performance.ts LodTier): an "individual" is simply
 * a PopulationData with count === 1 and near-zero traitVariance, so the
 * same update functions apply at either resolution without a fork in the
 * data model.
 */
export interface PopulationData {
  readonly populationId: string;
  readonly speciesId: string;
  readonly location: string;
  readonly count: number;
  /** Named age-class counts (e.g. { juvenile: 10, adult: 40, elder: 5 }). Free-form per species. */
  readonly ageStructure: Readonly<Record<string, number>>;
  /** Fraction of the population that is female, 0..1. */
  readonly sexRatio: number;
  readonly averageTraits: Readonly<Record<string, number>>;
  readonly traitVariance: Readonly<Record<string, number>>;
  /** 0..1 aggregate population health (injury/nutrition/condition). */
  readonly health: number;
  /** 0..1 aggregate available energy/reserves. */
  readonly energy: number;
  /** Baseline per-capita births per tick before environmental/ecological modifiers. */
  readonly birthRate: number;
  /** Baseline per-capita deaths per tick before environmental/ecological modifiers. */
  readonly deathRate: number;
  /** Baseline 0..1 propensity to migrate before pressure modifiers. */
  readonly migrationRate: number;
  readonly generation: number;
  /**
   * Ancestry chain of speciesIds this population descends from, oldest
   * first (e.g. ["ancestral-deer", "forest-deer"]). Team 05 never invents
   * or mutates this -- it is provided by whichever team creates/splits
   * populations (ultimately Team 04's lineage/speciation authority) and is
   * simply carried through and surfaced in extinction/speciation-signal
   * events for provenance. Defaults to [speciesId] when absent.
   */
  readonly lineage?: readonly string[];
}

export interface CreatePopulationInput {
  populationId: string;
  speciesId: string;
  location: string;
  count: number;
  ageStructure?: Record<string, number>;
  sexRatio?: number;
  averageTraits?: Record<string, number>;
  traitVariance?: Record<string, number>;
  health?: number;
  energy?: number;
  birthRate?: number;
  deathRate?: number;
  migrationRate?: number;
  generation?: number;
  lineage?: readonly string[];
}

export function createPopulation(input: CreatePopulationInput): PopulationData {
  const population: PopulationData = {
    populationId: input.populationId,
    speciesId: input.speciesId,
    location: input.location,
    count: input.count,
    ageStructure: input.ageStructure ?? {},
    sexRatio: input.sexRatio ?? 0.5,
    averageTraits: input.averageTraits ?? {},
    traitVariance: input.traitVariance ?? {},
    health: input.health ?? 1,
    energy: input.energy ?? 1,
    birthRate: input.birthRate ?? 0.1,
    deathRate: input.deathRate ?? 0.05,
    migrationRate: input.migrationRate ?? 0.05,
    generation: input.generation ?? 0,
    ...(input.lineage !== undefined ? { lineage: input.lineage } : {}),
  };
  validatePopulation(population);
  return population;
}

export function validatePopulation(value: unknown): asserts value is PopulationData {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("PopulationData must be an object");
  }
  const p = value as Partial<PopulationData>;
  if (typeof p.populationId !== "string" || p.populationId.length === 0) {
    throw new InvalidStateError("PopulationData.populationId must be a non-empty string");
  }
  if (typeof p.speciesId !== "string" || p.speciesId.length === 0) {
    throw new InvalidStateError("PopulationData.speciesId must be a non-empty string");
  }
  if (typeof p.location !== "string" || p.location.length === 0) {
    throw new InvalidStateError("PopulationData.location must be a non-empty string");
  }
  if (typeof p.count !== "number" || p.count < 0 || !Number.isFinite(p.count)) {
    throw new InvalidStateError("PopulationData.count must be a non-negative finite number");
  }
  if (typeof p.sexRatio !== "number" || p.sexRatio < 0 || p.sexRatio > 1) {
    throw new InvalidStateError("PopulationData.sexRatio must be within [0, 1]");
  }
  if (typeof p.health !== "number" || p.health < 0 || p.health > 1) {
    throw new InvalidStateError("PopulationData.health must be within [0, 1]");
  }
  if (typeof p.energy !== "number" || p.energy < 0 || p.energy > 1) {
    throw new InvalidStateError("PopulationData.energy must be within [0, 1]");
  }
  if (typeof p.birthRate !== "number" || p.birthRate < 0) {
    throw new InvalidStateError("PopulationData.birthRate must be non-negative");
  }
  if (typeof p.deathRate !== "number" || p.deathRate < 0) {
    throw new InvalidStateError("PopulationData.deathRate must be non-negative");
  }
  if (typeof p.migrationRate !== "number" || p.migrationRate < 0 || p.migrationRate > 1) {
    throw new InvalidStateError("PopulationData.migrationRate must be within [0, 1]");
  }
  if (typeof p.generation !== "number" || p.generation < 0 || !Number.isInteger(p.generation)) {
    throw new InvalidStateError("PopulationData.generation must be a non-negative integer");
  }
  if (p.lineage !== undefined && (!Array.isArray(p.lineage) || p.lineage.some((s) => typeof s !== "string"))) {
    throw new InvalidStateError("PopulationData.lineage must be an array of strings when present");
  }
  if (typeof p.ageStructure !== "object" || p.ageStructure === null) {
    throw new InvalidStateError("PopulationData.ageStructure must be an object");
  }
  if (typeof p.averageTraits !== "object" || p.averageTraits === null) {
    throw new InvalidStateError("PopulationData.averageTraits must be an object");
  }
  if (typeof p.traitVariance !== "object" || p.traitVariance === null) {
    throw new InvalidStateError("PopulationData.traitVariance must be an object");
  }
}

/** Returns a population's ancestry chain, defaulting to just its own current species when no lineage was supplied. */
export function lineageOf(population: PopulationData): readonly string[] {
  return population.lineage ?? [population.speciesId];
}

/** True when a population has died out and should be treated as extinct. */
export function isExtinct(population: PopulationData): boolean {
  return population.count <= 0;
}

/** Returns a copy of the population with count/health/energy clamped into valid ranges. Used after arithmetic updates. */
export function clampPopulationVitals(population: PopulationData): PopulationData {
  return {
    ...population,
    count: Math.max(0, population.count),
    health: clamp(population.health),
    energy: clamp(population.energy),
  };
}

import { clamp } from "./contracts";
import { PopulationData, lineageOf } from "./population";

/**
 * SelectionFeedbackSignal — Team 05's per-population, per-tick output
 * describing how well a population actually fared ecologically. Team 04
 * (Biology & Genetics) is expected to consume this to bias trait
 * inheritance/mutation/selection; Team 05 never reads or writes genome or
 * trait *values* itself (that stays entirely inside Team 04's ownership --
 * see contracts.ts). This file only computes the realized-fitness number
 * from ecology's own before/after state.
 */
export interface SelectionFeedbackSignal {
  readonly populationId: string;
  readonly speciesId: string;
  readonly tick: number;
  /**
   * 0..1 realized ecological fitness this tick: how well the population
   * actually did (grew vs. declined, relative to environment suitability
   * and pressure), not a claim about which traits caused it -- trait
   * attribution is Team 04's job.
   */
  readonly fitnessSignal: number;
  /** 0..1 environment/niche suitability this tick, provided as context for interpreting fitnessSignal. */
  readonly environmentSuitability: number;
  /** Realized per-capita growth rate this tick (can be negative), for Team 04 consumers that want the raw signal instead of the normalized one. */
  readonly realizedGrowthRate: number;
}

export interface SelectionFeedbackInputs {
  readonly previousPopulation: PopulationData;
  readonly nextPopulation: PopulationData;
  readonly environmentSuitability: number;
  readonly tick: number;
}

/**
 * Derives a realized-fitness signal purely from this tick's actual
 * population outcome (never invented, never taken from Team 04's own
 * fitness field -- that would be circular). A population that held or grew
 * despite pressure scores near 1; one that collapsed scores near 0.
 */
export function computeSelectionFeedback(inputs: SelectionFeedbackInputs): SelectionFeedbackSignal {
  const { previousPopulation, nextPopulation, environmentSuitability, tick } = inputs;

  const realizedGrowthRate =
    previousPopulation.count > 0 ? (nextPopulation.count - previousPopulation.count) / previousPopulation.count : 0;

  // Map growth rate onto 0..1: 0 growth -> 0.5, +50% growth or better -> 1, -50% decline or worse -> 0.
  const fitnessSignal = clamp(0.5 + realizedGrowthRate);

  return {
    populationId: nextPopulation.populationId,
    speciesId: nextPopulation.speciesId,
    tick,
    fitnessSignal,
    environmentSuitability: clamp(environmentSuitability),
    realizedGrowthRate,
  };
}

/** Convenience re-export so Team 04 adapters can label provenance without importing population.ts directly. */
export function selectionFeedbackLineage(population: PopulationData): readonly string[] {
  return lineageOf(population);
}

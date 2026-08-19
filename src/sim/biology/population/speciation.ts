import { GeneData, GenomeData } from "../genetics/geneTypes";
import { computeGeneticDistance } from "../genetics/inheritance";
import { resolveGeneExpression } from "../genetics/genome";

export interface SpeciationCandidate {
  readonly parentSpeciesId: string;
  readonly subpopulationAId: string;
  readonly subpopulationBId: string;
  readonly geneticDistance: number;
  readonly generationsSeparated: number;
  readonly geographicallyIsolated: boolean;
  readonly reproductivelyIsolated: boolean;
}

export interface SpeciationParams {
  readonly geneticDistanceThreshold: number;
  readonly minGenerationsSeparated: number;
  readonly requireGeographicIsolation: boolean;
}

export const DEFAULT_SPECIATION_PARAMS: SpeciationParams = {
  geneticDistanceThreshold: 0.35,
  minGenerationsSeparated: 20,
  requireGeographicIsolation: false,
};

/** Mean pairwise genetic distance between two subpopulations' genomes (a proxy for population-level divergence). */
export function computeSubpopulationDistance(genomesA: readonly GenomeData[], genomesB: readonly GenomeData[]): number {
  if (genomesA.length === 0 || genomesB.length === 0) return 0;
  const resolveExpression = (gene: GeneData) => resolveGeneExpression(gene);
  let total = 0;
  let count = 0;
  for (const a of genomesA) {
    for (const b of genomesB) {
      total += computeGeneticDistance(a, b, resolveExpression);
      count += 1;
    }
  }
  return count === 0 ? 0 : total / count;
}

/**
 * Detects a possible speciation event between two subpopulations of the
 * same species. Does NOT establish a new species automatically — it only
 * produces a SpeciationCandidate once thresholds are met, leaving the
 * decision to a future ecology/taxonomy system.
 */
export function detectSpeciationCandidate(
  parentSpeciesId: string,
  subpopulationAId: string,
  subpopulationBId: string,
  genomesA: readonly GenomeData[],
  genomesB: readonly GenomeData[],
  generationsSeparated: number,
  geographicallyIsolated: boolean,
  params: SpeciationParams = DEFAULT_SPECIATION_PARAMS,
): SpeciationCandidate | null {
  if (params.requireGeographicIsolation && !geographicallyIsolated) return null;
  if (generationsSeparated < params.minGenerationsSeparated) return null;

  const geneticDistance = computeSubpopulationDistance(genomesA, genomesB);
  if (geneticDistance < params.geneticDistanceThreshold) return null;

  return {
    parentSpeciesId,
    subpopulationAId,
    subpopulationBId,
    geneticDistance,
    generationsSeparated,
    geographicallyIsolated,
    reproductivelyIsolated: geneticDistance >= params.geneticDistanceThreshold,
  };
}

import { GenomeData } from "../genetics/geneTypes";
import { TraitValue } from "../traits/traitDefinition";

export interface AdaptationMetrics {
  readonly generation: number;
  readonly populationSize: number;
  readonly meanTrait: Readonly<Record<string, number>>;
  readonly traitVariance: Readonly<Record<string, number>>;
  readonly meanFitness: number;
  readonly fitnessVariance: number;
  /** alleleFrequencies[geneId][alleleId] = fraction of allele-slots in the population carrying that allele id. */
  readonly alleleFrequencies: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function variance(values: readonly number[], meanValue: number): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + (v - meanValue) ** 2, 0) / values.length;
}

/**
 * Computes population-level adaptation metrics for one generation/tick
 * snapshot: trait means/variances (to show a population's phenotype
 * gradually shifting), fitness distribution, and allele frequency (to show
 * genotype-level drift). Pure, deterministic aggregation — no RNG.
 */
export function computeAdaptationMetrics(
  generation: number,
  phenotypes: readonly Readonly<Record<string, TraitValue>>[],
  fitnessValues: readonly number[],
  genomes: readonly GenomeData[],
): AdaptationMetrics {
  const traitIds = new Set<string>();
  for (const phenotype of phenotypes) {
    for (const traitId of Object.keys(phenotype)) traitIds.add(traitId);
  }

  const meanTrait: Record<string, number> = {};
  const traitVariance: Record<string, number> = {};
  for (const traitId of traitIds) {
    const values = phenotypes.map((p) => p[traitId]?.value).filter((v): v is number => typeof v === "number");
    const m = mean(values);
    meanTrait[traitId] = m;
    traitVariance[traitId] = variance(values, m);
  }

  const meanFitness = mean(fitnessValues);
  const fitnessVariance = variance(fitnessValues, meanFitness);

  const alleleFrequencies: Record<string, Record<string, number>> = {};
  const geneSlotCounts: Record<string, number> = {};
  for (const genome of genomes) {
    for (const gene of genome.genes) {
      alleleFrequencies[gene.geneId] ??= {};
      geneSlotCounts[gene.geneId] ??= 0;
      for (const allele of gene.alleles) {
        alleleFrequencies[gene.geneId][allele.id] = (alleleFrequencies[gene.geneId][allele.id] ?? 0) + 1;
        geneSlotCounts[gene.geneId] += 1;
      }
    }
  }
  for (const geneId of Object.keys(alleleFrequencies)) {
    const total = geneSlotCounts[geneId] || 1;
    for (const alleleId of Object.keys(alleleFrequencies[geneId])) {
      alleleFrequencies[geneId][alleleId] = alleleFrequencies[geneId][alleleId] / total;
    }
  }

  return {
    generation,
    populationSize: phenotypes.length,
    meanTrait,
    traitVariance,
    meanFitness,
    fitnessVariance,
    alleleFrequencies,
  };
}

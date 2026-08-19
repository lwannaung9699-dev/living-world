/**
 * Genetics contracts (Team 04 / Biology).
 *
 * A genome is NOT `species = "wolf"`. It is a data-driven collection of
 * genes, each carrying a pair of alleles (diploid model), that later
 * pipelines (phenotype expression, inheritance, mutation, fitness,
 * selection) all operate on generically. New traits/genes can be added by
 * later content (species configs) without touching this engine.
 */

/** How a gene's two allele values resolve into a single expressed genotype value. */
export type InheritanceModel = "dominant-recessive" | "co-dominant" | "quantitative";

export interface AlleleData {
  readonly id: string;
  /** Numeric value this allele contributes, pre-dominance-resolution. */
  readonly value: number;
  /** Dominance rank used by the "dominant-recessive" model; higher wins. Ties broken by allele id. */
  readonly dominance?: number;
}

export interface GeneData {
  readonly geneId: string;
  /** Which trait this gene contributes to. Absent for purely regulatory genes. */
  readonly traitId?: string;
  readonly inheritance: InheritanceModel;
  /** The two allele copies carried at this locus (diploid model). */
  readonly alleles: readonly [AlleleData, AlleleData];
  /** Regulatory genes modulate expression of another gene rather than encoding a trait value directly. */
  readonly regulatory?: boolean;
  /** For regulatory genes: geneId of the gene being modulated. */
  readonly regulates?: string;
}

export interface MutationConfig {
  /** Probability, per allele per reproduction event, of a small point mutation. */
  readonly pointMutationRate: number;
  /** Probability, per allele per reproduction event, of a larger gaussian value mutation. */
  readonly geneValueMutationRate: number;
  readonly geneValueMutationStdDev: number;
  /** Probability, per genome per reproduction event, of a gene duplication. */
  readonly duplicationRate: number;
  /** Probability, per gene per reproduction event, of a gene deletion. */
  readonly deletionRate: number;
  /** Probability, per regulatory gene per reproduction event, of a regulatory-strength mutation. */
  readonly regulatoryMutationRate: number;
  /** Hard ceiling on gene count, to keep duplication from producing unbounded growth. */
  readonly maxGenes: number;
}

export interface GenomeData {
  readonly genomeId: string;
  readonly speciesId: string;
  readonly genes: readonly GeneData[];
  readonly mutationConfig: MutationConfig;
  readonly generation: number;
}

export const DEFAULT_MUTATION_CONFIG: MutationConfig = {
  pointMutationRate: 0.05,
  geneValueMutationRate: 0.02,
  geneValueMutationStdDev: 0.08,
  duplicationRate: 0.005,
  deletionRate: 0.005,
  regulatoryMutationRate: 0.02,
  maxGenes: 64,
};

import { InvalidStateError } from "../../core/errors";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { AlleleData, GeneData, GenomeData, InheritanceModel, MutationConfig } from "./geneTypes";

export interface CreateGenomeInput {
  readonly genomeId: string;
  readonly speciesId: string;
  readonly genes: readonly GeneData[];
  readonly mutationConfig: MutationConfig;
  readonly generation?: number;
}

export function createGenome(input: CreateGenomeInput): GenomeData {
  const genome: GenomeData = {
    genomeId: input.genomeId,
    speciesId: input.speciesId,
    genes: input.genes,
    mutationConfig: input.mutationConfig,
    generation: input.generation ?? 0,
  };
  validateGenome(genome);
  return genome;
}

export function validateAllele(value: unknown, path: string): asserts value is AlleleData {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError(`${path} must be an object`);
  }
  const allele = value as Partial<AlleleData>;
  if (typeof allele.id !== "string" || allele.id.length === 0) {
    throw new InvalidStateError(`${path}.id must be a non-empty string`);
  }
  if (typeof allele.value !== "number" || !Number.isFinite(allele.value)) {
    throw new InvalidStateError(`${path}.value must be a finite number`);
  }
  if (allele.dominance !== undefined && (typeof allele.dominance !== "number" || !Number.isFinite(allele.dominance))) {
    throw new InvalidStateError(`${path}.dominance must be a finite number when present`);
  }
}

const VALID_INHERITANCE_MODELS: readonly InheritanceModel[] = ["dominant-recessive", "co-dominant", "quantitative"];

export function validateGene(value: unknown, path: string): asserts value is GeneData {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError(`${path} must be an object`);
  }
  const gene = value as Partial<GeneData>;
  if (typeof gene.geneId !== "string" || gene.geneId.length === 0) {
    throw new InvalidStateError(`${path}.geneId must be a non-empty string`);
  }
  if (!VALID_INHERITANCE_MODELS.includes(gene.inheritance as InheritanceModel)) {
    throw new InvalidStateError(`${path}.inheritance must be one of ${VALID_INHERITANCE_MODELS.join(", ")}`);
  }
  if (!Array.isArray(gene.alleles) || gene.alleles.length !== 2) {
    throw new InvalidStateError(`${path}.alleles must contain exactly 2 alleles`);
  }
  validateAllele(gene.alleles[0], `${path}.alleles[0]`);
  validateAllele(gene.alleles[1], `${path}.alleles[1]`);
  if (gene.regulatory && (typeof gene.regulates !== "string" || gene.regulates.length === 0)) {
    throw new InvalidStateError(`${path}.regulates must be a non-empty string when regulatory is true`);
  }
}

export function validateMutationConfig(value: unknown, path: string): asserts value is MutationConfig {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError(`${path} must be an object`);
  }
  const config = value as Partial<MutationConfig>;
  const numericFields: (keyof MutationConfig)[] = [
    "pointMutationRate",
    "geneValueMutationRate",
    "geneValueMutationStdDev",
    "duplicationRate",
    "deletionRate",
    "regulatoryMutationRate",
    "maxGenes",
  ];
  for (const field of numericFields) {
    const v = config[field];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      throw new InvalidStateError(`${path}.${field} must be a non-negative finite number`);
    }
  }
}

export function validateGenome(value: unknown): asserts value is GenomeData {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("GenomeData must be an object");
  }
  const genome = value as Partial<GenomeData>;
  if (typeof genome.genomeId !== "string" || genome.genomeId.length === 0) {
    throw new InvalidStateError("GenomeData.genomeId must be a non-empty string");
  }
  if (typeof genome.speciesId !== "string" || genome.speciesId.length === 0) {
    throw new InvalidStateError("GenomeData.speciesId must be a non-empty string");
  }
  if (!Array.isArray(genome.genes) || genome.genes.length === 0) {
    throw new InvalidStateError("GenomeData.genes must be a non-empty array");
  }
  const seen = new Set<string>();
  genome.genes.forEach((gene, i) => {
    validateGene(gene, `GenomeData.genes[${i}]`);
    if (seen.has(gene.geneId)) {
      throw new InvalidStateError(`GenomeData.genes contains duplicate geneId "${gene.geneId}"`);
    }
    seen.add(gene.geneId);
  });
  validateMutationConfig(genome.mutationConfig, "GenomeData.mutationConfig");
  if (!Number.isInteger(genome.generation) || (genome.generation as number) < 0) {
    throw new InvalidStateError("GenomeData.generation must be a non-negative integer");
  }
}

export function getGene(genome: GenomeData, geneId: string): GeneData | undefined {
  return genome.genes.find((g) => g.geneId === geneId);
}

/**
 * Resolves a single gene's two allele values into one expressed genotype
 * value, according to its inheritance model. Pure function — no RNG.
 */
export function resolveGeneExpression(gene: GeneData): number {
  const [a, b] = gene.alleles;
  switch (gene.inheritance) {
    case "co-dominant":
      return (a.value + b.value) / 2;
    case "quantitative":
      return (a.value + b.value) / 2;
    case "dominant-recessive": {
      const da = a.dominance ?? 0;
      const db = b.dominance ?? 0;
      if (da === db) return a.id <= b.id ? a.value : b.value;
      return da > db ? a.value : b.value;
    }
    default:
      throw new InvalidStateError(`Unknown inheritance model on gene "${gene.geneId}"`);
  }
}

/**
 * Builds a founder genome from a species' base gene template, jittering
 * allele values slightly per-individual so a population is not a set of
 * clones. Deterministic given the same RNG stream state.
 */
export function createFounderGenome(
  genomeId: string,
  speciesId: string,
  template: readonly GeneData[],
  mutationConfig: MutationConfig,
  rng: DeterministicRng,
  jitterStdDev = 0.05,
): GenomeData {
  const genes = template.map((gene) => ({
    ...gene,
    alleles: [
      { ...gene.alleles[0], value: gene.alleles[0].value + rng.gaussian(0, jitterStdDev) },
      { ...gene.alleles[1], value: gene.alleles[1].value + rng.gaussian(0, jitterStdDev) },
    ] as [AlleleData, AlleleData],
  }));
  return createGenome({ genomeId, speciesId, genes, mutationConfig, generation: 0 });
}

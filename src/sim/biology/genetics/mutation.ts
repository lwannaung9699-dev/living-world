import { DeterministicRng } from "../../core/rng/deterministicRng";
import { AlleleData, GeneData, GenomeData } from "./geneTypes";
import { validateGenome } from "./genome";

export type MutationKind =
  | "point-mutation"
  | "gene-value-mutation"
  | "gene-duplication"
  | "gene-deletion"
  | "regulatory-variation";

export interface MutationRecord {
  readonly kind: MutationKind;
  readonly geneId: string;
  readonly alleleId?: string;
}

export interface MutationResult {
  readonly genome: GenomeData;
  readonly mutations: readonly MutationRecord[];
}

const POINT_MUTATION_STEP = 0.02;

function mutateAlleleValue(allele: AlleleData, rng: DeterministicRng, stdDev: number): AlleleData {
  return { ...allele, value: allele.value + rng.gaussian(0, stdDev) };
}

function pointMutateAllele(allele: AlleleData, rng: DeterministicRng): AlleleData {
  const direction = rng.boolean() ? 1 : -1;
  return { ...allele, value: allele.value + direction * POINT_MUTATION_STEP };
}

/**
 * Applies deterministic mutation to a genome, driven entirely by the
 * provided DeterministicRng stream. Same starting genome + same RNG stream
 * state + same mutationConfig => same offspring genome and same mutation
 * record list, every time. A different RNG stream (different seed/namespace
 * or different call history) produces different results.
 */
export function mutateGenome(genome: GenomeData, rng: DeterministicRng): MutationResult {
  const config = genome.mutationConfig;
  const mutations: MutationRecord[] = [];
  let genes: GeneData[] = genome.genes.map((gene) => ({
    ...gene,
    alleles: [{ ...gene.alleles[0] }, { ...gene.alleles[1] }] as [AlleleData, AlleleData],
  }));

  // 1. Point + gene-value mutation, per allele.
  genes = genes.map((gene) => {
    const alleles = gene.alleles.map((allele) => {
      let next = allele;
      if (rng.boolean(config.pointMutationRate)) {
        next = pointMutateAllele(next, rng);
        mutations.push({ kind: "point-mutation", geneId: gene.geneId, alleleId: allele.id });
      }
      if (rng.boolean(config.geneValueMutationRate)) {
        next = mutateAlleleValue(next, rng, config.geneValueMutationStdDev);
        mutations.push({ kind: "gene-value-mutation", geneId: gene.geneId, alleleId: allele.id });
      }
      return next;
    }) as [AlleleData, AlleleData];

    let nextGene: GeneData = { ...gene, alleles };

    if (gene.regulatory && rng.boolean(config.regulatoryMutationRate)) {
      const regulatedAlleles = nextGene.alleles.map((allele) =>
        mutateAlleleValue(allele, rng, config.geneValueMutationStdDev),
      ) as [AlleleData, AlleleData];
      nextGene = { ...nextGene, alleles: regulatedAlleles };
      mutations.push({ kind: "regulatory-variation", geneId: gene.geneId });
    }

    return nextGene;
  });

  // 2. Gene deletion (guard: never delete the last remaining gene).
  if (genes.length > 1) {
    genes = genes.filter((gene) => {
      const shouldDelete = rng.boolean(config.deletionRate) && genes.length > 1;
      if (shouldDelete) mutations.push({ kind: "gene-deletion", geneId: gene.geneId });
      return !shouldDelete;
    });
  }
  if (genes.length === 0) {
    // Safety net: deletion must never leave a genome with zero genes.
    genes = genome.genes.map((gene) => ({ ...gene }));
  }

  // 3. Gene duplication (bounded by maxGenes).
  const duplicates: GeneData[] = [];
  for (const gene of genes) {
    if (genes.length + duplicates.length >= config.maxGenes) break;
    if (rng.boolean(config.duplicationRate)) {
      const newGeneId = `${gene.geneId}-dup-${rng.nextUint32().toString(36)}`;
      duplicates.push({ ...gene, geneId: newGeneId });
      mutations.push({ kind: "gene-duplication", geneId: newGeneId });
    }
  }
  genes = [...genes, ...duplicates];

  const nextGenome: GenomeData = {
    ...genome,
    genes,
    generation: genome.generation + 1,
  };
  validateGenome(nextGenome);

  return { genome: nextGenome, mutations };
}

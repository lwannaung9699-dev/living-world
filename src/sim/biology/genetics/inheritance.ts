import { InvalidStateError } from "../../core/errors";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { AlleleData, GeneData, GenomeData } from "./geneTypes";
import { validateGenome } from "./genome";

/**
 * Combines two parent genomes into a single offspring genome via Mendelian
 * recombination: for each shared gene locus, the offspring receives one
 * randomly chosen allele copy from parent A and one from parent B.
 *
 * Both parents must share the same set of geneIds (i.e. be members of the
 * same species / compatible gene structure) — cross-species recombination
 * is out of scope for the Foundation and is rejected explicitly.
 *
 * Deterministic given the same RNG stream state: recombination draws are
 * made only from the passed-in DeterministicRng, never from Math.random.
 */
export function combineGenomes(
  parentA: GenomeData,
  parentB: GenomeData,
  rng: DeterministicRng,
  offspringGenomeId: string,
): GenomeData {
  if (parentA.speciesId !== parentB.speciesId) {
    throw new InvalidStateError(
      `combineGenomes requires both parents to share a speciesId (got "${parentA.speciesId}" and "${parentB.speciesId}")`,
    );
  }

  const genesA = new Map(parentA.genes.map((g) => [g.geneId, g] as const));
  const genesB = new Map(parentB.genes.map((g) => [g.geneId, g] as const));
  const sharedGeneIds = [...genesA.keys()].filter((id) => genesB.has(id));

  if (sharedGeneIds.length === 0) {
    throw new InvalidStateError("combineGenomes requires at least one shared geneId between parents");
  }

  const offspringGenes: GeneData[] = sharedGeneIds.map((geneId) => {
    const geneA = genesA.get(geneId)!;
    const geneB = genesB.get(geneId)!;
    const fromA = geneA.alleles[rng.nextInt(0, 1)];
    const fromB = geneB.alleles[rng.nextInt(0, 1)];
    return {
      ...geneA,
      alleles: [fromA, fromB] as [AlleleData, AlleleData],
    };
  });

  const offspring: GenomeData = {
    genomeId: offspringGenomeId,
    speciesId: parentA.speciesId,
    genes: offspringGenes,
    mutationConfig: parentA.mutationConfig,
    generation: Math.max(parentA.generation, parentB.generation) + 1,
  };
  validateGenome(offspring);
  return offspring;
}

/**
 * Produces an offspring genome for asexual reproduction: a direct clone of
 * the single parent's genes (mutation, applied separately, is what
 * introduces variation for asexual lineages).
 */
export function cloneGenomeForAsexualReproduction(parent: GenomeData, offspringGenomeId: string): GenomeData {
  const offspring: GenomeData = {
    genomeId: offspringGenomeId,
    speciesId: parent.speciesId,
    genes: parent.genes.map((gene) => ({
      ...gene,
      alleles: [{ ...gene.alleles[0] }, { ...gene.alleles[1] }] as [AlleleData, AlleleData],
    })),
    mutationConfig: parent.mutationConfig,
    generation: parent.generation + 1,
  };
  validateGenome(offspring);
  return offspring;
}

/** Genetic distance between two genomes: mean absolute difference of resolved gene-expression values across shared loci. */
export function computeGeneticDistance(
  genomeA: GenomeData,
  genomeB: GenomeData,
  resolveExpression: (gene: GeneData) => number,
): number {
  const genesA = new Map(genomeA.genes.map((g) => [g.geneId, g] as const));
  const genesB = new Map(genomeB.genes.map((g) => [g.geneId, g] as const));
  const sharedGeneIds = [...genesA.keys()].filter((id) => genesB.has(id));
  if (sharedGeneIds.length === 0) return 1;

  const totalDiff = sharedGeneIds.reduce((sum, geneId) => {
    const diff = Math.abs(resolveExpression(genesA.get(geneId)!) - resolveExpression(genesB.get(geneId)!));
    return sum + diff;
  }, 0);
  return totalDiff / sharedGeneIds.length;
}

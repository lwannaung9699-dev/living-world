import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveGeneExpression, createGenome } from "../../biology/genetics/genome";
import { combineGenomes, cloneGenomeForAsexualReproduction, computeGeneticDistance } from "../../biology/genetics/inheritance";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { InvalidStateError } from "../../core/errors";
import { DEMO_GENE_TEMPLATE, DEMO_SPECIES } from "./fixtures";

test("dominant-recessive inheritance expresses the higher-dominance allele", () => {
  const gene = DEMO_GENE_TEMPLATE.find((g) => g.geneId === "speedGene")!;
  assert.equal(resolveGeneExpression(gene), 6); // "speed-fast" has dominance 2 > 1
});

test("dominant-recessive inheritance breaks dominance ties deterministically by allele id", () => {
  const gene = {
    geneId: "tieGene",
    inheritance: "dominant-recessive" as const,
    alleles: [
      { id: "z-allele", value: 9, dominance: 1 },
      { id: "a-allele", value: 1, dominance: 1 },
    ] as const,
  };
  assert.equal(resolveGeneExpression(gene), 1); // "a-allele" <= "z-allele" lexicographically
});

test("co-dominant inheritance blends both allele values", () => {
  const gene = DEMO_GENE_TEMPLATE.find((g) => g.geneId === "coldGene")!;
  assert.equal(resolveGeneExpression(gene), (0.2 + -0.1) / 2);
});

test("quantitative inheritance averages both allele values", () => {
  const gene = DEMO_GENE_TEMPLATE.find((g) => g.geneId === "sizeGene")!;
  assert.equal(resolveGeneExpression(gene), 3);
});

test("combineGenomes recombines shared loci deterministically given the same RNG stream", () => {
  const rngA = DeterministicRng.fromSeed("recombine", 42);
  const rngB = DeterministicRng.fromSeed("recombine", 42);
  const parentA = createGenome({
    genomeId: "pa",
    speciesId: DEMO_SPECIES.speciesId,
    genes: DEMO_GENE_TEMPLATE,
    mutationConfig: DEMO_SPECIES.mutationConfig,
  });
  const parentB = createGenome({
    genomeId: "pb",
    speciesId: DEMO_SPECIES.speciesId,
    genes: DEMO_GENE_TEMPLATE,
    mutationConfig: DEMO_SPECIES.mutationConfig,
  });
  const offspringA = combineGenomes(parentA, parentB, rngA, "child-a");
  const offspringB = combineGenomes(parentA, parentB, rngB, "child-b");
  // Same RNG sequence -> same allele choices at every locus.
  assert.deepEqual(offspringA.genes.map((g) => g.alleles), offspringB.genes.map((g) => g.alleles));
  assert.equal(offspringA.generation, 1);
});

test("combineGenomes rejects parents from different species", () => {
  const rng = DeterministicRng.fromSeed("cross-species", 1);
  const parentA = createGenome({
    genomeId: "pa",
    speciesId: "species-a",
    genes: DEMO_GENE_TEMPLATE,
    mutationConfig: DEMO_SPECIES.mutationConfig,
  });
  const parentB = createGenome({
    genomeId: "pb",
    speciesId: "species-b",
    genes: DEMO_GENE_TEMPLATE,
    mutationConfig: DEMO_SPECIES.mutationConfig,
  });
  assert.throws(() => combineGenomes(parentA, parentB, rng, "child"), InvalidStateError);
});

test("cloneGenomeForAsexualReproduction copies genes and advances generation", () => {
  const parent = createGenome({
    genomeId: "parent",
    speciesId: DEMO_SPECIES.speciesId,
    genes: DEMO_GENE_TEMPLATE,
    mutationConfig: DEMO_SPECIES.mutationConfig,
  });
  const clone = cloneGenomeForAsexualReproduction(parent, "clone");
  assert.deepEqual(clone.genes, parent.genes);
  assert.equal(clone.generation, parent.generation + 1);
  assert.notEqual(clone.genomeId, parent.genomeId);
});

test("computeGeneticDistance is 0 for identical genomes and grows with divergence", () => {
  const genomeA = createGenome({
    genomeId: "ga",
    speciesId: DEMO_SPECIES.speciesId,
    genes: DEMO_GENE_TEMPLATE,
    mutationConfig: DEMO_SPECIES.mutationConfig,
  });
  const genomeB = createGenome({
    genomeId: "gb",
    speciesId: DEMO_SPECIES.speciesId,
    genes: DEMO_GENE_TEMPLATE,
    mutationConfig: DEMO_SPECIES.mutationConfig,
  });
  assert.equal(computeGeneticDistance(genomeA, genomeB, resolveGeneExpression), 0);

  const divergedGenes = DEMO_GENE_TEMPLATE.map((g) =>
    g.geneId === "sizeGene"
      ? { ...g, alleles: [{ id: "size-a", value: 30 }, { id: "size-b", value: 30 }] as const }
      : g,
  );
  const genomeC = createGenome({
    genomeId: "gc",
    speciesId: DEMO_SPECIES.speciesId,
    genes: divergedGenes,
    mutationConfig: DEMO_SPECIES.mutationConfig,
  });
  assert.ok(computeGeneticDistance(genomeA, genomeC, resolveGeneExpression) > 0);
});

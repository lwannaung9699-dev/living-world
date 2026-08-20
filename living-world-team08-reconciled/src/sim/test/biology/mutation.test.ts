import { test } from "node:test";
import assert from "node:assert/strict";
import { mutateGenome } from "../../biology/genetics/mutation";
import { createGenome } from "../../biology/genetics/genome";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { DEMO_GENE_TEMPLATE, DEMO_SPECIES } from "./fixtures";
import { MutationConfig } from "../../biology/genetics/geneTypes";

const HIGH_MUTATION_CONFIG: MutationConfig = {
  pointMutationRate: 0.6,
  geneValueMutationRate: 0.4,
  geneValueMutationStdDev: 0.2,
  duplicationRate: 0.3,
  deletionRate: 0.1,
  regulatoryMutationRate: 0.5,
  maxGenes: 20,
};

function baseGenome(genomeId: string, mutationConfig: MutationConfig = DEMO_SPECIES.mutationConfig) {
  return createGenome({
    genomeId,
    speciesId: DEMO_SPECIES.speciesId,
    genes: DEMO_GENE_TEMPLATE,
    mutationConfig,
  });
}

test("mutateGenome is deterministic: same genome + same RNG stream state => same offspring genome", () => {
  const genome = baseGenome("m1", HIGH_MUTATION_CONFIG);
  const rngA = DeterministicRng.fromSeed("mutate", 100);
  const rngB = DeterministicRng.fromSeed("mutate", 100);
  const resultA = mutateGenome(genome, rngA);
  const resultB = mutateGenome(genome, rngB);
  assert.deepEqual(resultA.genome, resultB.genome);
  assert.deepEqual(resultA.mutations, resultB.mutations);
});

test("mutateGenome produces different results for different seeds", () => {
  const genome = baseGenome("m2", HIGH_MUTATION_CONFIG);
  const rngA = DeterministicRng.fromSeed("mutate-a", 1);
  const rngB = DeterministicRng.fromSeed("mutate-b", 2);
  const resultA = mutateGenome(genome, rngA);
  const resultB = mutateGenome(genome, rngB);
  assert.notDeepEqual(resultA.genome.genes, resultB.genome.genes);
});

test("mutateGenome advances the generation counter", () => {
  const genome = baseGenome("m3");
  const rng = DeterministicRng.fromSeed("gen", 5);
  const { genome: mutated } = mutateGenome(genome, rng);
  assert.equal(mutated.generation, genome.generation + 1);
});

test("mutateGenome never leaves a genome with zero genes, even under extreme deletion rate", () => {
  const extremeDeletion: MutationConfig = { ...HIGH_MUTATION_CONFIG, deletionRate: 1, duplicationRate: 0 };
  const genome = baseGenome("m4", extremeDeletion);
  const rng = DeterministicRng.fromSeed("delete-all", 9);
  const { genome: mutated } = mutateGenome(genome, rng);
  assert.ok(mutated.genes.length >= 1);
});

test("mutateGenome respects maxGenes as a hard ceiling under extreme duplication rate", () => {
  const extremeDuplication: MutationConfig = { ...HIGH_MUTATION_CONFIG, duplicationRate: 1, deletionRate: 0, maxGenes: 6 };
  const genome = baseGenome("m5", extremeDuplication);
  const rng = DeterministicRng.fromSeed("duplicate-all", 3);
  const { genome: mutated } = mutateGenome(genome, rng);
  assert.ok(mutated.genes.length <= 6, `expected <= 6 genes, got ${mutated.genes.length}`);
});

test("mutateGenome with all rates at zero produces an unchanged (but generation-advanced) genome", () => {
  const noMutation: MutationConfig = {
    pointMutationRate: 0,
    geneValueMutationRate: 0,
    geneValueMutationStdDev: 0,
    duplicationRate: 0,
    deletionRate: 0,
    regulatoryMutationRate: 0,
    maxGenes: 64,
  };
  const genome = baseGenome("m6", noMutation);
  const rng = DeterministicRng.fromSeed("no-op", 1);
  const { genome: mutated, mutations } = mutateGenome(genome, rng);
  assert.deepEqual(mutated.genes, genome.genes);
  assert.equal(mutations.length, 0);
});

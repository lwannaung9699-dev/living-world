import { test } from "node:test";
import assert from "node:assert/strict";
import { createGenome, validateGenome, getGene, createFounderGenome } from "../../biology/genetics/genome";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { InvalidStateError } from "../../core/errors";
import { DEMO_GENE_TEMPLATE, DEMO_SPECIES } from "./fixtures";

test("createGenome builds a valid genome from gene data", () => {
  const genome = createGenome({
    genomeId: "g1",
    speciesId: DEMO_SPECIES.speciesId,
    genes: DEMO_GENE_TEMPLATE,
    mutationConfig: DEMO_SPECIES.mutationConfig,
  });
  assert.equal(genome.genomeId, "g1");
  assert.equal(genome.generation, 0);
  assert.equal(genome.genes.length, DEMO_GENE_TEMPLATE.length);
  assert.doesNotThrow(() => validateGenome(genome));
});

test("getGene finds a gene by id, returns undefined for unknown ids", () => {
  const genome = createGenome({
    genomeId: "g2",
    speciesId: DEMO_SPECIES.speciesId,
    genes: DEMO_GENE_TEMPLATE,
    mutationConfig: DEMO_SPECIES.mutationConfig,
  });
  assert.ok(getGene(genome, "sizeGene"));
  assert.equal(getGene(genome, "does-not-exist"), undefined);
});

test("validateGenome rejects a genome with zero genes", () => {
  assert.throws(
    () =>
      createGenome({
        genomeId: "bad",
        speciesId: DEMO_SPECIES.speciesId,
        genes: [],
        mutationConfig: DEMO_SPECIES.mutationConfig,
      }),
    InvalidStateError,
  );
});

test("validateGenome rejects duplicate geneIds", () => {
  assert.throws(
    () =>
      createGenome({
        genomeId: "dup",
        speciesId: DEMO_SPECIES.speciesId,
        genes: [DEMO_GENE_TEMPLATE[0], DEMO_GENE_TEMPLATE[0]],
        mutationConfig: DEMO_SPECIES.mutationConfig,
      }),
    InvalidStateError,
  );
});

test("validateGenome rejects a gene missing an allele pair", () => {
  const badGene = { ...DEMO_GENE_TEMPLATE[0], alleles: [DEMO_GENE_TEMPLATE[0].alleles[0]] };
  assert.throws(
    () =>
      createGenome({
        genomeId: "bad-allele",
        speciesId: DEMO_SPECIES.speciesId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        genes: [badGene as any],
        mutationConfig: DEMO_SPECIES.mutationConfig,
      }),
    InvalidStateError,
  );
});

test("validateGenome rejects an unknown inheritance model", () => {
  const badGene = { ...DEMO_GENE_TEMPLATE[0], inheritance: "not-a-real-model" };
  assert.throws(
    () =>
      createGenome({
        genomeId: "bad-inheritance",
        speciesId: DEMO_SPECIES.speciesId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        genes: [badGene as any],
        mutationConfig: DEMO_SPECIES.mutationConfig,
      }),
    InvalidStateError,
  );
});

test("validateGenome rejects a regulatory gene missing its regulates target", () => {
  const badGene = { ...DEMO_GENE_TEMPLATE[3], regulates: undefined };
  assert.throws(
    () =>
      createGenome({
        genomeId: "bad-regulatory",
        speciesId: DEMO_SPECIES.speciesId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        genes: [badGene as any],
        mutationConfig: DEMO_SPECIES.mutationConfig,
      }),
    InvalidStateError,
  );
});

test("createFounderGenome jitters allele values so a population is not a set of clones", () => {
  const rng = DeterministicRng.fromSeed("founder", 1);
  const genomeA = createFounderGenome("f1", DEMO_SPECIES.speciesId, DEMO_GENE_TEMPLATE, DEMO_SPECIES.mutationConfig, rng);
  const genomeB = createFounderGenome("f2", DEMO_SPECIES.speciesId, DEMO_GENE_TEMPLATE, DEMO_SPECIES.mutationConfig, rng);
  assert.notDeepEqual(genomeA.genes[0].alleles, genomeB.genes[0].alleles);
});

test("createFounderGenome is deterministic given the same RNG seed", () => {
  const rngA = DeterministicRng.fromSeed("founder-det", 7);
  const rngB = DeterministicRng.fromSeed("founder-det", 7);
  const genomeA = createFounderGenome("fa", DEMO_SPECIES.speciesId, DEMO_GENE_TEMPLATE, DEMO_SPECIES.mutationConfig, rngA);
  const genomeB = createFounderGenome("fa", DEMO_SPECIES.speciesId, DEMO_GENE_TEMPLATE, DEMO_SPECIES.mutationConfig, rngB);
  assert.deepEqual(genomeA, genomeB);
});

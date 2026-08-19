import { test } from "node:test";
import assert from "node:assert/strict";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { createFounderGenome } from "../../biology/genetics/genome";
import { detectSpeciationCandidate, computeSubpopulationDistance } from "../../biology/population/speciation";
import { DEMO_GENE_TEMPLATE, DEMO_SPECIES } from "./fixtures";

function makePopulation(prefix: string, seed: number, valueOffset: number, count = 5) {
  const rng = DeterministicRng.fromSeed(prefix, seed);
  return Array.from({ length: count }, (_, i) => {
    const genome = createFounderGenome(`${prefix}-${i}`, DEMO_SPECIES.speciesId, DEMO_GENE_TEMPLATE, DEMO_SPECIES.mutationConfig, rng);
    return {
      ...genome,
      genes: genome.genes.map((g) =>
        g.geneId === "sizeGene"
          ? { ...g, alleles: [{ ...g.alleles[0], value: g.alleles[0].value + valueOffset }, { ...g.alleles[1], value: g.alleles[1].value + valueOffset }] as const }
          : g,
      ),
    };
  });
}

test("detectSpeciationCandidate returns null when genetic distance is below threshold", () => {
  const popA = makePopulation("speciation-close-a", 1, 0);
  const popB = makePopulation("speciation-close-b", 2, 0.01);
  const candidate = detectSpeciationCandidate("demo-critter", "pop-a", "pop-b", popA, popB, 100, true, {
    geneticDistanceThreshold: 5,
    minGenerationsSeparated: 10,
    requireGeographicIsolation: false,
  });
  assert.equal(candidate, null);
});

test("detectSpeciationCandidate returns null when not enough generations have separated the subpopulations", () => {
  const popA = makePopulation("speciation-gen-a", 1, 0);
  const popB = makePopulation("speciation-gen-b", 2, 50);
  const candidate = detectSpeciationCandidate("demo-critter", "pop-a", "pop-b", popA, popB, 1, true, {
    geneticDistanceThreshold: 0.5,
    minGenerationsSeparated: 20,
    requireGeographicIsolation: false,
  });
  assert.equal(candidate, null);
});

test("detectSpeciationCandidate requires geographic isolation when configured to", () => {
  const popA = makePopulation("speciation-geo-a", 1, 0);
  const popB = makePopulation("speciation-geo-b", 2, 50);
  const candidate = detectSpeciationCandidate("demo-critter", "pop-a", "pop-b", popA, popB, 100, false, {
    geneticDistanceThreshold: 0.5,
    minGenerationsSeparated: 10,
    requireGeographicIsolation: true,
  });
  assert.equal(candidate, null);
});

test("detectSpeciationCandidate fires once genetic distance, generations, and isolation thresholds are all met", () => {
  const popA = makePopulation("speciation-fire-a", 1, 0);
  const popB = makePopulation("speciation-fire-b", 2, 50);
  const candidate = detectSpeciationCandidate("demo-critter", "pop-a", "pop-b", popA, popB, 100, true, {
    geneticDistanceThreshold: 0.5,
    minGenerationsSeparated: 10,
    requireGeographicIsolation: true,
  });
  assert.ok(candidate);
  assert.equal(candidate!.parentSpeciesId, "demo-critter");
  assert.equal(candidate!.reproductivelyIsolated, true);
  assert.ok(candidate!.geneticDistance >= 0.5);
});

test("computeSubpopulationDistance is 0 for a population of genetically identical genomes compared to itself", () => {
  // A single genome (no per-individual jitter) repeated, so every pairwise distance is exactly 0.
  const rng = DeterministicRng.fromSeed("speciation-identical", 1);
  const founder = createFounderGenome("identical-0", DEMO_SPECIES.speciesId, DEMO_GENE_TEMPLATE, DEMO_SPECIES.mutationConfig, rng, 0);
  const clones = Array.from({ length: 4 }, (_, i) => ({ ...founder, genomeId: `identical-${i}` }));
  assert.equal(computeSubpopulationDistance(clones, clones), 0);
});

test("computeSubpopulationDistance is symmetric", () => {
  const pop = makePopulation("speciation-symmetric", 1, 0);
  const popOther = makePopulation("speciation-symmetric-2", 2, 10);
  const forward = computeSubpopulationDistance(pop, popOther);
  const backward = computeSubpopulationDistance(popOther, pop);
  assert.ok(Math.abs(forward - backward) < 1e-9);
});

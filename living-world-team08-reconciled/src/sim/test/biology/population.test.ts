import { test } from "node:test";
import assert from "node:assert/strict";
import { createFounderGenome } from "../../biology/genetics/genome";
import { mutateGenome } from "../../biology/genetics/mutation";
import { expressPhenotype } from "../../biology/traits/phenotype";
import { computeFitness } from "../../biology/population/fitness";
import { applySelection, SelectionCandidate, DEFAULT_SELECTION_PARAMS } from "../../biology/population/selection";
import { computeAdaptationMetrics } from "../../biology/population/adaptation";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { DEMO_GENE_TEMPLATE, DEMO_SPECIES, DEMO_TRAIT_CONFIGS } from "./fixtures";
import { GenomeData } from "../../biology/genetics/geneTypes";

test("createFounderGenome produces genetic variation across a population (not clones)", () => {
  const rng = DeterministicRng.fromSeed("pop-variation", 1);
  const genomes = Array.from({ length: 10 }, (_, i) =>
    createFounderGenome(`founder-${i}`, DEMO_SPECIES.speciesId, DEMO_GENE_TEMPLATE, DEMO_SPECIES.mutationConfig, rng),
  );
  const sizeAlleleValues = genomes.map((g) => g.genes.find((gene) => gene.geneId === "sizeGene")!.alleles[0].value);
  const uniqueValues = new Set(sizeAlleleValues.map((v) => v.toFixed(6)));
  assert.ok(uniqueValues.size > 1, "expected genetic variation across founder genomes");
});

test("computeFitness rewards phenotypes closer to the species' configured optimum", () => {
  const environment = { temperature: 0 }; // neutral, matches DEMO_SPECIES fitnessProfile optimalCenter for temperatureTolerance
  const genome = createFounderGenome("fit-1", DEMO_SPECIES.speciesId, DEMO_GENE_TEMPLATE, DEMO_SPECIES.mutationConfig, DeterministicRng.fromSeed("fit", 1));
  const phenotype = expressPhenotype(genome, DEMO_TRAIT_CONFIGS, environment);
  const fitness = computeFitness(phenotype, DEMO_SPECIES.fitnessProfile);
  assert.ok(fitness >= 0 && fitness <= 1);

  // A phenotype pinned exactly at every optimum should score fitness 1.
  const perfectPhenotype = {
    temperatureTolerance: { traitId: "temperatureTolerance", rawValue: 0, value: 0 },
    speed: { traitId: "speed", rawValue: 6, value: 6 },
  };
  assert.ok(Math.abs(computeFitness(perfectPhenotype, DEMO_SPECIES.fitnessProfile) - 1) < 1e-9);
});

test("computeFitness: cold environment + high cold tolerance yields higher fitness than low cold tolerance", () => {
  const coldOptimizedProfile = [{ traitId: "temperatureTolerance", optimalCenter: -0.8, optimalTolerance: 0.3, weight: 1 }];
  const highToleranceColdAdapted = { temperatureTolerance: { traitId: "temperatureTolerance", rawValue: -0.8, value: -0.8 } };
  const lowToleranceWarmAdapted = { temperatureTolerance: { traitId: "temperatureTolerance", rawValue: 0.8, value: 0.8 } };
  assert.ok(
    computeFitness(highToleranceColdAdapted, coldOptimizedProfile) >
      computeFitness(lowToleranceWarmAdapted, coldOptimizedProfile),
  );
});

test("applySelection is probabilistic (not always survival of the fittest) but deterministic given a fixed RNG stream", () => {
  const population: SelectionCandidate[] = [
    { id: "weak", fitness: 0.1 },
    { id: "strong", fitness: 0.7 },
  ];
  const rngA = DeterministicRng.fromSeed("selection", 3);
  const rngB = DeterministicRng.fromSeed("selection", 3);
  const outcomeA = applySelection(population, rngA);
  const outcomeB = applySelection(population, rngB);
  assert.deepEqual(outcomeA, outcomeB);

  // Fitter individuals get a strictly higher survival probability, but it must stay a probability, not a guarantee.
  const weak = outcomeA.find((o) => o.id === "weak")!;
  const strong = outcomeA.find((o) => o.id === "strong")!;
  assert.ok(strong.survivalProbability > weak.survivalProbability);
  assert.ok(strong.survivalProbability < 1);
});

test("applySelection: across many trials, higher fitness individuals survive more often on average", () => {
  const rng = DeterministicRng.fromSeed("selection-stats", 77);
  let weakSurvivals = 0;
  let strongSurvivals = 0;
  const trials = 500;
  for (let i = 0; i < trials; i++) {
    const [weakOutcome, strongOutcome] = applySelection(
      [
        { id: "weak", fitness: 0.05 },
        { id: "strong", fitness: 0.95 },
      ],
      rng,
    );
    if (weakOutcome.survived) weakSurvivals++;
    if (strongOutcome.survived) strongSurvivals++;
  }
  assert.ok(strongSurvivals > weakSurvivals);
});

test("multi-generation evolution: mean fitness trends upward under sustained selection pressure toward an optimum", () => {
  const optimum = -0.9; // extreme cold tolerance target, outside the founder population's typical range
  const fitnessProfile = [{ traitId: "temperatureTolerance", optimalCenter: optimum, optimalTolerance: 0.4, weight: 1 }];
  const populationSize = 30;
  const generationCount = 25;

  const founderRng = DeterministicRng.fromSeed("evolution/founders", 1);
  let genomes: GenomeData[] = Array.from({ length: populationSize }, (_, i) =>
    createFounderGenome(`gen0-${i}`, DEMO_SPECIES.speciesId, DEMO_GENE_TEMPLATE, DEMO_SPECIES.mutationConfig, founderRng),
  );

  const selectionRng = DeterministicRng.fromSeed("evolution/selection", 2);
  const mutationRng = DeterministicRng.fromSeed("evolution/mutation", 3);

  const meanFitnessByGeneration: number[] = [];

  for (let gen = 0; gen < generationCount; gen++) {
    const phenotypes = genomes.map((g) => expressPhenotype(g, DEMO_TRAIT_CONFIGS, {}));
    const fitnesses = phenotypes.map((p) => computeFitness(p, fitnessProfile));
    meanFitnessByGeneration.push(fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length);

    const candidates: SelectionCandidate[] = genomes.map((g, i) => ({ id: g.genomeId, fitness: fitnesses[i] }));
    const outcomes = applySelection(candidates, selectionRng, {
      ...DEFAULT_SELECTION_PARAMS,
      reproductionFitnessInfluence: 0.9,
    });

    const reproducers = genomes.filter((_, i) => outcomes[i].selectedToReproduce);
    const pool = reproducers.length > 0 ? reproducers : genomes;

    genomes = Array.from({ length: populationSize }, (_, i) => {
      const parent = pool[i % pool.length];
      const { genome } = mutateGenome({ ...parent, genomeId: `gen${gen + 1}-${i}` }, mutationRng);
      return genome;
    });
  }

  const earlyMean = meanFitnessByGeneration.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const lateMean = meanFitnessByGeneration.slice(-3).reduce((a, b) => a + b, 0) / 3;
  assert.ok(
    lateMean > earlyMean,
    `expected mean fitness to improve over generations: early=${earlyMean}, late=${lateMean}`,
  );
});

test("computeAdaptationMetrics reports trait mean/variance, fitness distribution, and allele frequencies", () => {
  const rng = DeterministicRng.fromSeed("adaptation", 5);
  const genomes = Array.from({ length: 6 }, (_, i) =>
    createFounderGenome(`adapt-${i}`, DEMO_SPECIES.speciesId, DEMO_GENE_TEMPLATE, DEMO_SPECIES.mutationConfig, rng),
  );
  const phenotypes = genomes.map((g) => expressPhenotype(g, DEMO_TRAIT_CONFIGS, {}));
  const fitnesses = phenotypes.map((p) => computeFitness(p, DEMO_SPECIES.fitnessProfile));

  const metrics = computeAdaptationMetrics(3, phenotypes, fitnesses, genomes);
  assert.equal(metrics.generation, 3);
  assert.equal(metrics.populationSize, 6);
  assert.ok("bodySize" in metrics.meanTrait);
  assert.ok(metrics.traitVariance.bodySize >= 0);
  assert.ok(metrics.meanFitness >= 0 && metrics.meanFitness <= 1);
  assert.ok("sizeGene" in metrics.alleleFrequencies);

  const sizeGeneFrequencies = Object.values(metrics.alleleFrequencies.sizeGene);
  const totalFrequency = sizeGeneFrequencies.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(totalFrequency - 1) < 1e-9);
});

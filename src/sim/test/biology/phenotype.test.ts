import { test } from "node:test";
import assert from "node:assert/strict";
import { createGenome } from "../../biology/genetics/genome";
import { expressPhenotype, computeEnvironmentalModifier } from "../../biology/traits/phenotype";
import { DEMO_GENE_TEMPLATE, DEMO_SPECIES, DEMO_TRAIT_CONFIGS } from "./fixtures";

function demoGenome(genomeId = "p1") {
  return createGenome({
    genomeId,
    speciesId: DEMO_SPECIES.speciesId,
    genes: DEMO_GENE_TEMPLATE,
    mutationConfig: DEMO_SPECIES.mutationConfig,
  });
}

test("expressPhenotype is a pure deterministic function of genome + traits + environment", () => {
  const genome = demoGenome();
  const environment = { foodAvailability: 0.8, lightLevel: 0.4 };
  const phenotypeA = expressPhenotype(genome, DEMO_TRAIT_CONFIGS, environment);
  const phenotypeB = expressPhenotype(genome, DEMO_TRAIT_CONFIGS, environment);
  assert.deepEqual(phenotypeA, phenotypeB);
});

test("expressPhenotype produces one TraitValue per configured trait, clamped to definition bounds", () => {
  const genome = demoGenome();
  const phenotype = expressPhenotype(genome, DEMO_TRAIT_CONFIGS, {});
  for (const config of DEMO_TRAIT_CONFIGS) {
    const trait = phenotype[config.traitId];
    assert.ok(trait, `expected a TraitValue for ${config.traitId}`);
    assert.ok(trait.value >= config.definition.min && trait.value <= config.definition.max);
  }
});

test("expressPhenotype combines multiple genes (size gene + regulator) into final body size", () => {
  const genome = demoGenome();
  const phenotype = expressPhenotype(genome, DEMO_TRAIT_CONFIGS, {});
  // sizeGene alone resolves to 3 (quantitative average); the regulator gene should shift it away from exactly 3.
  assert.notEqual(phenotype.bodySize.rawValue, 0);
  assert.notEqual(phenotype.bodySize.value, 3);
});

test("environment shifts trait expression: higher foodAvailability increases bodySize", () => {
  const genome = demoGenome();
  const lowFood = expressPhenotype(genome, DEMO_TRAIT_CONFIGS, { foodAvailability: 0 });
  const highFood = expressPhenotype(genome, DEMO_TRAIT_CONFIGS, { foodAvailability: 1 });
  assert.ok(highFood.bodySize.value > lowFood.bodySize.value);
});

test("environment shifts trait expression: temperatureTolerance responds to environment temperature", () => {
  const genome = demoGenome();
  const cold = expressPhenotype(genome, DEMO_TRAIT_CONFIGS, { temperature: -1 });
  const hot = expressPhenotype(genome, DEMO_TRAIT_CONFIGS, { temperature: 1 });
  assert.ok(hot.temperatureTolerance.value > cold.temperatureTolerance.value);
});

test("computeEnvironmentalModifier is 0 when a trait defines no environmentalFactors", () => {
  const speedDef = DEMO_TRAIT_CONFIGS.find((c) => c.traitId === "speed")!.definition;
  assert.equal(computeEnvironmentalModifier(speedDef, { foodAvailability: 1, temperature: 1 }), 0);
});

test("same genome + different simulation version's traitConfig set still reproduces the same trait values for shared traits", () => {
  const genome = demoGenome();
  const phenotypeFull = expressPhenotype(genome, DEMO_TRAIT_CONFIGS, { temperature: 0.5 });
  const phenotypeSubset = expressPhenotype(genome, [DEMO_TRAIT_CONFIGS[0]], { temperature: 0.5 });
  assert.equal(phenotypeFull.bodySize.value, phenotypeSubset.bodySize.value);
});

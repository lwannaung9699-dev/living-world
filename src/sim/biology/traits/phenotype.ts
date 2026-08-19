import { GenomeData } from "../genetics/geneTypes";
import { getGene, resolveGeneExpression } from "../genetics/genome";
import { BiologicalEnvironment, resolveEnvironment } from "../environment/biologicalEnvironment";
import { TraitDefinition, TraitGene, TraitValue } from "./traitDefinition";

/** Maps a traitId to the genes (+ weights) and baseline that produce it. Owned by species content, not the engine. */
export interface SpeciesTraitConfig {
  readonly traitId: string;
  readonly definition: TraitDefinition;
  readonly genes: readonly TraitGene[];
  readonly baseline: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Computes the environmental modifier for a trait: the weighted sum of
 * (environment field value * configured weight) over the trait's
 * configured environmentalFactors. Purely a function of static config +
 * environment — no RNG, no hidden state, so the same inputs always produce
 * the same modifier.
 */
export function computeEnvironmentalModifier(
  definition: TraitDefinition,
  environment: BiologicalEnvironment,
): number {
  const resolved = resolveEnvironment(environment);
  const factors = definition.environmentalFactors ?? {};
  let modifier = 0;
  for (const [field, weight] of Object.entries(factors)) {
    const envValue = resolved[field as keyof BiologicalEnvironment];
    modifier += (envValue ?? 0) * (weight ?? 0);
  }
  return modifier;
}

/**
 * Applies regulatory genes on top of a base map of expressed gene values:
 * a regulatory gene's own expressed value acts as a small multiplicative
 * modifier on the gene it `regulates`. Pure function.
 */
function applyRegulation(genome: GenomeData, baseExpression: Map<string, number>): Map<string, number> {
  const result = new Map(baseExpression);
  for (const gene of genome.genes) {
    if (!gene.regulatory || !gene.regulates) continue;
    const target = result.get(gene.regulates);
    if (target === undefined) continue;
    const regulatoryValue = resolveGeneExpression(gene);
    result.set(gene.regulates, target * (1 + regulatoryValue * 0.1));
  }
  return result;
}

/**
 * Deterministic genotype -> phenotype pipeline:
 *   genome -> (per-gene expression) -> regulation -> per-trait aggregation
 *   -> environmental modifier -> clamp -> TraitValue
 *
 * Same genome + same traitConfigs + same environment + same simulation
 * version always produces the same phenotype (no RNG is used anywhere in
 * this pipeline).
 */
export function expressPhenotype(
  genome: GenomeData,
  traitConfigs: readonly SpeciesTraitConfig[],
  environment: BiologicalEnvironment = {},
): Readonly<Record<string, TraitValue>> {
  const baseExpression = new Map<string, number>();
  for (const gene of genome.genes) {
    baseExpression.set(gene.geneId, resolveGeneExpression(gene));
  }
  const expressed = applyRegulation(genome, baseExpression);

  const result: Record<string, TraitValue> = {};
  for (const config of traitConfigs) {
    let rawValue = config.baseline;
    for (const traitGene of config.genes) {
      const gene = getGene(genome, traitGene.geneId);
      // A gene referenced by a trait config may have been lost to a deletion
      // mutation (gene deletion is an intended evolutionary mechanism, not
      // genome corruption) — treat it as contributing 0 rather than failing
      // the whole phenotype expression.
      if (!gene) continue;
      const value = expressed.get(traitGene.geneId) ?? resolveGeneExpression(gene);
      rawValue += value * traitGene.weight;
    }

    const environmentalModifier = computeEnvironmentalModifier(config.definition, environment);
    const finalValue = clamp(rawValue + environmentalModifier, config.definition.min, config.definition.max);

    result[config.traitId] = { traitId: config.traitId, rawValue, value: finalValue };
  }
  return result;
}

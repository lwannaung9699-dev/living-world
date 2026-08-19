import { TraitValue } from "../traits/traitDefinition";
import { FitnessTraitProfile } from "../species/speciesConfig";

/**
 * Generic fitness evaluation: fitness emerges from how closely each trait's
 * phenotype value sits to the species' configured optimum for that trait,
 * combined with the environment (already baked into the phenotype's
 * environmental adjustment upstream — see traits/phenotype.ts). Nothing
 * here hardcodes per-species fitness values.
 *
 * Per trait: score = exp(-((value - optimalCenter)^2) / (2 * tolerance^2))
 * -> 1 when exactly at the optimum, decaying smoothly as the phenotype
 * drifts away. Overall fitness is the weighted average across the species'
 * fitness profile, in [0, 1].
 */
export function computeFitness(
  phenotype: Readonly<Record<string, TraitValue>>,
  fitnessProfile: readonly FitnessTraitProfile[],
): number {
  if (fitnessProfile.length === 0) return 1;

  let weightedSum = 0;
  let totalWeight = 0;
  for (const profile of fitnessProfile) {
    const trait = phenotype[profile.traitId];
    if (!trait) continue;
    const tolerance = Math.max(profile.optimalTolerance, 1e-6);
    const score = Math.exp(-((trait.value - profile.optimalCenter) ** 2) / (2 * tolerance ** 2));
    weightedSum += score * profile.weight;
    totalWeight += profile.weight;
  }
  if (totalWeight === 0) return 1;
  return weightedSum / totalWeight;
}

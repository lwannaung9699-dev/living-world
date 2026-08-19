import { DeterministicRng } from "../../core/rng/deterministicRng";

export interface SelectionCandidate {
  readonly id: string;
  readonly fitness: number;
}

export interface SelectionOutcome {
  readonly id: string;
  readonly fitness: number;
  readonly survivalProbability: number;
  readonly reproductionProbability: number;
  readonly survived: boolean;
  readonly selectedToReproduce: boolean;
}

export interface SelectionParams {
  /** Survival probability an individual with fitness 0.5 (neutral) would have. */
  readonly baselineSurvival: number;
  /** How strongly fitness above/below 0.5 shifts survival probability. */
  readonly fitnessInfluence: number;
  readonly baselineReproduction: number;
  readonly reproductionFitnessInfluence: number;
}

export const DEFAULT_SELECTION_PARAMS: SelectionParams = {
  baselineSurvival: 0.9,
  fitnessInfluence: 0.3,
  baselineReproduction: 0.5,
  reproductionFitnessInfluence: 0.4,
};

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Foundation-level natural selection: probabilistic, not deterministic in
 * outcome (the strongest individual does not always survive), but
 * deterministic given a fixed RNG stream state — fitness only biases the
 * probabilities, the actual survive/reproduce decision is a seeded
 * Bernoulli trial per individual.
 */
export function applySelection(
  population: readonly SelectionCandidate[],
  rng: DeterministicRng,
  params: SelectionParams = DEFAULT_SELECTION_PARAMS,
): SelectionOutcome[] {
  return population.map((candidate) => {
    const survivalProbability = clamp01(
      params.baselineSurvival + params.fitnessInfluence * (candidate.fitness - 0.5),
    );
    const reproductionProbability = clamp01(
      params.baselineReproduction + params.reproductionFitnessInfluence * (candidate.fitness - 0.5),
    );
    const survived = rng.boolean(survivalProbability);
    const selectedToReproduce = survived && rng.boolean(reproductionProbability);
    return {
      id: candidate.id,
      fitness: candidate.fitness,
      survivalProbability,
      reproductionProbability,
      survived,
      selectedToReproduce,
    };
  });
}

import { BiologicalEnvironment, resolveEnvironment } from "../environment/biologicalEnvironment";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export interface MetabolismParams {
  /** Baseline energy expenditure per tick, before mass scaling. */
  readonly baseMetabolicRate: number;
  /** How strongly mass increases expenditure (0 = mass-independent). */
  readonly massExpenditureFactor: number;
  /** How efficiently foodAvailability converts into recovered energy per tick. */
  readonly intakeEfficiency: number;
}

export const DEFAULT_METABOLISM_PARAMS: MetabolismParams = {
  baseMetabolicRate: 0.05,
  massExpenditureFactor: 0.001,
  intakeEfficiency: 0.15,
};

export interface MetabolismStepResult {
  readonly energy: number;
  readonly starving: boolean;
}

/**
 * Advances one tick of the generic biological energy model. Actual
 * food/resource sourcing belongs to a future Ecology system — Team 04 only
 * exposes the biological interface: expenditure scaled by mass/metabolic
 * rate, and intake scaled by the environment's foodAvailability.
 */
export function stepMetabolism(
  currentEnergy: number,
  mass: number,
  environment: BiologicalEnvironment,
  params: MetabolismParams = DEFAULT_METABOLISM_PARAMS,
): MetabolismStepResult {
  const resolved = resolveEnvironment(environment);
  const expenditure = params.baseMetabolicRate + mass * params.massExpenditureFactor;
  const intake = resolved.foodAvailability * params.intakeEfficiency;
  const energy = clamp01(currentEnergy - expenditure + intake);
  return { energy, starving: energy <= 0 };
}

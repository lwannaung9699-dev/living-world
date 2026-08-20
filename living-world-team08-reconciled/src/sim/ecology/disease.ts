import { clamp, EcologicalEnvironment } from "./contracts";
import { PopulationData } from "./population";
import { InvalidStateError } from "../core/errors";

/**
 * DiseaseState — a generic infection-pressure model attached to one
 * population. Deliberately NOT a full epidemiological simulation (no
 * compartments, no contact networks): just enough state for ecological
 * pressure to feed into population dynamics and carrying capacity, per
 * project rule #17.
 */
export interface DiseaseState {
  readonly diseaseId: string;
  readonly populationId: string;
  /** 0..1 current infection pressure/prevalence within the population. */
  readonly infectionPressure: number;
  /** 0..1 how readily the disease spreads as density/pressure rise. */
  readonly transmissionRate: number;
  /** 0..1 population-average resistance, reducing both spread and mortality. */
  readonly resistance: number;
  /** 0..1 per-tick mortality rate applied to infected individuals. */
  readonly mortalityRate: number;
  /** 0..1 per-tick rate at which infected individuals recover (reducing infectionPressure). */
  readonly recoveryRate: number;
}

export function validateDiseaseState(value: unknown): asserts value is DiseaseState {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("DiseaseState must be an object");
  }
  const d = value as Partial<DiseaseState>;
  for (const field of ["infectionPressure", "transmissionRate", "resistance", "mortalityRate", "recoveryRate"] as const) {
    const v = d[field];
    if (typeof v !== "number" || v < 0 || v > 1) {
      throw new InvalidStateError(`DiseaseState.${field} must be within [0, 1]`);
    }
  }
  if (typeof d.diseaseId !== "string" || d.diseaseId.length === 0) {
    throw new InvalidStateError("DiseaseState.diseaseId must be a non-empty string");
  }
  if (typeof d.populationId !== "string" || d.populationId.length === 0) {
    throw new InvalidStateError("DiseaseState.populationId must be a non-empty string");
  }
}

/**
 * Advances infection pressure by one tick: spread scales with population
 * density (crowding raises transmission) and inversely with resistance and
 * environmental habitat quality (healthier environments suppress disease);
 * recovery pulls pressure back down every tick regardless.
 */
export function updateDiseasePressure(
  disease: DiseaseState,
  population: PopulationData,
  environment: EcologicalEnvironment,
): DiseaseState {
  const densityFactor = clamp(population.count / 100, 0, 2); // saturates; density is a relative crowding signal, not a hard cap
  const habitatSuppression = clamp(environment.habitatQuality);

  const spread =
    (1 - disease.infectionPressure) *
    disease.transmissionRate *
    (1 - disease.resistance) *
    (0.4 + 0.6 * densityFactor) *
    (1 - 0.5 * habitatSuppression);

  const recovery = disease.infectionPressure * disease.recoveryRate;

  const infectionPressure = clamp(disease.infectionPressure + spread - recovery);

  return { ...disease, infectionPressure };
}

/** Fraction of the population's count expected to die this tick from disease, given current infection pressure. */
export function diseaseMortalityFraction(disease: DiseaseState): number {
  return clamp(disease.infectionPressure * disease.mortalityRate * (1 - disease.resistance * 0.5));
}

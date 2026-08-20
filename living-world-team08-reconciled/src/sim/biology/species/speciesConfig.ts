import { InvalidStateError } from "../../core/errors";
import { GeneData, MutationConfig } from "../genetics/geneTypes";
import { SpeciesTraitConfig } from "../traits/phenotype";

export type ReproductionMode = "sexual" | "asexual";

export interface ReproductionConfig {
  readonly mode: ReproductionMode;
  /** Minimum age (ticks) before an individual can reproduce. */
  readonly maturityAge: number;
  /** Minimum ticks between two reproduction events for the same individual. */
  readonly cooldownTicks: number;
  /** Minimum energy [0,1] required to attempt reproduction. */
  readonly minEnergyToReproduce: number;
  readonly offspringCountMin: number;
  readonly offspringCountMax: number;
}

export interface LifeCycleConfig {
  readonly maturityAge: number;
  readonly oldAge: number;
  readonly maxAge: number;
  /** Baseline per-tick mortality probability once in the "old" life stage, before fitness/health adjustment. */
  readonly baselineOldAgeMortality: number;
}

/** A trait's fitness contribution: how close to `optimalCenter` is ideal, and how forgiving `optimalTolerance` is. */
export interface FitnessTraitProfile {
  readonly traitId: string;
  readonly optimalCenter: number;
  readonly optimalTolerance: number;
  readonly weight: number;
}

export interface SpeciesConfig {
  readonly speciesId: string;
  readonly traits: readonly SpeciesTraitConfig[];
  readonly baseGenomeTemplate: readonly GeneData[];
  readonly mutationConfig: MutationConfig;
  readonly reproduction: ReproductionConfig;
  readonly lifeCycle: LifeCycleConfig;
  readonly fitnessProfile: readonly FitnessTraitProfile[];
  /** Below this population size, the species is considered at risk of extinction. */
  readonly minViablePopulation: number;
}

export function validateSpeciesConfig(value: unknown): asserts value is SpeciesConfig {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("SpeciesConfig must be an object");
  }
  const config = value as Partial<SpeciesConfig>;
  if (typeof config.speciesId !== "string" || config.speciesId.length === 0) {
    throw new InvalidStateError("SpeciesConfig.speciesId must be a non-empty string");
  }
  if (!Array.isArray(config.baseGenomeTemplate) || config.baseGenomeTemplate.length === 0) {
    throw new InvalidStateError("SpeciesConfig.baseGenomeTemplate must be a non-empty array");
  }
  if (!Array.isArray(config.traits)) {
    throw new InvalidStateError("SpeciesConfig.traits must be an array");
  }
  if (!Array.isArray(config.fitnessProfile)) {
    throw new InvalidStateError("SpeciesConfig.fitnessProfile must be an array");
  }
  if (typeof config.minViablePopulation !== "number" || config.minViablePopulation < 0) {
    throw new InvalidStateError("SpeciesConfig.minViablePopulation must be a non-negative number");
  }
}

import { InvalidStateError } from "../../core/errors";

export type LifeStage = "embryo" | "juvenile" | "adult" | "old" | "dead";
export type BiologicalSex = "male" | "female" | "asexual" | "hermaphrodite";

export interface BioEntityPosition {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
}

/**
 * BioEntity — a generic biological simulation object. Deliberately NOT an
 * NPC/AI agent: no intelligence, decision-making, or behavior lives here.
 * Higher-level systems (future NPC/society teams) may wrap or reference a
 * BioEntity, but Team 04 only models the biology.
 */
export interface BioEntity {
  readonly id: string;
  readonly speciesId: string;
  readonly genomeId: string;
  readonly age: number;
  readonly sex: BiologicalSex;
  readonly lifeStage: LifeStage;
  /** Normalized [0, 1]. */
  readonly health: number;
  /** Normalized [0, 1]. */
  readonly energy: number;
  readonly mass: number;
  readonly position?: BioEntityPosition;
  readonly generation: number;
  readonly parentIds: readonly string[];
  readonly birthTick: number;
  readonly deathTick: number | null;
  /** Tick of this entity's most recent successful reproduction, or null if it has never reproduced. Drives ReproductionConfig.cooldownTicks. */
  readonly lastReproducedTick: number | null;
}

export interface CreateBioEntityInput {
  readonly id: string;
  readonly speciesId: string;
  readonly genomeId: string;
  readonly sex: BiologicalSex;
  readonly mass: number;
  readonly generation: number;
  readonly parentIds: readonly string[];
  readonly birthTick: number;
  readonly position?: BioEntityPosition;
  readonly lifeStage?: LifeStage;
  readonly health?: number;
  readonly energy?: number;
}

export function createBioEntity(input: CreateBioEntityInput): BioEntity {
  const entity: BioEntity = {
    id: input.id,
    speciesId: input.speciesId,
    genomeId: input.genomeId,
    age: 0,
    sex: input.sex,
    lifeStage: input.lifeStage ?? "embryo",
    health: input.health ?? 1,
    energy: input.energy ?? 1,
    mass: input.mass,
    // Only set the key when a position was actually supplied — leaving it
    // as an explicit `undefined` value (vs. omitted) round-trips as `null`
    // through JSON-based serialization, which would make a freshly
    // constructed entity unequal to the same entity after a
    // serialize/deserialize cycle.
    ...(input.position !== undefined ? { position: input.position } : {}),
    generation: input.generation,
    parentIds: input.parentIds,
    birthTick: input.birthTick,
    deathTick: null,
    lastReproducedTick: null,
  };
  validateBioEntity(entity);
  return entity;
}

const VALID_LIFE_STAGES: readonly LifeStage[] = ["embryo", "juvenile", "adult", "old", "dead"];
const VALID_SEXES: readonly BiologicalSex[] = ["male", "female", "asexual", "hermaphrodite"];

export function validateBioEntity(value: unknown): asserts value is BioEntity {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("BioEntity must be an object");
  }
  const entity = value as Partial<BioEntity>;
  if (typeof entity.id !== "string" || entity.id.length === 0) {
    throw new InvalidStateError("BioEntity.id must be a non-empty string");
  }
  if (typeof entity.speciesId !== "string" || entity.speciesId.length === 0) {
    throw new InvalidStateError("BioEntity.speciesId must be a non-empty string");
  }
  if (typeof entity.genomeId !== "string" || entity.genomeId.length === 0) {
    throw new InvalidStateError("BioEntity.genomeId must be a non-empty string");
  }
  if (!Number.isInteger(entity.age) || (entity.age as number) < 0) {
    throw new InvalidStateError("BioEntity.age must be a non-negative integer");
  }
  if (!VALID_SEXES.includes(entity.sex as BiologicalSex)) {
    throw new InvalidStateError(`BioEntity.sex must be one of ${VALID_SEXES.join(", ")}`);
  }
  if (!VALID_LIFE_STAGES.includes(entity.lifeStage as LifeStage)) {
    throw new InvalidStateError(`BioEntity.lifeStage must be one of ${VALID_LIFE_STAGES.join(", ")}`);
  }
  if (typeof entity.health !== "number" || entity.health < 0 || entity.health > 1) {
    throw new InvalidStateError("BioEntity.health must be a number in [0, 1]");
  }
  if (typeof entity.energy !== "number" || entity.energy < 0 || entity.energy > 1) {
    throw new InvalidStateError("BioEntity.energy must be a number in [0, 1]");
  }
  if (typeof entity.mass !== "number" || entity.mass < 0) {
    throw new InvalidStateError("BioEntity.mass must be a non-negative number");
  }
  if (!Number.isInteger(entity.generation) || (entity.generation as number) < 0) {
    throw new InvalidStateError("BioEntity.generation must be a non-negative integer");
  }
  if (!Array.isArray(entity.parentIds)) {
    throw new InvalidStateError("BioEntity.parentIds must be an array");
  }
  if (!Number.isInteger(entity.birthTick) || (entity.birthTick as number) < 0) {
    throw new InvalidStateError("BioEntity.birthTick must be a non-negative integer");
  }
  if (entity.deathTick !== null && !Number.isInteger(entity.deathTick)) {
    throw new InvalidStateError("BioEntity.deathTick must be null or an integer");
  }
  if (entity.lastReproducedTick !== null && !Number.isInteger(entity.lastReproducedTick)) {
    throw new InvalidStateError("BioEntity.lastReproducedTick must be null or an integer");
  }
}

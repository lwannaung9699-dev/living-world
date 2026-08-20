import { InvalidStateError } from "../../core/errors";

export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

/**
 * SensoryProfile — per-species (or per-individual) sensory capabilities
 * (Team 06 §6). Purely data: a species with "strong smell, weak vision"
 * and a species with "strong vision, weak smell" both run through the same
 * PerceptionSystem, just with different numbers.
 */
export interface SensoryProfile {
  readonly visionRange: number;
  readonly fieldOfViewDegrees: number; // 360 = omnidirectional vision
  readonly hearingRange: number;
  readonly smellRange: number;
  readonly touchRange: number;
  readonly socialSensingRange: number;
}

export const DEFAULT_SENSORY_PROFILE: SensoryProfile = {
  visionRange: 30,
  fieldOfViewDegrees: 150,
  hearingRange: 20,
  smellRange: 15,
  touchRange: 1.5,
  socialSensingRange: 25,
};

export function validateSensoryProfile(value: unknown): asserts value is SensoryProfile {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("SensoryProfile must be an object");
  }
  const s = value as Partial<SensoryProfile>;
  for (const key of [
    "visionRange",
    "fieldOfViewDegrees",
    "hearingRange",
    "smellRange",
    "touchRange",
    "socialSensingRange",
  ] as const) {
    const v = s[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      throw new InvalidStateError(`SensoryProfile.${key} must be a non-negative finite number, got ${String(v)}`);
    }
  }
}

export type PerceivableKind = "creature" | "resource" | "threat" | "obstacle" | "signal" | (string & {});

/** A single raw perceivable object in the world, as supplied by the environment/ecology layers. */
export interface PerceivableEntity {
  readonly id: string;
  readonly kind: PerceivableKind;
  readonly position: Vector2;
  readonly speciesId?: string;
  readonly isThreat?: boolean;
  readonly isFood?: boolean;
  readonly emitsSound?: boolean;
  readonly emitsSmell?: boolean;
  readonly noiseLevel?: number; // 0-1, louder = detectable from farther away
}

export interface HeardEvent {
  readonly sourceId: string;
  readonly kind: string;
  readonly position: Vector2;
  readonly loudness: number;
}

/** Structured perception output (Team 06 §5). Never wired directly to rendering. */
export interface Perception {
  readonly observerId: string;
  readonly tick: number;
  readonly visibleEntities: readonly PerceivableEntity[];
  readonly heardEvents: readonly HeardEvent[];
  readonly nearbyResources: readonly PerceivableEntity[];
  readonly threats: readonly PerceivableEntity[];
  readonly potentialFood: readonly PerceivableEntity[];
  readonly socialEntities: readonly PerceivableEntity[];
  readonly environmentalConditions: Readonly<Record<string, unknown>>;
}

export interface PerceiveInput {
  readonly observerId: string;
  readonly observerPosition: Vector2;
  /** Facing direction in degrees; used with fieldOfViewDegrees for vision filtering. 0 = +x axis. */
  readonly facingDegrees: number;
  readonly tick: number;
  readonly sensory: SensoryProfile;
  readonly entitiesNearby: readonly PerceivableEntity[];
  readonly ambientEvents?: readonly HeardEvent[];
  readonly environmentalConditions?: Readonly<Record<string, unknown>>;
}

function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleBetweenDegrees(from: Vector2, to: Vector2): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

function angularDifference(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function isWithinFieldOfView(input: PerceiveInput, target: Vector2): boolean {
  if (input.sensory.fieldOfViewDegrees >= 360) return true;
  const angleToTarget = angleBetweenDegrees(input.observerPosition, target);
  return angularDifference(angleToTarget, input.facingDegrees) <= input.sensory.fieldOfViewDegrees / 2;
}

/**
 * PerceptionSystem.perceive — converts raw nearby-entity/event data into a
 * structured, sensory-limited Perception (§5-6). A creature never gets
 * omniscient knowledge: entities outside every applicable sense's range (or
 * outside field of view, for vision) simply do not appear.
 */
export function perceive(input: PerceiveInput): Perception {
  const visibleEntities: PerceivableEntity[] = [];
  const socialEntities: PerceivableEntity[] = [];
  const nearbyResources: PerceivableEntity[] = [];
  const threats: PerceivableEntity[] = [];
  const potentialFood: PerceivableEntity[] = [];

  for (const entity of input.entitiesNearby) {
    if (entity.id === input.observerId) continue;
    const dist = distance(input.observerPosition, entity.position);

    const seenByVision =
      dist <= input.sensory.visionRange && isWithinFieldOfView(input, entity.position);
    const smelledByScent = Boolean(entity.emitsSmell) && dist <= input.sensory.smellRange;
    const sensedSocially = dist <= input.sensory.socialSensingRange;

    const detected = seenByVision || smelledByScent;
    if (!detected) continue;

    visibleEntities.push(entity);
    if (entity.kind === "resource") nearbyResources.push(entity);
    if (entity.isThreat) threats.push(entity);
    if (entity.isFood) potentialFood.push(entity);
    if (entity.kind === "creature" && sensedSocially) socialEntities.push(entity);
  }

  const heardEvents = (input.ambientEvents ?? []).filter(
    (event) => distance(input.observerPosition, event.position) <= input.sensory.hearingRange,
  );

  const perception: Perception = {
    observerId: input.observerId,
    tick: input.tick,
    visibleEntities,
    heardEvents,
    nearbyResources,
    threats,
    potentialFood,
    socialEntities,
    environmentalConditions: input.environmentalConditions ?? {},
  };
  return perception;
}

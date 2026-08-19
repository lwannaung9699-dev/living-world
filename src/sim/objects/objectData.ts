import { InvalidStateError } from "../core/errors";
import { DecayState, createInitialDecayState, validateDecayState } from "../materials/decay";

export const OBJECT_DATA_CONTRACT_VERSION = "1.0.0";

export const OBJECT_CATEGORIES = [
  "tree",
  "rock",
  "log",
  "wall",
  "door",
  "bridge",
  "tool",
  "weapon",
  "container",
  "building_component",
  "furniture",
  "machine",
  "natural_formation",
] as const;
export type ObjectCategory = (typeof OBJECT_CATEGORIES)[number];

export const OBJECT_STATES = ["intact", "damaged", "destroyed", "decayed"] as const;
export type ObjectState = (typeof OBJECT_STATES)[number];

export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ObjectTransform {
  readonly position: Vector3;
  readonly rotation: Vector3;
  readonly scale: Vector3;
}

export const IDENTITY_TRANSFORM: ObjectTransform = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

/** What fraction of a part is made of a given material. A part's assignments should sum to ~1. */
export interface MaterialAssignment {
  readonly materialId: string;
  readonly proportion: number;
}

export interface Durability {
  readonly maxIntegrity: number;
  readonly integrity: number;
}

/**
 * ObjectPart — one independently addressable logical piece of a world
 * object (e.g. a tree's trunk, a house's north wall). No mesh, no visual
 * data: `volume` is the only physical quantity, used by the structural and
 * resource-extraction systems to turn MaterialAssignments into mass/yield.
 */
export interface ObjectPart {
  readonly id: string;
  readonly name: string;
  readonly materials: readonly MaterialAssignment[];
  /** m^3. */
  readonly volume: number;
  readonly transform: ObjectTransform;
  readonly durability: Durability;
}

export interface StructuralProperties {
  /** kg, derived from part volumes * material densities. */
  readonly mass: number;
  readonly centerOfMass: Vector3;
  readonly supportPoints: readonly Vector3[];
  /** Abstract load units this object can bear before failing. */
  readonly loadCapacity: number;
  /** Current applied load / loadCapacity, in [0, ~2]; >1 means overloaded. */
  readonly stress: number;
  /** 1 - stress, clamped to [0,1]. 0 means structurally failed. */
  readonly stability: number;
  /** Aggregate structural integrity in [0,1], distinct from any single part's Durability. */
  readonly integrity: number;
  /** Integrity threshold below which the object fractures/fails. */
  readonly fractureThreshold: number;
}

/**
 * ObjectData — a reusable, engine-agnostic logical representation of a
 * world object. Never contains mesh/visual data: a future Godot or web
 * client renders from this, it does not live inside it.
 */
export interface ObjectData {
  readonly contractVersion: string;
  readonly id: string;
  readonly category: ObjectCategory;
  readonly name: string;
  readonly parentId: string | null;
  readonly childIds: readonly string[];
  readonly parts: readonly ObjectPart[];
  readonly transform: ObjectTransform;
  readonly structural: StructuralProperties;
  readonly state: ObjectState;
  readonly decay: DecayState;
}

export interface CreateObjectDataInput {
  readonly id: string;
  readonly category: ObjectCategory;
  readonly name: string;
  readonly parts: readonly ObjectPart[];
  readonly structural: StructuralProperties;
  readonly transform?: ObjectTransform;
  readonly parentId?: string | null;
  readonly childIds?: readonly string[];
  readonly state?: ObjectState;
  readonly decay?: DecayState;
}

export function createObjectData(input: CreateObjectDataInput): ObjectData {
  const object: ObjectData = {
    contractVersion: OBJECT_DATA_CONTRACT_VERSION,
    id: input.id,
    category: input.category,
    name: input.name,
    parentId: input.parentId ?? null,
    childIds: input.childIds ?? [],
    parts: input.parts,
    transform: input.transform ?? IDENTITY_TRANSFORM,
    structural: input.structural,
    state: input.state ?? "intact",
    decay: input.decay ?? createInitialDecayState(),
  };
  validateObjectData(object);
  return object;
}

export function validateVector3(value: unknown, label: string): asserts value is Vector3 {
  if (typeof value !== "object" || value === null) throw new InvalidStateError(`${label} must be an object`);
  const v = value as Partial<Vector3>;
  for (const key of ["x", "y", "z"] as const) {
    if (!(typeof v[key] === "number" && Number.isFinite(v[key]))) {
      throw new InvalidStateError(`${label}.${key} must be a finite number, got ${String(v[key])}`);
    }
  }
}

export function validateTransform(value: unknown, label = "ObjectTransform"): asserts value is ObjectTransform {
  if (typeof value !== "object" || value === null) throw new InvalidStateError(`${label} must be an object`);
  const t = value as Partial<ObjectTransform>;
  validateVector3(t.position, `${label}.position`);
  validateVector3(t.rotation, `${label}.rotation`);
  validateVector3(t.scale, `${label}.scale`);
}

function validateMaterialAssignment(value: unknown): asserts value is MaterialAssignment {
  if (typeof value !== "object" || value === null) throw new InvalidStateError("MaterialAssignment must be an object");
  const a = value as Partial<MaterialAssignment>;
  if (typeof a.materialId !== "string" || a.materialId.length === 0) {
    throw new InvalidStateError("MaterialAssignment.materialId must be a non-empty string");
  }
  if (!(typeof a.proportion === "number" && Number.isFinite(a.proportion) && a.proportion > 0 && a.proportion <= 1)) {
    throw new InvalidStateError(`MaterialAssignment.proportion must be in (0,1], got ${String(a.proportion)}`);
  }
}

function validateDurability(value: unknown): asserts value is Durability {
  if (typeof value !== "object" || value === null) throw new InvalidStateError("Durability must be an object");
  const d = value as Partial<Durability>;
  if (!(typeof d.maxIntegrity === "number" && Number.isFinite(d.maxIntegrity) && d.maxIntegrity > 0)) {
    throw new InvalidStateError(`Durability.maxIntegrity must be a positive finite number, got ${String(d.maxIntegrity)}`);
  }
  if (!(typeof d.integrity === "number" && Number.isFinite(d.integrity) && d.integrity >= 0 && d.integrity <= d.maxIntegrity)) {
    throw new InvalidStateError(`Durability.integrity must be in [0, maxIntegrity], got ${String(d.integrity)}`);
  }
}

export function validateObjectPart(value: unknown): asserts value is ObjectPart {
  if (typeof value !== "object" || value === null) throw new InvalidStateError("ObjectPart must be an object");
  const p = value as Partial<ObjectPart>;
  if (typeof p.id !== "string" || p.id.length === 0) throw new InvalidStateError("ObjectPart.id must be a non-empty string");
  if (typeof p.name !== "string" || p.name.length === 0) throw new InvalidStateError("ObjectPart.name must be a non-empty string");
  if (!Array.isArray(p.materials) || p.materials.length === 0) {
    throw new InvalidStateError("ObjectPart.materials must be a non-empty array");
  }
  for (const a of p.materials) validateMaterialAssignment(a);
  const proportionSum = p.materials.reduce((sum, a) => sum + a.proportion, 0);
  if (proportionSum > 1 + 1e-6) {
    throw new InvalidStateError(`ObjectPart.materials proportions must sum to <= 1, got ${proportionSum}`);
  }
  if (!(typeof p.volume === "number" && Number.isFinite(p.volume) && p.volume > 0)) {
    throw new InvalidStateError(`ObjectPart.volume must be a positive finite number, got ${String(p.volume)}`);
  }
  validateTransform(p.transform, `ObjectPart(${p.id}).transform`);
  validateDurability(p.durability);
}

export function validateStructuralProperties(value: unknown): asserts value is StructuralProperties {
  if (typeof value !== "object" || value === null) throw new InvalidStateError("StructuralProperties must be an object");
  const s = value as Partial<StructuralProperties>;
  if (!(typeof s.mass === "number" && Number.isFinite(s.mass) && s.mass >= 0)) {
    throw new InvalidStateError(`StructuralProperties.mass must be a non-negative finite number, got ${String(s.mass)}`);
  }
  validateVector3(s.centerOfMass, "StructuralProperties.centerOfMass");
  if (!Array.isArray(s.supportPoints)) {
    throw new InvalidStateError("StructuralProperties.supportPoints must be an array");
  }
  s.supportPoints.forEach((p, i) => validateVector3(p, `StructuralProperties.supportPoints[${i}]`));
  if (!(typeof s.loadCapacity === "number" && Number.isFinite(s.loadCapacity) && s.loadCapacity >= 0)) {
    throw new InvalidStateError("StructuralProperties.loadCapacity must be a non-negative finite number");
  }
  for (const field of ["stress", "stability", "integrity", "fractureThreshold"] as const) {
    const v = s[field];
    if (!(typeof v === "number" && Number.isFinite(v) && v >= 0)) {
      throw new InvalidStateError(`StructuralProperties.${field} must be a non-negative finite number, got ${String(v)}`);
    }
  }
}

export function validateObjectData(value: unknown): asserts value is ObjectData {
  if (typeof value !== "object" || value === null) throw new InvalidStateError("ObjectData must be an object");
  const o = value as Partial<ObjectData>;
  if (typeof o.contractVersion !== "string" || o.contractVersion.length === 0) {
    throw new InvalidStateError("ObjectData.contractVersion must be a non-empty string");
  }
  if (typeof o.id !== "string" || o.id.length === 0) throw new InvalidStateError("ObjectData.id must be a non-empty string");
  if (!OBJECT_CATEGORIES.includes(o.category as ObjectCategory)) {
    throw new InvalidStateError(`ObjectData.category invalid: ${String(o.category)}`);
  }
  if (typeof o.name !== "string" || o.name.length === 0) throw new InvalidStateError("ObjectData.name must be a non-empty string");
  if (o.parentId !== null && typeof o.parentId !== "string") {
    throw new InvalidStateError("ObjectData.parentId must be a string or null");
  }
  if (!Array.isArray(o.childIds)) throw new InvalidStateError("ObjectData.childIds must be an array");
  if (!Array.isArray(o.parts) || o.parts.length === 0) {
    throw new InvalidStateError("ObjectData.parts must be a non-empty array");
  }
  o.parts.forEach(validateObjectPart);
  validateTransform(o.transform, "ObjectData.transform");
  validateStructuralProperties(o.structural);
  if (!OBJECT_STATES.includes(o.state as ObjectState)) {
    throw new InvalidStateError(`ObjectData.state invalid: ${String(o.state)}`);
  }
  validateDecayState(o.decay);
}

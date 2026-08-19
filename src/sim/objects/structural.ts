import { MaterialRegistry } from "../materials/materialRegistry";
import { InvalidStateError } from "../core/errors";
import { ObjectPart, StructuralProperties, Vector3 } from "./objectData";

/**
 * Computes total mass (kg) of a set of parts from their volume and
 * material density: mass = sum(part.volume * sum(assignment.proportion * material.density)).
 * Pure/deterministic — order of parts/assignments never affects the sum.
 */
export function computeMass(parts: readonly ObjectPart[], materials: MaterialRegistry): number {
  let mass = 0;
  for (const part of parts) {
    for (const assignment of part.materials) {
      const material = materials.get(assignment.materialId);
      mass += part.volume * assignment.proportion * material.density;
    }
  }
  return mass;
}

/** Mass-weighted average of each part's transform.position, i.e. the object's center of mass. */
export function computeCenterOfMass(parts: readonly ObjectPart[], materials: MaterialRegistry): Vector3 {
  let totalMass = 0;
  let sum: Vector3 = { x: 0, y: 0, z: 0 };
  for (const part of parts) {
    let partMass = 0;
    for (const assignment of part.materials) {
      partMass += part.volume * assignment.proportion * materials.get(assignment.materialId).density;
    }
    totalMass += partMass;
    sum = {
      x: sum.x + part.transform.position.x * partMass,
      y: sum.y + part.transform.position.y * partMass,
      z: sum.z + part.transform.position.z * partMass,
    };
  }
  if (totalMass <= 0) return { x: 0, y: 0, z: 0 };
  return { x: sum.x / totalMass, y: sum.y / totalMass, z: sum.z / totalMass };
}

/**
 * Estimates load-bearing capacity from the weakest-link principle: the
 * object's capacity is driven by its least-strong material, scaled up by
 * how many independent support points distribute the load, and by total
 * mass (bigger cross-section, roughly, more capacity). This is
 * intentionally simple simulation-level math for a future physics engine
 * to refine — see architecture §8.
 */
export function computeLoadCapacity(
  parts: readonly ObjectPart[],
  materials: MaterialRegistry,
  supportPointCount: number,
): number {
  if (parts.length === 0) return 0;
  const weakestStrength = Math.min(
    ...parts.flatMap((part) => part.materials.map((a) => materials.get(a.materialId).strength)),
  );
  const mass = computeMass(parts, materials);
  const supportFactor = Math.max(1, supportPointCount);
  return weakestStrength * (mass / 10 + 1) * supportFactor;
}

/**
 * Builds a fresh, unloaded StructuralProperties snapshot for a set of parts.
 */
export function buildStructuralProperties(
  parts: readonly ObjectPart[],
  materials: MaterialRegistry,
  supportPoints: readonly Vector3[],
  fractureThreshold = 0.15,
): StructuralProperties {
  const mass = computeMass(parts, materials);
  const centerOfMass = computeCenterOfMass(parts, materials);
  const loadCapacity = computeLoadCapacity(parts, materials, supportPoints.length);
  return {
    mass,
    centerOfMass,
    supportPoints,
    loadCapacity,
    stress: 0,
    stability: 1,
    integrity: 1,
    fractureThreshold,
  };
}

/**
 * Applies an additional load (abstract units, e.g. weight of something
 * resting on this object, or an impact force) to a StructuralProperties
 * snapshot: beam -> load -> stress -> deformation -> failure (§8).
 *
 * stress    = appliedLoad / loadCapacity (0 = unloaded, 1 = at capacity, >1 = overloaded)
 * stability = clamp(1 - stress, 0, 1)
 * integrity = reduced further whenever stress exceeds 1 (overload deformation/damage)
 *
 * Pure/deterministic given identical inputs.
 */
export function applyLoad(structural: StructuralProperties, appliedLoad: number): StructuralProperties {
  if (!(typeof appliedLoad === "number" && Number.isFinite(appliedLoad) && appliedLoad >= 0)) {
    throw new InvalidStateError(`applyLoad requires a non-negative finite appliedLoad, got ${String(appliedLoad)}`);
  }
  const stress = structural.loadCapacity > 0 ? appliedLoad / structural.loadCapacity : Number.POSITIVE_INFINITY;
  const stability = clamp01(1 - stress);
  const overload = Math.max(0, stress - 1);
  const integrity = clamp01(structural.integrity - overload * 0.25);
  return { ...structural, stress, stability, integrity };
}

/** True once stress exceeds capacity and integrity has dropped to/below fractureThreshold: beam has failed. */
export function hasFractured(structural: StructuralProperties): boolean {
  return structural.stress > 1 && structural.integrity <= structural.fractureThreshold;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

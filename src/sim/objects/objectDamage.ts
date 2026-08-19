import { MaterialRegistry } from "../materials/materialRegistry";
import { applyDamage, DamageEvent } from "../materials/damage";
import { InvalidStateError } from "../core/errors";
import { ObjectData, ObjectPart, ObjectState } from "./objectData";

/**
 * Applies a DamageEvent to every part of an object (each part reacts
 * according to its own material composition — see materials/damage.ts),
 * then re-derives the object's aggregate `state` from the resulting part
 * integrities. This is the propagation link between "a fireball hits this
 * wall" (a single DamageEvent) and "this wall's 4 planks each take
 * material-appropriate damage, and the wall as a whole is now `damaged`".
 *
 * Pure/deterministic: never mutates `object`, returns a new ObjectData.
 */
export function applyDamageToObject(object: ObjectData, materials: MaterialRegistry, event: DamageEvent): ObjectData {
  const parts: ObjectPart[] = object.parts.map((part) => {
    // A part made of multiple materials takes damage according to its most-affected material component
    // (the weakest link — e.g. a composite part with any flammable component still burns).
    const worstIntegrityLoss = Math.max(
      ...part.materials.map((assignment) => {
        const material = materials.get(assignment.materialId);
        const fraction = part.durability.integrity / part.durability.maxIntegrity;
        const after = applyDamage(fraction, material, event);
        return fraction - after;
      }),
    );
    const newFraction = clamp01(part.durability.integrity / part.durability.maxIntegrity - worstIntegrityLoss);
    return {
      ...part,
      durability: { ...part.durability, integrity: newFraction * part.durability.maxIntegrity },
    };
  });

  const state = deriveObjectState(parts);
  return { ...object, parts, state };
}

/** Aggregate integrity fraction across all parts, weighted by each part's maxIntegrity. */
export function computeAggregateIntegrity(parts: readonly ObjectPart[]): number {
  const totalMax = parts.reduce((sum, p) => sum + p.durability.maxIntegrity, 0);
  if (totalMax <= 0) throw new InvalidStateError("computeAggregateIntegrity: parts have zero total maxIntegrity");
  const totalCurrent = parts.reduce((sum, p) => sum + p.durability.integrity, 0);
  return totalCurrent / totalMax;
}

function deriveObjectState(parts: readonly ObjectPart[]): ObjectState {
  const aggregate = computeAggregateIntegrity(parts);
  if (aggregate <= 0) return "destroyed";
  if (aggregate < 0.6) return "damaged";
  return "intact";
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

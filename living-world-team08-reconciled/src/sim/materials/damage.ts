import { MaterialData } from "./materialData";
import { InvalidStateError } from "../core/errors";

export const DAMAGE_TYPES = ["impact", "heat", "fire", "water", "corrosion", "decay", "overload"] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

export interface DamageEvent {
  readonly type: DamageType;
  /** Raw, un-scaled severity in [0, 1] — the caller's judgment of "how bad" before material resistance is applied. */
  readonly amount: number;
  readonly sourceId?: string;
}

export function validateDamageEvent(value: unknown): asserts value is DamageEvent {
  if (typeof value !== "object" || value === null) throw new InvalidStateError("DamageEvent must be an object");
  const e = value as Partial<DamageEvent>;
  if (!DAMAGE_TYPES.includes(e.type as DamageType)) throw new InvalidStateError(`DamageEvent.type invalid: ${String(e.type)}`);
  if (!(typeof e.amount === "number" && Number.isFinite(e.amount) && e.amount >= 0)) {
    throw new InvalidStateError(`DamageEvent.amount must be a non-negative finite number, got ${String(e.amount)}`);
  }
}

/**
 * How strongly a given damage type actually bites, per material — e.g.
 * wood + fire is high damage (driven by flammability), stone + fire is low
 * damage (driven by toughness/hardness), iron + corrosion is gradual
 * (driven by corrosionResistance), any material + time/decay depends on
 * toughness. Returns a multiplier normally in roughly [0, ~1.5]; nothing
 * here is hardcoded per-material-id, only per-material-*property*.
 */
export function computeDamageMultiplier(material: MaterialData, type: DamageType): number {
  switch (type) {
    case "impact":
      return clamp(1 - material.toughness * 0.6 - material.elasticity * 0.2, 0.05, 1.5);
    case "heat":
      return clamp(1 - material.thermalCapacity * 0.5 - material.thermalConductivity * 0.2, 0.05, 1.5);
    case "fire":
      return clamp(0.2 + material.flammability * 1.3 - material.hardness * 0.2, 0.02, 1.6);
    case "water":
      return clamp(1 - material.waterResistance, 0.02, 1);
    case "corrosion":
      return clamp(1 - material.corrosionResistance, 0.02, 1);
    case "decay":
      return clamp(1 - material.toughness * 0.5, 0.05, 1.2);
    case "overload":
      return clamp(1 - material.strength * 0.7, 0.05, 1.5);
    default:
      return 1;
  }
}

/**
 * Applies a single DamageEvent to a current integrity value in [0, 1],
 * returning the new integrity (clamped to [0, 1]). Pure/deterministic:
 * identical (integrity, material, event) always yields the identical result.
 */
export function applyDamage(currentIntegrity: number, material: MaterialData, event: DamageEvent): number {
  if (!(typeof currentIntegrity === "number" && Number.isFinite(currentIntegrity))) {
    throw new InvalidStateError(`currentIntegrity must be a finite number, got ${String(currentIntegrity)}`);
  }
  validateDamageEvent(event);
  const multiplier = computeDamageMultiplier(material, event.type);
  const loss = event.amount * multiplier;
  return clamp(currentIntegrity - loss, 0, 1);
}

/** Applies multiple DamageEvents in order (order matters only in that later damage applies to an already-reduced integrity, as expected). */
export function applyDamageSequence(
  currentIntegrity: number,
  material: MaterialData,
  events: readonly DamageEvent[],
): number {
  return events.reduce((integrity, event) => applyDamage(integrity, material, event), currentIntegrity);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

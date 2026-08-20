import { MaterialData } from "./materialData";
import { MaterialEnvironmentContext, resolveMaterialEnvironment } from "./environment";
import { InvalidStateError } from "../core/errors";

/** Serializable decay progress for a single material-bearing object/part. */
export interface DecayState {
  /** Remaining structural/material integrity in [0, 1]. 1 = pristine, 0 = fully decayed. */
  readonly integrity: number;
  /** Total simulated seconds this state has existed under decay tracking. */
  readonly elapsedSeconds: number;
}

export function createInitialDecayState(): DecayState {
  return { integrity: 1, elapsedSeconds: 0 };
}

export function validateDecayState(value: unknown): asserts value is DecayState {
  if (typeof value !== "object" || value === null) throw new InvalidStateError("DecayState must be an object");
  const s = value as Partial<DecayState>;
  if (!(typeof s.integrity === "number" && Number.isFinite(s.integrity) && s.integrity >= 0 && s.integrity <= 1)) {
    throw new InvalidStateError(`DecayState.integrity must be a number in [0,1], got ${String(s.integrity)}`);
  }
  if (!(typeof s.elapsedSeconds === "number" && Number.isFinite(s.elapsedSeconds) && s.elapsedSeconds >= 0)) {
    throw new InvalidStateError(`DecayState.elapsedSeconds must be a non-negative finite number, got ${String(s.elapsedSeconds)}`);
  }
}

const SECONDS_PER_DAY = 86_400;

/**
 * Computes the instantaneous fractional decay rate (integrity loss per
 * second) for a material under a given environment and existing damage
 * level. Every input is either a MaterialData property or a
 * MaterialEnvironmentContext field — never a Team02 implementation type.
 *
 * Rationale (matches architecture doc §10): decay scales up with humidity /
 * water exposure (tempered by the material's own waterResistance), with
 * temperature extremes relative to the material's comfortable range, and
 * with existing damage (a damaged object decays faster); it scales down
 * with the material's own toughness.
 */
export function computeDecayRate(
  material: MaterialData,
  context: MaterialEnvironmentContext = {},
  currentDamage = 0,
): number {
  const env = resolveMaterialEnvironment(context);
  const baseDailyRate = material.decayRate;

  const moistureExposure = Math.max(env.humidity, env.waterExposure);
  const moisturePressure = moistureExposure * (1 - material.waterResistance);

  const range = material.temperatureRange;
  const span = Math.max(range.maxC - range.minC, 1);
  const overshoot =
    env.temperatureC < range.minC
      ? (range.minC - env.temperatureC) / span
      : env.temperatureC > range.maxC
        ? (env.temperatureC - range.maxC) / span
        : 0;
  const temperaturePressure = clamp01(overshoot);

  const toughnessRelief = 1 - material.toughness * 0.5;
  const damagePressure = 1 + clamp01(currentDamage) * 1.5;

  const dailyRate =
    baseDailyRate * (1 + moisturePressure * 2 + temperaturePressure * 1.5) * toughnessRelief * damagePressure;

  return dailyRate / SECONDS_PER_DAY;
}

/**
 * Advances a DecayState by `deltaSeconds` of simulated time. Pure/
 * deterministic given identical inputs. `currentDamage` (0..1, defaults to
 * 0) lets callers factor in existing DamageEvent-driven degradation so
 * decay accelerates on already-damaged objects, per architecture §9/§10.
 */
export function applyDecay(
  state: DecayState,
  material: MaterialData,
  context: MaterialEnvironmentContext,
  deltaSeconds: number,
  currentDamage = 0,
): DecayState {
  validateDecayState(state);
  if (!(typeof deltaSeconds === "number" && Number.isFinite(deltaSeconds) && deltaSeconds >= 0)) {
    throw new InvalidStateError(`deltaSeconds must be a non-negative finite number, got ${String(deltaSeconds)}`);
  }
  const rate = computeDecayRate(material, context, currentDamage);
  const integrity = clamp01(state.integrity - rate * deltaSeconds);
  return { integrity, elapsedSeconds: state.elapsedSeconds + deltaSeconds };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

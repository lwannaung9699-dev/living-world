import { InvalidStateError } from "../../core/errors";

/**
 * NeedsState — generic needs model (Team 06 §7).
 *
 * All values are on a normalized [0, 100] scale where HIGHER means MORE
 * PRESSURE (e.g. hunger=100 means starving, hunger=0 means fully fed).
 * This is intentionally generic and species-agnostic: species differences
 * come from `NeedsProfile` growth rates (see below), not from bespoke
 * per-species code.
 */
export interface NeedsState {
  readonly hunger: number;
  readonly thirst: number;
  readonly sleep: number;
  readonly safety: number;
  readonly temperature: number;
  readonly social: number;
  readonly reproduction: number;
  readonly curiosity: number;
}

export const NEED_KEYS = [
  "hunger",
  "thirst",
  "sleep",
  "safety",
  "temperature",
  "social",
  "reproduction",
  "curiosity",
] as const;

export type NeedKey = (typeof NEED_KEYS)[number];

/**
 * Data-driven per-species growth rates for each need, expressed as "points
 * of pressure gained per tick". Species with different metabolisms (e.g. a
 * fast-metabolism small mammal vs a slow-metabolism reptile) simply supply
 * different rates — no species-specific code is required (§29).
 */
export type NeedsGrowthProfile = Readonly<Record<NeedKey, number>>;

export const DEFAULT_NEEDS_GROWTH_PROFILE: NeedsGrowthProfile = {
  hunger: 0.15,
  thirst: 0.2,
  sleep: 0.1,
  safety: 0, // safety is event-driven (perceived threats), not a passive clock
  temperature: 0.05,
  social: 0.08,
  reproduction: 0.03,
  curiosity: 0.06,
};

export function createInitialNeeds(overrides: Partial<NeedsState> = {}): NeedsState {
  const base: NeedsState = {
    hunger: 10,
    thirst: 10,
    sleep: 5,
    safety: 0,
    temperature: 0,
    social: 15,
    reproduction: 0,
    curiosity: 20,
  };
  const merged = { ...base, ...overrides };
  validateNeedsState(merged);
  return merged;
}

export function validateNeedsState(value: unknown): asserts value is NeedsState {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("NeedsState must be an object");
  }
  const needs = value as Partial<NeedsState>;
  for (const key of NEED_KEYS) {
    const v = needs[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) {
      throw new InvalidStateError(`NeedsState.${key} must be a finite number in [0, 100], got ${String(v)}`);
    }
  }
}

function clampNeed(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Advances every need by one tick according to the growth profile.
 * Pure function — the chain "hunger increases -> food-seeking becomes more
 * valuable" is NOT hardcoded here; this only updates raw pressure values.
 * Turning pressure into behavior is the Decision/Utility layer's job (§7).
 */
export function tickNeeds(needs: NeedsState, profile: NeedsGrowthProfile = DEFAULT_NEEDS_GROWTH_PROFILE): NeedsState {
  const next: Record<NeedKey, number> = { ...needs };
  for (const key of NEED_KEYS) {
    next[key] = clampNeed(needs[key] + profile[key]);
  }
  return next as NeedsState;
}

/** Reduces a single need by `amount` (e.g. eating reduces hunger). Clamped to [0, 100]. */
export function satisfyNeed(needs: NeedsState, key: NeedKey, amount: number): NeedsState {
  return { ...needs, [key]: clampNeed(needs[key] - amount) };
}

/** Increases a single need by `amount` (e.g. spotting a predator raises `safety` pressure). Clamped to [0, 100]. */
export function raiseNeed(needs: NeedsState, key: NeedKey, amount: number): NeedsState {
  return { ...needs, [key]: clampNeed(needs[key] + amount) };
}

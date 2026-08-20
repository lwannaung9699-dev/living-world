import { InvalidStateError } from "../../core/errors";

/**
 * EmotionalState — lightweight internal emotional variables (Team 06 §15).
 * Deliberately NOT a human-level psychological model — just a small set of
 * normalized [0, 100] pressure/comfort values that feed into utility
 * scoring and decay gradually back toward a neutral baseline over time.
 */
export interface EmotionalState {
  readonly fear: number;
  readonly stress: number;
  readonly comfort: number;
  readonly excitement: number;
  readonly satisfaction: number;
  readonly anger: number;
}

export const EMOTION_KEYS = ["fear", "stress", "comfort", "excitement", "satisfaction", "anger"] as const;
export type EmotionKey = (typeof EMOTION_KEYS)[number];

/** Baseline each emotion decays toward when nothing is actively driving it. */
const NEUTRAL_BASELINE: Readonly<Record<EmotionKey, number>> = {
  fear: 0,
  stress: 0,
  comfort: 50,
  excitement: 0,
  satisfaction: 50,
  anger: 0,
};

/** How quickly (fraction of the gap to baseline, per tick) each emotion decays. */
const DEFAULT_DECAY_RATE: Readonly<Record<EmotionKey, number>> = {
  fear: 0.08,
  stress: 0.04,
  comfort: 0.05,
  excitement: 0.1,
  satisfaction: 0.03,
  anger: 0.06,
};

export function createInitialEmotionalState(overrides: Partial<EmotionalState> = {}): EmotionalState {
  const base: EmotionalState = { ...NEUTRAL_BASELINE };
  const merged = { ...base, ...overrides };
  validateEmotionalState(merged);
  return merged;
}

export function validateEmotionalState(value: unknown): asserts value is EmotionalState {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("EmotionalState must be an object");
  }
  const emotion = value as Partial<EmotionalState>;
  for (const key of EMOTION_KEYS) {
    const v = emotion[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) {
      throw new InvalidStateError(`EmotionalState.${key} must be a finite number in [0, 100], got ${String(v)}`);
    }
  }
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Decays every emotion one step toward its neutral baseline. Pure function. */
export function decayEmotionalState(
  emotion: EmotionalState,
  decayRate: Readonly<Record<EmotionKey, number>> = DEFAULT_DECAY_RATE,
): EmotionalState {
  const next: Record<EmotionKey, number> = { ...emotion };
  for (const key of EMOTION_KEYS) {
    const baseline = NEUTRAL_BASELINE[key];
    const delta = (baseline - emotion[key]) * decayRate[key];
    next[key] = clamp(emotion[key] + delta);
  }
  return next as EmotionalState;
}

/** Nudges a single emotion by a signed delta (e.g. spotting a predator raises `fear`). Clamped to [0, 100]. */
export function adjustEmotion(emotion: EmotionalState, key: EmotionKey, delta: number): EmotionalState {
  return { ...emotion, [key]: clamp(emotion[key] + delta) };
}

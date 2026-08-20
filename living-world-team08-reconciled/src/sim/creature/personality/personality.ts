import { DeterministicRng } from "../../core/rng/deterministicRng";
import { InvalidStateError } from "../../core/errors";

/**
 * PersonalityTraits — data-driven, persistent per-creature trait model
 * (Team 06 §12). Every trait is normalized to [0, 1].
 *
 * Traits are generated ONCE (at creature creation) from a deterministic RNG
 * draw and then persist for the creature's lifetime — they are never
 * re-rolled per tick. This is what lets two creatures of the same species
 * behave differently while staying individually consistent over time.
 */
export interface PersonalityTraits {
  readonly aggression: number;
  readonly caution: number;
  readonly curiosity: number;
  readonly sociability: number;
  readonly riskTolerance: number;
  readonly patience: number;
  readonly territoriality: number;
  readonly independence: number;
  readonly boldness: number;
}

export const PERSONALITY_TRAIT_KEYS = [
  "aggression",
  "caution",
  "curiosity",
  "sociability",
  "riskTolerance",
  "patience",
  "territoriality",
  "independence",
  "boldness",
] as const;

export type PersonalityTraitKey = (typeof PERSONALITY_TRAIT_KEYS)[number];

/**
 * Data-driven per-species allowed ranges for each trait (§29 — species
 * differences are data, not code). E.g. a species of scavenger might have
 * riskTolerance in [0.4, 0.9] while a species of prey animal has it in
 * [0.0, 0.3].
 */
export type PersonalityRangeProfile = Readonly<Record<PersonalityTraitKey, readonly [number, number]>>;

export const DEFAULT_PERSONALITY_RANGES: PersonalityRangeProfile = {
  aggression: [0, 1],
  caution: [0, 1],
  curiosity: [0, 1],
  sociability: [0, 1],
  riskTolerance: [0, 1],
  patience: [0, 1],
  territoriality: [0, 1],
  independence: [0, 1],
  boldness: [0, 1],
};

/**
 * Deterministically generates a persistent personality for a single
 * creature. Callers must supply an RNG stream scoped to that individual
 * creature (e.g. `rng.fork("creature/<creatureId>/personality")`) so that
 * personality generation never perturbs any other creature's RNG sequence
 * (§26 determinism, RNG stream isolation).
 */
export function generatePersonality(
  rng: DeterministicRng,
  ranges: PersonalityRangeProfile = DEFAULT_PERSONALITY_RANGES,
): PersonalityTraits {
  const traits = {} as Record<PersonalityTraitKey, number>;
  for (const key of PERSONALITY_TRAIT_KEYS) {
    const [min, max] = ranges[key];
    traits[key] = min + rng.nextFloat() * (max - min);
  }
  const personality = traits as PersonalityTraits;
  validatePersonalityTraits(personality);
  return personality;
}

export function validatePersonalityTraits(value: unknown): asserts value is PersonalityTraits {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("PersonalityTraits must be an object");
  }
  const traits = value as Partial<PersonalityTraits>;
  for (const key of PERSONALITY_TRAIT_KEYS) {
    const v = traits[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
      throw new InvalidStateError(`PersonalityTraits.${key} must be a finite number in [0, 1], got ${String(v)}`);
    }
  }
}

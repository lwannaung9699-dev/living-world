import { InvalidStateError } from "../../core/errors";

/**
 * Relationship — one creature's evolving perception of another individual
 * (Team 06 §17). Directional and asymmetric by design: A's relationship to
 * B is stored/evolved independently of B's relationship to A, since real
 * social perception is not always mutual.
 *
 * All scalar fields are normalized to [0, 1]. Relationships are NOT
 * predefined — they are created lazily on first interaction and evolve
 * from there.
 */
export interface Relationship {
  readonly sourceCreatureId: string;
  readonly targetCreatureId: string;
  readonly familiarity: number;
  readonly trust: number;
  readonly fear: number;
  readonly hostility: number;
  readonly affection: number;
  readonly dominance: number; // 0 = target dominant, 1 = source dominant, 0.5 = neutral/unknown
  readonly lastInteraction: number; // world tick
}

export function validateRelationship(value: unknown): asserts value is Relationship {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("Relationship must be an object");
  }
  const r = value as Partial<Relationship>;
  if (typeof r.sourceCreatureId !== "string" || r.sourceCreatureId.length === 0) {
    throw new InvalidStateError("Relationship.sourceCreatureId must be a non-empty string");
  }
  if (typeof r.targetCreatureId !== "string" || r.targetCreatureId.length === 0) {
    throw new InvalidStateError("Relationship.targetCreatureId must be a non-empty string");
  }
  for (const key of ["familiarity", "trust", "fear", "hostility", "affection", "dominance"] as const) {
    const v = r[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
      throw new InvalidStateError(`Relationship.${key} must be a finite number in [0, 1], got ${String(v)}`);
    }
  }
  if (!Number.isInteger(r.lastInteraction) || (r.lastInteraction as number) < 0) {
    throw new InvalidStateError("Relationship.lastInteraction must be a non-negative integer tick");
  }
}

export function createRelationship(
  sourceCreatureId: string,
  targetCreatureId: string,
  tick: number,
  overrides: Partial<Relationship> = {},
): Relationship {
  const relationship: Relationship = {
    sourceCreatureId,
    targetCreatureId,
    familiarity: 0,
    trust: 0.5,
    fear: 0,
    hostility: 0,
    affection: 0,
    dominance: 0.5,
    lastInteraction: tick,
    ...overrides,
  };
  validateRelationship(relationship);
  return relationship;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export type InteractionKind = "friendly" | "hostile" | "neutral" | "threat" | "mating" | "cooperative";

/**
 * Evolves a relationship based on an actual interaction (§17 — relationships
 * evolve from real interactions, never predefined). Pure function.
 */
export function applyInteraction(relationship: Relationship, kind: InteractionKind, tick: number): Relationship {
  const familiarity = clamp01(relationship.familiarity + 0.05);
  let { trust, fear, hostility, affection } = relationship;

  switch (kind) {
    case "friendly":
      trust = clamp01(trust + 0.05);
      affection = clamp01(affection + 0.08);
      hostility = clamp01(hostility - 0.05);
      break;
    case "cooperative":
      trust = clamp01(trust + 0.08);
      affection = clamp01(affection + 0.03);
      break;
    case "hostile":
      trust = clamp01(trust - 0.1);
      hostility = clamp01(hostility + 0.15);
      fear = clamp01(fear + 0.05);
      break;
    case "threat":
      fear = clamp01(fear + 0.2);
      hostility = clamp01(hostility + 0.1);
      trust = clamp01(trust - 0.15);
      break;
    case "mating":
      affection = clamp01(affection + 0.15);
      trust = clamp01(trust + 0.05);
      break;
    case "neutral":
    default:
      break;
  }

  return { ...relationship, familiarity, trust, fear, hostility, affection, lastInteraction: tick };
}

/** Familiarity/fear/hostility drift gently toward neutral when a relationship goes unreinforced. */
export function decayRelationship(relationship: Relationship, currentTick: number, rate = 0.001): Relationship {
  const elapsed = Math.max(0, currentTick - relationship.lastInteraction);
  if (elapsed === 0) return relationship;
  const decay = Math.min(1, rate * elapsed);
  return {
    ...relationship,
    fear: clamp01(relationship.fear * (1 - decay)),
    hostility: clamp01(relationship.hostility * (1 - decay)),
    familiarity: clamp01(relationship.familiarity * (1 - decay * 0.5)),
  };
}

import { InvalidStateError } from "../../core/errors";
import { NeedsState, createInitialNeeds, validateNeedsState } from "./needs";
import { EmotionalState, createInitialEmotionalState, validateEmotionalState } from "../emotional/emotionalState";
import { PersonalityTraits, validatePersonalityTraits } from "../personality/personality";
import { MemoryEntry, validateMemoryEntry } from "../memory/memory";
import { Relationship, validateRelationship } from "../relationships/relationship";
import { Goal } from "../goals/goals";
import { ActionProposal } from "../actions/actions";
import { Vector2 } from "../perception/perception";

/**
 * CreatureState — the reusable, species-agnostic individual state contract
 * (Team 06 §4). Nothing species-specific is hardcoded here; species
 * differences come entirely from data supplied via SpeciesDefinition
 * (see ../species/species.ts) and applied through the systems that operate
 * on this state.
 */
export interface CreatureState {
  readonly creatureId: string;
  readonly speciesId: string;
  readonly position: Vector2;
  readonly facingDegrees: number;
  readonly energy: number; // [0, 100]
  readonly health: number; // [0, 100]
  readonly age: number; // in ticks
  readonly fatigue: number; // [0, 100]
  readonly fear: number; // [0, 100] — quick-access mirror of emotional.fear, kept per §4's explicit field list
  readonly stress: number; // [0, 100]
  readonly needs: NeedsState; // hunger, thirst, sleep, safety, temperature, social, reproduction, curiosity
  readonly emotional: EmotionalState;
  readonly personality: PersonalityTraits;
  readonly memory: readonly MemoryEntry[];
  readonly relationships: Readonly<Record<string, Relationship>>;
  readonly currentGoal: Goal | null;
  readonly currentAction: ActionProposal | null;
}

export function validateCreatureState(value: unknown): asserts value is CreatureState {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("CreatureState must be an object");
  }
  const c = value as Partial<CreatureState>;
  if (typeof c.creatureId !== "string" || c.creatureId.length === 0) {
    throw new InvalidStateError("CreatureState.creatureId must be a non-empty string");
  }
  if (typeof c.speciesId !== "string" || c.speciesId.length === 0) {
    throw new InvalidStateError("CreatureState.speciesId must be a non-empty string");
  }
  if (typeof c.position !== "object" || c.position === null) {
    throw new InvalidStateError("CreatureState.position must be an object");
  }
  for (const key of ["energy", "health", "fatigue", "fear", "stress"] as const) {
    const v = c[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) {
      throw new InvalidStateError(`CreatureState.${key} must be a finite number in [0, 100], got ${String(v)}`);
    }
  }
  if (!Number.isFinite(c.age) || (c.age as number) < 0) {
    throw new InvalidStateError(`CreatureState.age must be a non-negative finite number, got ${String(c.age)}`);
  }
  validateNeedsState(c.needs);
  validateEmotionalState(c.emotional);
  validatePersonalityTraits(c.personality);
  if (!Array.isArray(c.memory)) {
    throw new InvalidStateError("CreatureState.memory must be an array");
  }
  for (const entry of c.memory) validateMemoryEntry(entry);
  if (typeof c.relationships !== "object" || c.relationships === null) {
    throw new InvalidStateError("CreatureState.relationships must be an object");
  }
  for (const rel of Object.values(c.relationships)) validateRelationship(rel);
}

export interface CreateCreatureStateInput {
  creatureId: string;
  speciesId: string;
  position: Vector2;
  facingDegrees?: number;
  personality: PersonalityTraits;
  energy?: number;
  health?: number;
  age?: number;
  needs?: Partial<NeedsState>;
}

export function createInitialCreatureState(input: CreateCreatureStateInput): CreatureState {
  const state: CreatureState = {
    creatureId: input.creatureId,
    speciesId: input.speciesId,
    position: input.position,
    facingDegrees: input.facingDegrees ?? 0,
    energy: input.energy ?? 100,
    health: input.health ?? 100,
    age: input.age ?? 0,
    fatigue: 0,
    fear: 0,
    stress: 0,
    needs: createInitialNeeds(input.needs),
    emotional: createInitialEmotionalState(),
    personality: input.personality,
    memory: [],
    relationships: {},
    currentGoal: null,
    currentAction: null,
  };
  validateCreatureState(state);
  return state;
}

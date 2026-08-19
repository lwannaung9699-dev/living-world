import { DeterministicRng } from "../../core/rng/deterministicRng";
import { RngStreamRegistry } from "../../core/rng/rngStreamRegistry";
import { WorldState } from "../../core/state/worldState";
import { SubsystemTickFn } from "../../core/simulation/simulation";
import { InvalidStateError } from "../../core/errors";

import { CreatureState, validateCreatureState } from "../state/creatureState";
import { tickNeeds, satisfyNeed, raiseNeed } from "../state/needs";
import { decayEmotionalState, adjustEmotion } from "../emotional/emotionalState";
import { decayMemories, recallMemory } from "../memory/memory";
import { decayRelationship } from "../relationships/relationship";
import { recordActivity, ActivityLogEntry } from "../state/dailyActivity";

import { PerceivableEntity, HeardEvent, perceive, Perception } from "../perception/perception";
import { generateCandidateActions, selectBestAction } from "../decision/utilityAI";
import { createMovementIntent, MovementIntent } from "../movement/movementIntent";
import { BiologyProvider } from "../integration/biologyAdapter";
import { EcologyProvider } from "../integration/ecologyAdapter";

/** Module key under WorldState.modules that Team 06 owns exclusively. */
export const CREATURE_MODULE_KEY = "creature";

export interface CreatureModuleState {
  readonly creatures: Readonly<Record<string, CreatureState>>;
  readonly activityLog: Readonly<Record<string, readonly ActivityLogEntry[]>>;
  readonly pendingMovementIntents: Readonly<Record<string, MovementIntent>>;
}

export function createInitialCreatureModuleState(): CreatureModuleState {
  return { creatures: {}, activityLog: {}, pendingMovementIntents: {} };
}

export function getCreatureModuleState(state: WorldState): CreatureModuleState {
  const mod = state.modules[CREATURE_MODULE_KEY];
  return (mod as CreatureModuleState | undefined) ?? createInitialCreatureModuleState();
}

export function withCreatureModuleState(state: WorldState, moduleState: CreatureModuleState): WorldState {
  return { ...state, modules: { ...state.modules, [CREATURE_MODULE_KEY]: moduleState } };
}

/**
 * EnvironmentQuery — the piece of information Team 06 needs from the world
 * around a creature that it does NOT own (terrain, weather, other
 * entities' positions — Team 02/03/05 territory). Supplied as a plain
 * function so the Foundation-level SubsystemTickFn stays pure/serializable
 * while still being pluggable against whatever the real environment
 * systems eventually look like.
 */
export interface EnvironmentQuery {
  getNearbyEntities(creature: CreatureState, tick: number): readonly PerceivableEntity[];
  getAmbientEvents(creature: CreatureState, tick: number): readonly HeardEvent[];
  getRegionId(creature: CreatureState): string;
  getEnvironmentalConditions(creature: CreatureState): Readonly<Record<string, unknown>>;
}

export class StaticEnvironmentQuery implements EnvironmentQuery {
  getNearbyEntities(): readonly PerceivableEntity[] {
    return [];
  }
  getAmbientEvents(): readonly HeardEvent[] {
    return [];
  }
  getRegionId(): string {
    return "default";
  }
  getEnvironmentalConditions(): Readonly<Record<string, unknown>> {
    return {};
  }
}

export interface SingleCreatureTickResult {
  readonly nextState: CreatureState;
  readonly perception: Perception;
  readonly movementIntent: MovementIntent | null;
  readonly activityEntry: ActivityLogEntry | null;
}

/**
 * Runs the full pipeline for ONE creature, for one tick:
 *
 *   perception -> needs/emotion/memory upkeep -> drives -> candidate goals
 *   -> utility evaluation -> decision -> action proposal -> movement intent
 *
 * Pure given its inputs (including the creature's own isolated RNG
 * stream), so this is independently unit-testable without any WorldState
 * plumbing (§32 tests rely heavily on this).
 */
export function tickCreature(
  creature: CreatureState,
  tick: number,
  rng: DeterministicRng,
  species: BiologyProvider,
  ecology: EcologyProvider,
  environment: EnvironmentQuery,
): SingleCreatureTickResult {
  validateCreatureState(creature);

  const speciesDef = species.getSpeciesDefinition(creature.speciesId);

  // 1. Perceive.
  const entitiesNearby = environment.getNearbyEntities(creature, tick);
  const ambientEvents = environment.getAmbientEvents(creature, tick);
  const perception = perceive({
    observerId: creature.creatureId,
    observerPosition: creature.position,
    facingDegrees: creature.facingDegrees,
    tick,
    sensory: speciesDef.sensory,
    entitiesNearby,
    ambientEvents,
    environmentalConditions: environment.getEnvironmentalConditions(creature),
  });

  // 2. Needs upkeep.
  let needs = tickNeeds(creature.needs, speciesDef.needsGrowth);

  // 3. Emotional upkeep: decay toward baseline, then react to newly perceived threats.
  let emotional = decayEmotionalState(creature.emotional);
  let fear = creature.fear;
  let stress = creature.stress;
  if (perception.threats.length > 0) {
    emotional = adjustEmotion(emotional, "fear", 15 * perception.threats.length);
    fear = Math.min(100, fear + 15 * perception.threats.length);
    stress = Math.min(100, stress + 5 * perception.threats.length);
    needs = raiseNeed(needs, "safety", 10 * perception.threats.length);
  } else {
    fear = Math.max(0, fear - 4);
    stress = Math.max(0, stress - 2);
  }

  // 4. Memory upkeep: decay, and reinforce memories about anything currently perceived.
  let memory = decayMemories(creature.memory);
  const perceivedIds = new Set(perception.visibleEntities.map((e) => e.id));
  memory = memory.map((m) => (perceivedIds.has(m.subject) ? recallMemory(m, tick) : m));

  // 5. Relationship upkeep: gentle decay for anything not currently interacted with.
  const relationships = Object.fromEntries(
    Object.entries(creature.relationships).map(([id, rel]) => [id, decayRelationship(rel, tick)]),
  );

  const preDecision: CreatureState = {
    ...creature,
    needs,
    emotional,
    fear,
    stress,
    memory,
    relationships,
    age: creature.age + 1,
  };

  // 6. Candidate generation + utility scoring + decision (§8, §11).
  const regionId = environment.getRegionId(creature);
  const candidates = generateCandidateActions(preDecision, perception, ecology, regionId);
  const decision = selectBestAction(preDecision, candidates, tick, rng);

  let nextState = preDecision;
  let movementIntent: MovementIntent | null = null;
  let activityEntry: ActivityLogEntry | null = null;

  if (decision) {
    nextState = { ...nextState, currentGoal: decision.goal, currentAction: decision.proposal };
    activityEntry = { tick, goalId: decision.goal.goalId, actionId: decision.proposal.actionId };

    if (decision.proposal.targetPosition) {
      movementIntent = createMovementIntent({
        creatureId: creature.creatureId,
        destination: decision.proposal.targetPosition,
        urgency: Math.min(1, Math.max(0, decision.breakdown.total)),
        reason: movementReasonForGoal(decision.goal.goalId),
        desiredSpeed: speciesDef.baseSpeed,
        avoidancePreference: perception.threats.length > 0 ? "avoidThreats" : "none",
      });
    }

    // Immediate, deterministic same-tick consequences Team 06 IS responsible for
    // (internal state only — no world-resource mutation, per §25).
    if (decision.proposal.actionId === "sleep" || decision.proposal.actionId === "rest") {
      nextState = { ...nextState, fatigue: Math.max(0, nextState.fatigue - 8) };
    }
  }

  validateCreatureState(nextState);
  return { nextState, perception, movementIntent, activityEntry };
}

function movementReasonForGoal(goalId: string): MovementIntent["reason"] {
  switch (goalId) {
    case "eat":
      return "seekFood";
    case "drink":
      return "seekWater";
    case "escape":
      return "flee";
    case "explore":
    case "investigate":
      return "explore";
    case "socialize":
    case "reproduce":
      return "socialize";
    default:
      return "explore";
  }
}

/**
 * Builds the Foundation-compatible SubsystemTickFn (Team 01 §35 extension
 * point) that advances every registered creature by one tick and writes
 * the results back into `state.modules.creature`. RNG isolation is
 * guaranteed by forking a per-creature namespace
 * (`creature/<creatureId>/decision`) from the shared registry — one
 * creature's decisions can never perturb another's RNG sequence (§26).
 */
export function createCreatureSubsystemTick(
  species: BiologyProvider,
  ecology: EcologyProvider,
  environment: EnvironmentQuery = new StaticEnvironmentQuery(),
): SubsystemTickFn {
  return (state: WorldState, rng: RngStreamRegistry): WorldState => {
    const moduleState = getCreatureModuleState(state);
    const nextCreatures: Record<string, CreatureState> = {};
    const nextActivityLog: Record<string, readonly ActivityLogEntry[]> = { ...moduleState.activityLog };
    const nextMovementIntents: Record<string, MovementIntent> = {};

    for (const [creatureId, creature] of Object.entries(moduleState.creatures)) {
      const creatureRng = rng.fork(`creature/${creatureId}/decision`);
      const result = tickCreature(creature, state.tick, creatureRng, species, ecology, environment);
      nextCreatures[creatureId] = result.nextState;
      if (result.activityEntry) {
        nextActivityLog[creatureId] = recordActivity(nextActivityLog[creatureId] ?? [], result.activityEntry);
      }
      if (result.movementIntent) {
        nextMovementIntents[creatureId] = result.movementIntent;
      }
    }

    return withCreatureModuleState(state, {
      creatures: nextCreatures,
      activityLog: nextActivityLog,
      pendingMovementIntents: nextMovementIntents,
    });
  };
}

/** Registers/replaces a single creature in the module state — used by callers spawning new creatures. */
export function upsertCreature(state: WorldState, creature: CreatureState): WorldState {
  validateCreatureState(creature);
  const moduleState = getCreatureModuleState(state);
  if (moduleState.creatures[creature.creatureId] && moduleState.creatures[creature.creatureId] !== creature) {
    // Allowed — this is how a creature is normally updated. No-op guard kept for clarity/documentation only.
  }
  return withCreatureModuleState(state, {
    ...moduleState,
    creatures: { ...moduleState.creatures, [creature.creatureId]: creature },
  });
}

export function removeCreature(state: WorldState, creatureId: string): WorldState {
  const moduleState = getCreatureModuleState(state);
  if (!(creatureId in moduleState.creatures)) {
    throw new InvalidStateError(`removeCreature: no creature registered with id "${creatureId}"`);
  }
  const { [creatureId]: _removed, ...creatures } = moduleState.creatures;
  const { [creatureId]: _removedLog, ...activityLog } = moduleState.activityLog;
  return withCreatureModuleState(state, { ...moduleState, creatures, activityLog });
}

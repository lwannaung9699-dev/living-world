import { MutationRecord } from "../genetics/mutation";
import { SpeciationCandidate } from "../population/speciation";

/**
 * Serializable biological events. These are plain data (no class
 * instances, no functions) so they can be embedded in WorldState.modules
 * and later consumed by a future History system without Team 04 depending
 * on it.
 */
export interface BirthEvent {
  readonly type: "birth";
  readonly tick: number;
  readonly entityId: string;
  readonly speciesId: string;
  readonly parentIds: readonly string[];
}

export interface DeathEvent {
  readonly type: "death";
  readonly tick: number;
  readonly entityId: string;
  readonly speciesId: string;
  readonly cause: "old-age" | "starvation" | "poor-health" | "selection";
}

export interface MutationEvent {
  readonly type: "mutation";
  readonly tick: number;
  readonly entityId: string;
  readonly genomeId: string;
  readonly mutations: readonly MutationRecord[];
}

export interface ReproductionEvent {
  readonly type: "reproduction";
  readonly tick: number;
  readonly speciesId: string;
  readonly parentIds: readonly string[];
  readonly offspringEntityId: string;
}

export interface SpeciationCandidateEvent {
  readonly type: "speciation-candidate";
  readonly tick: number;
  readonly candidate: SpeciationCandidate;
}

export interface ExtinctionEvent {
  readonly type: "extinction";
  readonly tick: number;
  readonly speciesId: string;
  readonly finalPopulationSize: number;
}

export interface AdaptationEvent {
  readonly type: "adaptation";
  readonly tick: number;
  readonly speciesId: string;
  readonly generation: number;
  readonly meanFitness: number;
}

export type BiologicalEvent =
  | BirthEvent
  | DeathEvent
  | MutationEvent
  | ReproductionEvent
  | SpeciationCandidateEvent
  | ExtinctionEvent
  | AdaptationEvent;

export function birthEvent(tick: number, entityId: string, speciesId: string, parentIds: readonly string[]): BirthEvent {
  return { type: "birth", tick, entityId, speciesId, parentIds };
}

export function deathEvent(
  tick: number,
  entityId: string,
  speciesId: string,
  cause: DeathEvent["cause"],
): DeathEvent {
  return { type: "death", tick, entityId, speciesId, cause };
}

export function mutationEvent(
  tick: number,
  entityId: string,
  genomeId: string,
  mutations: readonly MutationRecord[],
): MutationEvent {
  return { type: "mutation", tick, entityId, genomeId, mutations };
}

export function reproductionEvent(
  tick: number,
  speciesId: string,
  parentIds: readonly string[],
  offspringEntityId: string,
): ReproductionEvent {
  return { type: "reproduction", tick, speciesId, parentIds, offspringEntityId };
}

export function speciationCandidateEvent(tick: number, candidate: SpeciationCandidate): SpeciationCandidateEvent {
  return { type: "speciation-candidate", tick, candidate };
}

export function extinctionEvent(tick: number, speciesId: string, finalPopulationSize: number): ExtinctionEvent {
  return { type: "extinction", tick, speciesId, finalPopulationSize };
}

export function adaptationEvent(
  tick: number,
  speciesId: string,
  generation: number,
  meanFitness: number,
): AdaptationEvent {
  return { type: "adaptation", tick, speciesId, generation, meanFitness };
}

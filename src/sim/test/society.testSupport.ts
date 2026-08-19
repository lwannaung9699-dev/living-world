import { createWorldSeed, createInitialWorldState, WorldState } from "../index";
import { IndividualSnapshot, KinshipFact, LocationResourceSnapshot } from "../society/contracts";

export interface TestIndividualInput {
  readonly id: string;
  readonly locationId: string;
  readonly alive?: boolean;
  readonly sociability?: number;
  readonly aggression?: number;
  readonly ambition?: number;
  readonly empathy?: number;
}

export function makeIndividual(input: TestIndividualInput): IndividualSnapshot {
  return {
    id: input.id,
    alive: input.alive ?? true,
    locationId: input.locationId,
    traits: {
      sociability: input.sociability ?? 0.5,
      aggression: input.aggression ?? 0.5,
      ambition: input.ambition ?? 0.5,
      empathy: input.empathy ?? 0.5,
    },
  };
}

/** Builds a WorldState with npc/biology/ecology test data pre-populated in the shape the default adapters expect. */
export function buildTestWorldState(options: {
  seed: string;
  individuals?: readonly IndividualSnapshot[];
  kinshipFacts?: readonly KinshipFact[];
  locationResources?: readonly LocationResourceSnapshot[];
  tick?: number;
}): WorldState {
  const seed = createWorldSeed({ seed: options.seed });
  let state = createInitialWorldState(seed);
  state = {
    ...state,
    tick: options.tick ?? 0,
    modules: {
      ...state.modules,
      npc: { individuals: options.individuals ?? [] },
      biology: { kinshipFacts: options.kinshipFacts ?? [] },
      ecology: { locationResources: options.locationResources ?? [] },
    },
  };
  return state;
}

export function withIndividuals(state: WorldState, individuals: readonly IndividualSnapshot[]): WorldState {
  return { ...state, modules: { ...state.modules, npc: { individuals } } };
}

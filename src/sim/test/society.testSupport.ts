import { createWorldSeed, createInitialWorldState, WorldState } from "../index";
import { BiologyAdapter, EcologyAdapter, IndividualSnapshot, KinshipFact, LocationResourceSnapshot } from "../society/contracts";

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

/**
 * Test-only adapters that read the placeholder `state.modules.npc/biology
 * /ecology` shape `buildTestWorldState`/`withIndividuals` populate above.
 *
 * The *real* `defaultBiologyAdapter`/`defaultEcologyAdapter`/
 * `defaultNpcAdapter` (society/contracts.ts) read Team 04/05/06's actual
 * module shapes (`state.modules.biology.entities`,
 * `state.modules.ecology.resources`, `state.modules.creature.creatures`)
 * — see that file's header for why. Society's own unit tests here care
 * about society's internal logic given arbitrary KinshipFact/
 * LocationResourceSnapshot/IndividualSnapshot inputs, not about
 * re-verifying the cross-team translation (that has its own dedicated
 * coverage in society.determinism_integration.test.ts), so they inject
 * these lightweight test adapters directly instead of trying to fake a
 * realistic Team 04/05/06 module shape.
 */
export const testBiologyAdapter: BiologyAdapter = {
  listKinshipFacts(state: WorldState): readonly KinshipFact[] {
    const bioModule = state.modules["biology"] as { kinshipFacts?: readonly KinshipFact[] } | undefined;
    return bioModule?.kinshipFacts ?? [];
  },
};

export const testEcologyAdapter: EcologyAdapter = {
  listLocationResources(state: WorldState): readonly LocationResourceSnapshot[] {
    const ecoModule = state.modules["ecology"] as { locationResources?: readonly LocationResourceSnapshot[] } | undefined;
    return ecoModule?.locationResources ?? [];
  },
};

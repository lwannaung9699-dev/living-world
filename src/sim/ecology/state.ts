import { InvalidStateError } from "../core/errors";
import { PopulationData, validatePopulation } from "./population";
import { EcologicalResource, validateResource } from "./resources";
import { EcologicalNiche, validateNiche } from "./niche";
import { EcologicalInteraction, validateInteraction } from "./interactions";
import { FoodWeb, validateFoodWeb } from "./foodWeb";
import { DiseaseState, validateDiseaseState } from "./disease";
import { EcologicalDisturbance, validateDisturbance } from "./disturbance";
import { MigrationProposal } from "./migration";
import { EcologicalEvent } from "./events";
import { EcosystemMetrics } from "./metrics";
import { SelectionFeedbackSignal } from "./selectionFeedback";

export const ECOLOGY_MODULE_KEY = "ecology";
export const ECOLOGY_STATE_CONTRACT_VERSION = "1.0.0";

/**
 * EcologyModuleState — everything Team 05 owns, stored entirely under
 * WorldState.modules.ecology (never touching Foundation's own fields, per
 * the module-attachment contract in core/state/worldState.ts). Plain-JSON
 * serializable: records keyed by id instead of Map/Set, arrays instead of
 * any other collection type.
 */
export interface EcologyModuleState {
  readonly contractVersion: string;
  readonly populations: Readonly<Record<string, PopulationData>>;
  readonly resources: Readonly<Record<string, EcologicalResource>>;
  /** Niches keyed by speciesId (one niche definition per species, shared by every population of that species). */
  readonly niches: Readonly<Record<string, EcologicalNiche>>;
  readonly interactions: Readonly<Record<string, EcologicalInteraction>>;
  readonly foodWeb: FoodWeb;
  readonly diseases: Readonly<Record<string, DiseaseState>>;
  readonly disturbances: Readonly<Record<string, EcologicalDisturbance>>;
  /** Recomputed wholesale on the migration cadence tick (a slow process, see subsystem.ts time-scale gating) and otherwise carried over unchanged -- never accumulated across ticks. */
  readonly migrationProposals: readonly MigrationProposal[];
  /**
   * Events emitted on the most recently processed tick only. Team 05 never
   * discards event information across ticks in the sense of hiding it, but
   * it also does not accumulate an unbounded in-state log; a future
   * History system (Team 06+) is expected to read `events` every tick and
   * persist whatever subset it needs (see docs/team-05-handoff notes).
   */
  readonly events: readonly EcologicalEvent[];
  readonly metrics: EcosystemMetrics;
  /** This tick's selection-pressure feedback signals, one per non-extinct population -- Team 05's output contract for Team 04 (see selectionFeedback.ts). Recomputed fresh every tick, never accumulated. */
  readonly selectionFeedback: readonly SelectionFeedbackSignal[];
}

const EMPTY_METRICS: EcosystemMetrics = {
  speciesDiversity: 0,
  populationDiversity: 0,
  resourceStability: 1,
  foodWebConnectivity: 0,
  predatorPreyBalance: 0,
  totalBiomass: 0,
  ecosystemPressure: 0,
};

export function createInitialEcologyState(input?: {
  populations?: readonly PopulationData[];
  resources?: readonly EcologicalResource[];
  niches?: readonly EcologicalNiche[];
  interactions?: readonly EcologicalInteraction[];
  disturbances?: readonly EcologicalDisturbance[];
}): EcologyModuleState {
  const populations: Record<string, PopulationData> = {};
  for (const p of input?.populations ?? []) populations[p.populationId] = p;

  const resources: Record<string, EcologicalResource> = {};
  for (const r of input?.resources ?? []) resources[r.resourceId] = r;

  const niches: Record<string, EcologicalNiche> = {};
  for (const n of input?.niches ?? []) niches[n.speciesId] = n;

  const interactions: Record<string, EcologicalInteraction> = {};
  for (const i of input?.interactions ?? []) interactions[i.interactionId] = i;

  const disturbances: Record<string, EcologicalDisturbance> = {};
  for (const d of input?.disturbances ?? []) disturbances[d.disturbanceId] = d;

  const state: EcologyModuleState = {
    contractVersion: ECOLOGY_STATE_CONTRACT_VERSION,
    populations,
    resources,
    niches,
    interactions,
    foodWeb: { nodes: [], edges: [] },
    diseases: {},
    disturbances,
    migrationProposals: [],
    events: [],
    metrics: EMPTY_METRICS,
    selectionFeedback: [],
  };
  validateEcologyState(state);
  return state;
}

export function validateEcologyState(value: unknown): asserts value is EcologyModuleState {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("EcologyModuleState must be an object");
  }
  const state = value as Partial<EcologyModuleState>;
  if (typeof state.contractVersion !== "string" || state.contractVersion.length === 0) {
    throw new InvalidStateError("EcologyModuleState.contractVersion must be a non-empty string");
  }
  if (typeof state.populations !== "object" || state.populations === null) {
    throw new InvalidStateError("EcologyModuleState.populations must be an object");
  }
  for (const p of Object.values(state.populations)) validatePopulation(p);

  if (typeof state.resources !== "object" || state.resources === null) {
    throw new InvalidStateError("EcologyModuleState.resources must be an object");
  }
  for (const r of Object.values(state.resources)) validateResource(r);

  if (typeof state.niches !== "object" || state.niches === null) {
    throw new InvalidStateError("EcologyModuleState.niches must be an object");
  }
  for (const n of Object.values(state.niches)) validateNiche(n);

  if (typeof state.interactions !== "object" || state.interactions === null) {
    throw new InvalidStateError("EcologyModuleState.interactions must be an object");
  }
  for (const i of Object.values(state.interactions)) validateInteraction(i);

  validateFoodWeb(state.foodWeb);

  if (typeof state.diseases !== "object" || state.diseases === null) {
    throw new InvalidStateError("EcologyModuleState.diseases must be an object");
  }
  for (const d of Object.values(state.diseases)) validateDiseaseState(d);

  if (typeof state.disturbances !== "object" || state.disturbances === null) {
    throw new InvalidStateError("EcologyModuleState.disturbances must be an object");
  }
  for (const d of Object.values(state.disturbances)) validateDisturbance(d);

  if (!Array.isArray(state.migrationProposals)) {
    throw new InvalidStateError("EcologyModuleState.migrationProposals must be an array");
  }
  if (!Array.isArray(state.events)) {
    throw new InvalidStateError("EcologyModuleState.events must be an array");
  }
  if (typeof state.metrics !== "object" || state.metrics === null) {
    throw new InvalidStateError("EcologyModuleState.metrics must be an object");
  }
  if (!Array.isArray(state.selectionFeedback)) {
    throw new InvalidStateError("EcologyModuleState.selectionFeedback must be an array");
  }
}

/** Reads the ecology module state from a generic WorldState.modules bag, creating a fresh one if absent. */
export function readEcologyState(modules: Readonly<Record<string, unknown>>): EcologyModuleState {
  const existing = modules[ECOLOGY_MODULE_KEY];
  if (existing === undefined) return createInitialEcologyState();
  validateEcologyState(existing);
  return existing;
}

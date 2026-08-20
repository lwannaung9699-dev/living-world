import type { WorldState } from "../core/state/worldState";
import { InvalidStateError } from "../core/errors";
import {
  createEmptyPoliticsState,
  POLITICS_CONTRACT_VERSION,
  type PoliticalHistoryEvent,
  type PoliticalHistoryEventType,
  type PoliticsModuleState,
} from "./contracts";

export const POLITICS_MODULE_KEY = "politics";

/** Reads the current PoliticsModuleState from WorldState, initializing an empty one if absent. */
export function readPoliticsState(state: WorldState): PoliticsModuleState {
  const raw = state.modules[POLITICS_MODULE_KEY];
  if (raw === undefined) return createEmptyPoliticsState();
  validatePoliticsState(raw);
  return raw;
}

/** Returns a new WorldState with the given PoliticsModuleState attached. Never mutates the input. */
export function writePoliticsState(state: WorldState, politics: PoliticsModuleState): WorldState {
  return { ...state, modules: { ...state.modules, [POLITICS_MODULE_KEY]: politics } };
}

export function validatePoliticsState(value: unknown): asserts value is PoliticsModuleState {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("PoliticsModuleState must be an object");
  }
  const politics = value as Partial<PoliticsModuleState>;
  if (typeof politics.contractVersion !== "string" || politics.contractVersion.length === 0) {
    throw new InvalidStateError("PoliticsModuleState.contractVersion must be a non-empty string");
  }
  if (!Array.isArray(politics.history)) {
    throw new InvalidStateError("PoliticsModuleState.history must be an array");
  }
  const requiredRecordKeys: (keyof PoliticsModuleState)[] = [
    "rules",
    "customTrackers",
    "authorities",
    "legitimacies",
    "governanceSystems",
    "elections",
    "councils",
    "successions",
    "propertyRights",
    "landClaims",
    "taxPolicies",
    "publicResources",
    "disputes",
    "justiceCases",
    "rights",
    "obligations",
    "factions",
    "conflicts",
    "diplomaticRelations",
    "treaties",
    "territories",
    "polities",
    "stability",
    "idCounters",
  ];
  for (const key of requiredRecordKeys) {
    const v = politics[key];
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      throw new InvalidStateError(`PoliticsModuleState.${key} must be a plain record object`);
    }
  }
}

/**
 * Deterministically mints a new id for the given entity kind, using a
 * monotonic counter stored in PoliticsModuleState.idCounters rather than a
 * random draw — so ids are stable and independent of RNG stream call order
 * (see brief §36, execution-order independence).
 */
export function mintId(politics: PoliticsModuleState, kind: string): { id: string; idCounters: Record<string, number> } {
  const next = (politics.idCounters[kind] ?? 0) + 1;
  const id = `${kind}-${next}`;
  return { id, idCounters: { ...politics.idCounters, [kind]: next } };
}

/** Appends a single append-only PoliticalHistoryEvent. Never mutates or reorders existing history. */
export function appendHistory(
  politics: PoliticsModuleState,
  entry: { type: PoliticalHistoryEventType; tick: number; scope: string; summary: string; refs?: Record<string, string> },
): PoliticsModuleState {
  const { id: eventId, idCounters } = mintId(politics, "history-event");
  const event: PoliticalHistoryEvent = {
    eventId,
    type: entry.type,
    tick: entry.tick,
    scope: entry.scope,
    summary: entry.summary,
    refs: entry.refs ?? {},
  };
  return { ...politics, idCounters, history: [...politics.history, event] };
}

export function ensureContractVersion(politics: PoliticsModuleState): PoliticsModuleState {
  if (politics.contractVersion === POLITICS_CONTRACT_VERSION) return politics;
  return { ...politics, contractVersion: POLITICS_CONTRACT_VERSION };
}

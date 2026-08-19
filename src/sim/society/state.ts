import { WorldState } from "../core/state/worldState";
import { InvalidStateError } from "../core/errors";
import {
  SocialGroup,
  Relationship,
  Settlement,
  SocialNorm,
  SanctionRecord,
  Institution,
  CollectiveMemoryEvent,
  Story,
  CulturalSymbol,
  LanguageConcept,
  Technology,
  TradeRecord,
  MigrationRecord,
} from "./types";

export const SOCIETY_MODULE_KEY = "society";
export const SOCIETY_CONTRACT_VERSION = "1.0.0";

/**
 * SocietyState — Team 07's entire domain state, attached at
 * `WorldState.modules.society`. Plain-JSON-serializable, same discipline as
 * Foundation's WorldState: no class instances, no Map/Set/Date.
 *
 * Records are keyed by entity id for O(1) lookup; every subsystem that
 * iterates a record does so over `Object.keys(record).sort()` so that
 * iteration order never depends on insertion order (which is not
 * guaranteed to be deterministic across engines) — see determinism notes
 * in tick.ts.
 */
export interface SocietyState {
  readonly contractVersion: string;
  readonly nextIdCounter: number;

  readonly groups: Readonly<Record<string, SocialGroup>>;
  readonly relationships: Readonly<Record<string, Relationship>>;
  readonly settlements: Readonly<Record<string, Settlement>>;
  readonly norms: Readonly<Record<string, SocialNorm>>;
  readonly sanctions: Readonly<Record<string, SanctionRecord>>;
  readonly institutions: Readonly<Record<string, Institution>>;
  readonly collectiveMemories: Readonly<Record<string, CollectiveMemoryEvent>>;
  readonly stories: Readonly<Record<string, Story>>;
  readonly symbols: Readonly<Record<string, CulturalSymbol>>;
  readonly concepts: Readonly<Record<string, LanguageConcept>>;
  readonly technologies: Readonly<Record<string, Technology>>;
  readonly trades: Readonly<Record<string, TradeRecord>>;
  readonly migrations: Readonly<Record<string, MigrationRecord>>;

  readonly individualRoles: Readonly<Record<string, string>>;
  readonly individualGroups: Readonly<Record<string, string>>;
  /** locationId -> cumulative individual-ticks spent there (settlement formation input). */
  readonly locationPresence: Readonly<Record<string, number>>;
  /** behavior key ("groupId::behavior") -> repetition count (norm formation input). */
  readonly behaviorCounts: Readonly<Record<string, number>>;
}

export function createInitialSocietyState(): SocietyState {
  return {
    contractVersion: SOCIETY_CONTRACT_VERSION,
    nextIdCounter: 0,
    groups: {},
    relationships: {},
    settlements: {},
    norms: {},
    sanctions: {},
    institutions: {},
    collectiveMemories: {},
    stories: {},
    symbols: {},
    concepts: {},
    technologies: {},
    trades: {},
    migrations: {},
    individualRoles: {},
    individualGroups: {},
    locationPresence: {},
    behaviorCounts: {},
  };
}

export function validateSocietyState(value: unknown): asserts value is SocietyState {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("SocietyState must be an object");
  }
  const s = value as Partial<SocietyState>;
  if (typeof s.contractVersion !== "string" || s.contractVersion.length === 0) {
    throw new InvalidStateError("SocietyState.contractVersion must be a non-empty string");
  }
  if (!Number.isInteger(s.nextIdCounter) || (s.nextIdCounter as number) < 0) {
    throw new InvalidStateError("SocietyState.nextIdCounter must be a non-negative integer");
  }
  const recordFields: (keyof SocietyState)[] = [
    "groups",
    "relationships",
    "settlements",
    "norms",
    "sanctions",
    "institutions",
    "collectiveMemories",
    "stories",
    "symbols",
    "concepts",
    "technologies",
    "trades",
    "migrations",
    "individualRoles",
    "individualGroups",
    "locationPresence",
    "behaviorCounts",
  ];
  for (const field of recordFields) {
    if (typeof s[field] !== "object" || s[field] === null) {
      throw new InvalidStateError(`SocietyState.${field} must be an object`);
    }
  }
}

/** Reads the SocietyState from a WorldState, initializing it if this world has never ticked through Team 07 before. */
export function readSocietyState(state: WorldState): SocietyState {
  const raw = state.modules[SOCIETY_MODULE_KEY];
  if (raw === undefined) {
    return createInitialSocietyState();
  }
  validateSocietyState(raw);
  return raw;
}

/** Returns a new WorldState with the given SocietyState attached at modules.society. */
export function writeSocietyState(state: WorldState, society: SocietyState): WorldState {
  validateSocietyState(society);
  return {
    ...state,
    modules: {
      ...state.modules,
      [SOCIETY_MODULE_KEY]: society,
    },
  };
}

/** Deterministic sorted-key iteration helper, used throughout society subsystems. */
export function sortedEntries<V>(record: Readonly<Record<string, V>>): [string, V][] {
  return Object.keys(record)
    .sort()
    .map((key) => [key, record[key]] as [string, V]);
}

export function sortedKeys(record: Readonly<Record<string, unknown>>): string[] {
  return Object.keys(record).sort();
}

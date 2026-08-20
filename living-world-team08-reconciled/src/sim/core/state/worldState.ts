import { WorldSeed, validateWorldSeed } from "../seed/worldSeed";
import { RngRegistryState } from "../rng/rngStreamRegistry";
import { SimulationTime, createInitialSimulationTime, validateSimulationTime } from "../time/simulationClock";
import { InvalidStateError } from "../errors";

/** Contract version for the WorldState shape itself (Foundation-owned). */
export const WORLD_STATE_CONTRACT_VERSION = "1.0.0";

/**
 * WorldState — the single canonical, serializable snapshot of the entire
 * world at a given tick.
 *
 * Foundation (Team 01) intentionally models ONLY what is required to
 * initialize and advance the world deterministically. It must remain
 * plain-JSON-serializable (no class instances, no Map/Set, no Date objects)
 * so it can be saved/loaded/replicated without PostgreSQL, without Next.js,
 * and without any particular game client.
 *
 * Extensibility contract for later teams:
 * Team 02+ (Geography, Biology, NPC, Society, ...) must NOT modify this
 * interface. Instead, they attach their own domain state under a unique key
 * inside `modules` (e.g. `modules.geography`, `modules.biology`,
 * `modules.npc`), and read/write it from their own SubsystemTickFn (see
 * core/simulation/simulation.ts). This keeps the Foundation stable while
 * allowing unlimited future growth.
 */
export interface WorldState {
  readonly contractVersion: string;
  readonly seed: WorldSeed;
  readonly tick: number;
  readonly simulationTime: SimulationTime;
  readonly rng: RngRegistryState;
  readonly modules: Readonly<Record<string, unknown>>;
}

/** Builds the tick-zero WorldState for a given WorldSeed. */
export function createInitialWorldState(seed: WorldSeed): WorldState {
  validateWorldSeed(seed);
  const state: WorldState = {
    contractVersion: WORLD_STATE_CONTRACT_VERSION,
    seed,
    tick: 0,
    simulationTime: createInitialSimulationTime(),
    rng: {},
    modules: {},
  };
  validateWorldState(state);
  return state;
}

export function validateWorldState(value: unknown): asserts value is WorldState {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("WorldState must be an object");
  }
  const state = value as Partial<WorldState>;

  if (typeof state.contractVersion !== "string" || state.contractVersion.length === 0) {
    throw new InvalidStateError("WorldState.contractVersion must be a non-empty string");
  }
  validateWorldSeed(state.seed);
  if (!Number.isInteger(state.tick) || (state.tick as number) < 0) {
    throw new InvalidStateError(`WorldState.tick must be a non-negative integer, got ${String(state.tick)}`);
  }
  validateSimulationTime(state.simulationTime);
  if (typeof state.rng !== "object" || state.rng === null) {
    throw new InvalidStateError("WorldState.rng must be an object");
  }
  if (typeof state.modules !== "object" || state.modules === null) {
    throw new InvalidStateError("WorldState.modules must be an object");
  }
}

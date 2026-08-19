import { WorldSeed } from "../seed/worldSeed";
import { createInitialWorldState, WorldState } from "../state/worldState";
import { SimulationContext, tickN } from "../simulation/simulation";
import { computeStateHash } from "../serialization/stateHash";

export interface ReplayResult {
  readonly state: WorldState;
  readonly hash: string;
}

/**
 * Runs a full deterministic simulation from tick 0 to `ticks`, starting
 * from a fresh initial state built from `seed`, and returns both the final
 * state and its canonical replay hash.
 *
 * This is the foundation for:
 *   - deterministic replay regression tests (see sim/test/replay.test.ts)
 *   - headless/offline simulation (no database, no client, no rendering)
 *   - future network snapshot verification (two peers running the same
 *     seed must converge on the same hash)
 */
export function runSimulation(seed: WorldSeed, ticks: number, context: SimulationContext = {}): ReplayResult {
  const initial = createInitialWorldState(seed);
  const state = tickN(initial, ticks, context);
  return { state, hash: computeStateHash(state) };
}

/** True if two replay runs produced an identical canonical state hash. */
export function replayMatches(a: ReplayResult, b: ReplayResult): boolean {
  return a.hash === b.hash;
}

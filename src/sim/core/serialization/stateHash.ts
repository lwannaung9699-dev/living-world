import { WorldState } from "../state/worldState";
import { canonicalStringify } from "./canonicalJson";
import { hash128Hex } from "../hash";

/**
 * Produces a "replay view" of a WorldState: structurally identical except
 * that purely descriptive / non-deterministic metadata is stripped out.
 *
 * Currently strips `seed.createdAt` — a wall-clock record-keeping
 * timestamp that must never influence, or be influenced by, the
 * deterministic simulation outcome. Two WorldSeeds with the same `seed`,
 * `simulationVersion`, `rulesVersion`, and `initialStateVersion` but
 * different `createdAt` values MUST replay to identical hashes.
 */
export function toReplayView(state: WorldState): unknown {
  const { seed, ...rest } = state;
  const { createdAt: _createdAt, ...seedForReplay } = seed;
  return { ...rest, seed: seedForReplay };
}

/**
 * Deterministic canonical fingerprint of a WorldState, suitable for replay
 * regression tests: `run(seed, N ticks)` executed twice must yield the same
 * hash; different seeds or different tick counts should normally diverge.
 */
export function computeStateHash(state: WorldState): string {
  return hash128Hex(canonicalStringify(toReplayView(state)));
}

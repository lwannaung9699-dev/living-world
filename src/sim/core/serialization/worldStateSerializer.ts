import { WorldState, validateWorldState } from "../state/worldState";
import { canonicalStringify, canonicalParse } from "./canonicalJson";
import { SerializationError } from "../errors";

/**
 * Serializes a WorldState to a canonical JSON string.
 *
 * This is the single supported serialization path for save games, replay
 * logs, network snapshots, and (eventually) PostgreSQL persistence — the
 * Simulation Core never depends on how the resulting string is stored.
 */
export function serializeWorldState(state: WorldState): string {
  validateWorldState(state);
  return canonicalStringify(state);
}

/** Deserializes and validates a WorldState from a canonical JSON string. Fails explicitly on any corruption. */
export function deserializeWorldState(json: string): WorldState {
  let parsed: unknown;
  try {
    parsed = canonicalParse(json);
  } catch (error) {
    throw new SerializationError(`Failed to parse WorldState JSON: ${(error as Error).message}`);
  }
  validateWorldState(parsed);
  return parsed;
}

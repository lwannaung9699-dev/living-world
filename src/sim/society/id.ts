/**
 * Deterministic ID generation for Team 07 entities.
 *
 * Ids are derived from a monotonically increasing counter stored in
 * SocietyState (not from RNG), so entity creation order never depends on
 * — and never perturbs — any RNG stream's sequence. The counter itself is
 * part of the serialized state, so id assignment survives save/load and
 * replay identically.
 */

export interface IdCounter {
  readonly nextIdCounter: number;
}

export function nextId<T extends IdCounter>(
  state: T,
  prefix: string,
): { id: string; state: T } {
  const id = `${prefix}-${state.nextIdCounter.toString(36)}`;
  return { id, state: { ...state, nextIdCounter: state.nextIdCounter + 1 } };
}

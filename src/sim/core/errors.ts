/**
 * Foundation error types (Team 01).
 *
 * Philosophy: determinism is more important than hiding errors. Any
 * corrupted seed, invalid version, corrupted RNG state, invalid WorldState,
 * or invalid serialized payload must throw explicitly and immediately
 * rather than silently "recovering" into an unpredictable state.
 */

export class SimulationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Thrown when a MasterSeed / WorldSeed value is missing, empty, or malformed. */
export class InvalidSeedError extends SimulationError {}

/** Thrown when simulationVersion / rulesVersion / initialStateVersion is missing or malformed. */
export class InvalidVersionError extends SimulationError {}

/** Thrown when a WorldState (or a sub-part of it, e.g. SimulationTime) fails validation. */
export class InvalidStateError extends SimulationError {}

/** Thrown when a DeterministicRng / RngStreamRegistry state is corrupted or malformed. */
export class InvalidRngStateError extends SimulationError {}

/** Thrown when serialized simulation data cannot be parsed or fails validation on load. */
export class SerializationError extends SimulationError {}

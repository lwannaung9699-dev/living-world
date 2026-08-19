import { WorldState, validateWorldState } from "../state/worldState";
import { RngStreamRegistry } from "../rng/rngStreamRegistry";
import { worldSeedToRngRoot } from "../seed/worldSeed";
import { advanceSimulationTime, DEFAULT_TICK_DURATION_SECONDS } from "../time/simulationClock";
import { InvalidStateError } from "../errors";

/**
 * A subsystem tick function is a pure transformation applied once per
 * simulation tick, given the freshly-advanced WorldState and the shared
 * RngStreamRegistry (so it can fork its own deterministic namespace, e.g.
 * `rng.fork("biology/mutation")`).
 *
 * This is the Foundation's designated extension point for the future
 * pipeline: Team 02 (Geography) -> Team 03 (Physics/Materials) -> ... ->
 * Team 17 (History). Each future team supplies a SubsystemTickFn and
 * appends it to `SimulationContext.subsystems`, in pipeline order.
 * Foundation's tick()/tickN() never need to change as subsystems are added.
 */
export type SubsystemTickFn = (state: WorldState, rng: RngStreamRegistry) => WorldState;

export interface SimulationContext {
  /** Overrides the default tick duration (Foundation default: 60 simulated seconds per tick). */
  readonly tickDurationSeconds?: number;
  /** Ordered list of subsystem tick functions executed once per tick, after the clock advances. */
  readonly subsystems?: readonly SubsystemTickFn[];
}

/**
 * Advances a WorldState by exactly one tick.
 *
 * Pipeline per tick:
 *   1. Validate the incoming state (fail explicitly on corruption).
 *   2. Restore the RngStreamRegistry from the state's own serialized rng data.
 *   3. Advance tick counter + simulation clock.
 *   4. Run every registered subsystem, in order, each receiving the shared registry.
 *   5. Persist the registry's new state back onto the returned WorldState.
 *
 * Pure function: never touches a database, the filesystem, the network, or
 * any rendering/UI framework. Given the same input state and context, it
 * always produces the same output state.
 */
export function tick(state: WorldState, context: SimulationContext = {}): WorldState {
  validateWorldState(state);

  const rngRoot = worldSeedToRngRoot(state.seed);
  const registry = RngStreamRegistry.fromState(rngRoot, state.rng);

  const tickDurationSeconds = context.tickDurationSeconds ?? DEFAULT_TICK_DURATION_SECONDS;

  let nextState: WorldState = {
    ...state,
    tick: state.tick + 1,
    simulationTime: advanceSimulationTime(state.simulationTime, 1, tickDurationSeconds),
  };

  for (const subsystem of context.subsystems ?? []) {
    nextState = subsystem(nextState, registry);
    validateWorldState(nextState);
  }

  nextState = { ...nextState, rng: registry.serialize() };

  validateWorldState(nextState);
  return nextState;
}

/**
 * Advances a WorldState by N ticks. Semantically identical to calling
 * tick() N times in sequence — this is what guarantees a future Godot
 * client (or a headless server) can batch/chunk ticks however it likes
 * (per-frame, fixed-step catch-up, fast-forward) without ever changing the
 * deterministic result.
 */
export function tickN(state: WorldState, ticks: number, context: SimulationContext = {}): WorldState {
  if (!Number.isInteger(ticks) || ticks < 0) {
    throw new InvalidStateError(`tickN requires a non-negative integer tick count, got ${ticks}`);
  }
  let current = state;
  for (let i = 0; i < ticks; i++) {
    current = tick(current, context);
  }
  return current;
}

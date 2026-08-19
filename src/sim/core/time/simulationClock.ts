import { InvalidStateError } from "../errors";

/**
 * Default number of simulated seconds represented by a single simulation
 * tick (1 tick = 1 simulated minute). This is a Foundation-level clock
 * constant, not a domain rule (geography/climate/etc belong to later
 * teams) — it exists purely so simulation time can be reasoned about
 * independently of real-world wall-clock time or client render frame rate.
 */
export const DEFAULT_TICK_DURATION_SECONDS = 60;

/**
 * SimulationTime — the deterministic simulation clock.
 *
 * Deliberately separate from real-world wall-clock time: the simulation
 * advances by whole ticks, never by elapsed real seconds. A future Godot
 * client rendering at 30fps, 60fps, 144fps, or a headless server running as
 * fast as possible, must all produce identical simulation results for the
 * same number of ticks.
 */
export interface SimulationTime {
  readonly tick: number;
  readonly simulatedSeconds: number;
}

export function createInitialSimulationTime(): SimulationTime {
  return { tick: 0, simulatedSeconds: 0 };
}

export function validateSimulationTime(value: unknown): asserts value is SimulationTime {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("SimulationTime must be an object");
  }
  const time = value as Partial<SimulationTime>;
  if (!Number.isInteger(time.tick) || (time.tick as number) < 0) {
    throw new InvalidStateError(`SimulationTime.tick must be a non-negative integer, got ${String(time.tick)}`);
  }
  if (
    typeof time.simulatedSeconds !== "number" ||
    !Number.isFinite(time.simulatedSeconds) ||
    time.simulatedSeconds < 0
  ) {
    throw new InvalidStateError(
      `SimulationTime.simulatedSeconds must be a non-negative finite number, got ${String(time.simulatedSeconds)}`,
    );
  }
}

/** Advances simulation time by a whole number of ticks (never fractional — determinism first). */
export function advanceSimulationTime(
  time: SimulationTime,
  ticks: number,
  tickDurationSeconds: number = DEFAULT_TICK_DURATION_SECONDS,
): SimulationTime {
  if (!Number.isInteger(ticks) || ticks < 0) {
    throw new InvalidStateError(`advanceSimulationTime requires a non-negative integer tick count, got ${ticks}`);
  }
  if (!Number.isFinite(tickDurationSeconds) || tickDurationSeconds <= 0) {
    throw new InvalidStateError(`tickDurationSeconds must be a positive finite number, got ${tickDurationSeconds}`);
  }
  return {
    tick: time.tick + ticks,
    simulatedSeconds: time.simulatedSeconds + ticks * tickDurationSeconds,
  };
}

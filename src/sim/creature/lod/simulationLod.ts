/**
 * Simulation LOD (Level of Detail) foundation (§27-28).
 *
 * Team 06 does NOT implement the full LOD manager (that is a future
 * optimization-layer concern once population counts get large) — this file
 * only defines the interface so the pipeline can plug into one later
 * without changing any creature-intelligence code.
 */
export type SimulationDetailLevel = "detailed" | "simplified" | "population";

/** How often (in ticks) a creature at a given detail level should run its full decision pipeline. */
export interface LodTickFrequency {
  readonly detailed: number; // e.g. 1 = every tick ("critical response")
  readonly simplified: number; // e.g. 10 = every 10 ticks ("normal decision")
  readonly population: number; // e.g. 100 = every 100 ticks ("idle/background thinking")
}

export const DEFAULT_LOD_TICK_FREQUENCY: LodTickFrequency = {
  detailed: 1,
  simplified: 10,
  population: 100,
};

/**
 * Decides whether a creature at `level` should run its decision pipeline
 * on `tick`, given its individual tick offset (so creatures at the same
 * LOD don't all recompute on the exact same tick, spreading CPU load).
 */
export function shouldRunDetailedTick(
  level: SimulationDetailLevel,
  tick: number,
  tickOffset: number,
  frequency: LodTickFrequency = DEFAULT_LOD_TICK_FREQUENCY,
): boolean {
  const interval = frequency[level];
  if (interval <= 1) return true;
  return (tick + tickOffset) % interval === 0;
}

/**
 * LodClassifier — interface only (§28): a future optimization layer decides
 * which detail level a creature should run at (e.g. based on distance from
 * any observer/player, or population density). Team 06 supplies a trivial
 * "always detailed" default so the pipeline is runnable without it.
 */
export interface LodClassifier {
  classify(creatureId: string, tick: number): SimulationDetailLevel;
}

export class AlwaysDetailedLodClassifier implements LodClassifier {
  classify(): SimulationDetailLevel {
    return "detailed";
  }
}

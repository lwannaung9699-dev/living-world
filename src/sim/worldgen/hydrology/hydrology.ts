import { HydrologyConditions, Landform } from "../contracts/types";
import { NeighborElevations } from "../geography/elevation";
import { clamp01, fbm2D } from "../noise/valueNoise";

/**
 * Continuous "flow accumulation potential" in [0, 1]: how strongly water
 * tends to accumulate/channel at (x, y). Combines a coherent low-frequency
 * noise field (standing in for a drainage-basin network) with a
 * flatness/valley bias derived from the already-computed local slope
 * (water accumulates in flatter, lower terrain — spec §10: "water tends to
 * flow downhill").
 *
 * KNOWN LIMITATION: this is a position-pure approximation, not a real
 * global flow-accumulation simulation (which would require traversing the
 * whole upstream drainage network — incompatible with independent,
 * lazily-generated chunks, spec §7/§19). It reproduces the *qualitative*
 * behavior required by §10 (rivers emerge from elevation/slope/
 * precipitation-correlated terrain and always terminate downhill into
 * ocean/lake/basin) without simulating discrete water parcels over time.
 */
export function drainagePotentialAt(masterSeedRoot: string, x: number, y: number, slope01: number): number {
  const basinNoise = fbm2D(masterSeedRoot, "hydrology/drainage", x, y, {
    octaves: 3,
    lacunarity: 2.1,
    gain: 0.55,
    baseFrequency: 1 / 20,
  });
  const flatnessBias = 1 - slope01;
  return clamp01(basinNoise * 0.55 + flatnessBias * 0.45);
}

export interface HydrologySample {
  readonly isRiver: boolean;
  readonly isLake: boolean;
  readonly drainagePotential01: number;
}

/**
 * Classifies river/lake presence for a land cell from elevation, slope, and
 * its four neighbor elevations — all already pure functions of position,
 * so this stays fully order-independent.
 *
 * Rivers occupy valley/channel cells (at least one lower neighbor to flow
 * toward, i.e. the cell is not an enclosed pit) whose drainage potential
 * clears riverThreshold; they always sit on land above sea level and, by
 * construction, always have a downhill neighbor to flow into (ocean, a
 * lower valley cell, or eventually a lake/basin) — never an arbitrary
 * disconnected spline (spec §10).
 *
 * Lakes occupy enclosed basins (all four neighbors higher) whose drainage
 * potential clears lakeThreshold.
 */
export function classifyHydrology(
  hydrology: HydrologyConditions,
  landform: Landform,
  elevation: number,
  seaLevel: number,
  slope01: number,
  neighbors: NeighborElevations,
  drainagePotential01: number,
): HydrologySample {
  if (elevation < seaLevel) {
    return { isRiver: false, isLake: false, drainagePotential01 };
  }

  const higherNeighbors = [neighbors.n, neighbors.s, neighbors.w, neighbors.e].filter((e) => e > elevation).length;
  const hasDownhillExit = higherNeighbors < 4;

  const isLake =
    landform === "basin" && higherNeighbors === 4 && drainagePotential01 > hydrology.lakeThreshold && slope01 < 0.15;

  const isRiver =
    !isLake &&
    hasDownhillExit &&
    higherNeighbors >= 1 &&
    slope01 < 0.5 &&
    drainagePotential01 > hydrology.riverThreshold;

  return { isRiver, isLake, drainagePotential01 };
}

/** Combines river/lake/ocean presence with drainage potential and ocean proximity into an overall [0,1] water availability figure. */
export function waterAvailabilityAt(
  isOcean: boolean,
  isRiver: boolean,
  isLake: boolean,
  drainagePotential01: number,
  oceanProximity01: number,
): number {
  if (isOcean || isLake) return 1;
  if (isRiver) return 0.9;
  return clamp01(0.1 + drainagePotential01 * 0.35 + oceanProximity01 * 0.35);
}

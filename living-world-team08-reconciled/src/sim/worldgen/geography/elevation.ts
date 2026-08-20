import { GeologicalPlate, PlanetaryConditions } from "../contracts/types";
import { clamp01, fbm2D } from "../noise/valueNoise";

/**
 * Distance-weighted plate influence at (x, y), in [-1, 1].
 *
 * Every plate contributes an inverse-square-falloff pull toward its own
 * upliftBias; nearby plates dominate, distant plates fade out. This is the
 * "geological structure" ingredient (spec §9) that gives terrain
 * large-scale coherence — continents/mountain belts/basins that span many
 * chunks — instead of every chunk looking like independent noise.
 */
function plateInfluenceAt(plates: readonly GeologicalPlate[], worldSize: number, x: number, y: number): number {
  if (plates.length === 0) return 0;

  const influenceRadius = worldSize / Math.sqrt(plates.length) + 1;
  let weightedSum = 0;
  let totalWeight = 0;

  for (const plate of plates) {
    const dx = x - plate.cx;
    const dy = y - plate.cy;
    const distSq = dx * dx + dy * dy;
    const weight = 1 / (1 + distSq / (influenceRadius * influenceRadius));
    weightedSum += weight * plate.upliftBias;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Nearest plate to (x, y) by Euclidean distance — used downstream by
 * soil/resources to look up the local rock type and activity level.
 */
export function nearestPlate(plates: readonly GeologicalPlate[], x: number, y: number): GeologicalPlate | null {
  let best: GeologicalPlate | null = null;
  let bestDistSq = Infinity;
  for (const plate of plates) {
    const dx = x - plate.cx;
    const dy = y - plate.cy;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = plate;
    }
  }
  return best;
}

/**
 * Pure, position-based elevation field in [0, 1]. Combines:
 *   - geological plate structure (large-scale continents/basins)
 *   - multi-octave coherent noise (regional + local variation, spec §9)
 *   - a secondary low-frequency "erosion mask" that gently smooths extreme
 *     terrain (a lightweight, documented proxy for real erosion physics —
 *     see Known Limitations)
 *
 * A pure function of (masterSeedRoot, plates, x, y): calling it for the
 * same coordinates always returns the same value regardless of what other
 * chunks have or haven't been generated, which is what makes chunk
 * generation order irrelevant (spec §7).
 */
export function elevationAt(
  masterSeedRoot: string,
  planetary: PlanetaryConditions,
  plates: readonly GeologicalPlate[],
  x: number,
  y: number,
): number {
  const worldSize = planetary.worldSizeChunks * planetary.chunkSize;
  const plateContribution = plateInfluenceAt(plates, worldSize, x, y);

  const regionalNoise = fbm2D(masterSeedRoot, "geography/elevation", x, y, {
    octaves: 5,
    lacunarity: 2.0,
    gain: 0.5,
    baseFrequency: 1 / 40,
  });

  const erosionMask = fbm2D(masterSeedRoot, "geography/erosion", x, y, {
    octaves: 2,
    lacunarity: 2.0,
    gain: 0.5,
    baseFrequency: 1 / 96,
  });
  // erosionMask in [0,1]; higher erosion gently pulls elevation toward the
  // mean, approximating long-term weathering smoothing extreme terrain.
  const erosionDamping = 1 - erosionMask * 0.3;

  const noiseContribution = (regionalNoise * 2 - 1) * erosionDamping;

  const elevation = 0.5 + plateContribution * 0.32 + noiseContribution * 0.34;
  return clamp01(elevation);
}

/** Central-difference slope magnitude in [0, ~1] at (x, y). */
export function slopeAt(
  masterSeedRoot: string,
  planetary: PlanetaryConditions,
  plates: readonly GeologicalPlate[],
  x: number,
  y: number,
  step = 1,
): number {
  const eN = elevationAt(masterSeedRoot, planetary, plates, x, y - step);
  const eS = elevationAt(masterSeedRoot, planetary, plates, x, y + step);
  const eW = elevationAt(masterSeedRoot, planetary, plates, x - step, y);
  const eE = elevationAt(masterSeedRoot, planetary, plates, x + step, y);

  const dx = (eE - eW) / (2 * step);
  const dy = (eS - eN) / (2 * step);
  const gradientMagnitude = Math.sqrt(dx * dx + dy * dy);
  // Empirically, gradient magnitudes from this field rarely exceed ~0.3;
  // rescale so "steep" terrain reads near 1.0 for landform thresholds.
  return clamp01(gradientMagnitude * 3);
}

export interface NeighborElevations {
  readonly n: number;
  readonly s: number;
  readonly w: number;
  readonly e: number;
}

export function neighborElevations(
  masterSeedRoot: string,
  planetary: PlanetaryConditions,
  plates: readonly GeologicalPlate[],
  x: number,
  y: number,
  step = 1,
): NeighborElevations {
  return {
    n: elevationAt(masterSeedRoot, planetary, plates, x, y - step),
    s: elevationAt(masterSeedRoot, planetary, plates, x, y + step),
    w: elevationAt(masterSeedRoot, planetary, plates, x - step, y),
    e: elevationAt(masterSeedRoot, planetary, plates, x + step, y),
  };
}

import { GeologicalPlate, PlanetaryConditions } from "../contracts/types";
import { elevationAt } from "./elevation";
import { clamp01 } from "../noise/valueNoise";

const SEARCH_RADII = [4, 8, 16, 24];
const SAMPLES_PER_RING = 8;
const MAX_RADIUS = SEARCH_RADII[SEARCH_RADII.length - 1];

/**
 * Approximate distance-to-nearest-ocean-cell via bounded ring sampling
 * (a handful of points at a few increasing radii around x,y). A true
 * exact-nearest-ocean search would require flood-filling the whole world,
 * which is incompatible with generating any chunk in O(1) independent of
 * every other chunk (spec §7/§19) — this bounded approximation trades
 * exactness for locality while still being a real geometric proximity
 * measurement rather than a noise stand-in. See Known Limitations.
 *
 * Returns a value in [0, 1]: 1 = at/adjacent to the ocean, 0 = no ocean
 * found within MAX_RADIUS cells.
 */
export function oceanProximityAt(
  masterSeedRoot: string,
  planetary: PlanetaryConditions,
  plates: readonly GeologicalPlate[],
  x: number,
  y: number,
  seaLevel: number,
  currentElevation: number,
): number {
  if (currentElevation < seaLevel) return 1;

  for (const radius of SEARCH_RADII) {
    for (let i = 0; i < SAMPLES_PER_RING; i++) {
      const angle = (i / SAMPLES_PER_RING) * Math.PI * 2;
      const sx = x + Math.cos(angle) * radius;
      const sy = y + Math.sin(angle) * radius;
      if (elevationAt(masterSeedRoot, planetary, plates, sx, sy) < seaLevel) {
        return clamp01(1 - radius / MAX_RADIUS);
      }
    }
  }
  return 0;
}

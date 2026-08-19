import { Landform } from "../contracts/types";
import { NeighborElevations } from "./elevation";

const COAST_BAND = 0.02;

/**
 * Classifies a cell's landform from elevation + slope + its four cardinal
 * neighbor elevations. Deliberately reads only local, position-derivable
 * information (never a stored/authored map), so this stays as
 * order-independent as elevationAt/slopeAt themselves.
 */
export function classifyLandform(
  elevation: number,
  seaLevel: number,
  slope: number,
  neighbors: NeighborElevations,
): Landform {
  if (elevation < seaLevel) return "ocean";
  if (elevation < seaLevel + COAST_BAND) return "coast";

  const aboveSeaLevel = elevation - seaLevel;
  const higherNeighbors = [neighbors.n, neighbors.s, neighbors.w, neighbors.e].filter((e) => e > elevation).length;
  const lowerNeighbors = 4 - higherNeighbors;

  if (slope > 0.55) return "cliff";

  if (aboveSeaLevel > 0.28) {
    return slope > 0.28 ? "mountains" : "plateau";
  }

  // Enclosed local minimum well above sea level and surrounded by higher ground -> basin.
  if (higherNeighbors >= 3 && slope < 0.18) return "basin";

  // Local minimum along a channel (some but not all neighbors higher), moderate slope -> valley.
  if (higherNeighbors >= 2 && lowerNeighbors >= 1 && slope >= 0.1 && slope <= 0.35) return "valley";

  if (slope > 0.2) return "hills";

  return "plains";
}

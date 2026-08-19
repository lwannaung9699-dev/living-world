import { BiomesConditions } from "../contracts/types";

const TEMP_RANGE_C = 55;
const PRECIP_RANGE_MM = 2200;

/**
 * Classifies the biome at a cell by nearest-match distance in normalized
 * (temperature, precipitation, moisture) space against the world's biome
 * table (spec §12: emerges from environmental state, never a random pick).
 * Ocean is a hard constraint (only ocean cells can be "ocean", and ocean
 * cells can only be "ocean") rather than a distance competitor, since no
 * amount of climate similarity should let a landlocked desert "win" the
 * ocean biome or vice versa.
 */
export function classifyBiome(
  biomes: BiomesConditions,
  meanTemperatureC: number,
  annualPrecipitationMm: number,
  moisture01: number,
  isOcean: boolean,
): string {
  let bestId = "temperateGrassland";
  let bestScore = Infinity;

  for (const def of biomes.definitions) {
    if (def.requiresOcean !== isOcean) continue;

    const dTemp = (meanTemperatureC - def.idealTemperatureC) / TEMP_RANGE_C;
    const dPrecip = (annualPrecipitationMm - def.idealPrecipitationMm) / PRECIP_RANGE_MM;
    const dMoisture = moisture01 - def.idealMoisture01;
    const score = dTemp * dTemp + dPrecip * dPrecip + dMoisture * dMoisture;

    if (score < bestScore) {
      bestScore = score;
      bestId = def.id;
    }
  }

  return bestId;
}

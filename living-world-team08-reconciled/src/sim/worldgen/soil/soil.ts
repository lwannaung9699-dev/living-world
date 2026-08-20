import { DeterministicRng } from "../../core/rng/deterministicRng";
import { WORLD_GENERATION_VERSION } from "../version";
import { ClimateSample, GeologicalPlate, SoilConditions, SoilSample } from "../contracts/types";
import { clamp01, hash01 } from "../noise/valueNoise";

/** One-time roll from the "worldgen/soil" stream — currently config-free but versioned for future tuning. */
export function generateSoilConditions(_rng: DeterministicRng): SoilConditions {
  return { version: WORLD_GENERATION_VERSION };
}

/**
 * Pure, position-based soil sample (spec §13). Derives from rock
 * (nearest geological plate), climate (temperature/humidity), slope
 * (drainage/erosion), and water availability (hydrology) — never a flat
 * "terrain color" placeholder.
 */
export function soilAt(
  masterSeedRoot: string,
  plate: GeologicalPlate | null,
  climate: ClimateSample,
  slope01: number,
  waterAvailability01: number,
  x: number,
  y: number,
): SoilSample {
  const activity = plate?.activity ?? 0;
  const isSedimentary = plate?.rockType === "sedimentary";
  const isMetamorphic = plate?.rockType === "metamorphic";

  const aridity01 = 1 - climate.humidity01;
  const textureNoise = hash01(masterSeedRoot, "soil/texture", Math.floor(x * 4), Math.floor(y * 4));

  const sand01 = clamp01(aridity01 * 0.45 + (isSedimentary ? 0.2 : 0) + textureNoise * 0.15);
  const clay01 = clamp01(climate.humidity01 * (1 - slope01) * 0.5 + (isMetamorphic ? 0.15 : 0) + (1 - textureNoise) * 0.1);

  const temperatureSuitability01 = clamp01(1 - Math.abs(climate.meanTemperatureC - 15) / 35);
  const organicMatter01 = clamp01(temperatureSuitability01 * 0.5 + climate.humidity01 * 0.5);

  const weatheringNoise = hash01(masterSeedRoot, "soil/weathering", Math.floor(x * 2), Math.floor(y * 2));
  const nutrients01 = clamp01(organicMatter01 * 0.5 + activity * 0.3 + weatheringNoise * 0.2);

  const moisture01 = clamp01(waterAvailability01 * 0.6 + climate.humidity01 * 0.4 - slope01 * 0.15);

  const depthM = clamp01(1 - slope01) * 1.5 + 0.1;

  const moisturePenalty = Math.abs(moisture01 - 0.55);
  const fertility01 = clamp01(nutrients01 * 0.4 + organicMatter01 * 0.35 + (1 - moisturePenalty) * 0.25);

  return { moisture01, nutrients01, organicMatter01, sand01, clay01, fertility01, depthM };
}

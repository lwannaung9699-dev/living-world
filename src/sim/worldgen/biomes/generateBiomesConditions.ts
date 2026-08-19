import { DeterministicRng } from "../../core/rng/deterministicRng";
import { WORLD_GENERATION_VERSION } from "../version";
import { BiomeDefinition, BiomesConditions } from "../contracts/types";

/**
 * Data-driven biome table (Whittaker-diagram style: each biome is an ideal
 * point in temperature/precipitation/moisture space). classifyBiome (see
 * biomes.ts) picks the nearest-matching definition — biome is never a bare
 * random label (spec §12). Extensible: add a row to grow the biome set.
 */
const BASE_DEFINITIONS: readonly Omit<BiomeDefinition, "idealTemperatureC" | "idealPrecipitationMm">[] = [
  { id: "ocean", label: "Ocean", idealMoisture01: 1, requiresOcean: true },
  { id: "iceSheet", label: "Ice Sheet", idealMoisture01: 0.1, requiresOcean: false },
  { id: "tundra", label: "Tundra", idealMoisture01: 0.4, requiresOcean: false },
  { id: "borealForest", label: "Boreal Forest", idealMoisture01: 0.55, requiresOcean: false },
  { id: "temperateGrassland", label: "Temperate Grassland", idealMoisture01: 0.4, requiresOcean: false },
  { id: "temperateForest", label: "Temperate Forest", idealMoisture01: 0.65, requiresOcean: false },
  { id: "desert", label: "Desert", idealMoisture01: 0.15, requiresOcean: false },
  { id: "savanna", label: "Savanna", idealMoisture01: 0.35, requiresOcean: false },
  { id: "tropicalRainforest", label: "Tropical Rainforest", idealMoisture01: 0.85, requiresOcean: false },
  { id: "wetland", label: "Wetland", idealMoisture01: 0.9, requiresOcean: false },
];

const BASE_TEMPERATURES: Record<string, number> = {
  ocean: 15,
  iceSheet: -28,
  tundra: -10,
  borealForest: 0,
  temperateGrassland: 12,
  temperateForest: 13,
  desert: 26,
  savanna: 24,
  tropicalRainforest: 26,
  wetland: 19,
};

const BASE_PRECIPITATION: Record<string, number> = {
  ocean: 1000,
  iceSheet: 80,
  tundra: 250,
  borealForest: 500,
  temperateGrassland: 500,
  temperateForest: 1200,
  desert: 150,
  savanna: 900,
  tropicalRainforest: 2200,
  wetland: 1500,
};

/** One-time roll from the "worldgen/biomes" stream. */
export function generateBiomesConditions(rng: DeterministicRng): BiomesConditions {
  const definitions: BiomeDefinition[] = BASE_DEFINITIONS.map((def) => ({
    ...def,
    idealTemperatureC: BASE_TEMPERATURES[def.id] + rng.gaussian(0, 1.5),
    idealPrecipitationMm: Math.max(20, BASE_PRECIPITATION[def.id] + rng.gaussian(0, 60)),
  }));
  return { version: WORLD_GENERATION_VERSION, definitions };
}

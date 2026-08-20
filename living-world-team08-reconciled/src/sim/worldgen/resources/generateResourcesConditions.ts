import { DeterministicRng } from "../../core/rng/deterministicRng";
import { WORLD_GENERATION_VERSION } from "../version";
import { ResourceDefinition, ResourcesConditions } from "../contracts/types";

/**
 * Base resource table (spec §14 examples: stone, clay, sand, iron, copper,
 * coal, salt, rare minerals). Data-driven and extensible — adding a new
 * resource is adding a row here, never a hardcoded per-tile coordinate.
 * Each world jitters these baselines slightly (from the "worldgen/resources"
 * stream) so worlds differ in resource abundance, not just placement.
 */
const BASE_DEFINITIONS: readonly Omit<ResourceDefinition, "baseProbability01">[] = [
  { id: "stone", label: "Stone", preferredRockTypes: [], activityAffinity01: 0.1, coastalAffinity: 0, slopeAffinity01: 0.35, soilClayAffinity01: 0 },
  { id: "clay", label: "Clay", preferredRockTypes: ["sedimentary"], activityAffinity01: 0, coastalAffinity: 0.15, slopeAffinity01: -0.1, soilClayAffinity01: 0.5 },
  { id: "sand", label: "Sand", preferredRockTypes: ["sedimentary"], activityAffinity01: 0, coastalAffinity: 0.4, slopeAffinity01: -0.15, soilClayAffinity01: -0.2 },
  { id: "iron", label: "Iron Ore", preferredRockTypes: ["igneous", "metamorphic"], activityAffinity01: 0.35, coastalAffinity: 0, slopeAffinity01: 0.15, soilClayAffinity01: 0 },
  { id: "copper", label: "Copper Ore", preferredRockTypes: ["igneous", "volcanic"], activityAffinity01: 0.4, coastalAffinity: 0, slopeAffinity01: 0.1, soilClayAffinity01: 0 },
  { id: "coal", label: "Coal", preferredRockTypes: ["sedimentary"], activityAffinity01: 0.05, coastalAffinity: -0.1, slopeAffinity01: 0, soilClayAffinity01: 0.1 },
  { id: "salt", label: "Salt", preferredRockTypes: ["sedimentary"], activityAffinity01: 0, coastalAffinity: 0.5, slopeAffinity01: -0.2, soilClayAffinity01: 0 },
  { id: "rareMinerals", label: "Rare Minerals", preferredRockTypes: ["metamorphic", "volcanic"], activityAffinity01: 0.6, coastalAffinity: 0, slopeAffinity01: 0.2, soilClayAffinity01: 0 },
];

/** One-time roll from the "worldgen/resources" stream. */
export function generateResourcesConditions(rng: DeterministicRng): ResourcesConditions {
  const definitions: ResourceDefinition[] = BASE_DEFINITIONS.map((def) => ({
    ...def,
    baseProbability01: 0.08 + rng.nextFloat() * 0.12,
  }));
  return { version: WORLD_GENERATION_VERSION, definitions };
}

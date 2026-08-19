import { WorldState } from "../../core/state/worldState";
import { worldSeedToRngRoot } from "../../core/seed/worldSeed";
import { CellData } from "../contracts/types";
import { readWorldgenModules } from "../genesis/worldgenModules";
import { classifyLandform } from "../geography/landform";
import { elevationAt, nearestPlate, neighborElevations, slopeAt } from "../geography/elevation";
import { oceanProximityAt } from "../geography/oceanProximity";
import { classifyHydrology, drainagePotentialAt, waterAvailabilityAt } from "../hydrology/hydrology";
import { climateAt } from "../climate/climate";
import { soilAt } from "../soil/soil";
import { sampleResourcesAt } from "../resources/resources";
import { classifyBiome } from "../biomes/biomes";
import { computeHabitatAt } from "../habitats/habitats";

/**
 * Computes the full, deterministic CellData for one world-space position.
 * This is the single place that assembles every World Genesis subsystem
 * (spec §1 pipeline) into one result, and it is a PURE function of
 * (WorldState's genesis config, x, y) — no mutation, no dependence on
 * whether any other cell/chunk has been sampled before or since. That
 * purity is exactly what makes chunk generation order irrelevant (spec §7)
 * and lazy/on-demand generation safe (spec §19).
 */
export function sampleCellAt(state: WorldState, x: number, y: number): CellData {
  const modules = readWorldgenModules(state);
  const masterSeedRoot = worldSeedToRngRoot(state.seed);
  const { planetary, geography, geology, hydrology, climate, soil, resources, biomes } = modules;

  const elevation01 = elevationAt(masterSeedRoot, planetary, geology.plates, x, y);
  const slope01 = slopeAt(masterSeedRoot, planetary, geology.plates, x, y);
  const neighbors = neighborElevations(masterSeedRoot, planetary, geology.plates, x, y);
  const landform = classifyLandform(elevation01, geography.seaLevel, slope01, neighbors);
  const isOcean = landform === "ocean";

  const plate = nearestPlate(geology.plates, x, y);
  const oceanProximity01 = oceanProximityAt(masterSeedRoot, planetary, geology.plates, x, y, geography.seaLevel, elevation01);

  const drainagePotential01 = drainagePotentialAt(masterSeedRoot, x, y, slope01);
  const { isRiver, isLake } = classifyHydrology(
    hydrology,
    landform,
    elevation01,
    geography.seaLevel,
    slope01,
    neighbors,
    drainagePotential01,
  );
  const waterAvailability01 = waterAvailabilityAt(isOcean, isRiver, isLake, drainagePotential01, oceanProximity01);

  const climateSample = climateAt(masterSeedRoot, climate, planetary, geography.seaLevel, x, y, elevation01, oceanProximity01);

  const soilSample = soilAt(masterSeedRoot, plate, climateSample, slope01, waterAvailability01, x, y);

  const resourceDeposits = sampleResourcesAt(
    masterSeedRoot,
    resources,
    plate,
    slope01,
    oceanProximity01,
    soilSample,
    isOcean,
    x,
    y,
  );

  const biomeId = classifyBiome(
    biomes,
    climateSample.meanTemperatureC,
    climateSample.annualPrecipitationMm,
    soilSample.moisture01,
    isOcean,
  );

  const habitat = computeHabitatAt(climateSample, soilSample, waterAvailability01, landform, resourceDeposits);

  return {
    wx: x,
    wy: y,
    elevation01,
    slope01,
    landform,
    isRiver,
    isLake,
    waterAvailability01,
    climate: climateSample,
    soil: soilSample,
    resources: resourceDeposits,
    biomeId,
    habitat,
  };
}

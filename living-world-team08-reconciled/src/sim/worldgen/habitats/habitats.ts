import { DeterministicRng } from "../../core/rng/deterministicRng";
import { WORLD_GENERATION_VERSION } from "../version";
import { ClimateSample, HabitatSample, HabitatsConditions, Landform, ResourceDeposit, SoilSample } from "../contracts/types";
import { clamp01 } from "../noise/valueNoise";

/** One-time roll from the "worldgen/habitats" stream — currently config-free but versioned for future tuning. */
export function generateHabitatsConditions(_rng: DeterministicRng): HabitatsConditions {
  return { version: WORLD_GENERATION_VERSION };
}

const SHELTER_BASE_BY_LANDFORM: Record<Landform, number> = {
  ocean: 0.1,
  coast: 0.2,
  plains: 0.3,
  hills: 0.6,
  mountains: 0.55,
  valley: 0.7,
  plateau: 0.4,
  basin: 0.5,
  cliff: 0.45,
};

const TEMP_MIN_C = -30;
const TEMP_MAX_C = 35;

/**
 * Aggregates environmental habitat conditions for future Biology/Evolution
 * systems (spec §15) — no organisms, species, or behavior here, only the
 * environmental affordances those future systems will read. Also computes
 * `vegetationPotential01`, the explicit foundation for the future feedback
 * chain described in spec §16 (Rain -> River Flow -> Soil Moisture ->
 * Vegetation Potential -> Future Life) — WorldState exposes the potential;
 * actual vegetation/life remains entirely out of scope for Team 02.
 */
export function computeHabitatAt(
  climate: ClimateSample,
  soil: SoilSample,
  waterAvailability01: number,
  landform: Landform,
  resources: readonly ResourceDeposit[],
): HabitatSample {
  const temperature01 = clamp01((climate.meanTemperatureC - TEMP_MIN_C) / (TEMP_MAX_C - TEMP_MIN_C));

  const latFactor = clamp01(Math.cos((climate.latitudeDeg * Math.PI) / 180));
  const sunlight01 = clamp01(0.5 + latFactor * 0.3 - climate.humidity01 * 0.2);

  const shelterAvailability01 = clamp01(SHELTER_BASE_BY_LANDFORM[landform]);

  const resourceAvailability01 = clamp01(
    resources.reduce((sum, deposit) => sum + deposit.density01, 0) / 3,
  );

  const temperatureSuitability01 = clamp01(1 - Math.abs(climate.meanTemperatureC - 18) / 40);
  const vegetationPotential01 = clamp01(
    soil.moisture01 * 0.4 + temperatureSuitability01 * 0.4 + waterAvailability01 * 0.2,
  );

  return {
    temperature01,
    moisture01: soil.moisture01,
    nutrients01: soil.nutrients01,
    waterAvailability01,
    shelterAvailability01,
    sunlight01,
    terrain: landform,
    resourceAvailability01,
    vegetationPotential01,
  };
}

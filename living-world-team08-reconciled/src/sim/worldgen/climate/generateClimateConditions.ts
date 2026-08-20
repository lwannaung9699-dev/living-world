import { DeterministicRng } from "../../core/rng/deterministicRng";
import { WORLD_GENERATION_VERSION } from "../version";
import { ClimateConditions } from "../contracts/types";

/** One-time roll from the "worldgen/climate" stream. */
export function generateClimateConditions(rng: DeterministicRng): ClimateConditions {
  return {
    version: WORLD_GENERATION_VERSION,
    equatorTemperatureC: 26 + rng.nextFloat() * 6,
    poleTemperatureC: -25 - rng.nextFloat() * 15,
    elevationLapseRateC: 28 + rng.nextFloat() * 12,
    maxPrecipitationMm: 2200 + rng.nextFloat() * 800,
  };
}

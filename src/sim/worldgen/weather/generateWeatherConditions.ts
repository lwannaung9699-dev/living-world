import { DeterministicRng } from "../../core/rng/deterministicRng";
import { WORLD_GENERATION_VERSION } from "../version";
import { WeatherConditions } from "../contracts/types";

/** One-time roll from the "worldgen/weather" stream. */
export function generateWeatherConditions(rng: DeterministicRng): WeatherConditions {
  return {
    version: WORLD_GENERATION_VERSION,
    stormProbabilityBase01: 0.04 + rng.nextFloat() * 0.06,
    fogHumidityThreshold01: 0.7 + rng.nextFloat() * 0.15,
    snowTemperatureThresholdC: -1 + rng.nextFloat() * 3,
    extremeTemperatureDeltaC: 8 + rng.nextFloat() * 6,
  };
}

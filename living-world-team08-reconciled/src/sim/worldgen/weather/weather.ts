import { SimulationTime } from "../../core/time/simulationClock";
import { ClimateSample, PlanetaryConditions, WeatherConditions, WeatherSample } from "../contracts/types";
import { clamp01, hashKey01 } from "../noise/valueNoise";

/**
 * Fraction [0, 1) through the current simulated year, derived from the
 * Foundation's own SimulationTime (spec §11 seasonality). Pure function of
 * (planetary.ticksPerYear, simulationTime.tick) — never mutates or reads
 * anything else.
 */
export function computeSeasonPhase(planetary: PlanetaryConditions, simulationTime: SimulationTime): number {
  const yearTicks = planetary.ticksPerYear;
  return yearTicks > 0 ? (simulationTime.tick % yearTicks) / yearTicks : 0;
}

/**
 * Weather Foundation (spec §11 "Weather Foundation"): a deterministic,
 * on-demand instantaneous sample derived from the annual-mean climate
 * baseline, the current season phase, and a position+tick hash for
 * day-to-day variability. This is explicitly a FOUNDATION, not a full
 * weather simulation — there is no persisted moving weather-front state,
 * no spatial weather-system propagation over time. It exists so future
 * teams (and the client) have a well-defined, deterministic "what is the
 * weather right now at this location" query. See Known Limitations.
 */
export function computeWeatherAt(
  weather: WeatherConditions,
  planetary: PlanetaryConditions,
  climate: ClimateSample,
  seasonPhase01: number,
  masterSeedRoot: string,
  x: number,
  y: number,
  tick: number,
): WeatherSample {
  const seasonalAmplitudeC = (planetary.axialTiltDeg / 23.5) * 10;
  const hemisphereSign = climate.latitudeDeg >= 0 ? 1 : -1;
  const seasonalOffsetC = hemisphereSign * seasonalAmplitudeC * Math.sin(2 * Math.PI * seasonPhase01 - Math.PI / 2);

  const dailyKey = `${x.toFixed(2)}:${y.toFixed(2)}:${tick}`;
  const tempNoise = (hashKey01(masterSeedRoot, "weather/dailyTemp", dailyKey) - 0.5) * 2;

  const temperatureC = climate.meanTemperatureC + seasonalOffsetC + tempNoise;

  const rainNoise = hashKey01(masterSeedRoot, "weather/rain", dailyKey);
  const rain01 = clamp01(climate.humidity01 * (0.4 + rainNoise * 0.6));

  const stormRoll = hashKey01(masterSeedRoot, "weather/storm", dailyKey);
  const isStorm = stormRoll < weather.stormProbabilityBase01 * (0.5 + climate.humidity01);

  const windNoise = hashKey01(masterSeedRoot, "weather/windGust", dailyKey);
  const windSpeedFoundation01 = clamp01(climate.windFoundation01 * (0.7 + windNoise * 0.6));

  const fog01 =
    climate.humidity01 > weather.fogHumidityThreshold01
      ? clamp01((climate.humidity01 - weather.fogHumidityThreshold01) / (1 - weather.fogHumidityThreshold01))
      : 0;

  const snowProbability01 =
    temperatureC < weather.snowTemperatureThresholdC
      ? clamp01(climate.snowProbability01 * (1 + (weather.snowTemperatureThresholdC - temperatureC) / 10))
      : 0;

  const isExtremeTemperature = Math.abs(temperatureC - climate.meanTemperatureC) > weather.extremeTemperatureDeltaC;

  return {
    temperatureC,
    rain01,
    isStorm,
    windSpeedFoundation01,
    fog01,
    snowProbability01,
    isExtremeTemperature,
  };
}

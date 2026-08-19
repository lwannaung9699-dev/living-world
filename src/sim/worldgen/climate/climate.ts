import { ClimateConditions, ClimateSample, PlanetaryConditions } from "../contracts/types";
import { clamp01, fbm2D } from "../noise/valueNoise";

const DEG2RAD = Math.PI / 180;

/** Latitude in degrees ([-90, 90]) for a world-y coordinate; y=0 is the north pole, y=worldSize is the south pole. */
export function latitudeDegAt(planetary: PlanetaryConditions, y: number): number {
  const worldSize = planetary.worldSizeChunks * planetary.chunkSize;
  const fraction = ((y % worldSize) + worldSize) % worldSize / worldSize;
  return 90 - fraction * 180;
}

/**
 * Pure, position-based ANNUAL-MEAN climate baseline at (x, y). This is what
 * biome/soil classification reads (spec §11/§12) — instantaneous
 * day-to-day variation is a separate concern (see weather/weather.ts).
 *
 * Considers: latitude (temperature/precipitation gradient), altitude
 * (lapse-rate cooling + reduced precipitation at height, "rain shadow"
 * proxy), and ocean proximity (moderates temperature swings, boosts
 * precipitation/humidity near coasts) — every factor spec §11 requires.
 */
export function climateAt(
  masterSeedRoot: string,
  climate: ClimateConditions,
  planetary: PlanetaryConditions,
  seaLevel: number,
  x: number,
  y: number,
  elevation01: number,
  oceanProximity01: number,
): ClimateSample {
  const latitudeDeg = latitudeDegAt(planetary, y);
  const latFactor = clamp01(Math.cos(latitudeDeg * DEG2RAD));

  const baseTemp = climate.poleTemperatureC + (climate.equatorTemperatureC - climate.poleTemperatureC) * latFactor;
  const altitudeAboveSea = Math.max(0, elevation01 - seaLevel);
  const altitudeTemp = baseTemp - climate.elevationLapseRateC * altitudeAboveSea;

  const tempNoise = (fbm2D(masterSeedRoot, "climate/temperature", x, y, {
    octaves: 3,
    lacunarity: 2.0,
    gain: 0.5,
    baseFrequency: 1 / 60,
  }) * 2 - 1) * 3;

  const meanOfExtremes = (climate.equatorTemperatureC + climate.poleTemperatureC) / 2;
  const meanTemperatureC = altitudeTemp + tempNoise + (meanOfExtremes - (altitudeTemp + tempNoise)) * oceanProximity01 * 0.25;

  const precipNoise = fbm2D(masterSeedRoot, "climate/precipitation", x, y, {
    octaves: 4,
    lacunarity: 2.0,
    gain: 0.5,
    baseFrequency: 1 / 45,
  });
  const precipBase = climate.maxPrecipitationMm * (0.3 + 0.7 * latFactor);
  const rainShadow = 1 - clamp01(altitudeAboveSea * 1.4);
  const annualPrecipitationMm = Math.max(
    0,
    precipBase * (0.5 + 0.5 * precipNoise) * (0.6 + 0.4 * oceanProximity01) * rainShadow,
  );

  const humidity01 = clamp01((annualPrecipitationMm / climate.maxPrecipitationMm) * 0.7 + oceanProximity01 * 0.3);

  const windNoise = fbm2D(masterSeedRoot, "climate/wind", x, y, {
    octaves: 2,
    lacunarity: 2.0,
    gain: 0.5,
    baseFrequency: 1 / 30,
  });
  const windFoundation01 = clamp01(0.25 + (1 - latFactor) * 0.4 + windNoise * 0.3);

  const snowProbability01 = meanTemperatureC < 2 ? clamp01((2 - meanTemperatureC) / 20) : 0;

  return {
    latitudeDeg,
    meanTemperatureC,
    annualPrecipitationMm,
    humidity01,
    windFoundation01,
    snowProbability01,
  };
}

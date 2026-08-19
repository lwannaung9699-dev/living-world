import { WorldState } from "../../core/state/worldState";
import { worldSeedToRngRoot } from "../../core/seed/worldSeed";
import { WeatherSample } from "../contracts/types";
import { readWorldgenModules } from "../genesis/worldgenModules";
import { elevationAt } from "../geography/elevation";
import { oceanProximityAt } from "../geography/oceanProximity";
import { climateAt } from "../climate/climate";
import { computeSeasonPhase, computeWeatherAt } from "./weather";

/**
 * Public, on-demand query: "what is the weather right now at (x, y)?".
 * Deterministic in (WorldState's genesis config, x, y, state.time.tick) —
 * never persisted, always recomputed (spec §11 Weather Foundation).
 */
export function sampleWeatherAt(state: WorldState, x: number, y: number): WeatherSample {
  const modules = readWorldgenModules(state);
  const masterSeedRoot = worldSeedToRngRoot(state.seed);
  const { planetary, geography, geology, climate, weather } = modules;

  const elevation01 = elevationAt(masterSeedRoot, planetary, geology.plates, x, y);
  const oceanProximity01 = oceanProximityAt(masterSeedRoot, planetary, geology.plates, x, y, geography.seaLevel, elevation01);
  const climateSample = climateAt(masterSeedRoot, climate, planetary, geography.seaLevel, x, y, elevation01, oceanProximity01);
  const seasonPhase01 = computeSeasonPhase(planetary, state.simulationTime);

  return computeWeatherAt(weather, planetary, climateSample, seasonPhase01, masterSeedRoot, x, y, state.simulationTime.tick);
}

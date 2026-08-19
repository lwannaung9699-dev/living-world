import { WorldState } from "../../core/state/worldState";
import { RngStreamRegistry } from "../../core/rng/rngStreamRegistry";
import { worldSeedToRngRoot, WorldSeed } from "../../core/seed/worldSeed";
import { createInitialWorldState } from "../../core/state/worldState";
import { worldgenNamespace } from "../rngNamespaces";
import { generatePlanetaryConditions } from "../planetary/generatePlanetaryConditions";
import { generateGeologyConditions } from "../geology/generateGeologyConditions";
import { generateGeographyConditions } from "../geography/generateGeographyConditions";
import { generateHydrologyConditions } from "../hydrology/generateHydrologyConditions";
import { generateClimateConditions } from "../climate/generateClimateConditions";
import { generateWeatherConditions } from "../weather/generateWeatherConditions";
import { generateSoilConditions } from "../soil/soil";
import { generateResourcesConditions } from "../resources/generateResourcesConditions";
import { generateBiomesConditions } from "../biomes/generateBiomesConditions";
import { generateHabitatsConditions } from "../habitats/habitats";

/**
 * Populates WorldState.modules.{planetary, geology, geography, hydrology,
 * climate, weather, soil, resources, biomes, habitats} from the world's
 * Master Seed (spec §17). This is the ONLY place World Genesis forks
 * sequential RngStreamRegistry streams — one fork per subsystem, each
 * consumed exactly once, in a fixed order, to roll that subsystem's
 * one-time global configuration (plate placement, sea level, climate
 * baseline, ...). Every stream's derivation is `hash(masterSeedRoot ::
 * namespace)` (see RngStreamRegistry.fork), so this fixed call order is
 * irrelevant to the result — reordering these ten fork() calls would still
 * produce the exact same ten streams/values, because forking one namespace
 * never perturbs another's seed or state.
 *
 * Per-position data (elevation, climate samples, soil, biome, resources,
 * habitat — everything chunk generation touches) is NEVER rolled here.
 * Those are pure functions of position computed on demand (see
 * chunk/sampleCell.ts) — this function only ever produces the small,
 * global configuration those pure functions read.
 *
 * Reuses Team 01's exact tick() pattern (core/simulation/simulation.ts):
 * restore the registry from state.rng, fork what's needed, and persist the
 * registry's new state back onto `rng` — so World Genesis composes with
 * the Foundation's existing determinism/replay/serialization guarantees
 * with zero changes to Team 01 code.
 */
export function generateWorldGenesis(state: WorldState): WorldState {
  const rngRoot = worldSeedToRngRoot(state.seed);
  const registry = RngStreamRegistry.fromState(rngRoot, state.rng);

  const planetary = generatePlanetaryConditions(registry.fork(worldgenNamespace("planetary")));
  const geology = generateGeologyConditions(registry.fork(worldgenNamespace("geology")), planetary);
  const geography = generateGeographyConditions(
    registry.fork(worldgenNamespace("geography")),
    planetary,
    geology.plates,
    rngRoot,
  );
  const hydrology = generateHydrologyConditions(registry.fork(worldgenNamespace("hydrology")));
  const climate = generateClimateConditions(registry.fork(worldgenNamespace("climate")));
  const weather = generateWeatherConditions(registry.fork(worldgenNamespace("weather")));
  const soil = generateSoilConditions(registry.fork(worldgenNamespace("soil")));
  const resources = generateResourcesConditions(registry.fork(worldgenNamespace("resources")));
  const biomes = generateBiomesConditions(registry.fork(worldgenNamespace("biomes")));
  const habitats = generateHabitatsConditions(registry.fork(worldgenNamespace("habitats")));

  return {
    ...state,
    modules: {
      ...state.modules,
      planetary,
      geology,
      geography,
      hydrology,
      climate,
      weather,
      soil,
      resources,
      biomes,
      habitats,
    },
    rng: registry.serialize(),
  };
}

/**
 * Convenience entry point: builds tick-zero WorldState (Team 01's
 * createInitialWorldState) and immediately layers World Genesis on top.
 * This is what Team 03+ should call to get a fully-formed starting world
 * — createInitialWorldState alone only produces the empty Foundation
 * shell (modules: {}).
 */
export function createGenesisWorldState(seed: WorldSeed): WorldState {
  return generateWorldGenesis(createInitialWorldState(seed));
}

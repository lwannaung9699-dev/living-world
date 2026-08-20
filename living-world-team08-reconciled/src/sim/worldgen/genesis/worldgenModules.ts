import { WorldState } from "../../core/state/worldState";
import {
  BiomesConditions,
  ClimateConditions,
  GeographyConditions,
  GeologyConditions,
  HabitatsConditions,
  HydrologyConditions,
  PlanetaryConditions,
  ResourcesConditions,
  SoilConditions,
  WeatherConditions,
} from "../contracts/types";
import { WorldGenesisNotInitializedError } from "../errors";

export interface WorldgenModules {
  readonly planetary: PlanetaryConditions;
  readonly geography: GeographyConditions;
  readonly geology: GeologyConditions;
  readonly hydrology: HydrologyConditions;
  readonly climate: ClimateConditions;
  readonly weather: WeatherConditions;
  readonly soil: SoilConditions;
  readonly resources: ResourcesConditions;
  readonly biomes: BiomesConditions;
  readonly habitats: HabitatsConditions;
}

const MODULE_KEYS = [
  "planetary",
  "geography",
  "geology",
  "hydrology",
  "climate",
  "weather",
  "soil",
  "resources",
  "biomes",
  "habitats",
] as const;

/**
 * Reads and type-asserts every World Genesis module off WorldState.modules.
 * Throws WorldGenesisNotInitializedError with a clear message if
 * generateWorldGenesis() has not been run on this state yet — per
 * Foundation's error philosophy (explicit failure over silent
 * misbehavior, core/errors.ts).
 */
export function readWorldgenModules(state: WorldState): WorldgenModules {
  for (const key of MODULE_KEYS) {
    if (!(key in state.modules)) {
      throw new WorldGenesisNotInitializedError(
        `WorldState.modules.${key} is missing — call generateWorldGenesis(state) (or createGenesisWorldState(seed)) before querying World Genesis data.`,
      );
    }
  }
  return state.modules as unknown as WorldgenModules;
}

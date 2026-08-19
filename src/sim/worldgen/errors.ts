import { SimulationError } from "../core/errors";

/** Thrown when worldgen field/chunk queries are attempted against a WorldState that hasn't run generateWorldGenesis() yet. */
export class WorldGenesisNotInitializedError extends SimulationError {}

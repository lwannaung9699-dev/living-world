/**
 * World Genesis (Team 02) — public API.
 *
 * Entry points:
 *   - createGenesisWorldState(seed)   build a fresh, fully-generated world
 *   - generateWorldGenesis(state)     layer genesis onto an existing (Team 01) WorldState
 *   - generateChunk(state, coord)     get a full chunk of terrain/climate/soil/resources/biome/habitat data
 *   - sampleCellAt(state, x, y)       get a single cell without materializing a whole chunk
 *   - sampleWeatherAt(state, x, y)    on-demand instantaneous weather at a position
 */
export * from "./version";
export * from "./contracts/types";
export { generateWorldGenesis, createGenesisWorldState } from "./genesis/generateWorldGenesis";
export { readWorldgenModules, type WorldgenModules } from "./genesis/worldgenModules";
export { WorldGenesisNotInitializedError } from "./errors";
export { generateChunk } from "./chunk/generateChunk";
export { sampleCellAt } from "./chunk/sampleCell";
export { chunkKey, chunkOrigin } from "./chunk/chunkCoordinate";
export { sampleWeatherAt } from "./weather/sampleWeatherAt";
export { computeSeasonPhase } from "./weather/weather";
export { latitudeDegAt } from "./climate/climate";
export { nearestPlate } from "./geography/elevation";

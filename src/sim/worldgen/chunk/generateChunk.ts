import { WorldState } from "../../core/state/worldState";
import { CellData, ChunkCoordinate, ChunkData } from "../contracts/types";
import { WORLD_GENERATION_VERSION } from "../version";
import { readWorldgenModules } from "../genesis/worldgenModules";
import { chunkOrigin } from "./chunkCoordinate";
import { sampleCellAt } from "./sampleCell";

/**
 * Generates one chunk's full grid of cell data. Pure function of
 * (WorldState's genesis config, coord) — every cell is computed via
 * sampleCellAt, itself a pure function of world position. Generating
 * chunk (4,4) before or after chunk (0,0), or generating only chunk (4,4)
 * in complete isolation, always yields byte-identical results (spec §7).
 *
 * Never stored on WorldState: chunks are cheap to regenerate on demand
 * (lazy generation, spec §19) from (masterSeedRoot, genesis config, coord)
 * alone, so WorldState never grows unboundedly with chunk data — callers
 * (a future orchestration/client layer) are free to cache ChunkData
 * outside the Core if desired.
 */
export function generateChunk(state: WorldState, coord: ChunkCoordinate): ChunkData {
  const { planetary } = readWorldgenModules(state);
  const chunkSize = planetary.chunkSize;
  const { wx: originX, wy: originY } = chunkOrigin(coord, chunkSize);

  const cells: CellData[][] = [];
  for (let localY = 0; localY < chunkSize; localY++) {
    const row: CellData[] = [];
    for (let localX = 0; localX < chunkSize; localX++) {
      row.push(sampleCellAt(state, originX + localX, originY + localY));
    }
    cells.push(row);
  }

  return { version: WORLD_GENERATION_VERSION, coord, chunkSize, cells };
}

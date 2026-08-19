import { ChunkCoordinate } from "../contracts/types";

/** Canonical string key for a chunk coordinate, e.g. "4,-2". Stable across processes — used for caching/lookup by callers, never by the Foundation itself. */
export function chunkKey(coord: ChunkCoordinate): string {
  return `${coord.cx},${coord.cy}`;
}

/** World-space origin (top-left cell) of a chunk. */
export function chunkOrigin(coord: ChunkCoordinate, chunkSize: number): { readonly wx: number; readonly wy: number } {
  return { wx: coord.cx * chunkSize, wy: coord.cy * chunkSize };
}

import { WORLD_GENERATION_VERSION } from "./version";

/**
 * Builds a namespace path for a one-time (non-positional) worldgen RNG
 * stream, e.g. `worldgenNamespace("geology")` -> "worldgen/geology@0.1.0".
 *
 * Every worldgen namespace is suffixed with WORLD_GENERATION_VERSION so
 * that bumping the generation version deterministically reseeds every
 * worldgen stream (a "new physical universe") without disturbing any other
 * Team 01 / future-team namespace (per RngStreamRegistry's isolation
 * guarantee — see core/rng/rngStreamRegistry.ts).
 *
 * IMPORTANT: this is only for streams forked via RngStreamRegistry, i.e.
 * ONE-TIME global rolls made once at genesis (planetary parameters,
 * geological plate placement, ...). Anything that varies per world
 * position (elevation, climate, soil, biome, resources, chunk cell data)
 * must NEVER read from a sequential RngStreamRegistry stream — that would
 * make results depend on the order chunks/positions happen to be visited
 * in. Per-position data must instead use `positionHash()` /
 * `positionNoise()` from `./noise/valueNoise`, which are pure functions of
 * (masterSeedRoot, coordinates) with no mutable call-order state at all.
 */
export function worldgenNamespace(name: string): string {
  return `worldgen/${name}@${WORLD_GENERATION_VERSION}`;
}

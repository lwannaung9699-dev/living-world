import { DeterministicRng } from "../../core/rng/deterministicRng";
import { WORLD_GENERATION_VERSION } from "../version";
import { PlanetaryConditions } from "../contracts/types";

/**
 * Rolls the one-time planetary baseline for a world. Called exactly once
 * per world, at genesis, from the "worldgen/planetary" RNG stream — never
 * per-chunk or per-position (see rngNamespaces.ts for why).
 */
export function generatePlanetaryConditions(rng: DeterministicRng): PlanetaryConditions {
  return {
    version: WORLD_GENERATION_VERSION,
    worldSizeChunks: rng.nextInt(24, 48),
    chunkSize: 16,
    cellSpacing: 1,
    gravity: 0.9 + rng.nextFloat() * 0.2,
    axialTiltDeg: 10 + rng.nextFloat() * 30,
    ticksPerYear: 525_600, // 1 tick = 1 simulated minute (Foundation default) => 1 simulated year
    waterFraction: 0.55 + rng.nextFloat() * 0.2,
  };
}

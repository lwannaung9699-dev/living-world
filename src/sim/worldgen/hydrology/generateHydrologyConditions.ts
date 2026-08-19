import { DeterministicRng } from "../../core/rng/deterministicRng";
import { WORLD_GENERATION_VERSION } from "../version";
import { HydrologyConditions } from "../contracts/types";

/** One-time roll from the "worldgen/hydrology" stream. */
export function generateHydrologyConditions(rng: DeterministicRng): HydrologyConditions {
  return {
    version: WORLD_GENERATION_VERSION,
    riverThreshold: 0.62 + rng.nextFloat() * 0.08,
    lakeThreshold: 0.6 + rng.nextFloat() * 0.08,
  };
}

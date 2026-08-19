import { DeterministicRng } from "../../core/rng/deterministicRng";
import { WORLD_GENERATION_VERSION } from "../version";
import { GeologicalPlate, GeologyConditions, PlanetaryConditions, RockType } from "../contracts/types";

const ROCK_TYPES: readonly RockType[] = ["igneous", "sedimentary", "metamorphic", "volcanic"];

/**
 * Places a small number of geological "plates" — large-scale structural
 * provinces that bias regional elevation, rock type, and geological
 * activity. This is the structural ingredient that keeps terrain from
 * degenerating into "random noise + colors" (spec §9): elevation is never
 * pure noise, it is noise blended with distance-weighted plate uplift bias
 * (see geography/elevation.ts).
 *
 * One-time roll from the "worldgen/geology" stream — plate placement
 * itself is global genesis data, not a per-position query, so it is fine
 * for it to consume a sequential RNG stream. Everything DOWNSTREAM of this
 * (elevation, landform, etc.) reads the resulting plate list as static
 * data and combines it with pure position-hash noise — never touching this
 * stream again.
 */
export function generateGeologyConditions(rng: DeterministicRng, planetary: PlanetaryConditions): GeologyConditions {
  const worldSize = planetary.worldSizeChunks * planetary.chunkSize;
  const plateCount = rng.nextInt(10, 22);

  const plates: GeologicalPlate[] = [];
  for (let id = 0; id < plateCount; id++) {
    plates.push({
      id,
      cx: rng.nextFloat() * worldSize,
      cy: rng.nextFloat() * worldSize,
      upliftBias: rng.gaussian(0, 0.45),
      rockType: rng.choose(ROCK_TYPES),
      activity: rng.nextFloat(),
    });
  }

  return { version: WORLD_GENERATION_VERSION, plates };
}

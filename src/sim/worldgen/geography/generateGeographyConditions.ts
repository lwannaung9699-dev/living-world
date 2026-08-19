import { DeterministicRng } from "../../core/rng/deterministicRng";
import { WORLD_GENERATION_VERSION } from "../version";
import { GeographyConditions, GeologicalPlate, PlanetaryConditions } from "../contracts/types";
import { elevationAt } from "./elevation";

const CALIBRATION_SAMPLES = 2000;

/**
 * Derives the sea level threshold so that (approximately) `waterFraction`
 * of the world's surface actually ends up below it.
 *
 * A naive `seaLevel = 1 - waterFraction` assumes elevation is uniformly
 * distributed across [0, 1], but elevationAt's actual output distribution
 * (plate-weighted-average + damped fbm noise, see geography/elevation.ts)
 * clusters much more tightly around its 0.5 midpoint. Using the naive
 * mapping was measured to produce wildly wrong water coverage (e.g. a 70%
 * waterFraction target yielding well under 1% actual ocean). Instead, this
 * Monte-Carlo-samples the real elevation field at a fixed number of
 * deterministic random points across the world (using the
 * "worldgen/geography" stream — a one-time global roll, not a per-position
 * query, so this stays consistent with the rest of World Genesis's
 * determinism model) and picks the empirical waterFraction-quantile as the
 * threshold. This is still an approximation (finite sample, and any given
 * seed's actual coverage will vary somewhat around the target) but it is
 * grounded in the real field the world will actually use, rather than an
 * assumption about its shape. See Known Limitations.
 */
export function generateGeographyConditions(
  rng: DeterministicRng,
  planetary: PlanetaryConditions,
  plates: readonly GeologicalPlate[],
  masterSeedRoot: string,
): GeographyConditions {
  const worldSize = planetary.worldSizeChunks * planetary.chunkSize;

  const samples: number[] = [];
  for (let i = 0; i < CALIBRATION_SAMPLES; i++) {
    const x = rng.nextFloat() * worldSize;
    const y = rng.nextFloat() * worldSize;
    samples.push(elevationAt(masterSeedRoot, planetary, plates, x, y));
  }
  samples.sort((a, b) => a - b);

  const quantileIndex = Math.min(
    samples.length - 1,
    Math.max(0, Math.floor(planetary.waterFraction * samples.length)),
  );
  const seaLevel = samples[quantileIndex];

  return { version: WORLD_GENERATION_VERSION, seaLevel };
}

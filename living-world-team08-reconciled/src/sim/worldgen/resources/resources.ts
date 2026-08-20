import { GeologicalPlate, ResourceDeposit, ResourceDepthBand, ResourcesConditions, SoilSample } from "../contracts/types";
import { clamp01, hash01 } from "../noise/valueNoise";

function depthBandFor(density01: number): ResourceDepthBand {
  if (density01 > 0.7) return "deep";
  if (density01 > 0.4) return "moderate";
  return "shallow";
}

/**
 * Deterministic resource deposit sampling (spec §14). Presence probability
 * is driven entirely by geological/environmental affinities (rock type,
 * geological activity, coastal proximity, slope, soil clay content) — never
 * a flat "scatter everywhere" roll. The presence roll itself is a per-cell
 * position hash (not a sequential RNG draw), so it stays chunk-order
 * independent like everything else in worldgen.
 */
export function sampleResourcesAt(
  masterSeedRoot: string,
  resources: ResourcesConditions,
  plate: GeologicalPlate | null,
  slope01: number,
  oceanProximity01: number,
  soil: SoilSample,
  isOcean: boolean,
  x: number,
  y: number,
): ResourceDeposit[] {
  if (isOcean) return [];

  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const deposits: ResourceDeposit[] = [];

  for (const def of resources.definitions) {
    const rockMatch = def.preferredRockTypes.length === 0 || (plate !== null && def.preferredRockTypes.includes(plate.rockType));
    const rockMultiplier = def.preferredRockTypes.length === 0 ? 1 : rockMatch ? 1.6 : 0.35;

    const probability = clamp01(
      (def.baseProbability01 +
        def.activityAffinity01 * (plate?.activity ?? 0) +
        def.coastalAffinity * oceanProximity01 +
        def.slopeAffinity01 * slope01 +
        def.soilClayAffinity01 * soil.clay01) *
        rockMultiplier,
    );

    const presenceRoll = hash01(masterSeedRoot, `resources/presence/${def.id}`, ix, iy);
    if (presenceRoll < probability) {
      const density01 = clamp01(
        0.25 + hash01(masterSeedRoot, `resources/density/${def.id}`, ix, iy) * 0.5 + (plate?.activity ?? 0) * 0.25,
      );
      deposits.push({ resourceId: def.id, density01, depthBand: depthBandFor(density01) });
    }
  }

  return deposits;
}

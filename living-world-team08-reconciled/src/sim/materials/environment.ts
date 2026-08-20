/**
 * MaterialEnvironmentContext — the ONLY shape Team 03 depends on from
 * Team 02's world-genesis domain (terrain/climate/geology/hydrology/biome).
 *
 * Team 02 is being implemented independently and in parallel. Rather than
 * importing any Team 02 generator/type directly (which would create a
 * hard, one-directional Team03 -> Team02-implementation dependency this
 * architecture forbids), decay/damage/structural code here only ever
 * consumes this narrow, optional, plain-data context. When Team 02 lands,
 * it maps its own richer world state onto this shape; until then, callers
 * (including Team 03's own tests) pass a mocked or neutral context.
 */
export interface WorldMaterialContext {
  readonly terrainType?: string;
  readonly temperatureC?: number;
  readonly humidity?: number;
  readonly waterExposure?: number;
  readonly biomeId?: string;
}

/** Alias kept for naming symmetry with the decay/damage subsystem that consumes it. */
export type MaterialEnvironmentContext = WorldMaterialContext;

/** Room-temperature, dry, unexposed baseline — used whenever no real environment context is available yet. */
export const NEUTRAL_MATERIAL_ENVIRONMENT: MaterialEnvironmentContext = {
  temperatureC: 20,
  humidity: 0.4,
  waterExposure: 0,
};

/** Clamps and fills in defaults for a possibly-partial environment context. */
export function resolveMaterialEnvironment(context: MaterialEnvironmentContext = {}): Required<
  Pick<MaterialEnvironmentContext, "temperatureC" | "humidity" | "waterExposure">
> & MaterialEnvironmentContext {
  const temperatureC = Number.isFinite(context.temperatureC)
    ? (context.temperatureC as number)
    : NEUTRAL_MATERIAL_ENVIRONMENT.temperatureC!;
  const humidity = clamp01(context.humidity ?? NEUTRAL_MATERIAL_ENVIRONMENT.humidity!);
  const waterExposure = clamp01(context.waterExposure ?? NEUTRAL_MATERIAL_ENVIRONMENT.waterExposure!);
  return { ...context, temperatureC, humidity, waterExposure };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

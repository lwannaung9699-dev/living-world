import { clamp, EcologicalEnvironment } from "./contracts";
import { InvalidStateError } from "../core/errors";

/**
 * EcologicalNiche — the generic, data-driven description of the conditions
 * a species needs to thrive. No real-world species are ever hardcoded here;
 * species data (owned by whichever team defines species) supplies these
 * values.
 */
export interface EcologicalNiche {
  readonly speciesId: string;
  readonly temperatureRange: readonly [number, number];
  readonly humidityRange: readonly [number, number];
  /** 0..1 minimum normalized water availability the species needs. */
  readonly waterRequirement: number;
  /** Abstract resource type ids this species can feed on (e.g. "plant", "prey_biomass"). */
  readonly foodRequirements: readonly string[];
  /** Abstract habitat tags this species needs present at its location. */
  readonly habitatRequirements: readonly string[];
  /** Optional named activity conditions (e.g. minimum light level), 0..1 each. */
  readonly activityConditions?: Readonly<Record<string, number>>;
  /** Optional named reproduction conditions (e.g. minimum season warmth), 0..1 each. */
  readonly reproductionConditions?: Readonly<Record<string, number>>;
}

export function validateNiche(value: unknown): asserts value is EcologicalNiche {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("EcologicalNiche must be an object");
  }
  const niche = value as Partial<EcologicalNiche>;
  if (typeof niche.speciesId !== "string" || niche.speciesId.length === 0) {
    throw new InvalidStateError("EcologicalNiche.speciesId must be a non-empty string");
  }
  if (
    !Array.isArray(niche.temperatureRange) ||
    niche.temperatureRange.length !== 2 ||
    niche.temperatureRange.some((n) => typeof n !== "number" || !Number.isFinite(n)) ||
    niche.temperatureRange[0] > niche.temperatureRange[1]
  ) {
    throw new InvalidStateError("EcologicalNiche.temperatureRange must be an ordered [min, max] pair");
  }
  if (
    !Array.isArray(niche.humidityRange) ||
    niche.humidityRange.length !== 2 ||
    niche.humidityRange.some((n) => typeof n !== "number" || !Number.isFinite(n)) ||
    niche.humidityRange[0] > niche.humidityRange[1]
  ) {
    throw new InvalidStateError("EcologicalNiche.humidityRange must be an ordered [min, max] pair");
  }
  if (typeof niche.waterRequirement !== "number" || niche.waterRequirement < 0) {
    throw new InvalidStateError("EcologicalNiche.waterRequirement must be a non-negative number");
  }
  if (!Array.isArray(niche.foodRequirements)) {
    throw new InvalidStateError("EcologicalNiche.foodRequirements must be an array");
  }
  if (!Array.isArray(niche.habitatRequirements)) {
    throw new InvalidStateError("EcologicalNiche.habitatRequirements must be an array");
  }
}

/** 1.0 at the range midpoint, tapering linearly to 0 at (and outside) the edges. */
function rangeSuitability(value: number, range: readonly [number, number]): number {
  const [min, max] = range;
  if (value >= min && value <= max) {
    const span = max - min;
    if (span <= 0) return 1;
    const mid = (min + max) / 2;
    const distanceFromMid = Math.abs(value - mid);
    return clamp(1 - distanceFromMid / (span / 2), 0, 1);
  }
  // Outside the range: decays over a margin equal to 25% of the range span (or a flat margin if span is 0).
  const margin = Math.max((max - min) * 0.25, 1);
  const distanceOutside = value < min ? min - value : value - max;
  return clamp(1 - distanceOutside / margin, 0, 1);
}

/**
 * Computes a 0..1 niche suitability score for a species at a given
 * environment, combining temperature, humidity, water, and general
 * habitat/resource signals. This is the single source of truth other
 * ecology subsystems (carrying capacity, population dynamics, migration)
 * use to know "how good is this place for this species right now".
 */
export function nicheSuitability(niche: EcologicalNiche, environment: EcologicalEnvironment): number {
  const temperatureFit = rangeSuitability(environment.temperature, niche.temperatureRange);
  const humidityFit = rangeSuitability(environment.humidity, niche.humidityRange);
  const waterFit = niche.waterRequirement <= 0 ? 1 : clamp(environment.waterAvailability / niche.waterRequirement);
  const habitatFit = clamp(environment.habitatQuality);

  // Geometric mean: any single badly-unsuited dimension pulls the whole score down,
  // rather than being washed out by an unrelated favorable dimension.
  const factors = [temperatureFit, humidityFit, waterFit, habitatFit].map((f) => Math.max(f, 0.0001));
  const product = factors.reduce((acc, f) => acc * f, 1);
  return clamp(Math.pow(product, 1 / factors.length));
}

/**
 * EcologyProvider — the adapter boundary to Team 05 (population ecology).
 * Team 06 NEVER duplicates population simulation (§31) — it only reads
 * ecological context that informs individual decisions (e.g. "is food
 * scarce around here right now", "how much predator pressure is there").
 *
 * If Team 05's real implementation is not yet available in the repository,
 * `StaticEcologyProvider` is a stand-in adapter so Team 06 is fully
 * runnable/testable today.
 */
export interface EcologyProvider {
  getFoodAvailability(regionId: string): number; // [0, 1]
  getPredatorPressure(regionId: string): number; // [0, 1]
  getPopulationDensity(regionId: string): number; // [0, 1]
  getHabitatQuality(regionId: string): number; // [0, 1]
}

export class StaticEcologyProvider implements EcologyProvider {
  constructor(
    private readonly defaults: {
      foodAvailability?: number;
      predatorPressure?: number;
      populationDensity?: number;
      habitatQuality?: number;
    } = {},
  ) {}

  getFoodAvailability(): number {
    return this.defaults.foodAvailability ?? 0.5;
  }

  getPredatorPressure(): number {
    return this.defaults.predatorPressure ?? 0.2;
  }

  getPopulationDensity(): number {
    return this.defaults.populationDensity ?? 0.3;
  }

  getHabitatQuality(): number {
    return this.defaults.habitatQuality ?? 0.6;
  }
}

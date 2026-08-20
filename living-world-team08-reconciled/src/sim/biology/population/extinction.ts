export interface ExtinctionCheckResult {
  readonly extinct: boolean;
  readonly speciesId: string;
  readonly populationSize: number;
  readonly tick: number;
}

/**
 * A species is considered extinct once its living population reaches zero,
 * or drops to/below any configured minimum viable population threshold.
 * Detection only — deleting historical data is explicitly out of scope
 * (the future History system needs the resulting event).
 */
export function checkExtinction(
  speciesId: string,
  populationSize: number,
  tick: number,
  minViablePopulation = 0,
): ExtinctionCheckResult {
  return {
    extinct: populationSize <= minViablePopulation,
    speciesId,
    populationSize,
    tick,
  };
}

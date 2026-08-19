import { clamp } from "./contracts";
import { PopulationData } from "./population";
import { EcologicalResource } from "./resources";
import { FoodWeb, foodWebConnectivity } from "./foodWeb";
import { EcologicalInteraction } from "./interactions";

/**
 * EcosystemMetrics — every field is derived directly from live simulation
 * state (populations, resources, the food web), never an author-set
 * "ecosystem health = 100" placeholder (project rule #19).
 */
export interface EcosystemMetrics {
  /** Shannon diversity index (natural log base) over species counts; 0 = one species only. */
  readonly speciesDiversity: number;
  /** Shannon diversity index over individual populations (distinct population records, even same-species). */
  readonly populationDiversity: number;
  /** 0..1 average resource fullness (availableAmount / capacity) across all resources. */
  readonly resourceStability: number;
  /** 0..1 food web connectivity (see foodWeb.ts). */
  readonly foodWebConnectivity: number;
  /** Ratio of total predator biomass proxy (count) to total prey biomass proxy; 1 = balanced by this simple proxy. */
  readonly predatorPreyBalance: number;
  /** Sum of all population counts across the ecosystem, a coarse total-biomass proxy. */
  readonly totalBiomass: number;
  /** 0..1 aggregate ecosystem pressure: how close populations are running to their resource limits, on average. */
  readonly ecosystemPressure: number;
}

function shannonDiversity(counts: readonly number[]): number {
  const total = counts.reduce((sum, c) => sum + c, 0);
  if (total <= 0 || counts.length <= 1) return 0;
  let index = 0;
  for (const count of counts) {
    if (count <= 0) continue;
    const p = count / total;
    index -= p * Math.log(p);
  }
  return index;
}

export interface EcosystemMetricsInputs {
  readonly populations: readonly PopulationData[];
  readonly resources: readonly EcologicalResource[];
  readonly foodWeb: FoodWeb;
  readonly interactions: readonly EcologicalInteraction[];
  readonly carryingCapacityByPopulation: Readonly<Record<string, number>>;
}

export function computeEcosystemMetrics(inputs: EcosystemMetricsInputs): EcosystemMetrics {
  const { populations, resources, foodWeb, interactions, carryingCapacityByPopulation } = inputs;

  const speciesCounts = new Map<string, number>();
  for (const population of populations) {
    speciesCounts.set(population.speciesId, (speciesCounts.get(population.speciesId) ?? 0) + population.count);
  }

  const speciesDiversity = shannonDiversity([...speciesCounts.values()]);
  const populationDiversity = shannonDiversity(populations.map((p) => p.count));

  const resourceStability =
    resources.length === 0
      ? 1
      : resources.reduce((sum, r) => sum + (r.capacity > 0 ? r.availableAmount / r.capacity : 0), 0) / resources.length;

  const predatorIds = new Set(interactions.filter((i) => i.type === "predation").map((i) => i.sourceId));
  const preyIds = new Set(interactions.filter((i) => i.type === "predation").map((i) => i.targetId));

  const predatorBiomass = populations.filter((p) => predatorIds.has(p.populationId)).reduce((sum, p) => sum + p.count, 0);
  const preyBiomass = populations.filter((p) => preyIds.has(p.populationId)).reduce((sum, p) => sum + p.count, 0);
  const predatorPreyBalance = preyBiomass > 0 ? predatorBiomass / preyBiomass : predatorBiomass > 0 ? Infinity : 0;

  const totalBiomass = populations.reduce((sum, p) => sum + p.count, 0);

  const pressures = populations.map((p) => {
    const capacity = carryingCapacityByPopulation[p.populationId] ?? 0;
    return capacity > 0 ? clamp(p.count / capacity) : p.count > 0 ? 1 : 0;
  });
  const ecosystemPressure = pressures.length === 0 ? 0 : pressures.reduce((s, v) => s + v, 0) / pressures.length;

  return {
    speciesDiversity,
    populationDiversity,
    resourceStability: clamp(resourceStability),
    foodWebConnectivity: foodWebConnectivity(foodWeb),
    predatorPreyBalance: Number.isFinite(predatorPreyBalance) ? predatorPreyBalance : 1e9,
    totalBiomass,
    ecosystemPressure,
  };
}

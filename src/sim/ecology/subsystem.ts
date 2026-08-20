import { WorldState } from "../core/state/worldState";
import { RngStreamRegistry } from "../core/rng/rngStreamRegistry";
import { SubsystemTickFn } from "../core/simulation/simulation";
import { clamp, BiologicalPopulation, EcologicalEnvironment, DEFAULT_ECOLOGICAL_ENVIRONMENT, defaultBiologicalPopulation } from "./contracts";
import { PopulationData, isExtinct } from "./population";
import { EcologicalResource, regenerateResource, consumeResource } from "./resources";
import { EcologicalNiche, nicheSuitability } from "./niche";
import { computeCarryingCapacity } from "./carryingCapacity";
import { computeCompetitionPressure, CompetitorOverlap } from "./competition";
import { EcologicalInteraction } from "./interactions";
import { resolveConsumption, ConsumptionDemand } from "./consumption";
import { computePredationDemand } from "./predation";
import { computeHerbivoryDemand } from "./herbivory";
import { updatePopulation } from "./dynamics";
import { evaluateMigrationPressure, MigrationProposal } from "./migration";
import { updateDiseasePressure, diseaseMortalityFraction, DiseaseState } from "./disease";
import {
  EcologicalDisturbance,
  applyDisturbanceToResource,
  applyDisturbanceToPopulation,
  tickDisturbanceDuration,
} from "./disturbance";
import { foodWebFromInteractions, FoodWebNode } from "./foodWeb";
import { computeEcosystemMetrics } from "./metrics";
import { detectExtinctions, detectResourceCollapse, detectFoodWebDisruption, detectSpeciationSignal, EcologicalEvent } from "./events";
import { ECOLOGY_MODULE_KEY, EcologyModuleState, readEcologyState, ECOLOGY_STATE_CONTRACT_VERSION } from "./state";
import { buildRegionIndex, populationsInSameRegion } from "./spatial";
import { computeSelectionFeedback, SelectionFeedbackSignal } from "./selectionFeedback";

/**
 * Everything Team 02 / Team 04 would eventually feed in, expressed as
 * abstract lookups Team 05 consumes without importing either team's
 * concrete implementation (project rules #24-25).
 */
export interface EcologyTickContext {
  /** Per-location environmental context. Locations missing an entry fall back to DEFAULT_ECOLOGICAL_ENVIRONMENT. */
  readonly environmentByLocation?: Readonly<Record<string, EcologicalEnvironment>>;
  /** Per-population biological summary (traits/fitness). Populations missing an entry fall back to neutral defaults. */
  readonly biologicalOverrides?: Readonly<Record<string, BiologicalPopulation>>;
  /** Per-species per-capita food-biomass requirement used by carrying capacity. Defaults to 1. */
  readonly resourceRequirementBySpecies?: Readonly<Record<string, number>>;
  /** Run migration-pressure evaluation every N ticks (a slow process, project rule #14). Default 5. */
  readonly migrationUpdateEveryNTicks?: number;
  /** Run disease-pressure updates every N ticks (a medium process). Default 1 (every tick). */
  readonly diseaseUpdateEveryNTicks?: number;
  /** Average trait-variance threshold above which a SpeciationSignal is emitted for a population. Default 0.5. */
  readonly speciationDivergenceThreshold?: number;
  /**
   * Optional source of consumption demands from outside ecology (e.g. Team
   * 09 Economy harvesting settlements) — kept as an injected function
   * rather than an import so `src/sim/ecology` never depends on another
   * team's module (project rules #24-25). Each returned demand's `targetId`
   * must be an ecology `resourceId`; it is resolved together with
   * herbivory/predation demands via the same fair-share `resolveConsumption`
   * pass, so external and biological consumers compete for the same supply
   * consistently. The composition root (defaultSimulationPipeline.ts) is
   * responsible for wiring this to a real cross-team adapter. Defaults to
   * no external demand.
   */
  readonly externalDemandsProvider?: (state: WorldState) => readonly ConsumptionDemand[];
}

function environmentFor(location: string, context: EcologyTickContext): EcologicalEnvironment {
  return context.environmentByLocation?.[location] ?? DEFAULT_ECOLOGICAL_ENVIRONMENT;
}

function biologyFor(population: PopulationData, context: EcologyTickContext): BiologicalPopulation {
  return context.biologicalOverrides?.[population.populationId] ?? defaultBiologicalPopulation(population.populationId, population.speciesId);
}

function resourceRequirementFor(speciesId: string, context: EcologyTickContext): number {
  return context.resourceRequirementBySpecies?.[speciesId] ?? 1;
}

const OPEN_NICHE_SUITABILITY = 1;

/**
 * Builds the ecology SubsystemTickFn to register on SimulationContext.subsystems.
 *
 * Determinism & isolation (project rules #22): every population's own
 * stochastic draws come from `rng.fork("ecology/population/<id>")`, and
 * every interaction's stochastic draws come from
 * `rng.fork("ecology/interaction/<id>")` -- both keyed by stable id, never
 * by iteration order -- so simulating population A before population B (or
 * in any other order) never changes B's result. All resource/population
 * consumption is resolved in one aggregated pass (see consumption.ts)
 * rather than applied incrementally per-interaction, for the same reason.
 */
export function createEcologySubsystem(context: EcologyTickContext = {}): SubsystemTickFn {
  const migrationEvery = Math.max(1, context.migrationUpdateEveryNTicks ?? 5);
  const diseaseEvery = Math.max(1, context.diseaseUpdateEveryNTicks ?? 1);

  return (state: WorldState, rng: RngStreamRegistry): WorldState => {
    const ecology = readEcologyState(state.modules);
    const tick = state.tick;

    // ---- 1. Fast process: resource regeneration, every tick. -------------
    const regeneratedResources: Record<string, EcologicalResource> = {};
    for (const id of Object.keys(ecology.resources).sort()) {
      const resource = ecology.resources[id];
      regeneratedResources[id] = regenerateResource(resource, environmentFor(resource.location, context));
    }

    // ---- 2. Disturbances: apply, then age them down. ----------------------
    const disturbances = Object.values(ecology.disturbances).sort((a, b) => a.disturbanceId.localeCompare(b.disturbanceId));

    let disturbedResources = regeneratedResources;
    for (const disturbance of disturbances) {
      const next: Record<string, EcologicalResource> = {};
      for (const [id, resource] of Object.entries(disturbedResources)) {
        next[id] = applyDisturbanceToResource(resource, disturbance);
      }
      disturbedResources = next;
    }

    let disturbedPopulations: Record<string, PopulationData> = { ...ecology.populations };
    const disturbanceDeathsByPopulation: Record<string, number> = {};
    for (const disturbance of disturbances) {
      for (const id of Object.keys(disturbedPopulations).sort()) {
        const result = applyDisturbanceToPopulation(disturbedPopulations[id], disturbance);
        disturbedPopulations[id] = result.population;
        if (result.deaths > 0) {
          disturbanceDeathsByPopulation[id] = (disturbanceDeathsByPopulation[id] ?? 0) + result.deaths;
        }
      }
    }

    const nextDisturbances: Record<string, EcologicalDisturbance> = {};
    for (const disturbance of disturbances) {
      const advanced = tickDisturbanceDuration(disturbance);
      if (advanced) nextDisturbances[advanced.disturbanceId] = advanced;
    }

    // ---- 3. Consumption demands (predation / herbivory / resource_consumption / scavenging). ----
    const interactionIds = Object.keys(ecology.interactions).sort();
    const demands: ConsumptionDemand[] = [];

    for (const interactionId of interactionIds) {
      const interaction = ecology.interactions[interactionId];
      const interactionRng = rng.fork(`ecology/interaction/${interactionId}`);
      const source = disturbedPopulations[interaction.sourceId];
      if (!source || isExtinct(source)) continue;

      if (interaction.type === "predation") {
        const traits = biologyFor(source, context).averageTraits;
        demands.push(computePredationDemand(interaction, source, traits, interactionRng));
      } else if (interaction.type === "herbivory" || interaction.type === "resource_consumption" || interaction.type === "scavenging") {
        const traits = biologyFor(source, context).averageTraits;
        demands.push(computeHerbivoryDemand(interaction, source, traits, interactionRng));
      }
    }

    // External (non-biological) demand, e.g. Team 09 settlements harvesting
    // — only ever targets resources (never populations), resolved fairly
    // alongside herbivory/predation in the same pass. See EcologyTickContext.
    if (context.externalDemandsProvider) {
      for (const demand of context.externalDemandsProvider(state)) {
        if (demand.amount > 0 && disturbedResources[demand.targetId]) {
          demands.push(demand);
        }
      }
    }

    const availableByTarget: Record<string, number> = {};
    for (const id of Object.keys(disturbedPopulations)) availableByTarget[id] = disturbedPopulations[id].count;
    for (const id of Object.keys(disturbedResources)) availableByTarget[id] = disturbedResources[id].availableAmount;

    const consumption = resolveConsumption(demands, availableByTarget);

    const fedResources: Record<string, EcologicalResource> = {};
    for (const [id, resource] of Object.entries(disturbedResources)) {
      const removed = consumption.removedByTarget[id] ?? 0;
      fedResources[id] = removed > 0 ? consumeResource(resource, removed).resource : { ...resource, consumptionRate: 0 };
    }

    // ---- 4. Disease pressure (medium process, gated by cadence). ---------
    const runDisease = tick % diseaseEvery === 0;
    const diseases: Record<string, DiseaseState> = {};
    for (const id of Object.keys(ecology.diseases).sort()) {
      const disease = ecology.diseases[id];
      const population = disturbedPopulations[disease.populationId];
      if (!population) continue; // population is gone; disease record naturally drops out
      const env = environmentFor(population.location, context);
      diseases[id] = runDisease ? updateDiseasePressure(disease, population, env) : disease;
    }
    const diseaseMortalityByPopulation: Record<string, number> = {};
    for (const disease of Object.values(diseases)) {
      diseaseMortalityByPopulation[disease.populationId] = clamp(
        (diseaseMortalityByPopulation[disease.populationId] ?? 0) + diseaseMortalityFraction(disease),
      );
    }

    // ---- 5. Per-population update: niche suitability, competition, carrying capacity, dynamics. ----
    const populationIds = Object.keys(disturbedPopulations).sort();
    const nextPopulations: Record<string, PopulationData> = {};
    const carryingCapacityByPopulation: Record<string, number> = {};
    const predationPressureByPopulation: Record<string, number> = {};
    const selectionFeedback: SelectionFeedbackSignal[] = [];

    // Built once per tick: region-local lookups below are O(region size),
    // never an O(world-size) scan repeated per population (project rule
    // #23 / Notion's "avoid O(world-size) scans" requirement).
    const regionIndex = buildRegionIndex(Object.values(disturbedPopulations), Object.values(fedResources));
    const resourcesByLocation: Record<string, EcologicalResource[]> = {};
    for (const resource of Object.values(fedResources)) {
      (resourcesByLocation[resource.location] ??= []).push(resource);
    }

    for (const id of populationIds) {
      const population = disturbedPopulations[id];
      if (isExtinct(population)) {
        nextPopulations[id] = population;
        carryingCapacityByPopulation[id] = 0;
        continue;
      }

      const niche: EcologicalNiche | undefined = ecology.niches[population.speciesId];
      const environment = environmentFor(population.location, context);
      const suitability = niche ? nicheSuitability(niche, environment) : OPEN_NICHE_SUITABILITY;

      const prevCount = population.count;
      const predationLosses = consumption.removedByTarget[id] ?? 0;
      predationPressureByPopulation[id] = prevCount > 0 ? clamp(predationLosses / prevCount) : 0;

      const competitors: CompetitorOverlap[] = niche
        ? populationsInSameRegion(regionIndex, population)
            .map((otherId) => disturbedPopulations[otherId])
            .filter((other) => !isExtinct(other))
            .map((other) => {
              const otherNiche = ecology.niches[other.speciesId];
              const overlap = otherNiche ? nicheOverlap(niche, otherNiche) : 0;
              return { population: other, overlap };
            })
        : [];

      const carryingCapacity = niche
        ? computeCarryingCapacity({
            niche,
            environment,
            availableResources: (resourcesByLocation[population.location] ?? []).filter((r) =>
              niche.foodRequirements.includes(r.resourceType),
            ),
            perCapitaResourceRequirement: resourceRequirementFor(population.speciesId, context),
            predationPressure: predationPressureByPopulation[id],
            competitionPressure: 0, // filled in below once competitionResult is known; capacity uses a first pass without it to avoid a circular dependency
            diseasePressure: diseaseMortalityByPopulation[id] ?? 0,
          })
        : Number.POSITIVE_INFINITY;
      carryingCapacityByPopulation[id] = carryingCapacity;

      const competitionResult = computeCompetitionPressure({ population, carryingCapacity, competitors });

      const gained = consumption.gainedByConsumer[id] ?? 0;
      const energyGainedPerCapita = prevCount > 0 ? gained / prevCount : 0;

      const populationRng = rng.fork(`ecology/population/${id}`);
      const update = updatePopulation(
        {
          population,
          carryingCapacity,
          environmentSuitability: suitability,
          competitionPressure: competitionResult.totalPressure,
          predationLosses,
          diseaseMortalityFraction: diseaseMortalityByPopulation[id] ?? 0,
          energyGainedPerCapita,
        },
        populationRng,
      );

      nextPopulations[id] = update.population;

      // ---- Selection-pressure feedback for Team 04 (see selectionFeedback.ts). ----
      selectionFeedback.push(
        computeSelectionFeedback({
          previousPopulation: population,
          nextPopulation: update.population,
          environmentSuitability: suitability,
          tick,
        }),
      );
    }

    // ---- 6. Migration pressure (slow process, gated by cadence). --------
    const runMigration = tick % migrationEvery === 0;
    let migrationProposals: readonly MigrationProposal[] = ecology.migrationProposals;
    if (runMigration) {
      const proposals: MigrationProposal[] = [];
      for (const id of populationIds) {
        const population = nextPopulations[id];
        if (isExtinct(population)) continue;
        const niche = ecology.niches[population.speciesId];
        if (!niche) continue; // migration pressure needs niche data to be meaningful
        proposals.push(
          evaluateMigrationPressure({
            population,
            niche,
            environment: environmentFor(population.location, context),
            carryingCapacity: carryingCapacityByPopulation[id],
            predationPressure: predationPressureByPopulation[id] ?? 0,
          }),
        );
      }
      migrationProposals = proposals;
    }

    // ---- 7. Food web: rebuilt each tick from current nodes + interactions. ----
    const nodes: FoodWebNode[] = [
      ...populationIds.map((id): FoodWebNode => ({ id, kind: "population" })),
      ...Object.keys(fedResources)
        .sort()
        .map((id): FoodWebNode => ({ id, kind: "resource" })),
    ];
    const foodWeb = foodWebFromInteractions(nodes, Object.values(ecology.interactions));

    // ---- 8. Events: extinctions, resource collapse, food-web disruption. ----
    const events: EcologicalEvent[] = [];
    const extinctions = detectExtinctions(Object.values(nextPopulations), tick);
    events.push(...extinctions);
    const collapses = detectResourceCollapse(Object.values(fedResources), tick);
    events.push(...collapses);
    events.push(
      ...detectFoodWebDisruption(
        foodWeb,
        extinctions.map((e) => e.populationId),
        collapses.map((e) => e.resourceId),
        tick,
      ),
    );
    for (const id of populationIds) {
      const signal = detectSpeciationSignal(nextPopulations[id], tick, context.speciationDivergenceThreshold);
      if (signal) events.push(signal);
    }

    // ---- 9. Ecosystem metrics, derived from final state. -----------------
    const metrics = computeEcosystemMetrics({
      populations: Object.values(nextPopulations),
      resources: Object.values(fedResources),
      foodWeb,
      interactions: Object.values(ecology.interactions),
      carryingCapacityByPopulation,
    });

    const nextEcologyState: EcologyModuleState = {
      contractVersion: ECOLOGY_STATE_CONTRACT_VERSION,
      populations: nextPopulations,
      resources: fedResources,
      niches: ecology.niches,
      interactions: ecology.interactions,
      foodWeb,
      diseases,
      disturbances: nextDisturbances,
      migrationProposals,
      events,
      metrics,
      selectionFeedback,
    };

    return {
      ...state,
      modules: { ...state.modules, [ECOLOGY_MODULE_KEY]: nextEcologyState },
    };
  };
}

/** Jaccard-style overlap (0..1) between two species' food requirements, used as the interspecific-competition weight. */
function nicheOverlap(a: EcologicalNiche, b: EcologicalNiche): number {
  const foodA = new Set(a.foodRequirements);
  const foodB = new Set(b.foodRequirements);
  const union = new Set([...foodA, ...foodB]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const item of foodA) if (foodB.has(item)) intersection++;
  return intersection / union.size;
}

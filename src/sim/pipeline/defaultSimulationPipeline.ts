import type { SimulationContext, SubsystemTickFn } from "../core/simulation/simulation";
import { tickN } from "../core/simulation/simulation";
import type { WorldState } from "../core/state/worldState";
import type { WorldSeed } from "../core/seed/worldSeed";
import { createBiologySubsystem } from "../biology/tick/biologySubsystem";
import { createGenesisWorldState } from "../worldgen";
import type { BiologySubsystemOptions } from "../biology/tick/biologySubsystem";
import type { BiologyModuleState } from "../biology/tick/biologyModuleState";
import type { SpeciesConfig } from "../biology/species/speciesConfig";
import { createEcologySubsystem } from "../ecology/subsystem";
import type { EcologyTickContext } from "../ecology/subsystem";
import type { EcologyModuleState } from "../ecology/state";
import type { EcologicalResource } from "../ecology/resources";
import { createCreatureSubsystemTick, getCreatureModuleState, StaticEnvironmentQuery } from "../creature/tick/creatureTick";
import type { EnvironmentQuery } from "../creature/tick/creatureTick";
import { StaticBiologyProvider } from "../creature/integration/biologyAdapter";
import type { BiologyProvider } from "../creature/integration/biologyAdapter";
import type { EcologyProvider } from "../creature/integration/ecologyAdapter";
import { createSocietyTick } from "../society/tick";
import type {
  BiologyAdapter,
  EcologyAdapter,
  IndividualSnapshot,
  KinshipFact,
  SocietyAdapters,
} from "../society/contracts";
import { politicsTick } from "../politics/tick";
import type { CreatureState } from "../creature/state/creatureState";
import { createEconomySubsystemTick } from "../economy/tick";
import type { EconomyTickOptions } from "../economy/tick";

/** Configuration for the canonical Team 01–08 tick pipeline. */
export interface DefaultSimulationPipelineOptions {
  /** Static Team 04 species content consumed by the biology subsystem. */
  readonly speciesRegistry?: Readonly<Record<string, SpeciesConfig>>;
  /** Environment resolver used by Team 04 biology. */
  readonly biologyOptions?: BiologySubsystemOptions;
  /** Context/adapters supplied to Team 05 ecology. */
  readonly ecologyContext?: EcologyTickContext;
  /** Team 06 biology provider used for individual decisions. */
  readonly creatureBiology?: BiologyProvider;
  /** Team 06 ecology provider used for individual decisions. */
  readonly creatureEcology?: EcologyProvider;
  /** Team 06 environment adapter. */
  readonly creatureEnvironment?: EnvironmentQuery;
  /** Optional explicit Team 07 adapters. Defaults to state-backed adapters below. */
  readonly societyAdapters?: SocietyAdapters;
  /** Optional explicit Team 09 adapters/config. Defaults to state-backed adapters reading real Team 05/07 state. */
  readonly economyOptions?: EconomyTickOptions;
  /** Foundation tick duration override. */
  readonly tickDurationSeconds?: number;
}

/**
 * Builds the canonical per-tick pipeline for the currently implemented teams.
 *
 * Team 02 Worldgen is a one-time bootstrap (`createGenesisWorldState`) rather
 * than a normal tick subsystem. Team 03 Materials/Objects currently exposes
 * pure domain APIs and has no tick function to append here.
 *
 * Per tick, the order is Biology → Ecology → Creature → Society → Politics.
 * Each subsystem receives the state produced by the previous subsystem.
 */
/**
 * Team 03's optional per-tick boundary. Materials and objects are currently
 * pure APIs, so callers can supply a state transformation here when they need
 * resource decay, damage, extraction, or structural updates in the main loop.
 */
export type MaterialsObjectsStep = SubsystemTickFn;

/** Options for the complete bootstrap + tick runner. */
export interface FullSimulationPipelineOptions extends DefaultSimulationPipelineOptions {
  readonly materialsObjectsStep?: MaterialsObjectsStep;
}

/** Result of composing the complete Team 01–08 simulation lifecycle. */
export interface FullSimulationPipeline {
  readonly context: SimulationContext;
  readonly createInitialState: (seed: WorldSeed) => WorldState;
  readonly run: (seed: WorldSeed, ticks: number) => WorldState;
  readonly runFromState: (state: WorldState, ticks: number) => WorldState;
}

export function createDefaultSimulationPipeline(
  options: DefaultSimulationPipelineOptions = {},
): SimulationContext {
  const creatureBiology = options.creatureBiology ?? new StaticBiologyProvider();
  const environment = options.creatureEnvironment ?? new StaticEnvironmentQuery();
  const stateBackedEcology = options.creatureEcology ? undefined : new StateBackedEcologyProvider();
  const creatureEcology = options.creatureEcology ?? stateBackedEcology!;
  const societyAdapters = options.societyAdapters ?? createStateBackedSocietyAdapters(environment);

  const creatureSubsystem = createCreatureSubsystemTick(creatureBiology, creatureEcology, environment);
  const stateAwareCreatureSubsystem: SubsystemTickFn = stateBackedEcology
    ? (state: WorldState, rng) => {
        stateBackedEcology.setState(state);
        return creatureSubsystem(state, rng);
      }
    : creatureSubsystem;

  const subsystems: SubsystemTickFn[] = [
    createBiologySubsystem(options.speciesRegistry ?? {}, options.biologyOptions),
    createEcologySubsystem(options.ecologyContext),
    stateAwareCreatureSubsystem,
    createSocietyTick({ adapters: societyAdapters }),
    politicsTick,
    createEconomySubsystemTick(options.economyOptions),
  ];

  return {
    tickDurationSeconds: options.tickDurationSeconds,
    subsystems,
  };
}

/**
 * Composes the complete Team 01–08 lifecycle.
 *
 * Worldgen (Team 02) runs once before tick zero. Team 03's optional stage is
 * inserted first in every tick, followed by the canonical Team 04–08 order.
 * The returned runner makes the lifecycle explicit and prevents callers from
 * accidentally ticking an uninitialized non-genesis WorldState.
 */
export function createFullSimulationPipeline(
  options: FullSimulationPipelineOptions = {},
): FullSimulationPipeline {
  const tickPipeline = createDefaultSimulationPipeline(options);
  const materialsObjectsStep = options.materialsObjectsStep ?? ((state: WorldState) => state);
  const context: SimulationContext = {
    tickDurationSeconds: tickPipeline.tickDurationSeconds,
    subsystems: [materialsObjectsStep, ...(tickPipeline.subsystems ?? [])],
  };

  const createInitialState = (seed: WorldSeed): WorldState => createGenesisWorldState(seed);
  const runFromState = (state: WorldState, ticks: number): WorldState => tickN(state, ticks, context);
  const run = (seed: WorldSeed, ticks: number): WorldState => runFromState(createInitialState(seed), ticks);

  return { context, createInitialState, run, runFromState };
}

/**
 * Reads Team 05's actual EcologyModuleState for Team 06's decision API.
 * The state is refreshed by the bridge subsystem immediately after Ecology
 * runs, so Creature sees the current tick's resources and populations.
 */
export class StateBackedEcologyProvider implements EcologyProvider {
  private state: WorldState | undefined;

  setState(state: WorldState): void {
    this.state = state;
  }

  getFoodAvailability(regionId: string): number {
    const resources = resourcesAt(this.state, regionId);
    if (resources.length === 0) return 0.5;
    const edible = resources.filter((resource) => resource.resourceType !== "mineral");
    return averageAvailability(edible.length > 0 ? edible : resources);
  }

  getPredatorPressure(regionId: string): number {
    const module = ecologyModule(this.state);
    const localPopulationIds = new Set(
      objectValues(module?.populations)
        .filter((population) => population.location === regionId)
        .map((population) => population.populationId),
    );
    const local = objectValues(module?.interactions).filter(
      (interaction) =>
        interaction.type === "predation" &&
        (localPopulationIds.has(interaction.sourceId) || localPopulationIds.has(interaction.targetId)),
    );
    return clamp01(local.reduce((sum, interaction) => sum + interaction.strength, 0));
  }

  getPopulationDensity(regionId: string): number {
    const populations = objectValues(ecologyModule(this.state)?.populations).filter(
      (population) => population.location === regionId,
    );
    const count = populations.reduce((sum, population) => sum + population.count, 0);
    return clamp01(count / (count + 50));
  }

  getHabitatQuality(regionId: string): number {
    return this.getFoodAvailability(regionId);
  }
}

function createStateBackedSocietyAdapters(environment: EnvironmentQuery): SocietyAdapters {
  const biology: BiologyAdapter = {
    listKinshipFacts(state: WorldState): readonly KinshipFact[] {
      const entities = objectValues(biologyModule(state)?.entities);
      const facts: KinshipFact[] = [];
      for (const entity of entities) {
        for (const parentId of entity.parentIds) {
          facts.push({ a: parentId, b: entity.id, relation: "parent" });
        }
      }
      return facts.sort((a, b) => `${a.a}:${a.b}`.localeCompare(`${b.a}:${b.b}`));
    },
  };

  const ecology: EcologyAdapter = {
    listLocationResources(state: WorldState) {
      const resources = objectValues(ecologyModule(state)?.resources);
      const byLocation = new Map<string, { available: number; capacity: number }>();
      for (const resource of resources) {
        const prior = byLocation.get(resource.location) ?? { available: 0, capacity: 0 };
        byLocation.set(resource.location, {
          available: prior.available + resource.availableAmount,
          capacity: prior.capacity + resource.capacity,
        });
      }
      return [...byLocation.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([locationId, value]) => ({
          locationId,
          abundance: value.capacity <= 0 ? 0 : clamp01(value.available / value.capacity),
        }));
    },
  };

  return {
    npc: {
      listIndividuals(state: WorldState): readonly IndividualSnapshot[] {
        const creatures = getCreatureModuleState(state).creatures;
        return Object.values(creatures)
          .sort((a, b) => a.creatureId.localeCompare(b.creatureId))
          .map((creature) => creatureToIndividual(creature, environment));
      },
    },
    biology,
    ecology,
  };
}

function creatureToIndividual(creature: CreatureState, environment: EnvironmentQuery): IndividualSnapshot {
  return {
    id: creature.creatureId,
    alive: creature.health > 0,
    locationId: environment.getRegionId(creature),
    traits: {
      sociability: clamp01(creature.personality.sociability),
      aggression: clamp01(creature.personality.aggression),
      ambition: clamp01(
        (creature.personality.boldness + creature.personality.riskTolerance + creature.personality.independence) / 3,
      ),
      empathy: clamp01(1 - creature.personality.aggression),
    },
  };
}

function objectValues<T>(value: Readonly<Record<string, T>> | undefined): T[] {
  return value ? Object.values(value) : [];
}

function biologyModule(state: WorldState): BiologyModuleState | undefined {
  const value = state.modules.biology;
  return value && typeof value === "object" ? (value as BiologyModuleState) : undefined;
}

function ecologyModule(state: WorldState | undefined): EcologyModuleState | undefined {
  const value = state?.modules.ecology;
  return value && typeof value === "object" ? (value as EcologyModuleState) : undefined;
}

function resourcesAt(state: WorldState | undefined, regionId: string): EcologicalResource[] {
  return objectValues(ecologyModule(state)?.resources).filter((resource) => resource.location === regionId);
}

function averageAvailability(resources: readonly EcologicalResource[]): number {
  if (resources.length === 0) return 0.5;
  const available = resources.reduce((sum, resource) => sum + resource.availableAmount, 0);
  const capacity = resources.reduce((sum, resource) => sum + resource.capacity, 0);
  return capacity <= 0 ? 0 : clamp01(available / capacity);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}


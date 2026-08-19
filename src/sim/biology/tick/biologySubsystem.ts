import { WorldState } from "../../core/state/worldState";
import { RngStreamRegistry } from "../../core/rng/rngStreamRegistry";
import { SubsystemTickFn } from "../../core/simulation/simulation";
import { BioEntity } from "../entity/bioEntity";
import { checkDeath, nextLifeStage } from "../entity/lifeCycle";
import { stepMetabolism } from "../entity/metabolism";
import { GenomeData } from "../genetics/geneTypes";
import { expressPhenotype } from "../traits/phenotype";
import { computeFitness } from "../population/fitness";
import { applySelection, SelectionCandidate } from "../population/selection";
import { computeAdaptationMetrics } from "../population/adaptation";
import { checkExtinction } from "../population/extinction";
import { reproduceAsexual, reproduceSexual, isEligibleToReproduce } from "../reproduction/reproduction";
import {
  adaptationEvent,
  BiologicalEvent,
  birthEvent,
  deathEvent,
  extinctionEvent,
  mutationEvent,
  reproductionEvent,
} from "../events/biologicalEvents";
import { SpeciesConfig } from "../species/speciesConfig";
import { BiologicalEnvironment } from "../environment/biologicalEnvironment";
import { canonicalStringify } from "../../core/serialization/canonicalJson";
import { BIOLOGY_MODULE_KEY, BiologyModuleState, readBiologyModuleState } from "./biologyModuleState";

export interface BiologySubsystemOptions {
  /** Resolves the BiologicalEnvironment for a given tick's WorldState. Defaults to the neutral environment (Team 02 will eventually supply this). */
  readonly resolveEnvironment?: (state: WorldState) => BiologicalEnvironment;
}

/**
 * Builds the Team 04 SubsystemTickFn: a pure function of (WorldState,
 * RngStreamRegistry) -> WorldState, suitable for SimulationContext.subsystems
 * in Team 01's tick()/tickN() pipeline.
 *
 * `speciesRegistry` is static simulation content (not part of WorldState) —
 * the same pattern Foundation uses for SimulationContext itself.
 *
 * Each species gets its own isolated RNG namespace subtree
 * (`biology/<speciesId>/...`), so changing one species' population size or
 * behavior never perturbs another species' random sequence.
 */
export function createBiologySubsystem(
  speciesRegistry: Readonly<Record<string, SpeciesConfig>>,
  options: BiologySubsystemOptions = {},
): SubsystemTickFn {
  return (state: WorldState, rng: RngStreamRegistry): WorldState => {
    const prior = readBiologyModuleState(state.modules);
    const environment = options.resolveEnvironment ? options.resolveEnvironment(state) : {};
    const events: BiologicalEvent[] = [];

    const entities: Record<string, BioEntity> = { ...prior.entities };
    const genomes: Record<string, GenomeData> = { ...prior.genomes };
    let nextEntitySeqBySpecies: Record<string, number> = { ...prior.nextEntitySeqBySpecies };
    let nextGenomeSeqBySpecies: Record<string, number> = { ...prior.nextGenomeSeqBySpecies };

    function allocateEntityId(speciesId: string): string {
      const seq = nextEntitySeqBySpecies[speciesId] ?? 0;
      nextEntitySeqBySpecies = { ...nextEntitySeqBySpecies, [speciesId]: seq + 1 };
      return `${speciesId}-e${seq}`;
    }

    function allocateGenomeId(speciesId: string): string {
      const seq = nextGenomeSeqBySpecies[speciesId] ?? 0;
      nextGenomeSeqBySpecies = { ...nextGenomeSeqBySpecies, [speciesId]: seq + 1 };
      return `${speciesId}-g${seq}`;
    }

    for (const species of Object.values(speciesRegistry)) {
      const priorAlive = Object.values(prior.entities).filter(
        (e) => e.speciesId === species.speciesId && e.lifeStage !== "dead",
      ).length;

      const mortalityRng = rng.fork(`biology/${species.speciesId}/mortality`);
      const selectionRng = rng.fork(`biology/${species.speciesId}/selection`);
      const reproductionRng = rng.fork(`biology/${species.speciesId}/reproduction`);
      const mutationRng = rng.fork(`biology/${species.speciesId}/mutation`);

      // 1. Age, metabolism, life-stage progression, hard-limit death checks.
      const livingIds = Object.values(entities)
        .filter((e) => e.speciesId === species.speciesId && e.lifeStage !== "dead")
        .map((e) => e.id)
        .sort();

      for (const id of livingIds) {
        const entity = entities[id];
        const aged = { ...entity, age: entity.age + 1 };
        const { energy } = stepMetabolism(aged.energy, aged.mass, environment);
        const withEnergy = { ...aged, energy };
        const withStage = { ...withEnergy, lifeStage: nextLifeStage(withEnergy, species.lifeCycle) };

        const death = checkDeath(withStage, species.lifeCycle, mortalityRng);
        if (death.shouldDie) {
          entities[id] = { ...withStage, lifeStage: "dead", deathTick: state.tick };
          events.push(deathEvent(state.tick, id, species.speciesId, death.cause ?? "poor-health"));
        } else {
          entities[id] = withStage;
        }
      }

      // 2. Fitness + probabilistic selection over surviving adults/old individuals.
      const survivingAdultIds = Object.values(entities)
        .filter(
          (e) =>
            e.speciesId === species.speciesId &&
            e.lifeStage !== "dead" &&
            (e.lifeStage === "adult" || e.lifeStage === "old"),
        )
        .map((e) => e.id)
        .sort();

      const fitnessById = new Map<string, number>();
      for (const id of survivingAdultIds) {
        const genome = genomes[entities[id].genomeId];
        const phenotype = expressPhenotype(genome, species.traits, environment);
        fitnessById.set(id, computeFitness(phenotype, species.fitnessProfile));
      }

      const selectionCandidates: SelectionCandidate[] = survivingAdultIds.map((id) => ({
        id,
        fitness: fitnessById.get(id) ?? 0.5,
      }));
      const selectionOutcomes = applySelection(selectionCandidates, selectionRng);

      const reproducerIds: string[] = [];
      for (const outcome of selectionOutcomes) {
        if (!outcome.survived) {
          entities[outcome.id] = { ...entities[outcome.id], lifeStage: "dead", deathTick: state.tick };
          events.push(deathEvent(state.tick, outcome.id, species.speciesId, "selection"));
          continue;
        }
        const entity = entities[outcome.id];
        if (
          outcome.selectedToReproduce &&
          isEligibleToReproduce(entity, species.reproduction, state.tick, entity.lastReproducedTick ?? undefined)
        ) {
          reproducerIds.push(outcome.id);
        }
      }

      // 3. Reproduction.
      if (species.reproduction.mode === "sexual") {
        const males = reproducerIds.filter((id) => entities[id].sex === "male");
        const females = reproducerIds.filter((id) => entities[id].sex === "female");
        const pairCount = Math.min(males.length, females.length);
        for (let i = 0; i < pairCount; i++) {
          const parentA = { entity: entities[males[i]], genome: genomes[entities[males[i]].genomeId] };
          const parentB = { entity: entities[females[i]], genome: genomes[entities[females[i]].genomeId] };
          entities[males[i]] = { ...entities[males[i]], lastReproducedTick: state.tick };
          entities[females[i]] = { ...entities[females[i]], lastReproducedTick: state.tick };
          const offspringCount = reproductionRng.nextInt(
            species.reproduction.offspringCountMin,
            species.reproduction.offspringCountMax,
          );
          for (let o = 0; o < offspringCount; o++) {
            const offspringEntityId = allocateEntityId(species.speciesId);
            const offspringGenomeId = allocateGenomeId(species.speciesId);
            const result = reproduceSexual(
              parentA,
              parentB,
              species.reproduction,
              { offspringEntityId, offspringGenomeId },
              state.tick,
              reproductionRng,
              mutationRng,
            );
            entities[offspringEntityId] = result.offspringEntity;
            genomes[offspringGenomeId] = result.offspringGenome;
            events.push(birthEvent(state.tick, offspringEntityId, species.speciesId, result.offspringEntity.parentIds));
            events.push(
              reproductionEvent(state.tick, species.speciesId, result.offspringEntity.parentIds, offspringEntityId),
            );
            if (result.mutations.length > 0) {
              events.push(mutationEvent(state.tick, offspringEntityId, offspringGenomeId, result.mutations));
            }
          }
        }
      } else {
        for (const parentId of reproducerIds) {
          const parent = { entity: entities[parentId], genome: genomes[entities[parentId].genomeId] };
          entities[parentId] = { ...entities[parentId], lastReproducedTick: state.tick };
          const offspringCount = reproductionRng.nextInt(
            species.reproduction.offspringCountMin,
            species.reproduction.offspringCountMax,
          );
          for (let o = 0; o < offspringCount; o++) {
            const offspringEntityId = allocateEntityId(species.speciesId);
            const offspringGenomeId = allocateGenomeId(species.speciesId);
            const result = reproduceAsexual(
              parent,
              species.reproduction,
              { offspringEntityId, offspringGenomeId },
              state.tick,
              mutationRng,
            );
            entities[offspringEntityId] = result.offspringEntity;
            genomes[offspringGenomeId] = result.offspringGenome;
            events.push(birthEvent(state.tick, offspringEntityId, species.speciesId, result.offspringEntity.parentIds));
            events.push(
              reproductionEvent(state.tick, species.speciesId, result.offspringEntity.parentIds, offspringEntityId),
            );
            if (result.mutations.length > 0) {
              events.push(mutationEvent(state.tick, offspringEntityId, offspringGenomeId, result.mutations));
            }
          }
        }
      }

      // 4. Adaptation metrics (population-level, this tick's snapshot).
      const finalAliveIds = Object.values(entities)
        .filter((e) => e.speciesId === species.speciesId && e.lifeStage !== "dead")
        .map((e) => e.id);
      if (finalAliveIds.length > 0) {
        const phenotypes = finalAliveIds.map((id) => expressPhenotype(genomes[entities[id].genomeId], species.traits, environment));
        const fitnesses = phenotypes.map((p) => computeFitness(p, species.fitnessProfile));
        const genomeList = finalAliveIds.map((id) => genomes[entities[id].genomeId]);
        const maxGeneration = Math.max(...genomeList.map((g) => g.generation));
        const metrics = computeAdaptationMetrics(maxGeneration, phenotypes, fitnesses, genomeList);
        events.push(adaptationEvent(state.tick, species.speciesId, metrics.generation, metrics.meanFitness));
      }

      // 5. Extinction detection (only fires on the transition into extinction).
      const finalPopulationSize = finalAliveIds.length;
      if (priorAlive > species.minViablePopulation) {
        const extinction = checkExtinction(species.speciesId, finalPopulationSize, state.tick, species.minViablePopulation);
        if (extinction.extinct) {
          events.push(extinctionEvent(state.tick, species.speciesId, finalPopulationSize));
        }
      }
    }

    const nextBiologyState: BiologyModuleState = {
      entities,
      genomes,
      nextEntitySeqBySpecies,
      nextGenomeSeqBySpecies,
      // Sorted by canonical content, not push order: which species a
      // registry processes first must never change the resulting event
      // sequence (or the resulting state hash) — see the "execution-order
      // independence" integration test.
      events: [...events].sort((a, b) => {
        const ka = canonicalStringify(a);
        const kb = canonicalStringify(b);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      }),
    };

    return {
      ...state,
      modules: { ...state.modules, [BIOLOGY_MODULE_KEY]: nextBiologyState },
    };
  };
}

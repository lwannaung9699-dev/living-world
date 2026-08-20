import { InvalidStateError } from "../../core/errors";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { BioEntity, createBioEntity, validateBioEntity } from "../entity/bioEntity";
import { GenomeData } from "../genetics/geneTypes";
import { createFounderGenome, validateGenome } from "../genetics/genome";
import { BiologicalEvent } from "../events/biologicalEvents";
import { SpeciesConfig } from "../species/speciesConfig";

/**
 * BiologyModuleState — the plain-JSON-serializable slice of biology domain
 * data that lives at WorldState.modules.biology. Species content
 * (SpeciesConfig, TraitRegistry, ...) is NOT stored here: it is static
 * simulation content/rules supplied by the caller each tick (same pattern
 * as Foundation's SimulationContext.subsystems), not part of the evolving
 * world snapshot.
 */
export interface BiologyModuleState {
  readonly entities: Readonly<Record<string, BioEntity>>;
  readonly genomes: Readonly<Record<string, GenomeData>>;
  /**
   * Per-species ID sequence counters, keyed by speciesId. Kept per-species
   * (rather than one global counter) so that one species' entity/genome ID
   * numbering — and therefore its serialized state — never depends on
   * which other species happen to be simulated alongside it, or in what
   * order. This mirrors the same isolation guarantee RngStreamRegistry
   * already gives per-namespace RNG streams.
   */
  readonly nextEntitySeqBySpecies: Readonly<Record<string, number>>;
  readonly nextGenomeSeqBySpecies: Readonly<Record<string, number>>;
  /** Events emitted during the most recently processed tick only (not an unbounded log — see performance notes). */
  readonly events: readonly BiologicalEvent[];
}

export const BIOLOGY_MODULE_KEY = "biology";

export function createEmptyBiologyModuleState(): BiologyModuleState {
  return { entities: {}, genomes: {}, nextEntitySeqBySpecies: {}, nextGenomeSeqBySpecies: {}, events: [] };
}

function validateSeqMap(value: unknown, path: string): asserts value is Record<string, number> {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError(`${path} must be an object`);
  }
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (!Number.isInteger(v) || (v as number) < 0) {
      throw new InvalidStateError(`${path}["${key}"] must be a non-negative integer`);
    }
  }
}

export function validateBiologyModuleState(value: unknown): asserts value is BiologyModuleState {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("BiologyModuleState must be an object");
  }
  const state = value as Partial<BiologyModuleState>;
  if (typeof state.entities !== "object" || state.entities === null) {
    throw new InvalidStateError("BiologyModuleState.entities must be an object");
  }
  if (typeof state.genomes !== "object" || state.genomes === null) {
    throw new InvalidStateError("BiologyModuleState.genomes must be an object");
  }
  Object.values(state.entities).forEach((e) => validateBioEntity(e));
  Object.values(state.genomes).forEach((g) => validateGenome(g));
  validateSeqMap(state.nextEntitySeqBySpecies, "BiologyModuleState.nextEntitySeqBySpecies");
  validateSeqMap(state.nextGenomeSeqBySpecies, "BiologyModuleState.nextGenomeSeqBySpecies");
  if (!Array.isArray(state.events)) {
    throw new InvalidStateError("BiologyModuleState.events must be an array");
  }
}

/** Reads the biology module slice out of a generic WorldState.modules bag, defaulting to empty. */
export function readBiologyModuleState(modules: Readonly<Record<string, unknown>>): BiologyModuleState {
  const raw = modules[BIOLOGY_MODULE_KEY];
  if (raw === undefined) return createEmptyBiologyModuleState();
  validateBiologyModuleState(raw);
  return raw;
}

/** Allocates the next entityId for a species and returns the advanced state alongside it. */
export function nextEntityId(state: BiologyModuleState, speciesId: string): { id: string; nextEntitySeqBySpecies: Record<string, number> } {
  const seq = state.nextEntitySeqBySpecies[speciesId] ?? 0;
  return { id: `${speciesId}-e${seq}`, nextEntitySeqBySpecies: { ...state.nextEntitySeqBySpecies, [speciesId]: seq + 1 } };
}

/** Allocates the next genomeId for a species and returns the advanced state alongside it. */
export function nextGenomeId(state: BiologyModuleState, speciesId: string): { id: string; nextGenomeSeqBySpecies: Record<string, number> } {
  const seq = state.nextGenomeSeqBySpecies[speciesId] ?? 0;
  return { id: `${speciesId}-g${seq}`, nextGenomeSeqBySpecies: { ...state.nextGenomeSeqBySpecies, [speciesId]: seq + 1 } };
}

/**
 * Seeds an initial founder population for one species: deterministic given
 * the same RNG stream state. Entities are created already-adult so they are
 * immediately eligible to participate in reproduction/selection.
 */
export function seedPopulation(
  state: BiologyModuleState,
  species: SpeciesConfig,
  count: number,
  currentTick: number,
  rng: DeterministicRng,
): BiologyModuleState {
  const entities: Record<string, BioEntity> = { ...state.entities };
  const genomes: Record<string, GenomeData> = { ...state.genomes };
  let entitySeq = state.nextEntitySeqBySpecies[species.speciesId] ?? 0;
  let genomeSeq = state.nextGenomeSeqBySpecies[species.speciesId] ?? 0;

  for (let i = 0; i < count; i++) {
    const genomeId = `${species.speciesId}-g${genomeSeq++}`;
    const genome = createFounderGenome(genomeId, species.speciesId, species.baseGenomeTemplate, species.mutationConfig, rng);
    genomes[genomeId] = genome;

    const entityId = `${species.speciesId}-e${entitySeq++}`;
    const entity = createBioEntity({
      id: entityId,
      speciesId: species.speciesId,
      genomeId,
      sex: i % 2 === 0 ? "male" : "female",
      mass: 1,
      generation: 0,
      parentIds: [],
      birthTick: currentTick,
      lifeStage: "adult",
      health: 1,
      energy: 1,
    });
    entities[entityId] = { ...entity, age: species.lifeCycle.maturityAge };
  }

  return {
    ...state,
    entities,
    genomes,
    nextEntitySeqBySpecies: { ...state.nextEntitySeqBySpecies, [species.speciesId]: entitySeq },
    nextGenomeSeqBySpecies: { ...state.nextGenomeSeqBySpecies, [species.speciesId]: genomeSeq },
  };
}

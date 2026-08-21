import { SpeciesDefinition, createDefaultSpeciesDefinition } from "../species/species";
import type { WorldState } from "../../core/state/worldState";
import type { BiologyModuleState } from "../../biology/tick/biologyModuleState";
import type { BioEntity } from "../../biology/entity/bioEntity";
import type { SpeciesConfig } from "../../biology/species/speciesConfig";

/**
 * BiologyProvider — the adapter boundary to Team 04 (genetics / phenotype /
 * natural selection). Team 06 NEVER implements genome, mutation,
 * inheritance, phenotype expression, or speciation logic (§30) — it only
 * consumes the behavioral subset of a creature's biology through this
 * interface.
 *
 * If Team 04's real implementation is not yet available in the repository,
 * `StaticBiologyProvider` below is a stand-in adapter so Team 06's pipeline
 * is fully runnable and testable today; swapping in Team 04's real
 * implementation later requires no changes to any Team 06 consumer, only a
 * different BiologyProvider instance.
 */
export interface BiologyProvider {
  /** The behavioral species data (needs growth rates, sensory profile, etc.) for a given species. */
  getSpeciesDefinition(speciesId: string): SpeciesDefinition;
  /**
   * Whether two creatures are biologically compatible mates. Team 06 uses
   * this only to decide whether to PROPOSE a MateSeekingAction (§23) — it
   * never performs reproduction itself.
   */
  canReproduce(sourceCreatureId: string, targetCreatureId: string): boolean;
  /** Current biological energy requirement per tick for a creature (may reflect age/health/genome). */
  getEnergyRequirement(creatureId: string): number;
}

/**
 * StaticBiologyProvider — a minimal, fully-deterministic placeholder
 * adapter. Registers plain SpeciesDefinition data and treats any two
 * creatures of the same species as reproduction-eligible. This satisfies
 * §30's "create adapters/interfaces only" instruction while Team 04's real
 * biology system does not yet exist in this repository.
 */
export class StaticBiologyProvider implements BiologyProvider {
  private readonly species = new Map<string, SpeciesDefinition>();
  private readonly creatureSpecies = new Map<string, string>();

  registerSpecies(definition: SpeciesDefinition): void {
    this.species.set(definition.speciesId, definition);
  }

  registerCreatureSpecies(creatureId: string, speciesId: string): void {
    this.creatureSpecies.set(creatureId, speciesId);
  }

  getSpeciesDefinition(speciesId: string): SpeciesDefinition {
    return this.species.get(speciesId) ?? createDefaultSpeciesDefinition(speciesId);
  }

  canReproduce(sourceCreatureId: string, targetCreatureId: string): boolean {
    const a = this.creatureSpecies.get(sourceCreatureId);
    const b = this.creatureSpecies.get(targetCreatureId);
    return Boolean(a && b && a === b);
  }

  getEnergyRequirement(creatureId: string): number {
    const speciesId = this.creatureSpecies.get(creatureId);
    if (!speciesId) return 0.1;
    return this.getSpeciesDefinition(speciesId).energyRequirementPerTick;
  }
}

/**
 * StateBackedBiologyProvider — reads Team 04's actual BiologyModuleState
 * (`state.modules.biology`) for Team 06's decision API, mirroring the
 * pattern `StateBackedEcologyProvider` uses for Team 05
 * (see `../../pipeline/defaultSimulationPipeline.ts`). Refreshed once per
 * tick via `setState()`, immediately before Team 06 runs, so creatures see
 * the current tick's real biology data whenever Team 04 has actually
 * seeded that species/entity.
 *
 * Falls back to the same conservative defaults `StaticBiologyProvider`
 * always returned whenever no real data is available yet — so behavior is
 * unchanged for any caller that hasn't wired up real biology entities
 * (e.g. the default pipeline's empty `speciesRegistry`, under which
 * `state.modules.biology.entities` stays empty and every method below
 * degrades to the original static defaults).
 *
 * KNOWN LIMITATION (documented per the project's Evidence Rule, not
 * hidden): no production code currently establishes a shared ID space
 * between Team 06's `CreatureState.creatureId` and Team 04's
 * `BioEntity.id` — Team 04 allocates entity ids as `${speciesId}-eN`
 * independently of creature creation (see `biologySubsystem.ts`). So:
 *  - `getSpeciesDefinition(speciesId)` — the only method the current
 *    production pipeline actually calls (`tickCreature`) — works purely
 *    off `speciesId` and benefits from real data whenever Team 04 has
 *    seeded that species, regardless of any ID alignment.
 *  - `canReproduce`/`getEnergyRequirement` take a `creatureId` and can
 *    only pick up real per-entity data if a caller deliberately supplies
 *    matching ids; otherwise they gracefully fall back to the same
 *    conservative defaults as before (no fabricated linkage is assumed).
 * Establishing a real creatureId<->BioEntity.id linkage is a separate,
 * larger cross-team wiring decision (analogous to the Team 06<->07
 * `defaultNpcAdapter` fix) and is out of scope for this adapter swap.
 */
export class StateBackedBiologyProvider implements BiologyProvider {
  private state: WorldState | undefined;

  constructor(private readonly speciesRegistry: Readonly<Record<string, SpeciesConfig>> = {}) {}

  setState(state: WorldState): void {
    this.state = state;
  }

  getSpeciesDefinition(speciesId: string): SpeciesDefinition {
    const livingEntities = this.entitiesOfSpecies(speciesId);
    if (livingEntities.length === 0) {
      return createDefaultSpeciesDefinition(speciesId);
    }

    // Only override fields Team 04 genuinely models (mass is a real,
    // directly-read BioEntity field with a defensible metabolic
    // relationship to energy need). Behavioral-only fields Team 06 owns
    // (sensory/needsGrowth/personalityRanges/dietTags/behaviorTendencies/
    // isPredator) have no Team 04 equivalent to source from, so they keep
    // the same defaults StaticBiologyProvider always used — no semantics
    // are fabricated here.
    const avgMass = average(livingEntities.map((entity) => entity.mass));
    return createDefaultSpeciesDefinition(speciesId, {
      // Scaled so the founder default mass of 1 (see biologyModuleState.ts
      // seedPopulation) reproduces the original static baseline of 0.1.
      energyRequirementPerTick: avgMass > 0 ? 0.1 * avgMass : 0.1,
    });
  }

  canReproduce(sourceCreatureId: string, targetCreatureId: string): boolean {
    const source = this.entityById(sourceCreatureId);
    const target = this.entityById(targetCreatureId);
    // No real linkage available for these ids — conservative default,
    // identical to StaticBiologyProvider's behavior for any unregistered
    // creatureId (which is every creatureId in the current pipeline).
    if (!source || !target) return false;
    if (source.speciesId !== target.speciesId) return false;
    if (source.lifeStage !== "adult" || target.lifeStage !== "adult") return false;
    if (source.deathTick !== null || target.deathTick !== null) return false;
    const minEnergy = this.speciesRegistry[source.speciesId]?.reproduction.minEnergyToReproduce ?? 0.3;
    return source.energy >= minEnergy && target.energy >= minEnergy;
  }

  getEnergyRequirement(creatureId: string): number {
    const entity = this.entityById(creatureId);
    if (!entity) return 0.1; // same fallback as StaticBiologyProvider
    return this.getSpeciesDefinition(entity.speciesId).energyRequirementPerTick;
  }

  private biologyModule(): BiologyModuleState | undefined {
    const value = this.state?.modules.biology;
    return value && typeof value === "object" ? (value as BiologyModuleState) : undefined;
  }

  private entitiesOfSpecies(speciesId: string): BioEntity[] {
    return Object.values(this.biologyModule()?.entities ?? {}).filter(
      (entity) => entity.speciesId === speciesId && entity.lifeStage !== "dead",
    );
  }

  private entityById(id: string): BioEntity | undefined {
    return this.biologyModule()?.entities[id];
  }
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

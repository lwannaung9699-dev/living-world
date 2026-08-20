import { SpeciesDefinition, createDefaultSpeciesDefinition } from "../species/species";

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

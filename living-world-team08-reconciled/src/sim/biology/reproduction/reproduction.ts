import { InvalidStateError } from "../../core/errors";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { GenomeData } from "../genetics/geneTypes";
import { combineGenomes, cloneGenomeForAsexualReproduction } from "../genetics/inheritance";
import { mutateGenome, MutationRecord } from "../genetics/mutation";
import { BioEntity, BiologicalSex, createBioEntity } from "../entity/bioEntity";
import { ReproductionConfig } from "../species/speciesConfig";

export interface ReproductionResult {
  readonly offspringEntity: BioEntity;
  readonly offspringGenome: GenomeData;
  readonly mutations: readonly MutationRecord[];
}

export interface ReproductionIds {
  readonly offspringEntityId: string;
  readonly offspringGenomeId: string;
}

/** True if an entity currently satisfies its species' reproduction eligibility rules. */
export function isEligibleToReproduce(
  entity: BioEntity,
  config: ReproductionConfig,
  currentTick: number,
  lastReproducedTick?: number,
): boolean {
  if (entity.lifeStage !== "adult" && entity.lifeStage !== "old") return false;
  if (entity.age < config.maturityAge) return false;
  if (entity.energy < config.minEnergyToReproduce) return false;
  if (lastReproducedTick !== undefined && currentTick - lastReproducedTick < config.cooldownTicks) return false;
  return true;
}

/**
 * Sexual reproduction: recombination between two parent genomes, then
 * mutation. RNG draws come only from the two forked streams passed in
 * (recombinationRng, mutationRng) so callers control isolation (e.g. one
 * substream per species/population).
 */
export function reproduceSexual(
  parentA: { entity: BioEntity; genome: GenomeData },
  parentB: { entity: BioEntity; genome: GenomeData },
  config: ReproductionConfig,
  ids: ReproductionIds,
  currentTick: number,
  recombinationRng: DeterministicRng,
  mutationRng: DeterministicRng,
): ReproductionResult {
  if (config.mode !== "sexual") {
    throw new InvalidStateError(`reproduceSexual called with a non-sexual ReproductionConfig (mode="${config.mode}")`);
  }
  const recombined = combineGenomes(parentA.genome, parentB.genome, recombinationRng, ids.offspringGenomeId);
  const { genome: offspringGenome, mutations } = mutateGenome(recombined, mutationRng);

  const sex: BiologicalSex = recombinationRng.boolean() ? "male" : "female";
  const offspringEntity = createBioEntity({
    id: ids.offspringEntityId,
    speciesId: parentA.entity.speciesId,
    genomeId: offspringGenome.genomeId,
    sex,
    mass: (parentA.entity.mass + parentB.entity.mass) / 2,
    generation: offspringGenome.generation,
    parentIds: [parentA.entity.id, parentB.entity.id],
    birthTick: currentTick,
  });

  return { offspringEntity, offspringGenome, mutations };
}

/** Asexual reproduction: mutated clone of a single parent's genome. */
export function reproduceAsexual(
  parent: { entity: BioEntity; genome: GenomeData },
  config: ReproductionConfig,
  ids: ReproductionIds,
  currentTick: number,
  mutationRng: DeterministicRng,
): ReproductionResult {
  if (config.mode !== "asexual") {
    throw new InvalidStateError(`reproduceAsexual called with a non-asexual ReproductionConfig (mode="${config.mode}")`);
  }
  const cloned = cloneGenomeForAsexualReproduction(parent.genome, ids.offspringGenomeId);
  const { genome: offspringGenome, mutations } = mutateGenome(cloned, mutationRng);

  const offspringEntity = createBioEntity({
    id: ids.offspringEntityId,
    speciesId: parent.entity.speciesId,
    genomeId: offspringGenome.genomeId,
    sex: "asexual",
    mass: parent.entity.mass,
    generation: offspringGenome.generation,
    parentIds: [parent.entity.id],
    birthTick: currentTick,
  });

  return { offspringEntity, offspringGenome, mutations };
}

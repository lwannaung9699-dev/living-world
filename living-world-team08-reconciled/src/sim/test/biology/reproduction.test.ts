import { test } from "node:test";
import assert from "node:assert/strict";
import { createGenome } from "../../biology/genetics/genome";
import { createBioEntity } from "../../biology/entity/bioEntity";
import { reproduceSexual, reproduceAsexual, isEligibleToReproduce } from "../../biology/reproduction/reproduction";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { DEMO_GENE_TEMPLATE, DEMO_SPECIES, DEMO_ASEXUAL_SPECIES } from "./fixtures";

function makeParent(id: string, genomeId: string, sex: "male" | "female", age: number) {
  const genome = createGenome({
    genomeId,
    speciesId: DEMO_SPECIES.speciesId,
    genes: DEMO_GENE_TEMPLATE,
    mutationConfig: DEMO_SPECIES.mutationConfig,
  });
  const entity = createBioEntity({
    id,
    speciesId: DEMO_SPECIES.speciesId,
    genomeId,
    sex,
    mass: 5,
    generation: 0,
    parentIds: [],
    birthTick: 0,
    lifeStage: "adult",
    energy: 1,
  });
  return { entity: { ...entity, age }, genome };
}

test("isEligibleToReproduce requires maturity age, sufficient energy, and cooldown elapsed", () => {
  const { entity } = makeParent("e1", "g1", "female", 10);
  assert.equal(isEligibleToReproduce(entity, DEMO_SPECIES.reproduction, 100), true);
  assert.equal(isEligibleToReproduce({ ...entity, age: 1 }, DEMO_SPECIES.reproduction, 100), false);
  assert.equal(isEligibleToReproduce({ ...entity, energy: 0.1 }, DEMO_SPECIES.reproduction, 100), false);
  assert.equal(isEligibleToReproduce(entity, DEMO_SPECIES.reproduction, 100, 99), false); // cooldown not elapsed
});

test("reproduceSexual produces a valid offspring entity + genome, deterministically", () => {
  const parentA = makeParent("male-1", "g-male", "male", 10);
  const parentB = makeParent("female-1", "g-female", "female", 10);

  const runOnce = () => {
    const recombinationRng = DeterministicRng.fromSeed("sexual/recombination", 11);
    const mutationRng = DeterministicRng.fromSeed("sexual/mutation", 22);
    return reproduceSexual(
      parentA,
      parentB,
      DEMO_SPECIES.reproduction,
      { offspringEntityId: "child-1", offspringGenomeId: "child-genome-1" },
      50,
      recombinationRng,
      mutationRng,
    );
  };

  const resultA = runOnce();
  const resultB = runOnce();
  assert.deepEqual(resultA.offspringEntity, resultB.offspringEntity);
  assert.deepEqual(resultA.offspringGenome, resultB.offspringGenome);
  assert.deepEqual(resultA.offspringEntity.parentIds, ["male-1", "female-1"]);
  assert.equal(resultA.offspringEntity.birthTick, 50);
  assert.equal(resultA.offspringEntity.lifeStage, "embryo");
});

test("reproduceAsexual produces a single-parent offspring, deterministically", () => {
  const genome = createGenome({
    genomeId: "asex-genome",
    speciesId: DEMO_ASEXUAL_SPECIES.speciesId,
    genes: DEMO_GENE_TEMPLATE,
    mutationConfig: DEMO_ASEXUAL_SPECIES.mutationConfig,
  });
  const parent = {
    entity: createBioEntity({
      id: "solo-1",
      speciesId: DEMO_ASEXUAL_SPECIES.speciesId,
      genomeId: "asex-genome",
      sex: "asexual" as const,
      mass: 2,
      generation: 0,
      parentIds: [],
      birthTick: 0,
      lifeStage: "adult",
    }),
    genome,
  };

  const mutationRng = DeterministicRng.fromSeed("asexual/mutation", 4);
  const result = reproduceAsexual(
    parent,
    DEMO_ASEXUAL_SPECIES.reproduction,
    { offspringEntityId: "clone-1", offspringGenomeId: "clone-genome-1" },
    20,
    mutationRng,
  );
  assert.deepEqual(result.offspringEntity.parentIds, ["solo-1"]);
  assert.equal(result.offspringGenome.speciesId, DEMO_ASEXUAL_SPECIES.speciesId);
  assert.equal(result.offspringEntity.sex, "asexual");
});

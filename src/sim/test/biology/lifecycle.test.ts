import { test } from "node:test";
import assert from "node:assert/strict";
import { nextLifeStage, checkDeath } from "../../biology/entity/lifeCycle";
import { createBioEntity } from "../../biology/entity/bioEntity";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { DEMO_SPECIES } from "./fixtures";

function entityAt(age: number, overrides: Partial<Parameters<typeof createBioEntity>[0]> = {}) {
  const entity = createBioEntity({
    id: "e",
    speciesId: DEMO_SPECIES.speciesId,
    genomeId: "g",
    sex: "female",
    mass: 1,
    generation: 0,
    parentIds: [],
    birthTick: 0,
    lifeStage: "embryo",
    ...overrides,
  });
  return { ...entity, age };
}

test("nextLifeStage progresses embryo -> juvenile -> adult -> old as age crosses configured thresholds", () => {
  assert.equal(nextLifeStage(entityAt(0), DEMO_SPECIES.lifeCycle), "embryo");
  assert.equal(nextLifeStage(entityAt(1), DEMO_SPECIES.lifeCycle), "juvenile");
  assert.equal(nextLifeStage(entityAt(DEMO_SPECIES.lifeCycle.maturityAge), DEMO_SPECIES.lifeCycle), "adult");
  assert.equal(nextLifeStage(entityAt(DEMO_SPECIES.lifeCycle.oldAge), DEMO_SPECIES.lifeCycle), "old");
});

test("nextLifeStage keeps a dead entity dead regardless of age", () => {
  const dead = entityAt(3, { lifeStage: "dead" });
  assert.equal(nextLifeStage(dead, DEMO_SPECIES.lifeCycle), "dead");
});

test("checkDeath: an entity past maxAge always dies", () => {
  const entity = entityAt(DEMO_SPECIES.lifeCycle.maxAge, { lifeStage: "old", energy: 1, health: 1 });
  const rng = DeterministicRng.fromSeed("death-old", 1);
  const result = checkDeath(entity, DEMO_SPECIES.lifeCycle, rng);
  assert.equal(result.shouldDie, true);
  assert.equal(result.cause, "old-age");
});

test("checkDeath: an entity with zero energy always dies of starvation", () => {
  const entity = entityAt(10, { lifeStage: "adult", energy: 0 });
  const rng = DeterministicRng.fromSeed("death-starve", 1);
  const result = checkDeath(entity, DEMO_SPECIES.lifeCycle, rng);
  assert.equal(result.shouldDie, true);
  assert.equal(result.cause, "starvation");
});

test("checkDeath: a healthy young adult with energy reliably survives", () => {
  const entity = entityAt(10, { lifeStage: "adult", energy: 1, health: 1 });
  const rng = DeterministicRng.fromSeed("death-survive", 1);
  const result = checkDeath(entity, DEMO_SPECIES.lifeCycle, rng);
  assert.equal(result.shouldDie, false);
});

test("checkDeath is deterministic given the same RNG stream state for old-age probabilistic mortality", () => {
  const entity = entityAt(DEMO_SPECIES.lifeCycle.oldAge, { lifeStage: "old", energy: 1, health: 0.5 });
  const rngA = DeterministicRng.fromSeed("death-prob", 42);
  const rngB = DeterministicRng.fromSeed("death-prob", 42);
  assert.deepEqual(checkDeath(entity, DEMO_SPECIES.lifeCycle, rngA), checkDeath(entity, DEMO_SPECIES.lifeCycle, rngB));
});

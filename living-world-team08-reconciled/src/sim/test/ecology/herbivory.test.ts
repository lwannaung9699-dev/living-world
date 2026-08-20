import { test } from "node:test";
import assert from "node:assert/strict";
import { computeHerbivoryDemand, resolveConsumption, createPopulation } from "../../ecology";
import { RngStreamRegistry } from "../../core/rng/rngStreamRegistry";

function rngFor(seed: string) {
  return RngStreamRegistry.create(seed).fork("test");
}

test("computeHerbivoryDemand scales with herbivore count and interaction strength", () => {
  const herbivore = createPopulation({ populationId: "deer", speciesId: "deer", location: "meadow", count: 20, energy: 1 });
  const interaction = { interactionId: "deer-eats-grass", type: "herbivory" as const, sourceId: "deer", targetId: "grass", strength: 0.3 };
  const lower = computeHerbivoryDemand(interaction, herbivore, {}, rngFor("herb-a"));
  const higher = computeHerbivoryDemand({ ...interaction, strength: 0.9 }, herbivore, {}, rngFor("herb-a"));
  assert.ok(higher.amount > lower.amount);
});

test("resolveConsumption grants full demand when supply is sufficient", () => {
  const demands = [{ interactionId: "i1", consumerId: "deer", targetId: "grass", amount: 50 }];
  const result = resolveConsumption(demands, { grass: 500 });
  assert.equal(result.grantedByInteraction.i1, 50);
  assert.equal(result.removedByTarget.grass, 50);
  assert.equal(result.gainedByConsumer.deer, 50);
});

test("resolveConsumption applies fair-share scaling when total demand exceeds supply", () => {
  const demands = [
    { interactionId: "i1", consumerId: "deer-a", targetId: "grass", amount: 80 },
    { interactionId: "i2", consumerId: "deer-b", targetId: "grass", amount: 20 },
  ];
  const result = resolveConsumption(demands, { grass: 50 });
  // total demand 100, supply 50 -> scale 0.5
  assert.equal(result.grantedByInteraction.i1, 40);
  assert.equal(result.grantedByInteraction.i2, 10);
  assert.equal(result.removedByTarget.grass, 50);
});

test("resolveConsumption never removes more than the available supply from a target", () => {
  const demands = [
    { interactionId: "i1", consumerId: "a", targetId: "grass", amount: 1000 },
    { interactionId: "i2", consumerId: "b", targetId: "grass", amount: 2000 },
    { interactionId: "i3", consumerId: "c", targetId: "grass", amount: 500 },
  ];
  const result = resolveConsumption(demands, { grass: 100 });
  assert.ok(Math.abs(result.removedByTarget.grass - 100) < 1e-9);
});

test("resolveConsumption result does not depend on the order demands are listed in", () => {
  const demands = [
    { interactionId: "i1", consumerId: "a", targetId: "grass", amount: 30 },
    { interactionId: "i2", consumerId: "b", targetId: "grass", amount: 70 },
    { interactionId: "i3", consumerId: "c", targetId: "water", amount: 10 },
  ];
  const forward = resolveConsumption(demands, { grass: 60, water: 5 });
  const reversed = resolveConsumption([...demands].reverse(), { grass: 60, water: 5 });
  assert.deepEqual(forward, reversed);
});

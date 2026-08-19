import { test } from "node:test";
import assert from "node:assert/strict";
import { computePredationDemand, predationEnergyGain, createPopulation } from "../../ecology";
import { RngStreamRegistry } from "../../core/rng/rngStreamRegistry";

function rngFor(seed: string) {
  return RngStreamRegistry.create(seed).fork("test");
}

test("computePredationDemand scales with predator count and interaction strength", () => {
  const predator = createPopulation({ populationId: "wolf", speciesId: "wolf", location: "forest", count: 10 });
  const interaction = { interactionId: "wolf-eats-deer", type: "predation" as const, sourceId: "wolf", targetId: "deer", strength: 0.5 };
  const small = computePredationDemand(interaction, predator, {}, rngFor("demand-a"));
  const bigger = computePredationDemand({ ...interaction, strength: 1 }, predator, {}, rngFor("demand-a"));
  assert.ok(bigger.amount > small.amount);
});

test("computePredationDemand references the correct interaction, consumer, and target", () => {
  const predator = createPopulation({ populationId: "wolf", speciesId: "wolf", location: "forest", count: 10 });
  const interaction = { interactionId: "wolf-eats-deer", type: "predation" as const, sourceId: "wolf", targetId: "deer", strength: 0.5 };
  const demand = computePredationDemand(interaction, predator, {}, rngFor("demand-b"));
  assert.equal(demand.interactionId, "wolf-eats-deer");
  assert.equal(demand.consumerId, "wolf");
  assert.equal(demand.targetId, "deer");
  assert.ok(demand.amount >= 0);
});

test("a predator population of zero produces zero demand", () => {
  const predator = createPopulation({ populationId: "wolf", speciesId: "wolf", location: "forest", count: 0 });
  const interaction = { interactionId: "wolf-eats-deer", type: "predation" as const, sourceId: "wolf", targetId: "deer", strength: 0.5 };
  const demand = computePredationDemand(interaction, predator, {}, rngFor("demand-c"));
  assert.equal(demand.amount, 0);
});

test("higher huntingEfficiency trait increases demand", () => {
  const predator = createPopulation({ populationId: "wolf", speciesId: "wolf", location: "forest", count: 10 });
  const interaction = { interactionId: "wolf-eats-deer", type: "predation" as const, sourceId: "wolf", targetId: "deer", strength: 0.5 };
  const base = computePredationDemand(interaction, predator, { huntingEfficiency: 1 }, rngFor("demand-d"));
  const skilled = computePredationDemand(interaction, predator, { huntingEfficiency: 2 }, rngFor("demand-d"));
  assert.ok(skilled.amount > base.amount);
});

test("predationEnergyGain distributes killed biomass across the predator population", () => {
  assert.equal(predationEnergyGain(10, 10, 1), 1);
  assert.equal(predationEnergyGain(0, 10, 1), 0);
  assert.equal(predationEnergyGain(10, 0, 1), 0);
});

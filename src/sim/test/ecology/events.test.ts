import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectExtinctions,
  detectResourceCollapse,
  detectFoodWebDisruption,
  detectSpeciationSignal,
  createPopulation,
  createResource,
  createFoodWeb,
} from "../../ecology";

test("detectExtinctions flags only zero-count populations, and carries lineage provenance", () => {
  const alive = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 5 });
  const dead = createPopulation({
    populationId: "b",
    speciesId: "forest-deer",
    location: "meadow",
    count: 0,
    lineage: ["ancestral-deer", "forest-deer"],
  });
  const events = detectExtinctions([alive, dead], 10);
  assert.equal(events.length, 1);
  assert.equal(events[0].populationId, "b");
  assert.equal(events[0].tick, 10);
  assert.deepEqual(events[0].lineage, ["ancestral-deer", "forest-deer"]);
});

test("detectExtinctions defaults lineage to [speciesId] when none was supplied", () => {
  const dead = createPopulation({ populationId: "b", speciesId: "deer", location: "meadow", count: 0 });
  const [event] = detectExtinctions([dead], 1);
  assert.deepEqual(event.lineage, ["deer"]);
});

test("detectResourceCollapse flags only resources with zero availability AND zero capacity", () => {
  const depletedButRecoverable = createResource({ resourceId: "grass", resourceType: "plant", location: "meadow", availableAmount: 0, capacity: 100, regenerationRate: 0.1 });
  const trulyCollapsed = createResource({ resourceId: "spring", resourceType: "water", location: "meadow", availableAmount: 0, capacity: 0, regenerationRate: 0 });
  const events = detectResourceCollapse([depletedButRecoverable, trulyCollapsed], 3);
  assert.equal(events.length, 1);
  assert.equal(events[0].resourceId, "spring");
});

test("detectFoodWebDisruption flags consumers of a lost node", () => {
  const web = createFoodWeb(
    [
      { id: "grass", kind: "resource" },
      { id: "deer", kind: "population" },
      { id: "wolf", kind: "population" },
    ],
    [
      { from: "deer", to: "grass", interactionType: "herbivory", strength: 0.5 },
      { from: "wolf", to: "deer", interactionType: "predation", strength: 0.3 },
    ],
  );
  const events = detectFoodWebDisruption(web, ["deer"], [], 7);
  assert.equal(events.length, 1);
  assert.equal(events[0].nodeId, "deer");
  assert.deepEqual(events[0].affectedConsumerIds, ["wolf"]);
});

test("detectFoodWebDisruption produces nothing for a lost node with no consumers", () => {
  const web = createFoodWeb([{ id: "grass", kind: "resource" }], []);
  const events = detectFoodWebDisruption(web, [], ["grass"], 1);
  assert.equal(events.length, 0);
});

test("detectSpeciationSignal fires once trait divergence crosses the threshold, carrying lineage", () => {
  const diverged = createPopulation({
    populationId: "a",
    speciesId: "forest-deer",
    location: "meadow",
    count: 20,
    traitVariance: { size: 0.6, speed: 0.7 },
    lineage: ["ancestral-deer", "forest-deer"],
  });
  const signal = detectSpeciationSignal(diverged, 12, 0.5);
  assert.ok(signal);
  assert.equal(signal!.type, "SpeciationSignal");
  assert.deepEqual(signal!.lineage, ["ancestral-deer", "forest-deer"]);
  assert.ok(signal!.divergence >= 0.5);
});

test("detectSpeciationSignal does not fire below the threshold or with no trait variance data", () => {
  const stable = createPopulation({ populationId: "a", speciesId: "deer", location: "meadow", count: 20, traitVariance: { size: 0.1 } });
  const noData = createPopulation({ populationId: "b", speciesId: "deer", location: "meadow", count: 20 });
  assert.equal(detectSpeciationSignal(stable, 1, 0.5), undefined);
  assert.equal(detectSpeciationSignal(noData, 1, 0.5), undefined);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  birthEvent,
  deathEvent,
  mutationEvent,
  reproductionEvent,
  speciationCandidateEvent,
  extinctionEvent,
  adaptationEvent,
} from "../../biology/events/biologicalEvents";

test("birthEvent carries tick, entityId, speciesId, and parentIds", () => {
  const event = birthEvent(10, "child-1", "demo-critter", ["parent-a", "parent-b"]);
  assert.equal(event.type, "birth");
  assert.equal(event.tick, 10);
  assert.equal(event.entityId, "child-1");
  assert.deepEqual(event.parentIds, ["parent-a", "parent-b"]);
});

test("deathEvent carries a valid cause", () => {
  const event = deathEvent(20, "e-1", "demo-critter", "starvation");
  assert.equal(event.type, "death");
  assert.equal(event.cause, "starvation");
});

test("mutationEvent carries the full mutation record list", () => {
  const event = mutationEvent(5, "e-1", "g-1", [{ kind: "point-mutation", geneId: "sizeGene", alleleId: "size-a" }]);
  assert.equal(event.type, "mutation");
  assert.equal(event.mutations.length, 1);
});

test("reproductionEvent, speciationCandidateEvent, extinctionEvent, adaptationEvent all carry a tick and are plain serializable data", () => {
  const repro = reproductionEvent(1, "demo-critter", ["a", "b"], "child");
  const speciation = speciationCandidateEvent(2, {
    parentSpeciesId: "demo-critter",
    subpopulationAId: "north",
    subpopulationBId: "south",
    geneticDistance: 0.6,
    generationsSeparated: 30,
    geographicallyIsolated: true,
    reproductivelyIsolated: true,
  });
  const extinction = extinctionEvent(3, "demo-critter", 0);
  const adaptation = adaptationEvent(4, "demo-critter", 12, 0.7);

  for (const event of [repro, speciation, extinction, adaptation]) {
    assert.equal(typeof event.tick, "number");
    // Round-tripping through JSON proves these are plain serializable data (no class instances/functions).
    assert.deepEqual(JSON.parse(JSON.stringify(event)), event);
  }
});

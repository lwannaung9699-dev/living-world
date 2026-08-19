import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRegionIndex, populationsInSameRegion, resourcesInRegion, aggregateByRegion, createPopulation, createResource } from "../../ecology";

test("buildRegionIndex groups populations and resources by location", () => {
  const populations = [
    createPopulation({ populationId: "a", speciesId: "deer", location: "forest", count: 10 }),
    createPopulation({ populationId: "b", speciesId: "wolf", location: "forest", count: 2 }),
    createPopulation({ populationId: "c", speciesId: "fish", location: "lake", count: 50 }),
  ];
  const resources = [createResource({ resourceId: "grass", resourceType: "plant", location: "forest", availableAmount: 100, capacity: 200, regenerationRate: 0.1 })];

  const index = buildRegionIndex(populations, resources);
  assert.deepEqual([...index.populationsByLocation.forest].sort(), ["a", "b"]);
  assert.deepEqual([...index.populationsByLocation.lake].sort(), ["c"]);
  assert.deepEqual([...index.resourcesByLocation.forest], ["grass"]);
});

test("populationsInSameRegion excludes the population itself and never crosses locations", () => {
  const populations = [
    createPopulation({ populationId: "a", speciesId: "deer", location: "forest", count: 10 }),
    createPopulation({ populationId: "b", speciesId: "wolf", location: "forest", count: 2 }),
    createPopulation({ populationId: "c", speciesId: "fish", location: "lake", count: 50 }),
  ];
  const index = buildRegionIndex(populations, []);
  const neighbors = populationsInSameRegion(index, populations[0]);
  assert.deepEqual(neighbors, ["b"]);
});

test("resourcesInRegion returns an empty array for a location with no resources, not undefined/throw", () => {
  const index = buildRegionIndex([], []);
  assert.deepEqual(resourcesInRegion(index, "nowhere"), []);
});

test("aggregateByRegion sums biomass and species counts per location, and resource availability separately", () => {
  const populations = [
    createPopulation({ populationId: "a", speciesId: "deer", location: "forest", count: 10 }),
    createPopulation({ populationId: "b", speciesId: "deer", location: "forest", count: 5 }),
    createPopulation({ populationId: "c", speciesId: "fish", location: "lake", count: 50 }),
  ];
  const resources = [createResource({ resourceId: "grass", resourceType: "plant", location: "forest", availableAmount: 100, capacity: 200, regenerationRate: 0.1 })];

  const aggregates = aggregateByRegion(populations, resources);
  assert.equal(aggregates.forest.totalBiomass, 15);
  assert.equal(aggregates.forest.speciesCounts.deer, 15);
  assert.equal(aggregates.forest.totalResourceAvailable, 100);
  assert.equal(aggregates.lake.totalBiomass, 50);
  assert.equal(aggregates.lake.totalResourceAvailable, 0);
});

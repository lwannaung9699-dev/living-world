import { test } from "node:test";
import assert from "node:assert/strict";
import { createResource, regenerateResource, consumeResource, DEFAULT_ECOLOGICAL_ENVIRONMENT } from "../../ecology";

test("createResource builds a valid resource", () => {
  const resource = createResource({
    resourceId: "grass-1",
    resourceType: "plant",
    location: "meadow",
    availableAmount: 500,
    capacity: 1000,
    regenerationRate: 0.1,
  });
  assert.equal(resource.availableAmount, 500);
  assert.equal(resource.consumptionRate, 0);
});

test("regenerateResource grows availableAmount toward capacity, scaled by environment", () => {
  const resource = createResource({
    resourceId: "grass-1",
    resourceType: "plant",
    location: "meadow",
    availableAmount: 0,
    capacity: 1000,
    regenerationRate: 0.5,
  });
  const goodEnv = { ...DEFAULT_ECOLOGICAL_ENVIRONMENT, waterAvailability: 1, habitatQuality: 1 };
  const next = regenerateResource(resource, goodEnv);
  assert.ok(next.availableAmount > resource.availableAmount);
  assert.ok(next.availableAmount <= resource.capacity);
});

test("regenerateResource never exceeds capacity", () => {
  const resource = createResource({
    resourceId: "grass-1",
    resourceType: "plant",
    location: "meadow",
    availableAmount: 990,
    capacity: 1000,
    regenerationRate: 1,
  });
  const goodEnv = { ...DEFAULT_ECOLOGICAL_ENVIRONMENT, waterAvailability: 1, habitatQuality: 1 };
  const next = regenerateResource(resource, goodEnv);
  assert.ok(next.availableAmount <= 1000);
});

test("regenerateResource in a poor environment grows more slowly than in a good one", () => {
  const resource = createResource({
    resourceId: "grass-1",
    resourceType: "plant",
    location: "meadow",
    availableAmount: 0,
    capacity: 1000,
    regenerationRate: 0.5,
  });
  const poorEnv = { ...DEFAULT_ECOLOGICAL_ENVIRONMENT, waterAvailability: 0, habitatQuality: 0 };
  const goodEnv = { ...DEFAULT_ECOLOGICAL_ENVIRONMENT, waterAvailability: 1, habitatQuality: 1 };
  const poorNext = regenerateResource(resource, poorEnv);
  const goodNext = regenerateResource(resource, goodEnv);
  assert.ok(goodNext.availableAmount > poorNext.availableAmount);
});

test("consumeResource removes up to the requested amount and never goes below zero", () => {
  const resource = createResource({
    resourceId: "grass-1",
    resourceType: "plant",
    location: "meadow",
    availableAmount: 50,
    capacity: 1000,
    regenerationRate: 0.1,
  });
  const { resource: after, consumed } = consumeResource(resource, 200);
  assert.equal(consumed, 50);
  assert.equal(after.availableAmount, 0);
  assert.equal(after.consumptionRate, 50);
});

test("consumeResource with amount within availability consumes exactly that amount", () => {
  const resource = createResource({
    resourceId: "grass-1",
    resourceType: "plant",
    location: "meadow",
    availableAmount: 50,
    capacity: 1000,
    regenerationRate: 0.1,
  });
  const { resource: after, consumed } = consumeResource(resource, 20);
  assert.equal(consumed, 20);
  assert.equal(after.availableAmount, 30);
});

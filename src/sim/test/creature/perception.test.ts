import { test } from "node:test";
import assert from "node:assert/strict";
import { perceive, DEFAULT_SENSORY_PROFILE, PerceivableEntity } from "../../creature/perception/perception";

const baseInput = {
  observerId: "obs-1",
  observerPosition: { x: 0, y: 0 },
  facingDegrees: 0,
  tick: 1,
  sensory: DEFAULT_SENSORY_PROFILE,
};

test("perception range: entities beyond vision/smell range are not detected", () => {
  const nearEntity: PerceivableEntity = { id: "near", kind: "resource", position: { x: 5, y: 0 } };
  const farEntity: PerceivableEntity = { id: "far", kind: "resource", position: { x: 1000, y: 0 } };
  const perception = perceive({ ...baseInput, entitiesNearby: [nearEntity, farEntity] });
  const ids = perception.visibleEntities.map((e) => e.id);
  assert.ok(ids.includes("near"));
  assert.ok(!ids.includes("far"));
});

test("field-of-view filtering: entity behind the observer is not seen by vision, even in range", () => {
  const behind: PerceivableEntity = { id: "behind", kind: "resource", position: { x: -5, y: 0 } };
  const perception = perceive({ ...baseInput, entitiesNearby: [behind] });
  assert.equal(perception.visibleEntities.length, 0);
});

test("field-of-view filtering: 360-degree FOV sees entities in every direction", () => {
  const omniSensory = { ...DEFAULT_SENSORY_PROFILE, fieldOfViewDegrees: 360 };
  const behind: PerceivableEntity = { id: "behind", kind: "resource", position: { x: -5, y: 0 } };
  const perception = perceive({ ...baseInput, sensory: omniSensory, entitiesNearby: [behind] });
  assert.equal(perception.visibleEntities.length, 1);
});

test("sensory limitations: smell can detect a scent-emitting entity outside the FOV but within smell range", () => {
  const behindButSmelly: PerceivableEntity = {
    id: "smelly",
    kind: "resource",
    position: { x: -5, y: 0 },
    emitsSmell: true,
  };
  const perception = perceive({ ...baseInput, entitiesNearby: [behindButSmelly] });
  assert.equal(perception.visibleEntities.length, 1);
  assert.equal(perception.visibleEntities[0].id, "smelly");
});

test("sensory limitations: two species with different sensory profiles perceive differently from identical input", () => {
  const strongSmellWeakVision = { ...DEFAULT_SENSORY_PROFILE, visionRange: 2, smellRange: 40 };
  const strongVisionWeakSmell = { ...DEFAULT_SENSORY_PROFILE, visionRange: 40, smellRange: 2 };
  const target: PerceivableEntity = { id: "t", kind: "resource", position: { x: 10, y: 0 }, emitsSmell: true };

  const a = perceive({ ...baseInput, sensory: strongSmellWeakVision, entitiesNearby: [target] });
  const b = perceive({ ...baseInput, sensory: strongVisionWeakSmell, entitiesNearby: [target] });

  assert.equal(a.visibleEntities.length, 1, "strong-smell species should detect via smell");
  assert.equal(b.visibleEntities.length, 1, "strong-vision species should detect via vision");
});

test("threats, food, resources, and social entities are correctly bucketed in perception output", () => {
  const entities: PerceivableEntity[] = [
    { id: "wolf", kind: "creature", position: { x: 3, y: 0 }, isThreat: true },
    { id: "berries", kind: "resource", position: { x: 4, y: 0 }, isFood: true },
    { id: "deer", kind: "creature", position: { x: 5, y: 0 }, speciesId: "deer" },
  ];
  const perception = perceive({ ...baseInput, entitiesNearby: entities });
  assert.equal(perception.threats.length, 1);
  assert.equal(perception.potentialFood.length, 1);
  assert.equal(perception.socialEntities.length, 2);
});

test("hearing: ambient events beyond hearing range are excluded", () => {
  const perception = perceive({
    ...baseInput,
    entitiesNearby: [],
    ambientEvents: [
      { sourceId: "x", kind: "call", position: { x: 5, y: 0 }, loudness: 0.5 },
      { sourceId: "y", kind: "call", position: { x: 999, y: 0 }, loudness: 0.5 },
    ],
  });
  assert.equal(perception.heardEvents.length, 1);
  assert.equal(perception.heardEvents[0].sourceId, "x");
});

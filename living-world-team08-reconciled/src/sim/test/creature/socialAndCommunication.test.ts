import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySocialEntity } from "../../creature/social/socialPerception";
import { createRelationship, applyInteraction } from "../../creature/relationships/relationship";
import { createCommunicationEvent } from "../../creature/communication/communication";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { createInitialCreatureState } from "../../creature/state/creatureState";
import { generatePersonality } from "../../creature/personality/personality";
import { perceive, DEFAULT_SENSORY_PROFILE, PerceivableEntity } from "../../creature/perception/perception";
import { generateCandidateActions, selectBestAction } from "../../creature/decision/utilityAI";
import { StaticEcologyProvider } from "../../creature/integration/ecologyAdapter";

test("social perception: same-species entity with no relationship history classifies as sameSpecies", () => {
  const entity: PerceivableEntity = { id: "e1", kind: "creature", position: { x: 1, y: 1 }, speciesId: "deer" };
  const result = classifySocialEntity(entity, "deer", null);
  assert.equal(result.classification, "sameSpecies");
});

test("social perception: a relationship with high fear classifies the individual as a threat", () => {
  const entity: PerceivableEntity = { id: "e2", kind: "creature", position: { x: 1, y: 1 }, speciesId: "deer" };
  const relationship = { ...createRelationship("self", "e2", 0), fear: 0.9 };
  const result = classifySocialEntity(entity, "deer", relationship);
  assert.equal(result.classification, "threat");
});

test("relationship updates: a friendly interaction increases trust and affection, a hostile one increases hostility", () => {
  const base = createRelationship("a", "b", 0);
  const friendly = applyInteraction(base, "friendly", 1);
  const hostile = applyInteraction(base, "hostile", 1);
  assert.ok(friendly.trust > base.trust);
  assert.ok(friendly.affection > base.affection);
  assert.ok(hostile.hostility > base.hostility);
  assert.ok(hostile.trust < base.trust);
});

test("communication events: a warning call carries source, kind, and position", () => {
  const event = createCommunicationEvent({
    eventId: "evt-1",
    sourceCreatureId: "c1",
    kind: "warning",
    position: { x: 5, y: 5 },
    tick: 10,
  });
  assert.equal(event.kind, "warning");
  assert.equal(event.sourceCreatureId, "c1");
  assert.deepEqual(event.position, { x: 5, y: 5 });
});

const ecology = new StaticEcologyProvider();

test("predator response: a cautious, low-boldness creature facing a threat chooses to flee or hide rather than attack", () => {
  const rng = DeterministicRng.fromSeed("timid-predator-response", 9);
  const creature = createInitialCreatureState({
    creatureId: "prey-1",
    speciesId: "deer",
    position: { x: 0, y: 0 },
    personality: { ...generatePersonality(rng), boldness: 0, caution: 1, aggression: 0, riskTolerance: 0 },
    needs: { hunger: 10, thirst: 10, safety: 0 },
  });
  const threat: PerceivableEntity = { id: "wolf-1", kind: "creature", position: { x: 3, y: 0 }, isThreat: true };
  const perception = perceive({
    observerId: creature.creatureId,
    observerPosition: creature.position,
    facingDegrees: 0,
    tick: 1,
    sensory: DEFAULT_SENSORY_PROFILE,
    entitiesNearby: [threat],
  });
  const decision = selectBestAction(
    creature,
    generateCandidateActions(creature, perception, ecology, "region-1"),
    1,
    DeterministicRng.fromSeed("decision/prey-1", 1),
  );
  assert.ok(decision);
  assert.ok(["flee", "hide"].includes(decision!.proposal.actionId));
});

test("exploration: a curious, unthreatened, well-fed creature still generates an explore/observe candidate", () => {
  const rng = DeterministicRng.fromSeed("curious", 3);
  const creature = createInitialCreatureState({
    creatureId: "curious-1",
    speciesId: "deer",
    position: { x: 0, y: 0 },
    personality: { ...generatePersonality(rng), curiosity: 1 },
    needs: { hunger: 5, thirst: 5, safety: 0, curiosity: 50 },
  });
  const perception = perceive({
    observerId: creature.creatureId,
    observerPosition: creature.position,
    facingDegrees: 0,
    tick: 1,
    sensory: DEFAULT_SENSORY_PROFILE,
    entitiesNearby: [],
  });
  const candidates = generateCandidateActions(creature, perception, ecology, "region-1");
  assert.ok(candidates.some((c) => c.goalId === "explore"));
});

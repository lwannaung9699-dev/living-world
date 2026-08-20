import { test } from "node:test";
import assert from "node:assert/strict";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { createInitialCreatureState } from "../../creature/state/creatureState";
import { generatePersonality, DEFAULT_PERSONALITY_RANGES } from "../../creature/personality/personality";
import { perceive, DEFAULT_SENSORY_PROFILE, PerceivableEntity } from "../../creature/perception/perception";
import { generateCandidateActions, selectBestAction } from "../../creature/decision/utilityAI";
import { StaticEcologyProvider } from "../../creature/integration/ecologyAdapter";

function makeCreature(id: string, overrides: Parameters<typeof createInitialCreatureState>[0]["needs"] = {}) {
  const rng = DeterministicRng.fromSeed(`personality/${id}`, 12345);
  const personality = generatePersonality(rng);
  return createInitialCreatureState({
    creatureId: id,
    speciesId: "test-species",
    position: { x: 0, y: 0 },
    personality,
    needs: overrides,
  });
}

const ecology = new StaticEcologyProvider();

test("goal selection: a starving creature with visible food chooses to eat over exploring", () => {
  const creature = makeCreature("c1", { hunger: 95, thirst: 5, curiosity: 5 });
  const food: PerceivableEntity = { id: "berries", kind: "resource", position: { x: 2, y: 0 }, isFood: true };
  const perception = perceive({
    observerId: creature.creatureId,
    observerPosition: creature.position,
    facingDegrees: 0,
    tick: 1,
    sensory: DEFAULT_SENSORY_PROFILE,
    entitiesNearby: [food],
  });
  const candidates = generateCandidateActions(creature, perception, ecology, "region-1");
  const rng = DeterministicRng.fromSeed("decision/c1", 1);
  const decision = selectBestAction(creature, candidates, 1, rng);
  assert.ok(decision);
  assert.equal(decision!.proposal.actionId, "eat");
  assert.equal(decision!.goal.goalId, "eat");
});

test("utility scoring: a well-fed, safe creature does not choose to flee when nothing threatens it", () => {
  const creature = makeCreature("c2", { hunger: 5, thirst: 5, sleep: 5, safety: 0 });
  const perception = perceive({
    observerId: creature.creatureId,
    observerPosition: creature.position,
    facingDegrees: 0,
    tick: 1,
    sensory: DEFAULT_SENSORY_PROFILE,
    entitiesNearby: [],
  });
  const candidates = generateCandidateActions(creature, perception, ecology, "region-1");
  const rng = DeterministicRng.fromSeed("decision/c2", 1);
  const decision = selectBestAction(creature, candidates, 1, rng);
  assert.ok(decision);
  assert.notEqual(decision!.proposal.actionId, "flee");
});

test("personality differences: two creatures with identical needs/perception can select different actions", () => {
  // Fix every trait that could otherwise influence scoring (riskTolerance affects
  // the risk term on every candidate; curiosity affects "move"'s personality
  // modifier) so sociability/independence are the only thing that differs.
  const sharedTraits = {
    aggression: 0.5,
    caution: 0.5,
    boldness: 0.5,
    riskTolerance: 0.5,
    patience: 0.5,
    territoriality: 0.5,
    curiosity: 0,
  };
  const needs = { hunger: 10, thirst: 10, sleep: 5, safety: 0, social: 40, curiosity: 20, temperature: 0, reproduction: 0 };

  const sociable = createInitialCreatureState({
    creatureId: "sociable-1",
    speciesId: "test-species",
    position: { x: 0, y: 0 },
    personality: { ...sharedTraits, sociability: 1, independence: 0 },
    needs,
  });
  const loner = createInitialCreatureState({
    creatureId: "loner-1",
    speciesId: "test-species",
    position: { x: 0, y: 0 },
    personality: { ...sharedTraits, sociability: 0, independence: 1 },
    needs,
  });

  const peer: PerceivableEntity = { id: "peer", kind: "creature", position: { x: 3, y: 0 }, speciesId: "test-species" };
  const perceptionFor = (creature: typeof sociable) =>
    perceive({
      observerId: creature.creatureId,
      observerPosition: creature.position,
      facingDegrees: 0,
      tick: 1,
      sensory: DEFAULT_SENSORY_PROFILE,
      entitiesNearby: [peer],
    });

  const sociableDecision = selectBestAction(
    sociable,
    generateCandidateActions(sociable, perceptionFor(sociable), ecology, "region-1"),
    1,
    DeterministicRng.fromSeed("decision/sociable", 1),
  );
  const lonerDecision = selectBestAction(
    loner,
    generateCandidateActions(loner, perceptionFor(loner), ecology, "region-1"),
    1,
    DeterministicRng.fromSeed("decision/loner", 1),
  );

  assert.ok(sociableDecision && lonerDecision);
  assert.equal(sociableDecision!.proposal.actionId, "approach", "high-sociability, low-independence creature should approach the peer");
  assert.notEqual(
    lonerDecision!.proposal.actionId,
    "approach",
    "low-sociability, high-independence creature should not choose to approach, given identical needs/perception",
  );
});

test("deterministic decisions: identical creature state + perception + rng seed always yields the same decision", () => {
  const creature = makeCreature("c3", { hunger: 60, thirst: 40 });
  const food: PerceivableEntity = { id: "berries", kind: "resource", position: { x: 2, y: 0 }, isFood: true };
  const perception = perceive({
    observerId: creature.creatureId,
    observerPosition: creature.position,
    facingDegrees: 0,
    tick: 5,
    sensory: DEFAULT_SENSORY_PROFILE,
    entitiesNearby: [food],
  });

  const run = () => {
    const candidates = generateCandidateActions(creature, perception, ecology, "region-1");
    const rng = DeterministicRng.fromSeed("decision/c3", 777);
    return selectBestAction(creature, candidates, 5, rng);
  };

  const a = run();
  const b = run();
  assert.deepEqual(a, b);
});

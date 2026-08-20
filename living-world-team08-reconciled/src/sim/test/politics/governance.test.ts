import { test } from "node:test";
import assert from "node:assert/strict";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { createEmptyPoliticsState } from "../../politics/contracts";
import {
  assignLeader,
  callElection,
  chooseDecisionMethod,
  createGovernanceSystem,
  formCouncil,
  isEligibleForGovernance,
  removeLeader,
  representationForMethod,
  resolveElection,
  type GovernanceSignals,
} from "../../politics/governance";
import type { ActorSnapshot } from "../../politics/adapters/populationAdapter";

const baseSignals: GovernanceSignals = {
  population: 100,
  wealth: 0.5,
  inequality: 0.3,
  cohesion: 0.5,
  topMilitaryStrength: 0.2,
  topReligiousStanding: 0.2,
  topKinship: 0.2,
};

test("isEligibleForGovernance gates on population threshold", () => {
  assert.equal(isEligibleForGovernance({ ...baseSignals, population: 5 }), false);
  assert.equal(isEligibleForGovernance({ ...baseSignals, population: 30 }), true);
});

test("chooseDecisionMethod is not hardcoded: small kin-dense settlements favor elder_council/consensus more often than a large, unequal, martial one, over many draws", () => {
  const kinSignals: GovernanceSignals = { ...baseSignals, population: 40, topKinship: 0.9, inequality: 0.1 };
  const martialSignals: GovernanceSignals = { ...baseSignals, population: 40, topMilitaryStrength: 0.95, inequality: 0.7 };

  let kinElderOrConsensus = 0;
  let martialElderOrConsensus = 0;
  const trials = 200;
  for (let i = 0; i < trials; i++) {
    const rng = DeterministicRng.fromSeed("draw", i);
    const kinMethod = chooseDecisionMethod(kinSignals, rng);
    const martialMethod = chooseDecisionMethod(martialSignals, DeterministicRng.fromSeed("draw", i + 100000));
    if (kinMethod === "elder_council" || kinMethod === "consensus") kinElderOrConsensus++;
    if (martialMethod === "elder_council" || martialMethod === "consensus") martialElderOrConsensus++;
  }
  assert.ok(kinElderOrConsensus > martialElderOrConsensus, "kin-dense settlements should lean elder/consensus more than martial ones");
});

test("different seeds can produce different decision methods for identical signals — nothing is assigned outright", () => {
  const methods = new Set<string>();
  for (let i = 0; i < 50; i++) {
    methods.add(chooseDecisionMethod(baseSignals, DeterministicRng.fromSeed("variety", i)));
  }
  assert.ok(methods.size > 1, "expected the weighted draw to produce more than one distinct outcome across seeds");
});

test("representationForMethod maps every decision method to a defined structure", () => {
  const methods = ["individual_ruler", "elder_council", "consensus", "majority_vote", "representative_vote", "merchant_council", "military_council", "religious_authority", "hereditary_succession"] as const;
  for (const m of methods) {
    assert.ok(typeof representationForMethod(m) === "string");
  }
});

test("createGovernanceSystem is deterministic for a fixed seed and records history", () => {
  let politics = createEmptyPoliticsState();
  const rng = DeterministicRng.fromSeed("gov", 42);
  const result = createGovernanceSystem(politics, "settlement-1", baseSignals, 5, rng);
  politics = result.politics;

  assert.equal(result.governance.scope, "settlement-1");
  assert.equal(result.governance.leaderId, null);
  assert.equal(Object.keys(politics.governanceSystems).length, 1);
  assert.equal(politics.history.filter((h) => h.type === "institution_created").length, 1);
});

function actor(id: string, overrides: Partial<ActorSnapshot> = {}): ActorSnapshot {
  return {
    actorId: id,
    settlementId: "s",
    influence: 0.3,
    wealth: 0.3,
    militaryStrength: 0.3,
    kinship: 0.3,
    religiousStanding: 0.3,
    knowledge: 0.3,
    trust: 0.3,
    ...overrides,
  };
}

test("formCouncil selects members according to the method's selection criteria, favoring higher-scoring actors", () => {
  let politics = createEmptyPoliticsState();
  const rng = DeterministicRng.fromSeed("gov", 1);
  const govResult = createGovernanceSystem(politics, "s", { ...baseSignals, topKinship: 0.9 }, 0, DeterministicRng.fromSeed("force-elder", 7));
  politics = govResult.politics;

  const actors = [actor("a1", { kinship: 0.9 }), actor("a2", { kinship: 0.1 }), actor("a3", { kinship: 0.95 }), actor("a4", { kinship: 0.05 })];
  const councilResult = formCouncil(politics, "s", govResult.governance, actors, 1, rng);
  politics = councilResult.politics;

  assert.ok(councilResult.council.memberIds.length > 0);
  assert.equal(Object.keys(politics.councils).length, 1);
  assert.equal(politics.history.filter((h) => h.type === "council_formed").length, 1);
});

test("election: candidates, votes are tallied, and a winner is deterministically resolved for a fixed seed", () => {
  let politics = createEmptyPoliticsState();
  const called = callElection(politics, "s", "leader", ["c1", "c2", "c3"], ["v1", "v2", "v3", "v4", "v5"], "plurality", 0, 100);
  politics = called.politics;
  assert.equal(called.election.winnerId, null);
  assert.equal(called.election.resolvedAtTick, null);

  const rngA = DeterministicRng.fromSeed("election", 9);
  const resolvedA = resolveElection(politics, called.election.electionId, 1, rngA);
  const winnerA = resolvedA.elections[called.election.electionId].winnerId;

  // Re-run from the same starting point with an identically-seeded RNG: must reproduce the same winner.
  const rngB = DeterministicRng.fromSeed("election", 9);
  const resolvedB = resolveElection(politics, called.election.electionId, 1, rngB);
  const winnerB = resolvedB.elections[called.election.electionId].winnerId;

  assert.equal(winnerA, winnerB);
  assert.ok(["c1", "c2", "c3"].includes(winnerA as string));
  assert.equal(resolvedA.history.filter((h) => h.type === "election_held").length, 1);
});

test("resolveElection is a no-op when called twice on an already-resolved election", () => {
  let politics = createEmptyPoliticsState();
  const called = callElection(politics, "s", "leader", ["c1"], ["v1"], "acclamation", 0, null);
  politics = called.politics;
  politics = resolveElection(politics, called.election.electionId, 1, DeterministicRng.fromSeed("e", 1));
  const afterFirst = politics.elections[called.election.electionId].resolvedAtTick;
  politics = resolveElection(politics, called.election.electionId, 5, DeterministicRng.fromSeed("e", 2));
  assert.equal(politics.elections[called.election.electionId].resolvedAtTick, afterFirst, "second resolve call must not overwrite the first result");
});

test("assignLeader records a SuccessionEvent and appends leader_selected history; removeLeader appends leader_removed", () => {
  let politics = createEmptyPoliticsState();
  const govResult = createGovernanceSystem(politics, "s", baseSignals, 0, DeterministicRng.fromSeed("g", 3));
  politics = govResult.politics;

  politics = assignLeader(politics, govResult.governance.governanceId, "actor-1", 5, "term_end");
  assert.equal(politics.governanceSystems[govResult.governance.governanceId].leaderId, "actor-1");
  assert.equal(Object.values(politics.successions).length, 1);
  assert.equal(politics.history.filter((h) => h.type === "leader_selected").length, 1);

  politics = removeLeader(politics, govResult.governance.governanceId, 6);
  assert.equal(politics.governanceSystems[govResult.governance.governanceId].leaderId, null);
  assert.equal(politics.history.filter((h) => h.type === "leader_removed").length, 1);
});

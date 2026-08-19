import { test } from "node:test";
import assert from "node:assert/strict";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { createEmptyPoliticsState } from "../../politics/contracts";
import { createGovernanceSystem } from "../../politics/governance";
import {
  chooseResolutionMethod,
  deriveRightsAndObligationsFromRule,
  fileAppeal,
  fileJusticeCase,
  grantRight,
  imposeObligation,
  judgeCase,
  raiseDispute,
  resolveDispute,
} from "../../politics/justice";
import type { SocialRule } from "../../politics/contracts";

const baseSignals = { population: 100, wealth: 0.5, inequality: 0.3, cohesion: 0.5, topMilitaryStrength: 0.2, topReligiousStanding: 0.2, topKinship: 0.2 };

test("chooseResolutionMethod: the same offense resolves differently depending on the scope's institutional maturity", () => {
  const noGovernance = chooseResolutionMethod(null, false);
  assert.equal(noGovernance, "family_mediation");

  const rulerGov = { ...createGovernanceSystem(createEmptyPoliticsState(), "s", baseSignals, 0, DeterministicRng.fromSeed("any", 1)).governance, decisionMethod: "individual_ruler" as const };
  assert.equal(chooseResolutionMethod(rulerGov, false), "ruler");

  const withCourt = chooseResolutionMethod(rulerGov, true);
  assert.equal(withCourt, "court", "a settlement with a court institution should always route there regardless of governance type");
});

test("raiseDispute + resolveDispute: unresolved until resolved, then records an outcome and history event", () => {
  let politics = createEmptyPoliticsState();
  const raised = raiseDispute(politics, "s", ["a1", "a2"], "boundary_disagreement", "elder_mediation", 1);
  politics = raised.politics;
  assert.equal(raised.dispute.resolvedAtTick, null);
  assert.equal(raised.dispute.outcome, null);

  politics = resolveDispute(politics, raised.dispute.disputeId, 2, DeterministicRng.fromSeed("d", 1));
  const resolved = politics.disputes[raised.dispute.disputeId];
  assert.equal(resolved.resolvedAtTick, 2);
  assert.ok(["favor_first_party", "favor_second_party", "mutual_compromise"].includes(resolved.outcome as string));
  assert.equal(politics.history.filter((h) => h.type === "dispute_resolved").length, 1);
});

test("resolveDispute does not re-resolve an already-resolved dispute", () => {
  let politics = createEmptyPoliticsState();
  const raised = raiseDispute(politics, "s", ["a1", "a2"], "x", "judge", 1);
  politics = raised.politics;
  politics = resolveDispute(politics, raised.dispute.disputeId, 2, DeterministicRng.fromSeed("d", 1));
  const firstOutcome = politics.disputes[raised.dispute.disputeId].outcome;
  politics = resolveDispute(politics, raised.dispute.disputeId, 9, DeterministicRng.fromSeed("d", 99));
  assert.equal(politics.disputes[raised.dispute.disputeId].outcome, firstOutcome);
});

const testRule: SocialRule = {
  ruleId: "rule-1",
  scope: "s",
  creator: "leader-1",
  enactedAtTick: 0,
  concept: "theft",
  conditions: [],
  prohibitedActions: ["theft"],
  requiredActions: [],
  permissions: [],
  sanctions: ["fine", "compensation", "imprisonment"],
  exceptions: [],
  enforcementStrength: 0.8,
  socialAcceptance: 0.7,
  status: "formal",
};

test("fileJusticeCase starts pending; judgeCase resolves guilt from evidence strength and draws a sanction from the rule's own sanction pool", () => {
  let politics = createEmptyPoliticsState();
  const filed = fileJusticeCase(politics, "s", "victim-1", "accused-1", "theft", testRule, 0.95, ["witness-1"], "court", 3);
  politics = filed.politics;
  assert.equal(filed.justiceCase.judgment, "pending");

  politics = judgeCase(politics, filed.justiceCase.caseId, testRule, 4, DeterministicRng.fromSeed("j", 1));
  const resolved = politics.justiceCases[filed.justiceCase.caseId];
  assert.notEqual(resolved.judgment, "pending");
  if (resolved.judgment === "guilty") {
    assert.ok(testRule.sanctions.includes(resolved.punishment!));
  } else {
    assert.equal(resolved.punishment, null);
  }
  assert.equal(politics.history.filter((h) => h.type === "justice_case_resolved").length, 1);
});

test("judgeCase is idempotent — judging an already-resolved case leaves it unchanged", () => {
  let politics = createEmptyPoliticsState();
  const filed = fileJusticeCase(politics, "s", "v", "a", "theft", testRule, 1, [], "court", 0);
  politics = filed.politics;
  politics = judgeCase(politics, filed.justiceCase.caseId, testRule, 1, DeterministicRng.fromSeed("j", 5));
  const first = politics.justiceCases[filed.justiceCase.caseId];
  politics = judgeCase(politics, filed.justiceCase.caseId, testRule, 99, DeterministicRng.fromSeed("j", 999));
  assert.deepEqual(politics.justiceCases[filed.justiceCase.caseId], first);
});

test("fileAppeal only works on a resolved case, and produces a fresh pending case referencing the original", () => {
  let politics = createEmptyPoliticsState();
  const filed = fileJusticeCase(politics, "s", "v", "a", "theft", testRule, 1, [], "judge", 0);
  politics = filed.politics;

  const tooEarly = fileAppeal(politics, filed.justiceCase.caseId, "ruler", 1);
  assert.equal(tooEarly, null, "cannot appeal a still-pending case");

  politics = judgeCase(politics, filed.justiceCase.caseId, testRule, 1, DeterministicRng.fromSeed("j", 3));
  const appeal = fileAppeal(politics, filed.justiceCase.caseId, "ruler", 2);
  assert.ok(appeal !== null);
  assert.equal(appeal!.appealCase.judgment, "pending");
  assert.equal(appeal!.appealCase.appealOf, filed.justiceCase.caseId);
  assert.equal(appeal!.appealCase.resolutionMethod, "ruler");
});

test("grantRight / imposeObligation / deriveRightsAndObligationsFromRule wire a rule's permissions and requirements into tracked rights/obligations", () => {
  let politics = createEmptyPoliticsState();
  politics = grantRight(politics, "s", "landholders", "vote_on_land_use", 1, "rule-1");
  politics = imposeObligation(politics, "s", "all_members", "pay_tax", 1, "rule-1");
  assert.equal(Object.keys(politics.rights).length, 1);
  assert.equal(Object.keys(politics.obligations).length, 1);

  const withPermission: SocialRule = { ...testRule, ruleId: "rule-2", permissions: ["use_common_land"], requiredActions: [], prohibitedActions: [] };
  politics = deriveRightsAndObligationsFromRule(politics, withPermission, 2);
  assert.equal(Object.keys(politics.rights).length, 2);

  const withObligation: SocialRule = { ...testRule, ruleId: "rule-3", permissions: [], requiredActions: ["report_disputes"] };
  politics = deriveRightsAndObligationsFromRule(politics, withObligation, 3);
  assert.equal(Object.keys(politics.obligations).length, 2);
});

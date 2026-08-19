/**
 * Rules & customary law (brief §4–6).
 *
 * Pipeline: repeated behavior -> social expectation -> violation -> social
 * punishment -> rule strengthens -> (once thresholds are met) crystallizes
 * into a formal SocialRule. Nothing here decides in advance which concept
 * becomes a rule in which settlement — `observeCustom` is driven by
 * whatever behavioral signal the caller (tick.ts) feeds it, sourced from
 * settlement/actor conditions that vary per world.
 */

import type { DeterministicRng } from "../core/rng/deterministicRng";
import {
  CUSTOM_TO_LAW_ENFORCEMENT_THRESHOLD,
  CUSTOM_TO_LAW_OBSERVATION_THRESHOLD,
  DEFAULT_SANCTION_POOL,
  ESCALATED_SANCTION_POOL,
  FORMAL_LAW_MIN_AUTHORITY_CONCENTRATION,
  FORMAL_LAW_POPULATION_THRESHOLD,
} from "./config";
import type { CustomTracker, PoliticsModuleState, RuleStatus, SocialRule } from "./contracts";
import { appendHistory, mintId } from "./state";

/** Records one more observation of a recurring behavior in `scope`, creating its tracker on first sight. */
export function observeCustom(
  politics: PoliticsModuleState,
  scope: string,
  concept: string,
  tick: number,
  wasEnforcedViolation: boolean,
): PoliticsModuleState {
  const trackerKey = `${scope}::${concept}`;
  const existing = Object.values(politics.customTrackers).find((t) => t.scope === scope && t.concept === concept);

  if (!existing) {
    const { id: trackerId, idCounters } = mintId(politics, "custom-tracker");
    const tracker: CustomTracker = {
      trackerId,
      scope,
      concept,
      observedCount: 1,
      enforcedViolationCount: wasEnforcedViolation ? 1 : 0,
      firstObservedTick: tick,
      lastObservedTick: tick,
      producedRuleId: null,
    };
    return {
      ...politics,
      idCounters,
      customTrackers: { ...politics.customTrackers, [trackerId]: tracker },
    };
  }

  const updated: CustomTracker = {
    ...existing,
    observedCount: existing.observedCount + 1,
    enforcedViolationCount: existing.enforcedViolationCount + (wasEnforcedViolation ? 1 : 0),
    lastObservedTick: tick,
  };
  void trackerKey;
  return { ...politics, customTrackers: { ...politics.customTrackers, [existing.trackerId]: updated } };
}

/**
 * Checks every un-crystallized tracker in `scope`; any that has crossed both
 * the observation and enforcement thresholds becomes a new customary
 * SocialRule. Returns the updated state (idempotent — trackers that already
 * produced a rule are skipped).
 */
export function crystallizeCustomsIntoRules(
  politics: PoliticsModuleState,
  scope: string,
  tick: number,
  rng: DeterministicRng,
): PoliticsModuleState {
  let next = politics;
  for (const tracker of Object.values(politics.customTrackers)) {
    if (tracker.scope !== scope || tracker.producedRuleId !== null) continue;
    if (
      tracker.observedCount < CUSTOM_TO_LAW_OBSERVATION_THRESHOLD ||
      tracker.enforcedViolationCount < CUSTOM_TO_LAW_ENFORCEMENT_THRESHOLD
    ) {
      continue;
    }

    const { id: ruleId, idCounters } = mintId(next, "rule");
    const sanctions = rng.choose([DEFAULT_SANCTION_POOL, ESCALATED_SANCTION_POOL]);
    const rule: SocialRule = {
      ruleId,
      scope,
      creator: null, // diffuse origin — customary law has no single author
      enactedAtTick: tick,
      concept: tracker.concept,
      conditions: [],
      prohibitedActions: [`violates:${tracker.concept}`],
      requiredActions: [],
      permissions: [],
      sanctions,
      exceptions: [],
      enforcementStrength: clamp01(tracker.enforcedViolationCount / Math.max(1, tracker.observedCount)),
      socialAcceptance: clamp01(tracker.observedCount / (tracker.observedCount + 3)),
      status: "customary",
    };

    next = {
      ...next,
      idCounters,
      rules: { ...next.rules, [ruleId]: rule },
      customTrackers: { ...next.customTrackers, [tracker.trackerId]: { ...tracker, producedRuleId: ruleId } },
    };
    next = appendHistory(next, {
      type: "rule_created",
      tick,
      scope,
      summary: `Customary rule formed around "${tracker.concept}" after ${tracker.observedCount} observations.`,
      refs: { ruleId },
    });
  }
  return next;
}

/**
 * Evaluates whether a scope's accumulated customary rules should formalize
 * into codified law (brief §6): population growth, conflict/trade
 * pressure, and centralized authority all push toward formalization. The
 * caller supplies the current population and authority-concentration
 * signal for the scope; this function never invents them.
 */
export function maybeFormalizeLaw(
  politics: PoliticsModuleState,
  scope: string,
  tick: number,
  population: number,
  authorityConcentration: number,
  creatorId: string | null,
): PoliticsModuleState {
  if (population < FORMAL_LAW_POPULATION_THRESHOLD) return politics;
  if (authorityConcentration < FORMAL_LAW_MIN_AUTHORITY_CONCENTRATION) return politics;

  let next = politics;
  for (const rule of Object.values(politics.rules)) {
    if (rule.scope !== scope || rule.status !== "customary") continue;
    const formalized: SocialRule = {
      ...rule,
      status: "formal" as RuleStatus,
      creator: creatorId,
      enforcementStrength: clamp01(rule.enforcementStrength + 0.15),
    };
    next = { ...next, rules: { ...next.rules, [rule.ruleId]: formalized } };
    next = appendHistory(next, {
      type: "law_created",
      tick,
      scope,
      summary: `Customary rule "${rule.concept}" codified into formal law.`,
      refs: { ruleId: rule.ruleId },
    });
  }
  return next;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

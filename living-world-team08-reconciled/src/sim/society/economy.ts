/**
 * Resource sharing (spec §11) and trade foundation (spec §25).
 *
 * Team 07 does not force one economic model. `resourceSharingMode` is
 * itself derived from measurable group history (average trust and
 * accumulated customs) rather than hardcoded per "civilization type" — a
 * high-trust group with few private customs drifts toward communal
 * sharing; a group with strong individual role differentiation and lower
 * average trust drifts toward private/barter patterns.
 */

import { SocietyState, sortedEntries } from "./state";
import { getRelationship } from "./relationships";
import { nextId } from "./id";
import { TradeRecord } from "./types";

export type ResourceSharingMode = "communal_sharing" | "private_ownership" | "gift_economy" | "redistribution";

export function classifySharingMode(society: SocietyState, groupId: string): ResourceSharingMode {
  const group = society.groups[groupId];
  if (!group || group.memberIds.length === 0) return "private_ownership";

  let trustSum = 0;
  let count = 0;
  for (let i = 0; i < group.memberIds.length; i++) {
    for (let j = i + 1; j < group.memberIds.length; j++) {
      const rel = getRelationship(society, group.memberIds[i], group.memberIds[j]);
      if (rel) {
        trustSum += rel.trust;
        count += 1;
      }
    }
  }
  const avgTrust = count > 0 ? trustSum / count : 0;
  const hasLeader = group.leaderIds.length > 0 && group.leaderIds.length < group.memberIds.length;

  if (avgTrust > 0.4) return "communal_sharing";
  if (avgTrust > 0.15 && hasLeader) return "redistribution";
  if (avgTrust > 0.15) return "gift_economy";
  return "private_ownership";
}

/** Distributes a group's pooled resources back out per its emergent sharing mode. Communal/redistribution drain the pool each tick (consumed by the group); private/gift leave it largely untouched (individuals are assumed to hold their own share, tracked outside Team 07's scope). */
export function settleResourcePool(society: SocietyState, decayFraction = 0.3): SocietyState {
  let groups = society.groups;
  for (const [groupId, group] of sortedEntries(groups)) {
    if (!group.active) continue;
    const mode = classifySharingMode(society, groupId);
    const drain = mode === "communal_sharing" || mode === "redistribution" ? decayFraction : decayFraction * 0.5;
    groups = { ...groups, [groupId]: { ...group, resources: { pooled: group.resources.pooled * (1 - drain) } } };
  }
  return { ...society, groups };
}

const TRADE_TRUST_MIN = -0.2; // groups with severe active hostility do not trade

/**
 * Evaluates trade between every pair of active groups sharing overlapping
 * territory (spec §14/§25: contact implied by shared influence over a
 * location). Trade value depends on relative scarcity (the receiving
 * group's pooled resources vs the giving group's), not a universal price.
 */
export function evaluateTrade(society: SocietyState, tick: number): SocietyState {
  const groupIds = Object.keys(society.groups)
    .filter((id) => society.groups[id].active)
    .sort();

  let current = society;
  for (let i = 0; i < groupIds.length; i++) {
    for (let j = i + 1; j < groupIds.length; j++) {
      const groupA = current.groups[groupIds[i]];
      const groupB = current.groups[groupIds[j]];
      const sharedLocations = Object.keys(groupA.territory).filter((loc) => loc in groupB.territory);
      if (sharedLocations.length === 0) continue;

      // Inter-group trust proxy: average trust between any known cross-group relationship.
      let trustSum = 0;
      let count = 0;
      for (const memberA of groupA.memberIds) {
        for (const memberB of groupB.memberIds) {
          const rel = getRelationship(current, memberA, memberB);
          if (rel) {
            trustSum += rel.trust;
            count += 1;
          }
        }
      }
      const avgTrust = count > 0 ? trustSum / count : 0;
      if (avgTrust < TRADE_TRUST_MIN) continue;

      const scarcityGap = groupB.resources.pooled - groupA.resources.pooled;
      if (Math.abs(scarcityGap) < 0.5) continue; // not enough differential to motivate exchange

      const [giver, receiver] = scarcityGap < 0 ? [groupIds[i], groupIds[j]] : [groupIds[j], groupIds[i]];
      const value = Math.min(Math.abs(scarcityGap) * 0.2, current.groups[giver].resources.pooled * 0.3);
      if (value <= 0) continue;

      const kind = avgTrust > 0.3 ? "gift" : "exchange";

      current = {
        ...current,
        groups: {
          ...current.groups,
          [giver]: { ...current.groups[giver], resources: { pooled: current.groups[giver].resources.pooled - value } },
          [receiver]: {
            ...current.groups[receiver],
            resources: { pooled: current.groups[receiver].resources.pooled + value },
          },
        },
      };

      const { id: tradeId, state: withCounter } = nextId(current, "trade");
      const record: TradeRecord = { tradeId, groupA: giver, groupB: receiver, kind, value, tick };
      current = { ...withCounter, trades: { ...withCounter.trades, [tradeId]: record } };
    }
  }
  return current;
}

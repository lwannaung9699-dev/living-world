/**
 * Social group system (spec §4).
 *
 * Groups are never spawned as `createKingdom("Human Empire")`. The only
 * "authoring" primitive is `createGroup`, and even that is called by the
 * group-formation subsystem in response to emergent trust clusters — never
 * by hardcoded world-generation logic.
 */

import { IndividualSnapshot } from "./contracts";
import { SocialGroup } from "./types";
import { SocietyState, sortedEntries } from "./state";
import { nextId } from "./id";
import { getRelationship } from "./relationships";

const TRUST_JOIN_THRESHOLD = 0.3;

export function createGroup(
  society: SocietyState,
  founderIds: readonly string[],
  tick: number,
  parentGroupId: string | null = null,
): { society: SocietyState; groupId: string } {
  const { id: groupId, state: withCounter } = nextId(society, "group");
  const sortedFounders = founderIds.slice().sort();
  const group: SocialGroup = {
    groupId,
    memberIds: sortedFounders,
    founderIds: sortedFounders,
    leaderIds: [],
    sharedGoals: [],
    territory: {},
    resources: { pooled: 0, economicStockTotal: 0 },
    customs: [],
    normIds: [],
    identitySymbolIds: [],
    foundedTick: tick,
    tension: 0,
    parentGroupId,
    active: true,
  };
  let individualGroups = withCounter.individualGroups;
  for (const id of sortedFounders) {
    individualGroups = { ...individualGroups, [id]: groupId };
  }
  return {
    society: {
      ...withCounter,
      groups: { ...withCounter.groups, [groupId]: group },
      individualGroups,
    },
    groupId,
  };
}

export function joinGroup(society: SocietyState, groupId: string, individualId: string): SocietyState {
  const group = society.groups[groupId];
  if (!group || !group.active) return society;
  if (group.memberIds.includes(individualId)) return society;
  const memberIds = [...group.memberIds, individualId].sort();
  return {
    ...society,
    groups: { ...society.groups, [groupId]: { ...group, memberIds } },
    individualGroups: { ...society.individualGroups, [individualId]: groupId },
  };
}

export function leaveGroup(society: SocietyState, groupId: string, individualId: string): SocietyState {
  const group = society.groups[groupId];
  if (!group) return society;
  const memberIds = group.memberIds.filter((id) => id !== individualId);
  const leaderIds = group.leaderIds.filter((id) => id !== individualId);
  const { [individualId]: _removed, ...individualGroups } = society.individualGroups;
  return {
    ...society,
    groups: { ...society.groups, [groupId]: { ...group, memberIds, leaderIds } },
    individualGroups,
  };
}

/** Founds a new group from a subset of an existing group's members, without dissolving the parent. */
export function splitGroup(
  society: SocietyState,
  groupId: string,
  departingMemberIds: readonly string[],
  tick: number,
): { society: SocietyState; newGroupId: string | null } {
  const group = society.groups[groupId];
  if (!group) return { society, newGroupId: null };
  const departing = departingMemberIds.filter((id) => group.memberIds.includes(id));
  if (departing.length === 0) return { society, newGroupId: null };

  const remaining = group.memberIds.filter((id) => !departing.includes(id));
  const withoutDeparting: SocietyState = {
    ...society,
    groups: { ...society.groups, [groupId]: { ...group, memberIds: remaining } },
  };
  const { society: withNewGroup, groupId: newGroupId } = createGroup(withoutDeparting, departing, tick, groupId);
  // New group inherits customs/norms as a starting point but is free to diverge (spec §27).
  const parent = withNewGroup.groups[groupId];
  const child = withNewGroup.groups[newGroupId];
  const seeded = {
    ...withNewGroup,
    groups: {
      ...withNewGroup.groups,
      [newGroupId]: { ...child, customs: parent.customs, normIds: [] as string[] },
    },
  };
  return { society: seeded, newGroupId };
}

/** Merges groupB into groupA. groupB is deactivated but its record is retained for history (spec §28). */
export function mergeGroups(society: SocietyState, groupIdA: string, groupIdB: string, tick: number): SocietyState {
  const a = society.groups[groupIdA];
  const b = society.groups[groupIdB];
  if (!a || !b || !a.active || !b.active) return society;

  const memberIds = [...new Set([...a.memberIds, ...b.memberIds])].sort();
  const customs = [...new Set([...a.customs, ...b.customs])];
  const mergedA: SocialGroup = { ...a, memberIds, customs };
  const deactivatedB: SocialGroup = { ...b, active: false, memberIds: [] };

  let individualGroups = society.individualGroups;
  for (const id of b.memberIds) {
    individualGroups = { ...individualGroups, [id]: groupIdA };
  }

  return {
    ...society,
    groups: { ...society.groups, [groupIdA]: mergedA, [groupIdB]: deactivatedB },
    individualGroups,
  };
}

/** Marks a group destroyed (all members already departed). Historical record is kept, not deleted. */
export function destroyGroup(society: SocietyState, groupId: string): SocietyState {
  const group = society.groups[groupId];
  if (!group) return society;
  return { ...society, groups: { ...society.groups, [groupId]: { ...group, active: false, memberIds: [] } } };
}

/**
 * Emergent group formation: unaffiliated individuals whose mutual trust
 * exceeds TRUST_JOIN_THRESHOLD, and who share a location, are clustered via
 * deterministic union-find (processed in sorted-pair order) and founded as
 * new groups, or absorbed into an existing group one of the cluster's
 * members already belongs to.
 */
export function formGroupsFromTrustClusters(
  society: SocietyState,
  individuals: readonly IndividualSnapshot[],
  tick: number,
): SocietyState {
  const living = individuals.filter((i) => i.alive);
  const ids = living.map((i) => i.id).sort();
  const parent = new Map<string, string>(ids.map((id) => [id, id]));

  function find(x: string): string {
    while (parent.get(x) !== x) {
      const p = parent.get(x)!;
      parent.set(x, parent.get(p)!);
      x = p;
    }
    return x;
  }
  function union(x: string, y: string): void {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent.set(rx < ry ? ry : rx, rx < ry ? rx : ry);
  }

  const byLocation = new Map<string, string[]>();
  for (const ind of living) {
    const list = byLocation.get(ind.locationId) ?? [];
    list.push(ind.id);
    byLocation.set(ind.locationId, list);
  }

  for (const locationId of [...byLocation.keys()].sort()) {
    const group = byLocation.get(locationId)!.slice().sort();
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const rel = getRelationship(society, group[i], group[j]);
        if (rel && rel.trust >= TRUST_JOIN_THRESHOLD) {
          union(group[i], group[j]);
        }
      }
    }
  }

  const clusters = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const list = clusters.get(root) ?? [];
    list.push(id);
    clusters.set(root, list);
  }

  let current = society;
  for (const root of [...clusters.keys()].sort()) {
    const members = clusters.get(root)!.sort();
    if (members.length < 2) continue;

    const existingGroupIds = [...new Set(members.map((id) => current.individualGroups[id]).filter(Boolean))].sort();
    if (existingGroupIds.length === 0) {
      const { society: withGroup } = createGroup(current, members, tick);
      current = withGroup;
    } else {
      const targetGroupId = existingGroupIds[0];
      for (const id of members) {
        if (current.individualGroups[id] !== targetGroupId) {
          const priorGroupId = current.individualGroups[id];
          let next = current;
          if (priorGroupId) next = leaveGroup(next, priorGroupId, id);
          current = joinGroup(next, targetGroupId, id);
        }
      }
    }
  }

  return current;
}

const SPLIT_TENSION_THRESHOLD = 0.75;
const SPLIT_POPULATION_THRESHOLD = 12;
const MERGE_TRUST_THRESHOLD = 0.5;

/**
 * Fission (spec §27): population growth + resource pressure + social
 * conflict shows up here as accumulated group tension. Once tension is
 * high and the group is large enough to plausibly split, the
 * lowest-average-trust-to-the-rest cohort (found by a simple trust cut)
 * departs to found a new group.
 */
export function evaluateGroupSplits(society: SocietyState, tick: number): SocietyState {
  let current = society;
  for (const groupId of Object.keys(current.groups).sort()) {
    const group = current.groups[groupId];
    if (!group.active) continue;
    if (group.tension < SPLIT_TENSION_THRESHOLD) continue;
    if (group.memberIds.length < SPLIT_POPULATION_THRESHOLD) continue;

    const scored = group.memberIds
      .map((id) => {
        let sum = 0;
        let count = 0;
        for (const other of group.memberIds) {
          if (other === id) continue;
          const rel = getRelationship(current, id, other);
          if (rel) {
            sum += rel.trust;
            count += 1;
          }
        }
        return { id, avgTrust: count > 0 ? sum / count : 0 };
      })
      .sort((a, b) => a.avgTrust - b.avgTrust || a.id.localeCompare(b.id));

    const departingCount = Math.max(2, Math.floor(group.memberIds.length * 0.3));
    const departing = scored.slice(0, departingCount).map((s) => s.id);

    const { society: afterSplit } = splitGroup(current, groupId, departing, tick);
    current = {
      ...afterSplit,
      groups: { ...afterSplit.groups, [groupId]: { ...afterSplit.groups[groupId], tension: afterSplit.groups[groupId].tension * 0.4 } },
    };
  }
  return current;
}

/**
 * Merging (spec §28): two groups whose members hold sufficiently high
 * mutual average trust (the measurable proxy for alliance/marriage/shared
 * threat bonds having already formed at the individual level) combine.
 * Merged groups retain their historical differences: mergeGroups() unions
 * customs rather than discarding either side's.
 */
export function evaluateGroupMerges(society: SocietyState, tick: number): SocietyState {
  let current = society;
  const groupIds = Object.keys(current.groups)
    .filter((id) => current.groups[id].active)
    .sort();

  for (let i = 0; i < groupIds.length; i++) {
    for (let j = i + 1; j < groupIds.length; j++) {
      const a = current.groups[groupIds[i]];
      const b = current.groups[groupIds[j]];
      if (!a || !b || !a.active || !b.active) continue;
      if (a.memberIds.length === 0 || b.memberIds.length === 0) continue;

      let sum = 0;
      let count = 0;
      for (const memberA of a.memberIds) {
        for (const memberB of b.memberIds) {
          const rel = getRelationship(current, memberA, memberB);
          if (rel) {
            sum += rel.trust;
            count += 1;
          }
        }
      }
      const coverage = count / (a.memberIds.length * b.memberIds.length);
      const avgTrust = count > 0 ? sum / count : 0;
      if (coverage < 0.5 || avgTrust < MERGE_TRUST_THRESHOLD) continue;

      current = mergeGroups(current, groupIds[i], groupIds[j], tick);
    }
  }
  return current;
}

/** Removes individuals who are no longer alive/present from every active group. */
export function pruneAbsentMembers(society: SocietyState, livingIds: ReadonlySet<string>): SocietyState {
  let current = society;
  for (const [groupId, group] of sortedEntries(current.groups)) {
    if (!group.active) continue;
    for (const memberId of group.memberIds) {
      if (!livingIds.has(memberId)) {
        current = leaveGroup(current, groupId, memberId);
      }
    }
  }
  return current;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialSocietyState } from "../society/state";
import { createGroup, joinGroup, leaveGroup, splitGroup, mergeGroups } from "../society/groups";

test("1. group creation registers members, founders, and individualGroups index", () => {
  const society = createInitialSocietyState();
  const { society: after, groupId } = createGroup(society, ["alice", "bob"], 10);
  const group = after.groups[groupId];
  assert.ok(group);
  assert.deepEqual(group.memberIds, ["alice", "bob"]);
  assert.deepEqual(group.founderIds, ["alice", "bob"]);
  assert.equal(group.foundedTick, 10);
  assert.equal(after.individualGroups["alice"], groupId);
  assert.equal(after.individualGroups["bob"], groupId);
});

test("2. group joining adds a member and updates the individual index", () => {
  const society = createInitialSocietyState();
  const { society: withGroup, groupId } = createGroup(society, ["alice"], 0);
  const after = joinGroup(withGroup, groupId, "carol");
  assert.deepEqual(after.groups[groupId].memberIds, ["alice", "carol"]);
  assert.equal(after.individualGroups["carol"], groupId);
});

test("2b. joining twice is a no-op", () => {
  const society = createInitialSocietyState();
  const { society: withGroup, groupId } = createGroup(society, ["alice"], 0);
  const once = joinGroup(withGroup, groupId, "carol");
  const twice = joinGroup(once, groupId, "carol");
  assert.deepEqual(twice.groups[groupId].memberIds, ["alice", "carol"]);
});

test("3. group leaving removes a member, clears leader status, and clears the individual index", () => {
  const society = createInitialSocietyState();
  const { society: withGroup, groupId } = createGroup(society, ["alice", "bob"], 0);
  const withLeader = { ...withGroup, groups: { ...withGroup.groups, [groupId]: { ...withGroup.groups[groupId], leaderIds: ["bob"] } } };
  const after = leaveGroup(withLeader, groupId, "bob");
  assert.deepEqual(after.groups[groupId].memberIds, ["alice"]);
  assert.deepEqual(after.groups[groupId].leaderIds, []);
  assert.equal(after.individualGroups["bob"], undefined);
});

test("4. group splitting founds a new group from departing members, leaves the parent otherwise intact", () => {
  const society = createInitialSocietyState();
  const { society: withGroup, groupId } = createGroup(society, ["a", "b", "c", "d"], 0);
  const { society: after, newGroupId } = splitGroup(withGroup, groupId, ["c", "d"], 50);
  assert.ok(newGroupId);
  assert.deepEqual(after.groups[groupId].memberIds, ["a", "b"]);
  assert.deepEqual(after.groups[newGroupId!].memberIds, ["c", "d"]);
  assert.equal(after.groups[newGroupId!].parentGroupId, groupId);
  assert.equal(after.groups[newGroupId!].foundedTick, 50);
});

test("4b. splitting off members not in the group is a no-op", () => {
  const society = createInitialSocietyState();
  const { society: withGroup, groupId } = createGroup(society, ["a", "b"], 0);
  const { society: after, newGroupId } = splitGroup(withGroup, groupId, ["zzz"], 0);
  assert.equal(newGroupId, null);
  assert.deepEqual(after.groups[groupId].memberIds, ["a", "b"]);
});

test("5. group merging unions members and customs, retains the absorbed group's historical record", () => {
  const society = createInitialSocietyState();
  const { society: s1, groupId: groupA } = createGroup(society, ["a1", "a2"], 0);
  const { society: s2, groupId: groupB } = createGroup(s1, ["b1"], 0);
  const withCustoms = {
    ...s2,
    groups: {
      ...s2.groups,
      [groupA]: { ...s2.groups[groupA], customs: ["greet-elders"] },
      [groupB]: { ...s2.groups[groupB], customs: ["share-catch"] },
    },
  };
  const merged = mergeGroups(withCustoms, groupA, groupB, 100);
  assert.deepEqual(merged.groups[groupA].memberIds, ["a1", "a2", "b1"]);
  assert.deepEqual(new Set(merged.groups[groupA].customs), new Set(["greet-elders", "share-catch"]));
  assert.equal(merged.groups[groupB].active, false);
  assert.deepEqual(merged.groups[groupB].memberIds, []); // absorbed, but the historical record (customs, founding) survives
  assert.equal(merged.individualGroups["b1"], groupA);
});

test("6. destroyed groups are marked inactive but their record is retained, not deleted", () => {
  const society = createInitialSocietyState();
  const { society: withGroup, groupId } = createGroup(society, ["solo"], 0);
  const afterLeave = leaveGroup(withGroup, groupId, "solo");
  assert.ok(afterLeave.groups[groupId]); // still present in history
});

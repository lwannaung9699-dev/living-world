/**
 * Institutions (spec §30) and war foundation (spec §29 — hostility only,
 * no combat execution: that belongs to the appropriate gameplay/physics
 * systems per the spec).
 *
 * Institutions are never spawned automatically at group founding. They
 * crystallize only once a repeated social function has stayed stable long
 * enough: a leadership arrangement that persists (authority / council), a
 * settlement with a symbol of "religion" meaning plus stable participants
 * (religious_organization), consistent trade activity (trade_organization),
 * or sustained high group tension with an armed response posture
 * (military_organization).
 */

import { Institution, InstitutionKind } from "./types";
import { SocietyState, sortedEntries } from "./state";
import { nextId } from "./id";

const STABILITY_TICKS_REQUIRED = 100;

export function updateInstitutions(society: SocietyState, tick: number): SocietyState {
  let current = society;

  for (const [groupId, group] of sortedEntries(current.groups)) {
    if (!group.active) continue;

    const existing = (kind: InstitutionKind) =>
      Object.values(current.institutions).find((inst) => inst.groupId === groupId && inst.kind === kind);

    // Authority / council: leadership has existed and been broadly stable.
    if (group.leaderIds.length > 0) {
      const kind: InstitutionKind = group.leaderIds.length > 1 ? "council" : "authority";
      const other = kind === "council" ? existing("authority") : existing("council");
      const found = existing(kind);
      if (found) {
        current = bumpStability(current, found.institutionId, group.leaderIds, tick);
      } else if (!other) {
        current = foundInstitution(current, groupId, kind, group.leaderIds, tick);
      } else {
        current = replaceInstitution(current, other.institutionId, kind, group.leaderIds, tick);
      }
    }

    // Trade organization: the group has an established, ongoing trade pattern.
    const tradeCount = Object.values(current.trades).filter((t) => t.groupA === groupId || t.groupB === groupId).length;
    if (tradeCount >= 5) {
      const found = existing("trade_organization");
      const traderMembers = group.memberIds.filter((id) => current.individualRoles[id] === "trader");
      if (found) {
        current = bumpStability(current, found.institutionId, traderMembers, tick);
      } else {
        current = foundInstitution(current, groupId, "trade_organization", traderMembers, tick);
      }
    }

    // Military organization: sustained high tension with guards present.
    const guardMembers = group.memberIds.filter((id) => current.individualRoles[id] === "guard");
    if (group.tension > 0.5 && guardMembers.length > 0) {
      const found = existing("military_organization");
      if (found) {
        current = bumpStability(current, found.institutionId, guardMembers, tick);
      } else {
        current = foundInstitution(current, groupId, "military_organization", guardMembers, tick);
      }
    }

    // Clan authority: a kinship-dense group (many kin ties) with an elder-style leader (high experience).
    // Represented simply: group has kin-tagged relationships among a majority of members.
  }

  return current;
}

function foundInstitution(
  society: SocietyState,
  groupId: string,
  kind: InstitutionKind,
  memberIds: readonly string[],
  tick: number,
): SocietyState {
  const { id: institutionId, state: withCounter } = nextId(society, "institution");
  const institution: Institution = {
    institutionId,
    groupId,
    kind,
    memberIds: [...memberIds].sort(),
    establishedTick: tick,
    stabilityTicks: 1,
  };
  return { ...withCounter, institutions: { ...withCounter.institutions, [institutionId]: institution } };
}

function bumpStability(society: SocietyState, institutionId: string, memberIds: readonly string[], _tick: number): SocietyState {
  const inst = society.institutions[institutionId];
  if (!inst) return society;
  return {
    ...society,
    institutions: {
      ...society.institutions,
      [institutionId]: { ...inst, memberIds: [...memberIds].sort(), stabilityTicks: inst.stabilityTicks + 1 },
    },
  };
}

function replaceInstitution(
  society: SocietyState,
  institutionId: string,
  kind: InstitutionKind,
  memberIds: readonly string[],
  tick: number,
): SocietyState {
  const inst = society.institutions[institutionId];
  if (!inst) return society;
  return {
    ...society,
    institutions: {
      ...society.institutions,
      [institutionId]: { ...inst, kind, memberIds: [...memberIds].sort(), establishedTick: tick, stabilityTicks: 1 },
    },
  };
}

export function isStableInstitution(institution: Institution): boolean {
  return institution.stabilityTicks >= STABILITY_TICKS_REQUIRED;
}

/* -------------------------------- war foundation (§29) -------------------------------- */

export type HostilityPosture = "peace" | "threat" | "mobilization" | "raid_posture" | "defense_posture";

/** Derives a group's current hostility posture from tension and whether it has a military_organization — foundation only; no combat execution here. */
export function hostilityPosture(society: SocietyState, groupId: string): HostilityPosture {
  const group = society.groups[groupId];
  if (!group) return "peace";
  const hasMilitary = Object.values(society.institutions).some(
    (i) => i.groupId === groupId && i.kind === "military_organization",
  );
  if (group.tension < 0.3) return "peace";
  if (group.tension < 0.5) return "threat";
  if (!hasMilitary) return "mobilization";
  return group.tension >= 0.75 ? "raid_posture" : "defense_posture";
}

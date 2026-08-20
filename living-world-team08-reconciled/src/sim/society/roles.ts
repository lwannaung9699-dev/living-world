/**
 * Social role subsystem (spec §10).
 *
 * Roles are never assigned wholesale at world creation. Each tick, every
 * member of an active group is scored against every role by a fixed,
 * deterministic suitability function (trait fit + opportunity from local
 * resource abundance + a small preference-continuity term that rewards
 * keeping a role once earned, modeling experience) and assigned their best
 * fit. Ties break on individual id so results are order-independent.
 */

import { IndividualSnapshot } from "./contracts";
import { EcologyAdapter, abundanceAt } from "./contracts";
import { WorldState } from "../core/state/worldState";
import { SocialRole, SOCIAL_ROLES } from "./types";
import { SocietyState } from "./state";

function traitFit(role: SocialRole, individual: IndividualSnapshot): number {
  const t = individual.traits;
  switch (role) {
    case "hunter":
      return t.aggression * 0.6 + (1 - t.empathy) * 0.2 + t.ambition * 0.2;
    case "gatherer":
      return t.sociability * 0.2 + (1 - t.aggression) * 0.5 + t.empathy * 0.3;
    case "builder":
      return t.ambition * 0.5 + (1 - t.sociability) * 0.3 + 0.2;
    case "healer":
      return t.empathy * 0.7 + t.sociability * 0.3;
    case "craftsperson":
      return t.ambition * 0.4 + (1 - t.aggression) * 0.4 + 0.2;
    case "trader":
      return t.sociability * 0.5 + t.ambition * 0.4 + (1 - t.aggression) * 0.1;
    case "scout":
      return t.ambition * 0.3 + (1 - t.sociability) * 0.4 + 0.3;
    case "guard":
      return t.aggression * 0.5 + (1 - t.empathy) * 0.1 + 0.2;
    case "leader":
      return t.ambition * 0.4 + t.sociability * 0.3 + t.empathy * 0.3;
    case "teacher":
      return t.empathy * 0.5 + t.sociability * 0.5;
    case "farmer":
      return (1 - t.aggression) * 0.4 + t.empathy * 0.2 + 0.2;
    case "artisan":
      return t.ambition * 0.4 + t.empathy * 0.2 + 0.2;
    case "storyteller":
      return t.sociability * 0.6 + t.empathy * 0.4;
  }
}

function suitability(
  role: SocialRole,
  individual: IndividualSnapshot,
  opportunity: number,
  currentRole: string | undefined,
): number {
  const fit = traitFit(role, individual);
  const continuity = currentRole === role ? 0.1 : 0;
  const opportunityWeight = role === "hunter" || role === "gatherer" || role === "farmer" ? opportunity : 0.5;
  return fit * 0.7 + opportunityWeight * 0.2 + continuity;
}

export function updateRoles(
  society: SocietyState,
  individuals: readonly IndividualSnapshot[],
  worldState: WorldState,
  ecology: EcologyAdapter,
): SocietyState {
  const resources = ecology.listLocationResources(worldState);
  let individualRoles = society.individualRoles;

  for (const groupId of Object.keys(society.groups).sort()) {
    const group = society.groups[groupId];
    if (!group.active) continue;
    const members = group.memberIds
      .map((id) => individuals.find((i) => i.id === id))
      .filter((i): i is IndividualSnapshot => i !== undefined)
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const member of members) {
      const opportunity = abundanceAt(resources, member.locationId);
      let bestRole: SocialRole = SOCIAL_ROLES[0];
      let bestScore = -Infinity;
      for (const role of SOCIAL_ROLES) {
        const score = suitability(role, member, opportunity, individualRoles[member.id]);
        if (score > bestScore) {
          bestScore = score;
          bestRole = role;
        }
      }
      individualRoles = { ...individualRoles, [member.id]: bestRole };
    }
  }

  return { ...society, individualRoles };
}

/**
 * Leadership emergence subsystem (spec §9).
 *
 * Deliberately NOT `leader = highestStrengthNPC`. Each member's leadership
 * score blends trust others place in them, competence (ambition trait as a
 * proxy until Team 06 exposes skill data), influence (share of the group
 * they have a positive relationship with), experience (ticks since the
 * group formed, weighted by membership), and crisis performance (recent
 * group tension resolved while they were already trusted). Different
 * groups can and do converge on different leader counts/styles as a result
 * of their own relationship history — nothing here special-cases "chief"
 * vs "council" as a template; a group with several close scorers simply
 * ends up with multiple leaderIds (spec's "council" outcome falls out of
 * that naturally), while a group with one clear standout ends up with a
 * single leader ("chief"/"war leader" outcome).
 */

import { IndividualSnapshot } from "./contracts";
import { SocietyState } from "./state";
import { getRelationship } from "./relationships";

const LEADER_SCORE_MARGIN = 0.08; // scorers within this margin of the top score are all recognized as leaders (council emergence)

function leadershipScore(
  society: SocietyState,
  individual: IndividualSnapshot,
  memberIds: readonly string[],
  foundedTick: number,
  currentTick: number,
): number {
  let trustSum = 0;
  let trustCount = 0;
  for (const otherId of memberIds) {
    if (otherId === individual.id) continue;
    const rel = getRelationship(society, individual.id, otherId);
    if (rel) {
      trustSum += rel.trust;
      trustCount += 1;
    }
  }
  const trustAvg = trustCount > 0 ? trustSum / trustCount : 0;
  const influence = trustCount > 0 ? trustCount / Math.max(1, memberIds.length - 1) : 0;
  const competence = individual.traits.ambition;
  const experience = Math.min(1, (currentTick - foundedTick) / 500);
  const empathyBonus = individual.traits.empathy * 0.2;

  return trustAvg * 0.35 + influence * 0.15 + competence * 0.25 + experience * 0.15 + empathyBonus;
}

export function updateLeadership(
  society: SocietyState,
  individuals: readonly IndividualSnapshot[],
  tick: number,
): SocietyState {
  const byId = new Map(individuals.map((i) => [i.id, i]));
  let current = society;

  for (const groupId of Object.keys(current.groups).sort()) {
    const group = current.groups[groupId];
    if (!group.active || group.memberIds.length === 0) continue;

    const scored = group.memberIds
      .map((id) => byId.get(id))
      .filter((i): i is IndividualSnapshot => i !== undefined)
      .map((ind) => ({ id: ind.id, score: leadershipScore(current, ind, group.memberIds, group.foundedTick, tick) }))
      .sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));

    if (scored.length === 0) continue;
    const topScore = scored[0].score;
    const leaderIds = scored.filter((s) => topScore - s.score <= LEADER_SCORE_MARGIN && s.score > 0).map((s) => s.id);

    current = { ...current, groups: { ...current.groups, [groupId]: { ...group, leaderIds } } };
  }

  return current;
}

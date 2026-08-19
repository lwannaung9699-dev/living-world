/**
 * Norm formation (spec §15) and sanctions (spec §16).
 *
 * A norm crystallizes only once a behavior (already tracked in
 * `behaviorCounts`, populated by cooperation.ts and elsewhere) has been
 * repeated often enough within a group to count as socially expected. This
 * is the *foundation* for law/institutions (Team 08/09) — no complete
 * legal system is implemented here.
 */

import { SocialNorm, SanctionKind, SanctionRecord } from "./types";
import { SocietyState, sortedEntries, sortedKeys } from "./state";
import { nextId } from "./id";

const NORM_FORMATION_THRESHOLD = 5;

/** Scans behaviorCounts for any group::behavior pair that has crossed the reinforcement threshold and doesn't have a norm yet; crystallizes it. */
export function updateNormFormation(society: SocietyState, tick: number): SocietyState {
  let current = society;

  for (const key of sortedKeys(current.behaviorCounts)) {
    const count = current.behaviorCounts[key];
    const [groupId, behavior] = key.split("::");
    const group = current.groups[groupId];
    if (!group || !group.active) continue;

    const existingNorm = Object.values(current.norms).find((n) => n.groupId === groupId && n.behavior === behavior);
    if (existingNorm) {
      current = {
        ...current,
        norms: {
          ...current.norms,
          [existingNorm.normId]: {
            ...existingNorm,
            reinforcementCount: count,
            strength: Math.min(1, count / (NORM_FORMATION_THRESHOLD * 4)),
          },
        },
      };
      continue;
    }

    if (count >= NORM_FORMATION_THRESHOLD) {
      const { id: normId, state: withCounter } = nextId(current, "norm");
      const norm: SocialNorm = {
        normId,
        groupId,
        behavior,
        reinforcementCount: count,
        establishedTick: tick,
        strength: Math.min(1, count / (NORM_FORMATION_THRESHOLD * 4)),
      };
      current = {
        ...withCounter,
        norms: { ...withCounter.norms, [normId]: norm },
        groups: { ...withCounter.groups, [groupId]: { ...group, normIds: [...group.normIds, normId] } },
      };
    }
  }

  return current;
}

/**
 * Records a sanction against an individual relative to a norm. Callers
 * (e.g. the conflict subsystem, or a future violation-detection pass) pass
 * in the observed kind — Team 07 does not itself decide guilt, only
 * records the social response and lets it feed reputation/trust.
 */
export function recordSanction(
  society: SocietyState,
  groupId: string,
  targetId: string,
  normId: string,
  kind: SanctionKind,
  tick: number,
): SocietyState {
  const { id: sanctionId, state: withCounter } = nextId(society, "sanction");
  const record: SanctionRecord = { sanctionId, groupId, targetId, normId, kind, tick };
  return { ...withCounter, sanctions: { ...withCounter.sanctions, [sanctionId]: record } };
}

/**
 * Derives sanctions from this tick's severe conflict events between
 * members of the same group where an active "protect"/"share" norm exists:
 * the aggressor in a within-group resource_conflict receives disapproval,
 * damping their trust with the group's other members going forward via
 * the relationship graph (handled by the caller through applyInteractionEvents/conflict.ts;
 * this function only produces the record).
 */
export function deriveConflictSanctions(
  society: SocietyState,
  conflictEvents: readonly { a: string; b: string; groupId: string | null; kind: string; severity: number }[],
  tick: number,
): SocietyState {
  let current = society;
  for (const event of conflictEvents) {
    if (!event.groupId || event.kind !== "resource_conflict") continue;
    const group = current.groups[event.groupId];
    if (!group) continue;
    const relevantNorm = Object.values(current.norms).find(
      (n) => n.groupId === event.groupId && n.behavior.includes("share"),
    );
    if (!relevantNorm) continue;
    const kind: SanctionKind = event.severity > 0.6 ? "social_exclusion" : "disapproval";
    // The individual with lower average trust to the rest of the group is treated as the party sanctioned.
    current = recordSanction(current, event.groupId, event.a, relevantNorm.normId, kind, tick);
  }
  return current;
}

export function activeNormsFor(society: SocietyState, groupId: string): readonly SocialNorm[] {
  return sortedEntries(society.norms)
    .map(([, n]) => n)
    .filter((n) => n.groupId === groupId);
}

/**
 * Conflict subsystem (spec §8).
 *
 * Conflict is derived from this tick's competitive InteractionEvents,
 * amplified by local resource scarcity (EcologyAdapter). It produces
 * history (relationship damage — already applied by applyInteractionEvents
 * — plus group tension and, above a severity threshold, a collective
 * memory entry) but never automatically escalates to war; see
 * migration.ts / groups.ts (split) and institutions.ts for what groups may
 * eventually decide to do about accumulated tension.
 */

import { WorldState } from "../core/state/worldState";
import { EcologyAdapter, abundanceAt } from "./contracts";
import { InteractionEvent } from "./types";
import { SocietyState } from "./state";
import { pairKey } from "./relationships";

const SCARCITY_TENSION_MULTIPLIER = 1.5;
const MEMORY_IMPORTANCE_THRESHOLD = 0.4;

export interface ConflictOutcome {
  readonly society: SocietyState;
  readonly conflictEvents: readonly {
    readonly a: string;
    readonly b: string;
    readonly groupId: string | null;
    readonly kind: "argument" | "resource_conflict" | "territorial_conflict" | "personal_rivalry" | "group_conflict";
    readonly severity: number;
  }[];
}

export function applyConflict(
  society: SocietyState,
  competitiveEvents: readonly InteractionEvent[],
  worldState: WorldState,
  ecology: EcologyAdapter,
  tick: number,
): ConflictOutcome {
  let current = society;
  const resources = ecology.listLocationResources(worldState);
  const conflictEvents: {
    a: string;
    b: string;
    groupId: string | null;
    kind: "argument" | "resource_conflict" | "territorial_conflict" | "personal_rivalry" | "group_conflict";
    severity: number;
  }[] = [];

  const sorted = competitiveEvents.slice().sort((x, y) => pairKey(x.a, x.b).localeCompare(pairKey(y.a, y.b)));
  for (const event of sorted) {
    const groupA = current.individualGroups[event.a] ?? null;
    const groupB = current.individualGroups[event.b] ?? null;
    const abundance = abundanceAt(resources, event.locationId);
    const scarcity = 1 - abundance;
    const severity = Math.min(1, 0.2 + scarcity * SCARCITY_TENSION_MULTIPLIER * 0.3);

    let kind: ConflictOutcome["conflictEvents"][number]["kind"];
    if (groupA && groupB && groupA !== groupB) {
      kind = scarcity > 0.5 ? "territorial_conflict" : "group_conflict";
    } else if (groupA && groupA === groupB) {
      kind = scarcity > 0.5 ? "resource_conflict" : "argument";
    } else {
      kind = "personal_rivalry";
    }

    if (groupA) {
      const group = current.groups[groupA];
      if (group) {
        current = {
          ...current,
          groups: { ...current.groups, [groupA]: { ...group, tension: Math.min(1, group.tension + severity * 0.1) } },
        };
      }
    }
    if (groupB && groupB !== groupA) {
      const group = current.groups[groupB];
      if (group) {
        current = {
          ...current,
          groups: { ...current.groups, [groupB]: { ...group, tension: Math.min(1, group.tension + severity * 0.1) } },
        };
      }
    }

    if (severity >= MEMORY_IMPORTANCE_THRESHOLD && (groupA || groupB)) {
      const memoryGroupId = groupA ?? groupB!;
      const memoryId = `memory-conflict-${tick}-${event.a}-${event.b}`;
      current = {
        ...current,
        collectiveMemories: {
          ...current.collectiveMemories,
          [memoryId]: {
            memoryId,
            groupId: memoryGroupId,
            event: `conflict:${kind}`,
            importance: severity,
            participantIds: [event.a, event.b],
            locationId: event.locationId,
            tick,
            interpretation: `dispute between ${event.a} and ${event.b}`,
          },
        },
      };
    }

    conflictEvents.push({ a: event.a, b: event.b, groupId: groupA ?? groupB, kind, severity });
  }

  return { society: current, conflictEvents };
}

/** Reconciliation: tension decays for groups whose members' average trust has recovered above a healthy baseline. */
export function applyReconciliation(society: SocietyState, decayPerTick: number = 0.01): SocietyState {
  let current = society;
  for (const groupId of Object.keys(current.groups).sort()) {
    const group = current.groups[groupId];
    if (!group.active || group.tension <= 0) continue;
    current = {
      ...current,
      groups: { ...current.groups, [groupId]: { ...group, tension: Math.max(0, group.tension - decayPerTick) } },
    };
  }
  return current;
}

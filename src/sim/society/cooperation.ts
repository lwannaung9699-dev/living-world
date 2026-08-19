/**
 * Cooperation subsystem (spec §7).
 *
 * Cooperation is never unconditional — it is derived from this tick's
 * cooperative InteractionEvents (see relationships.ts), filtered by
 * shared group membership, and only proceeds if the pair's trust,
 * relationship, and (for resource-producing behaviors) local resource
 * availability support it. The specific behavior label is chosen
 * deterministically from context, not freely randomized.
 */

import { DeterministicRng } from "../core/rng/deterministicRng";
import { WorldState } from "../core/state/worldState";
import { EcologyAdapter, abundanceAt } from "./contracts";
import { InteractionEvent } from "./types";
import { SocietyState } from "./state";

const COOPERATION_TRUST_THRESHOLD = 0.05;

const RESOURCE_BEHAVIORS = ["hunt_together", "gather_together", "share_food", "build_shelter"] as const;
const PROTECTIVE_BEHAVIORS = ["protect_young", "care_for_injured", "defend_territory"] as const;

export interface CooperationOutcome {
  readonly society: SocietyState;
  readonly behaviors: readonly { groupId: string; behavior: string; participantIds: readonly string[] }[];
}

export function applyCooperation(
  society: SocietyState,
  cooperativeEvents: readonly InteractionEvent[],
  worldState: WorldState,
  ecology: EcologyAdapter,
  rng: DeterministicRng,
): CooperationOutcome {
  let current = society;
  const behaviors: { groupId: string; behavior: string; participantIds: readonly string[] }[] = [];
  const resources = ecology.listLocationResources(worldState);

  const sorted = cooperativeEvents.slice().sort((x, y) => (x.a + x.b).localeCompare(y.a + y.b));
  for (const event of sorted) {
    const groupA = current.individualGroups[event.a];
    const groupB = current.individualGroups[event.b];
    if (!groupA || groupA !== groupB) continue; // cooperation-as-group-behavior requires shared group
    const group = current.groups[groupA];
    if (!group || !group.active) continue;

    const rel = current.relationships[event.a < event.b ? `${event.a}::${event.b}` : `${event.b}::${event.a}`];
    if (!rel || rel.trust < COOPERATION_TRUST_THRESHOLD) continue;

    const abundance = abundanceAt(resources, event.locationId);
    const pool = abundance < 0.4 ? RESOURCE_BEHAVIORS : rng.boolean(0.7) ? RESOURCE_BEHAVIORS : PROTECTIVE_BEHAVIORS;
    const behavior = rng.choose(pool);

    const resourceGain = abundance * 0.5;
    current = {
      ...current,
      groups: {
        ...current.groups,
        [groupA]: { ...group, resources: { pooled: group.resources.pooled + resourceGain } },
      },
    };

    const behaviorKey = `${groupA}::${behavior}`;
    current = {
      ...current,
      behaviorCounts: {
        ...current.behaviorCounts,
        [behaviorKey]: (current.behaviorCounts[behaviorKey] ?? 0) + 1,
      },
    };

    behaviors.push({ groupId: groupA, behavior, participantIds: [event.a, event.b] });
  }

  return { society: current, behaviors };
}

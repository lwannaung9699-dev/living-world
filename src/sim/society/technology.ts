/**
 * Innovation (spec §24) and technology diffusion (spec §23).
 *
 * Innovation probability is deterministic (drawn from the
 * `society/innovation` RNG stream, never an AI model or external API), and
 * scales with individual ambition, environmental pressure (scarcity), and
 * how much existing knowledge the individual's group already has (more
 * accumulated know-how -> more raw material to recombine).
 */

import { DeterministicRng } from "../core/rng/deterministicRng";
import { WorldState } from "../core/state/worldState";
import { IndividualSnapshot, EcologyAdapter, abundanceAt } from "./contracts";
import { Technology } from "./types";
import { SocietyState, sortedEntries } from "./state";
import { nextId } from "./id";

const BASE_INNOVATION_CHANCE = 0.01;

export function applyInnovation(
  society: SocietyState,
  individuals: readonly IndividualSnapshot[],
  worldState: WorldState,
  ecology: EcologyAdapter,
  rng: DeterministicRng,
  tick: number,
): SocietyState {
  let current = society;
  const resources = ecology.listLocationResources(worldState);
  const living = individuals.filter((i) => i.alive).slice().sort((a, b) => a.id.localeCompare(b.id));

  for (const ind of living) {
    const groupId = current.individualGroups[ind.id];
    const group = groupId ? current.groups[groupId] : null;
    const knownCount = group
      ? Object.values(current.technologies).filter((t) => t.knownByGroupIds.includes(groupId)).length
      : 0;

    const scarcity = 1 - abundanceAt(resources, ind.locationId);
    const chance =
      BASE_INNOVATION_CHANCE + ind.traits.ambition * 0.02 + scarcity * 0.015 + Math.min(knownCount, 10) * 0.001;

    if (!rng.boolean(Math.min(0.2, chance))) continue;

    const { id: technologyId, state: withCounter } = nextId(current, "tech");
    const technology: Technology = {
      technologyId,
      label: `technique-${technologyId}`,
      originGroupId: groupId ?? "unaffiliated",
      originIndividualId: ind.id,
      originTick: tick,
      knownByGroupIds: groupId ? [groupId] : [],
    };
    current = { ...withCounter, technologies: { ...withCounter.technologies, [technologyId]: technology } };
  }

  return current;
}

const DIFFUSION_TRUST_MIN = 0.15;
const DIFFUSION_CHANCE = 0.1;

/** Technology known by one group can spread to another group with which it has positive contact (shared territory or an existing trade relationship), see spec §23. */
export function applyTechnologyDiffusion(society: SocietyState, rng: DeterministicRng): SocietyState {
  let current = society;
  const groupIds = Object.keys(current.groups)
    .filter((id) => current.groups[id].active)
    .sort();

  for (const [technologyId, tech] of sortedEntries(current.technologies)) {
    for (const knownGroupId of [...tech.knownByGroupIds].sort()) {
      const source = current.groups[knownGroupId];
      if (!source) continue;
      for (const targetGroupId of groupIds) {
        if (current.technologies[technologyId].knownByGroupIds.includes(targetGroupId)) continue;
        const target = current.groups[targetGroupId];
        const sharesTerritory = Object.keys(source.territory).some((loc) => loc in target.territory);
        const hasTraded = Object.values(current.trades).some(
          (t) =>
            (t.groupA === knownGroupId && t.groupB === targetGroupId) ||
            (t.groupA === targetGroupId && t.groupB === knownGroupId),
        );
        if (!sharesTerritory && !hasTraded) continue;

        let trustSum = 0;
        let count = 0;
        for (const a of source.memberIds) {
          for (const b of target.memberIds) {
            const rel = current.relationships[a < b ? `${a}::${b}` : `${b}::${a}`];
            if (rel) {
              trustSum += rel.trust;
              count += 1;
            }
          }
        }
        const avgTrust = count > 0 ? trustSum / count : 0;
        if (avgTrust < DIFFUSION_TRUST_MIN) continue;
        if (!rng.boolean(DIFFUSION_CHANCE)) continue;

        current = {
          ...current,
          technologies: {
            ...current.technologies,
            [technologyId]: { ...current.technologies[technologyId], knownByGroupIds: [...current.technologies[technologyId].knownByGroupIds, targetGroupId] },
          },
        };
      }
    }
  }

  return current;
}

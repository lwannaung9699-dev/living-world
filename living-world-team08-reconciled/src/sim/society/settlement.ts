/**
 * Settlement emergence (spec §12) and classification (spec §13), plus
 * territory as an irregular influence field (spec §14).
 *
 * Nothing here spawns a settlement from a map list. A settlement only
 * exists once a group has accumulated enough presence (individual-ticks
 * spent) at a location for its classification thresholds to trigger.
 */

import { IndividualSnapshot } from "./contracts";
import { Settlement, SettlementType } from "./types";
import { SocietyState, sortedEntries } from "./state";
import { nextId } from "./id";

const CAMP_THRESHOLD = 20;
const HAMLET_THRESHOLD = 150;
const VILLAGE_THRESHOLD = 500;
const TOWN_THRESHOLD = 2000;
const CITY_THRESHOLD = 8000;

function classify(presence: number, population: number): SettlementType {
  if (presence < CAMP_THRESHOLD) return "temporary_camp";
  if (presence < HAMLET_THRESHOLD) return "seasonal_settlement";
  if (presence < VILLAGE_THRESHOLD) return "hamlet";
  if (presence < TOWN_THRESHOLD) return population >= 30 ? "village" : "hamlet";
  if (presence < CITY_THRESHOLD) return "town";
  return "city";
}

/** Accumulates individual-ticks-present per location, then updates/creates settlements for any group whose members concentrate there. */
export function updateSettlements(
  society: SocietyState,
  individuals: readonly IndividualSnapshot[],
  tick: number,
): SocietyState {
  let current = society;
  let locationPresence = current.locationPresence;
  const living = individuals.filter((i) => i.alive);

  for (const ind of living.slice().sort((a, b) => a.id.localeCompare(b.id))) {
    locationPresence = { ...locationPresence, [ind.locationId]: (locationPresence[ind.locationId] ?? 0) + 1 };
  }
  current = { ...current, locationPresence };

  const popByGroupLocation = new Map<string, number>();
  for (const ind of living) {
    const groupId = current.individualGroups[ind.id];
    if (!groupId) continue;
    const key = `${groupId}::${ind.locationId}`;
    popByGroupLocation.set(key, (popByGroupLocation.get(key) ?? 0) + 1);
  }

  for (const key of [...popByGroupLocation.keys()].sort()) {
    const [groupId, locationId] = key.split("::");
    const group = current.groups[groupId];
    if (!group || !group.active) continue;
    const population = popByGroupLocation.get(key)!;
    if (population === 0) continue;

    const presence = current.locationPresence[locationId] ?? 0;
    const existing = Object.values(current.settlements).find(
      (s) => s.groupId === groupId && s.locationId === locationId,
    );

    if (existing) {
      current = {
        ...current,
        settlements: {
          ...current.settlements,
          [existing.settlementId]: {
            ...existing,
            presence,
            population,
            settlementType: classify(presence, population),
          },
        },
      };
    } else if (presence >= CAMP_THRESHOLD * 0.25) {
      // A camp is only "founded" as a record once individuals have returned there repeatedly (spec §12).
      const { id: settlementId, state: withCounter } = nextId(current, "settlement");
      const settlement: Settlement = {
        settlementId,
        locationId,
        groupId,
        foundedTick: tick,
        presence,
        population,
        settlementType: classify(presence, population),
        defensibility: 0.5,
      };
      current = { ...withCounter, settlements: { ...withCounter.settlements, [settlementId]: settlement } };
    }
  }

  return current;
}

const TERRITORY_GAIN = 0.05;
const TERRITORY_DECAY = 0.01;

/** Builds/decays each group's territorial influence field from where its members actually spend time — an irregular field, not a geometric border. */
export function updateTerritory(society: SocietyState, individuals: readonly IndividualSnapshot[]): SocietyState {
  let groups = society.groups;
  const living = individuals.filter((i) => i.alive);

  const presenceByGroup = new Map<string, Map<string, number>>();
  for (const ind of living) {
    const groupId = society.individualGroups[ind.id];
    if (!groupId) continue;
    const map = presenceByGroup.get(groupId) ?? new Map<string, number>();
    map.set(ind.locationId, (map.get(ind.locationId) ?? 0) + 1);
    presenceByGroup.set(groupId, map);
  }

  for (const [groupId, group] of sortedEntries(groups)) {
    if (!group.active) continue;
    let territory = { ...group.territory };
    for (const loc of Object.keys(territory)) {
      territory[loc] = Math.max(0, territory[loc] - TERRITORY_DECAY);
      if (territory[loc] === 0) delete territory[loc];
    }
    const presentAt = presenceByGroup.get(groupId);
    if (presentAt) {
      for (const loc of [...presentAt.keys()].sort()) {
        territory[loc] = Math.min(1, (territory[loc] ?? 0) + TERRITORY_GAIN);
      }
    }
    groups = { ...groups, [groupId]: { ...group, territory } };
  }

  return { ...society, groups };
}

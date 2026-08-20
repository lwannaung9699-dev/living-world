/**
 * Migration subsystem (spec §26).
 *
 * A group relocates its territorial center of gravity when its current
 * primary location's resources can no longer support it (population
 * pressure vs abundance) or when accumulated tension/conflict makes
 * staying costly. The destination is the best-known alternative location
 * already present in the group's own (decaying) territory field or in
 * ecology data — Team 07 never invents new geography; it only chooses
 * among locations Team 02/05 have already made known to it.
 */

import { EcologyAdapter, abundanceAt } from "./contracts";
import { WorldState } from "../core/state/worldState";
import { MigrationRecord } from "./types";
import { SocietyState, sortedEntries } from "./state";
import { nextId } from "./id";

const DEPLETION_PRESSURE_THRESHOLD = 0.25;
const TENSION_MIGRATION_THRESHOLD = 0.7;

export function evaluateMigration(
  society: SocietyState,
  worldState: WorldState,
  ecology: EcologyAdapter,
  tick: number,
): SocietyState {
  let current = society;
  const resources = ecology.listLocationResources(worldState);

  for (const [groupId, group] of sortedEntries(current.groups)) {
    if (!group.active || group.memberIds.length === 0) continue;
    const locations = Object.keys(group.territory);
    if (locations.length === 0) continue;

    const primaryLocation = locations.sort((a, b) => group.territory[b] - group.territory[a])[0];
    const abundance = abundanceAt(resources, primaryLocation);
    const pressure = group.memberIds.length / Math.max(1, abundance * 20);

    const resourceDriven = abundance < DEPLETION_PRESSURE_THRESHOLD && pressure > 1;
    const conflictDriven = group.tension >= TENSION_MIGRATION_THRESHOLD;
    if (!resourceDriven && !conflictDriven) continue;

    const candidates = locations
      .filter((loc) => loc !== primaryLocation)
      .sort((a, b) => abundanceAt(resources, b) - abundanceAt(resources, a));
    const target = candidates.find((loc) => abundanceAt(resources, loc) > abundance);
    if (!target) continue;

    const reason: MigrationRecord["reason"] = conflictDriven
      ? "conflict"
      : resourceDriven
        ? "resource_depletion"
        : "population_pressure";

    const { id: migrationId, state: withCounter } = nextId(current, "migration");
    const record: MigrationRecord = {
      migrationId,
      groupId,
      fromLocationId: primaryLocation,
      toLocationId: target,
      reason,
      tick,
    };

    current = {
      ...withCounter,
      migrations: { ...withCounter.migrations, [migrationId]: record },
      groups: {
        ...withCounter.groups,
        [groupId]: {
          ...withCounter.groups[groupId],
          territory: { ...withCounter.groups[groupId].territory, [target]: Math.max(withCounter.groups[groupId].territory[target] ?? 0, 0.3) },
          tension: conflictDriven ? Math.max(0, withCounter.groups[groupId].tension - 0.2) : withCounter.groups[groupId].tension,
        },
      },
    };
  }

  return current;
}

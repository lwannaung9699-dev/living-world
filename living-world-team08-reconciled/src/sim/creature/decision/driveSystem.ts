import { NeedKey, NeedsState } from "../state/needs";

/**
 * Drive — the intermediate layer between a raw Need and a Goal (§8):
 *
 *   Need (hunger) -> Drive (seek food) -> Goal (find edible resource) -> Action (move toward resource)
 *
 * Keeping this as its own step (rather than collapsing need directly into
 * goal selection) is what lets future complexity plug in without touching
 * the needs model or the utility scorer: e.g. a future "food quality"
 * drive-modifier can be added here without changing NeedsState or Goal.
 */
export interface Drive {
  readonly driveId: string;
  readonly sourceNeed: NeedKey;
  readonly goalId: string;
  readonly intensity: number; // [0, 1] — derived from need pressure, this tick
}

const NEED_TO_DRIVE: Readonly<Record<NeedKey, { driveId: string; goalId: string }>> = {
  hunger: { driveId: "seekFood", goalId: "eat" },
  thirst: { driveId: "seekWater", goalId: "drink" },
  sleep: { driveId: "seekRest", goalId: "sleep" },
  safety: { driveId: "seekSafety", goalId: "escape" },
  temperature: { driveId: "seekComfort", goalId: "explore" },
  social: { driveId: "seekCompany", goalId: "socialize" },
  reproduction: { driveId: "seekMate", goalId: "reproduce" },
  curiosity: { driveId: "seekNovelty", goalId: "explore" },
};

/**
 * Derives the active drives for a creature's current needs. Only needs
 * above `threshold` produce an active drive (below that, the pressure is
 * background noise, not something worth acting on yet).
 */
export function deriveDrives(needs: NeedsState, threshold = 15): Drive[] {
  const drives: Drive[] = [];
  for (const [need, value] of Object.entries(needs) as [NeedKey, number][]) {
    if (value < threshold) continue;
    const mapping = NEED_TO_DRIVE[need];
    drives.push({
      driveId: mapping.driveId,
      sourceNeed: need,
      goalId: mapping.goalId,
      intensity: value / 100,
    });
  }
  return drives.sort((a, b) => b.intensity - a.intensity);
}

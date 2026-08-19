/**
 * Daily activity tracking (§19). Deliberately NOT a fixed schedule table —
 * a creature's activity for any given tick emerges from whichever goal the
 * utility system actually selected (species traits, environment, needs,
 * memory, and personality all feed into that selection already). This
 * module just records the resulting history so patterns can be observed
 * (e.g. for tests, debugging, or a future analytics/culture layer) without
 * forcing any two creatures onto identical schedules.
 */
export interface ActivityLogEntry {
  readonly tick: number;
  readonly goalId: string;
  readonly actionId: string;
}

const DEFAULT_LOG_CAPACITY = 48;

export function recordActivity(
  log: readonly ActivityLogEntry[],
  entry: ActivityLogEntry,
  capacity = DEFAULT_LOG_CAPACITY,
): ActivityLogEntry[] {
  const next = [...log, entry];
  return next.length > capacity ? next.slice(next.length - capacity) : next;
}

/** Fraction of the recent log spent on a given goal — useful for observing emergent per-individual routines. */
export function activityShare(log: readonly ActivityLogEntry[], goalId: string): number {
  if (log.length === 0) return 0;
  const count = log.filter((entry) => entry.goalId === goalId).length;
  return count / log.length;
}

/**
 * Political factions & conflict (brief §23–24). Factions are clustered
 * from actual actor interests/traits, never spawned with fixed names.
 */

import type { DeterministicRng } from "../core/rng/deterministicRng";
import { EMERGENCE_THRESHOLDS } from "./config";
import type { FactionInterest, PoliticalConflict, PoliticalConflictKind, PoliticalFaction, PoliticsModuleState } from "./contracts";
import type { ActorSnapshot } from "./adapters/populationAdapter";
import { appendHistory, mintId } from "./state";

const INTEREST_POOL: readonly FactionInterest[] = [
  "wealth",
  "land",
  "trade",
  "religion",
  "military",
  "clan",
  "workers",
  "merchants",
  "farmers",
  "nobility",
  "regional_autonomy",
  "centralization",
];

export function isEligibleForFactions(population: number): boolean {
  return population >= EMERGENCE_THRESHOLDS.factionMinPopulation;
}

/** Assigns each actor a dominant interest from their trait profile — the raw material factions cluster from. */
function dominantInterest(actor: ActorSnapshot, rng: DeterministicRng): FactionInterest {
  const candidates: { value: FactionInterest; weight: number }[] = [
    { value: "wealth", weight: actor.wealth },
    { value: "merchants", weight: actor.wealth * actor.influence },
    { value: "military", weight: actor.militaryStrength },
    { value: "nobility", weight: actor.kinship * actor.influence },
    { value: "clan", weight: actor.kinship },
    { value: "religion", weight: actor.religiousStanding },
    { value: "workers", weight: 1 - actor.wealth },
    { value: "farmers", weight: 1 - actor.knowledge },
    { value: "centralization", weight: actor.influence },
    { value: "regional_autonomy", weight: 1 - actor.trust },
    { value: "land", weight: actor.kinship * 0.5 + actor.wealth * 0.5 },
    { value: "trade", weight: actor.wealth * 0.5 + actor.influence * 0.5 },
  ];
  return rng.weightedChoice(candidates.map((c) => ({ value: c.value, weight: Math.max(0.001, c.weight) })));
}

/**
 * Clusters actors in a scope into factions by dominant interest. Only
 * clusters of at least `minSize` become a tracked PoliticalFaction — small
 * scattered interests stay diffuse population, not a faction.
 */
export function crystallizeFactions(
  politics: PoliticsModuleState,
  scope: string,
  actors: readonly ActorSnapshot[],
  tick: number,
  rng: DeterministicRng,
  minSize = 3,
): PoliticsModuleState {
  const byInterest = new Map<FactionInterest, ActorSnapshot[]>();
  for (const actor of actors) {
    const interest = dominantInterest(actor, rng);
    const bucket = byInterest.get(interest) ?? [];
    bucket.push(actor);
    byInterest.set(interest, bucket);
  }

  let next = politics;
  for (const interest of INTEREST_POOL) {
    const members = byInterest.get(interest);
    if (!members || members.length < minSize) continue;
    const already = Object.values(next.factions).find((f) => f.scope === scope && f.primaryInterests.includes(interest));
    if (already) continue;

    const cohesion = clamp01(1 - stdev(members.map((m) => m.influence)));
    const strength = clamp01(members.reduce((s, m) => s + m.influence + m.wealth, 0) / (members.length * 2));

    const { id: factionId, idCounters } = mintId(next, "faction");
    const faction: PoliticalFaction = {
      factionId,
      scope,
      primaryInterests: [interest],
      memberIds: members.map((m) => m.actorId),
      cohesion,
      strength,
      formedAtTick: tick,
    };
    next = { ...next, idCounters, factions: { ...next.factions, [factionId]: faction } };
    next = appendHistory(next, {
      type: "faction_formed",
      tick,
      scope,
      summary: `Political faction formed around "${interest}" with ${members.length} members.`,
      refs: { factionId },
    });
  }
  return next;
}

const OPPOSED_INTERESTS: ReadonlySet<string> = new Set([
  "wealth:workers",
  "nobility:workers",
  "centralization:regional_autonomy",
  "merchants:farmers",
  "military:regional_autonomy",
]);

function areOpposed(a: FactionInterest, b: FactionInterest): boolean {
  return OPPOSED_INTERESTS.has(`${a}:${b}`) || OPPOSED_INTERESTS.has(`${b}:${a}`);
}

function conflictKindFor(a: FactionInterest, b: FactionInterest): PoliticalConflictKind {
  if (a === "centralization" || b === "centralization" || a === "regional_autonomy" || b === "regional_autonomy") return "centralization_conflict";
  if (a === "religion" || b === "religion") return "religious_conflict";
  if (a === "military" || b === "military") return "regional_conflict";
  return "class_conflict";
}

/** Checks every pair of opposed factions in scope for a possible conflict ignition, gated by combined strength and a deterministic draw. */
export function maybeIgniteConflict(
  politics: PoliticsModuleState,
  scope: string,
  tick: number,
  rng: DeterministicRng,
): PoliticsModuleState {
  const scoped = Object.values(politics.factions).filter((f) => f.scope === scope);
  if (scoped.length < EMERGENCE_THRESHOLDS.conflictMinOpposedFactions) return politics;

  let next = politics;
  for (let i = 0; i < scoped.length; i++) {
    for (let j = i + 1; j < scoped.length; j++) {
      const a = scoped[i];
      const b = scoped[j];
      if (!a.primaryInterests.some((ia) => b.primaryInterests.some((ib) => areOpposed(ia, ib)))) continue;

      const alreadyActive = Object.values(next.conflicts).some(
        (c) => c.scope === scope && c.resolvedAtTick === null && c.factionIds.includes(a.factionId) && c.factionIds.includes(b.factionId),
      );
      if (alreadyActive) continue;

      const ignitionChance = clamp01((a.strength + b.strength) / 2);
      if (!rng.boolean(ignitionChance * 0.3)) continue;

      const { id: conflictId, idCounters } = mintId(next, "conflict");
      const conflict: PoliticalConflict = {
        conflictId,
        scope,
        kind: conflictKindFor(a.primaryInterests[0], b.primaryInterests[0]),
        factionIds: [a.factionId, b.factionId],
        startedAtTick: tick,
        intensity: clamp01((a.strength + b.strength) / 2),
        resolvedAtTick: null,
        resolution: null,
      };
      next = { ...next, idCounters, conflicts: { ...next.conflicts, [conflictId]: conflict } };
      next = appendHistory(next, {
        type: "political_conflict_started",
        tick,
        scope,
        summary: `Political conflict (${conflict.kind}) ignited between opposed factions.`,
        refs: { conflictId },
      });
    }
  }
  return next;
}

export function resolveConflict(
  politics: PoliticsModuleState,
  conflictId: string,
  resolution: NonNullable<PoliticalConflict["resolution"]>,
  tick: number,
): PoliticsModuleState {
  const conflict = politics.conflicts[conflictId];
  if (!conflict || conflict.resolvedAtTick !== null) return politics;
  const resolved: PoliticalConflict = { ...conflict, resolvedAtTick: tick, resolution };
  let next: PoliticsModuleState = { ...politics, conflicts: { ...politics.conflicts, [conflictId]: resolved } };
  next = appendHistory(next, {
    type: "political_conflict_resolved",
    tick,
    scope: conflict.scope,
    summary: `Political conflict (${conflict.kind}) resolved via ${resolution}.`,
    refs: { conflictId },
  });
  return next;
}

function stdev(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

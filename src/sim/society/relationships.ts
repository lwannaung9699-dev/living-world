/**
 * Social network subsystem (spec §6, §3).
 *
 * Relationships are a graph, never re-randomized per tick. Changes are
 * always caused by InteractionEvents, which are themselves generated
 * deterministically from individuals' traits, colocation, and existing
 * relationship state — not by directly randomizing trust/friendship
 * values.
 */

import { DeterministicRng } from "../core/rng/deterministicRng";
import { IndividualSnapshot } from "./contracts";
import { InteractionEvent, InteractionKind, Relationship } from "./types";
import { SocietyState, sortedEntries } from "./state";

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

export function getRelationship(society: SocietyState, a: string, b: string): Relationship | null {
  return society.relationships[pairKey(a, b)] ?? null;
}

function defaultRelationship(a: string, b: string, tick: number): Relationship {
  const [x, y] = a < b ? [a, b] : [b, a];
  return {
    a: x,
    b: y,
    trust: 0,
    respect: 0,
    fear: 0,
    loyalty: 0,
    friendship: 0,
    rivalry: 0,
    obligation: 0,
    kinship: null,
    authority: 0,
    lastEventTick: tick,
  };
}

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

/**
 * Deterministically generates this tick's InteractionEvents from colocated
 * living individuals. Likelihood and kind depend on traits and the
 * existing relationship (higher trust -> more likely cooperative; higher
 * mutual aggression / low trust -> more likely competitive), drawn from
 * the `society/interactions` RNG stream. Individuals are processed in
 * sorted-id order so results never depend on adapter iteration order.
 */
export function generateInteractionEvents(
  individuals: readonly IndividualSnapshot[],
  society: SocietyState,
  tick: number,
  rng: DeterministicRng,
): InteractionEvent[] {
  const living = individuals.filter((i) => i.alive).slice().sort((a, b) => a.id.localeCompare(b.id));

  const byLocation = new Map<string, IndividualSnapshot[]>();
  for (const ind of living) {
    const list = byLocation.get(ind.locationId) ?? [];
    list.push(ind);
    byLocation.set(ind.locationId, list);
  }

  const events: InteractionEvent[] = [];
  const locations = [...byLocation.keys()].sort();
  for (const locationId of locations) {
    const group = byLocation.get(locationId)!;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const baseChance = (a.traits.sociability + b.traits.sociability) / 2;
        if (!rng.boolean(clamp(baseChance * 0.6 + 0.05, 0, 1))) continue;

        const rel = getRelationship(society, a.id, b.id);
        const trust = rel?.trust ?? 0;
        const aggression = (a.traits.aggression + b.traits.aggression) / 2;
        const cooperativeScore = clamp(0.5 + trust * 0.5 - aggression * 0.3, 0, 1);
        const competitiveScore = clamp(aggression * 0.6 - trust * 0.3, 0, 1);

        let kind: InteractionKind;
        if (cooperativeScore <= 0 && competitiveScore <= 0) {
          kind = "neutral";
        } else {
          kind = rng.weightedChoice<InteractionKind>([
            { value: "cooperative", weight: Math.max(cooperativeScore, 0.001) },
            { value: "competitive", weight: Math.max(competitiveScore, 0.001) },
            { value: "neutral", weight: 0.3 },
          ]);
        }

        events.push({ a: a.id, b: b.id, kind, locationId, tick });
      }
    }
  }
  return events;
}

const TRUST_DELTA: Record<InteractionKind, number> = { cooperative: 0.05, competitive: -0.06, neutral: 0.005 };
const FRIENDSHIP_DELTA: Record<InteractionKind, number> = { cooperative: 0.04, competitive: -0.05, neutral: 0.002 };
const RESPECT_DELTA: Record<InteractionKind, number> = { cooperative: 0.02, competitive: -0.02, neutral: 0 };
const RIVALRY_DELTA: Record<InteractionKind, number> = { cooperative: -0.02, competitive: 0.06, neutral: -0.005 };

/** Applies a batch of InteractionEvents to the relationship graph. Pure, deterministic. */
export function applyInteractionEvents(
  society: SocietyState,
  events: readonly InteractionEvent[],
): SocietyState {
  let relationships = society.relationships;
  for (const event of events) {
    const key = pairKey(event.a, event.b);
    const existing = relationships[key] ?? defaultRelationship(event.a, event.b, event.tick);
    const updated: Relationship = {
      ...existing,
      trust: clamp(existing.trust + TRUST_DELTA[event.kind], -1, 1),
      friendship: clamp(existing.friendship + FRIENDSHIP_DELTA[event.kind], -1, 1),
      respect: clamp(existing.respect + RESPECT_DELTA[event.kind], -1, 1),
      rivalry: clamp(existing.rivalry + RIVALRY_DELTA[event.kind], 0, 1),
      lastEventTick: event.tick,
    };
    relationships = { ...relationships, [key]: updated };
  }
  return { ...society, relationships };
}

/** Removes relationship entries where neither party is among the currently-living individuals. Keeps memory footprint bounded. */
export function pruneDeadRelationships(
  society: SocietyState,
  livingIds: ReadonlySet<string>,
): SocietyState {
  const relationships: Record<string, Relationship> = {};
  for (const [key, rel] of sortedEntries(society.relationships)) {
    if (livingIds.has(rel.a) || livingIds.has(rel.b)) {
      relationships[key] = rel;
    }
  }
  return { ...society, relationships };
}

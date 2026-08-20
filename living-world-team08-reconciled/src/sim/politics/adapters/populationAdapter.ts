/**
 * Population adapter — Team 08's read-only port onto Team 06 (Creature/NPC
 * Intelligence) and Team 07 (Society/Culture/Civilization).
 *
 * RECONCILED 2026-08-19 against the real merged repository (Team 01–08 all
 * present under src/sim/**). Findings from actually reading Team 06/07's
 * code, not guessing:
 *
 *  - Team 07's real module key is `state.modules.society` (matches the
 *    original guess) with `SocietyState.settlements: Record<string,
 *    Settlement>` and `SocietyState.groups: Record<string, SocialGroup>`.
 *    `Settlement` has `population` but no `wealth`/`inequality`/`cohesion`/
 *    `memberIds` field directly — those live one hop away via
 *    `Settlement.groupId -> SocialGroup` (`memberIds`, `resources.pooled`,
 *    `tension`). This adapter now reads through that real shape instead of
 *    guessing flat fields on Settlement itself.
 *  - Team 06's real module key is `state.modules.creature` (NOT `npc`, as
 *    originally guessed) with `CreatureModuleState.creatures: Record<string,
 *    CreatureState>` (NOT `.agents`). `CreatureState` has no `settlementId`
 *    field at all (creatures track `position`, not settlement membership)
 *    and no wealth/militaryStrength/kinship/religiousStanding/knowledge/
 *    trust fields — it has `personality: PersonalityTraits` (aggression,
 *    caution, curiosity, sociability, riskTolerance, patience,
 *    territoriality, independence, boldness).
 *  - Critically, **Team 07's `SocialGroup.memberIds` are Team 07's own
 *    synthetic `individualId` strings, not real Team 06 `creatureId`s** —
 *    grepping Team 07's source confirms it never imports or reads
 *    `CREATURE_MODULE_KEY`/`state.modules.creature` anywhere. Team 06 and
 *    Team 07 are not wired to each other yet (Team 07's own Notion page
 *    self-reports this: it built its own no-op NpcAdapter). So there is, as
 *    of this reconciliation, no path to real per-individual behavioral
 *    trait data for a real Team 07 population member — that data simply
 *    doesn't exist yet anywhere upstream.
 *
 * Given that, this adapter now does the honest thing at each layer:
 *  1. Settlement-level structure (population, wealth, cohesion, the roster
 *     of member ids) is read from **real Team 07 data** when
 *     `state.modules.society` is attached.
 *  2. Per-individual behavioral traits (influence, militaryStrength,
 *     kinship, religiousStanding, knowledge, trust) still have no real
 *     upstream source, so they are derived deterministically from each
 *     real Team 07 individualId via a seeded RNG stream — real identities,
 *     synthetic trait values, clearly marked via `sourced`/
 *     `traitsAreSynthetic` rather than silently presented as real.
 *  3. Falls back to a fully synthetic population only when Team 07 isn't
 *     attached at all yet.
 *
 * Nothing here mutates `state.modules.creature`/`state.modules.society` —
 * Team 08 only ever reads population context, never owns it (see brief §2).
 */

import type { WorldState } from "../../core/state/worldState";
import type { RngStreamRegistry } from "../../core/rng/rngStreamRegistry";

export interface ActorSnapshot {
  readonly actorId: string;
  readonly settlementId: string;
  /** 0..1 raw signals Team 08 turns into AuthorityFactors (see authority.ts). Absent fields default to 0. */
  readonly influence: number;
  readonly wealth: number;
  readonly militaryStrength: number;
  readonly kinship: number;
  readonly religiousStanding: number;
  readonly knowledge: number;
  readonly trust: number;
}

export interface SettlementSnapshot {
  readonly settlementId: string;
  readonly population: number;
  /** 0..1 abstracted wealth/resource-surplus proxy. */
  readonly wealth: number;
  /** 0..1 — how unevenly wealth/authority is distributed among actors in this settlement. */
  readonly inequality: number;
  /** 0..1 — cultural/social cohesion proxy from Team 07. */
  readonly cohesion: number;
  readonly actorIds: readonly string[];
}

export interface PopulationSnapshot {
  readonly settlements: readonly SettlementSnapshot[];
  readonly actorsById: Readonly<Record<string, ActorSnapshot>>;
  /** True when settlement structure came from real Team 07 module state rather than the standalone fallback. */
  readonly sourced: boolean;
  /** True when actor-level behavioral traits are synthetic even though settlement structure is real — see file header. */
  readonly traitsAreSynthetic: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Reads real Team 07 settlement structure through its actual shape:
 * `society.settlements[id]` for population, plus `society.groups[settlement.groupId]`
 * for member roster / wealth proxy (`resources.pooled`) / cohesion proxy
 * (`1 - tension`). Returns null if `state.modules.society` isn't attached
 * or doesn't look like the real Team 07 shape.
 */
function tryReadSocietyModule(modules: Readonly<Record<string, unknown>>): readonly SettlementSnapshot[] | null {
  const society = modules["society"];
  if (!isPlainObject(society) || !isPlainObject(society["settlements"])) return null;
  const groups = isPlainObject(society["groups"]) ? (society["groups"] as Record<string, unknown>) : {};

  const out: SettlementSnapshot[] = [];
  for (const [id, raw] of Object.entries(society["settlements"] as Record<string, unknown>)) {
    if (!isPlainObject(raw)) continue;
    const population = typeof raw["population"] === "number" ? (raw["population"] as number) : 0;

    const groupId = typeof raw["groupId"] === "string" ? raw["groupId"] : null;
    const group = groupId !== null && isPlainObject(groups[groupId]) ? (groups[groupId] as Record<string, unknown>) : null;

    const actorIds = group && Array.isArray(group["memberIds"]) ? (group["memberIds"] as string[]) : [];
    const pooled = group && typeof (group["resources"] as Record<string, unknown> | undefined)?.["pooled"] === "number" ? ((group["resources"] as Record<string, unknown>)["pooled"] as number) : null;
    const tension = group && typeof group["tension"] === "number" ? (group["tension"] as number) : null;

    // resources.pooled is an unbounded accumulator in Team 07's model, not a 0..1 fraction — compress it into one with a soft curve rather than a hard clamp that would saturate at 1 for any sizeable settlement.
    const wealth = pooled === null ? 0 : clamp01(pooled / (pooled + 50));
    const cohesion = tension === null ? 0.5 : clamp01(1 - tension);
    const inequality = 0.3; // no per-member wealth distribution exists anywhere upstream yet (Team 09 Economy territory) — honest default, not a guess dressed as data.

    out.push({ settlementId: id, population, wealth, inequality, cohesion, actorIds });
  }
  return out.length > 0 ? out : null;
}

/**
 * There is currently no real upstream source for per-individual behavioral
 * traits (see file header: Team 06's CreatureState has no matching fields,
 * and Team 07's individualIds aren't wired to Team 06's creatureIds at
 * all). Rather than silently defaulting every trait to 0 — which would
 * flatten authority/legitimacy computation for every real Team 07
 * individual identically — this derives stable per-individual trait values
 * from a seeded RNG keyed by the real individualId, so the same person
 * gets the same traits on every tick even though the traits themselves
 * aren't backed by real simulation yet.
 */
function deriveSyntheticTraitsForRealActor(actorId: string, settlementId: string, rng: RngStreamRegistry): ActorSnapshot {
  const stream = rng.fork(`politics/population-fallback/actor-traits/${actorId}`);
  return {
    actorId,
    settlementId,
    influence: stream.nextFloat(),
    wealth: stream.nextFloat(),
    militaryStrength: stream.nextFloat(),
    kinship: stream.nextFloat(),
    religiousStanding: stream.nextFloat(),
    knowledge: stream.nextFloat(),
    trust: stream.nextFloat(),
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Deterministic standalone fallback: grows a small synthetic population
 * from the world's own tick count and RNG, so Team 08 has *something* to
 * govern even when Team 07 isn't attached at all yet. Every draw comes
 * from `rng.fork("politics/population-fallback")`, isolated from every
 * other subsystem's stream.
 */
function syntheticPopulation(state: WorldState, rng: RngStreamRegistry): PopulationSnapshot {
  const stream = rng.fork("politics/population-fallback");
  const settlementCount = 1 + Math.floor(Math.min(state.tick, 400) / 100); // grows slowly, capped
  const settlements: SettlementSnapshot[] = [];
  const actorsById: Record<string, ActorSnapshot> = {};

  for (let s = 0; s < settlementCount; s++) {
    const settlementId = `fallback-settlement-${s}`;
    const population = 10 + Math.floor(Math.min(state.tick, 2000) / 5) + stream.nextInt(0, 20);
    const actorCount = Math.min(12, Math.max(3, Math.floor(population / 15)));
    const actorIds: string[] = [];
    for (let a = 0; a < actorCount; a++) {
      const actorId = `${settlementId}-actor-${a}`;
      actorIds.push(actorId);
      actorsById[actorId] = {
        actorId,
        settlementId,
        influence: stream.nextFloat(),
        wealth: stream.nextFloat(),
        militaryStrength: stream.nextFloat(),
        kinship: stream.nextFloat(),
        religiousStanding: stream.nextFloat(),
        knowledge: stream.nextFloat(),
        trust: stream.nextFloat(),
      };
    }
    settlements.push({
      settlementId,
      population,
      wealth: stream.nextFloat(),
      inequality: stream.nextFloat() * 0.6,
      cohesion: 0.4 + stream.nextFloat() * 0.5,
      actorIds,
    });
  }

  return { settlements, actorsById, sourced: false, traitsAreSynthetic: true };
}

/**
 * Reads whatever population context is available for this tick: real
 * Team 07 settlement/group structure when `state.modules.society` is
 * attached (population, wealth, cohesion, and the real roster of member
 * ids are genuine Team 07 data), with per-individual behavioral traits
 * derived deterministically per real individualId (see
 * `deriveSyntheticTraitsForRealActor` — there is currently no real
 * upstream source for those traits; see file header). Falls back to a
 * fully synthetic population only when Team 07 isn't attached at all.
 */
export function readPopulationSnapshot(state: WorldState, rng: RngStreamRegistry): PopulationSnapshot {
  const societySettlements = tryReadSocietyModule(state.modules);
  if (!societySettlements) return syntheticPopulation(state, rng);

  const actorsById: Record<string, ActorSnapshot> = {};
  for (const settlement of societySettlements) {
    for (const actorId of settlement.actorIds) {
      actorsById[actorId] = deriveSyntheticTraitsForRealActor(actorId, settlement.settlementId, rng);
    }
  }
  return { settlements: societySettlements, actorsById, sourced: true, traitsAreSynthetic: true };
}

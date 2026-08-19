/**
 * Population adapter — Team 08's read-only port onto Team 06 (Creature/NPC
 * Intelligence) and Team 07 (Society/Culture/Civilization).
 *
 * Per the brief ("If an interface is missing, create a clean
 * adapter/interface. Do NOT wait for other teams."), this file:
 *
 *  1. Defines the minimal shape Team 08 actually needs from those teams
 *     (`ActorSnapshot`, `SettlementSnapshot`).
 *  2. Duck-types `WorldState.modules.npc` / `WorldState.modules.society` at
 *     runtime and adapts them if they already look like that shape.
 *  3. Falls back to a deterministic, seed-derived synthetic population when
 *     neither module exists yet, so Team 08 can run, be tested, and evolve
 *     standalone. The fallback is intentionally simple and clearly marked —
 *     it is NOT a substitute for real Team 06/07 data and should be treated
 *     as a placeholder until those teams attach real state.
 *
 * Nothing here mutates `state.modules.npc`/`state.modules.society` — Team 08
 * only ever reads population context, never owns it (see brief §2, "Do NOT
 * own: basic social relationships, basic culture generation").
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
  /** True when this snapshot came from real Team 06/07 module state rather than the standalone fallback. */
  readonly sourced: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Best-effort duck-typed read of a Team 07 `society` module, if one is attached and shaped as expected. */
function tryReadSocietyModule(modules: Readonly<Record<string, unknown>>): readonly SettlementSnapshot[] | null {
  const society = modules["society"];
  if (!isPlainObject(society) || !isPlainObject(society["settlements"])) return null;

  const out: SettlementSnapshot[] = [];
  for (const [id, raw] of Object.entries(society["settlements"] as Record<string, unknown>)) {
    if (!isPlainObject(raw)) continue;
    const population = typeof raw["population"] === "number" ? (raw["population"] as number) : 0;
    const wealth = typeof raw["wealth"] === "number" ? clamp01(raw["wealth"] as number) : 0;
    const inequality = typeof raw["inequality"] === "number" ? clamp01(raw["inequality"] as number) : 0.3;
    const cohesion = typeof raw["cohesion"] === "number" ? clamp01(raw["cohesion"] as number) : 0.5;
    const actorIds = Array.isArray(raw["memberIds"]) ? (raw["memberIds"] as string[]) : [];
    out.push({ settlementId: id, population, wealth, inequality, cohesion, actorIds });
  }
  return out.length > 0 ? out : null;
}

/** Best-effort duck-typed read of a Team 06 `npc` module, if attached and shaped as expected. */
function tryReadNpcModule(modules: Readonly<Record<string, unknown>>): Readonly<Record<string, ActorSnapshot>> | null {
  const npc = modules["npc"];
  if (!isPlainObject(npc) || !isPlainObject(npc["agents"])) return null;

  const out: Record<string, ActorSnapshot> = {};
  for (const [id, raw] of Object.entries(npc["agents"] as Record<string, unknown>)) {
    if (!isPlainObject(raw)) continue;
    out[id] = {
      actorId: id,
      settlementId: typeof raw["settlementId"] === "string" ? (raw["settlementId"] as string) : "unassigned",
      influence: numOr(raw["influence"], 0),
      wealth: numOr(raw["wealth"], 0),
      militaryStrength: numOr(raw["militaryStrength"], 0),
      kinship: numOr(raw["kinship"], 0),
      religiousStanding: numOr(raw["religiousStanding"], 0),
      knowledge: numOr(raw["knowledge"], 0),
      trust: numOr(raw["trust"], 0),
    };
  }
  return Object.keys(out).length > 0 ? out : null;
}

function numOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? clamp01(value) : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Deterministic standalone fallback: grows a small synthetic population
 * from the world's own tick count and RNG, so Team 08 has *something* to
 * govern even before Team 06/07 exist. Every draw comes from
 * `rng.fork("politics/population-fallback")`, isolated from every other
 * subsystem's stream.
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

  return { settlements, actorsById, sourced: false };
}

/**
 * Reads whatever population context is available for this tick: real
 * Team 07 settlements + Team 06 agents if attached, otherwise the
 * deterministic standalone fallback.
 */
export function readPopulationSnapshot(state: WorldState, rng: RngStreamRegistry): PopulationSnapshot {
  const societySettlements = tryReadSocietyModule(state.modules);
  const npcAgents = tryReadNpcModule(state.modules);

  if (societySettlements) {
    return { settlements: societySettlements, actorsById: npcAgents ?? {}, sourced: true };
  }
  return syntheticPopulation(state, rng);
}

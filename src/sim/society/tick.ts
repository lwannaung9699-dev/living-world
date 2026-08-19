/**
 * Team 07 top-level tick composition.
 *
 * `societyTick` is a Foundation `SubsystemTickFn` (see
 * core/simulation/simulation.ts): `(state, rng) => state`. It is meant to
 * be appended to `SimulationContext.subsystems` after Team 02-06's own
 * tick functions, in pipeline order. It never touches anything outside
 * `state.modules.society` (reads other modules only through the adapters
 * in contracts.ts) and never uses `Math.random` — every draw goes through
 * a namespaced fork of the shared RngStreamRegistry, so the sequence for
 * any other subsystem (or another society run with different tick counts)
 * is unaffected.
 *
 * DETERMINISM NOTE: every subsystem below iterates its own state via
 * sorted keys / sorted individual ids (see state.ts's sortedEntries and
 * each subsystem file), so the order in which the NpcAdapter happens to
 * return individuals, or the insertion order of any Record in
 * SocietyState, never changes the outcome.
 */

import { WorldState } from "../core/state/worldState";
import { RngStreamRegistry } from "../core/rng/rngStreamRegistry";
import { SocietyAdapters, defaultSocietyAdapters } from "./contracts";
import { readSocietyState, writeSocietyState, SocietyState } from "./state";
import { syncKinship } from "./kinship";
import { generateInteractionEvents, applyInteractionEvents, pruneDeadRelationships } from "./relationships";
import { applyCooperation } from "./cooperation";
import { applyConflict, applyReconciliation } from "./conflict";
import {
  formGroupsFromTrustClusters,
  pruneAbsentMembers,
  evaluateGroupSplits,
  evaluateGroupMerges,
} from "./groups";
import { updateLeadership } from "./leadership";
import { updateRoles } from "./roles";
import { updateSettlements, updateTerritory } from "./settlement";
import { settleResourcePool, evaluateTrade } from "./economy";
import { updateNormFormation, deriveConflictSanctions } from "./norms";
import { transmitCulture, updateStoriesAndMyths, developSymbols, developLanguageConcepts, recordCollectiveMemory } from "./culture";
import { applyInnovation, applyTechnologyDiffusion } from "./technology";
import { evaluateMigration } from "./migration";
import { updateInstitutions } from "./institutions";

export interface SocietyTickOptions {
  readonly adapters?: SocietyAdapters;
}

export function createSocietyTick(options: SocietyTickOptions = {}) {
  const adapters = options.adapters ?? defaultSocietyAdapters;

  return function societyTick(state: WorldState, rng: RngStreamRegistry): WorldState {
    const tick = state.tick;
    let society = readSocietyState(state);

    const individuals = adapters.npc.listIndividuals(state);
    const livingIds = new Set(individuals.filter((i) => i.alive).map((i) => i.id));

    society = pruneAbsentMembers(society, livingIds);
    society = pruneDeadRelationships(society, livingIds);
    society = syncKinship(state, society, adapters.biology, tick);

    const events = generateInteractionEvents(individuals, society, tick, rng.fork("society/interactions"));
    society = applyInteractionEvents(society, events);

    const cooperativeEvents = events.filter((e) => e.kind === "cooperative");
    const competitiveEvents = events.filter((e) => e.kind === "competitive");

    const cooperationOutcome = applyCooperation(
      society,
      cooperativeEvents,
      state,
      adapters.ecology,
      rng.fork("society/cooperation"),
    );
    society = cooperationOutcome.society;

    const conflictOutcome = applyConflict(society, competitiveEvents, state, adapters.ecology, tick);
    society = conflictOutcome.society;
    society = deriveConflictSanctions(society, conflictOutcome.conflictEvents, tick);
    society = applyReconciliation(society);

    const groupCountBefore = Object.values(society.groups).filter((g) => g.active).length;
    society = formGroupsFromTrustClusters(society, individuals, tick);
    society = recordNewGroupMemories(society, groupCountBefore, tick);

    society = updateLeadership(society, individuals, tick);
    society = updateRoles(society, individuals, state, adapters.ecology);

    society = updateSettlements(society, individuals, tick);
    society = updateTerritory(society, individuals);

    society = settleResourcePool(society);
    society = evaluateTrade(society, tick);

    society = updateNormFormation(society, tick);

    society = transmitCulture(society, individuals, rng.fork("society/culture"));
    society = updateStoriesAndMyths(society, tick, rng.fork("society/stories"));
    society = developSymbols(society, tick);
    society = developLanguageConcepts(society, tick);

    society = applyInnovation(society, individuals, state, adapters.ecology, rng.fork("society/innovation"), tick);
    society = applyTechnologyDiffusion(society, rng.fork("society/diffusion"));

    society = evaluateMigration(society, state, adapters.ecology, tick);
    society = evaluateGroupSplits(society, tick);
    society = evaluateGroupMerges(society, tick);

    society = updateInstitutions(society, tick);

    return writeSocietyState(state, society);
  };
}

/** Founding a group is itself a memorable event for that group's own collective memory. */
function recordNewGroupMemories(society: SocietyState, groupCountBefore: number, tick: number): SocietyState {
  void groupCountBefore; // retained for signature clarity/future use; founding is detected directly via foundedTick === tick
  const activeGroups = Object.values(society.groups).filter((g) => g.active && g.foundedTick === tick);
  if (activeGroups.length === 0) return society;

  let current = society;
  for (const group of activeGroups.slice().sort((a, b) => a.groupId.localeCompare(b.groupId))) {
    current = recordCollectiveMemory(
      current,
      group.groupId,
      "founding",
      0.6,
      group.founderIds,
      "unknown",
      tick,
      `${group.groupId} was founded`,
    );
  }
  return current;
}

/** Default-configured society tick, ready to append to SimulationContext.subsystems. */
export const societyTick = createSocietyTick();

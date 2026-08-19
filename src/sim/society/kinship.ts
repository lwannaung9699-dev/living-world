/**
 * Kinship subsystem (spec §5).
 *
 * Team 04 owns biological validity of parent/child/sibling/mate facts.
 * Team 07 only consumes those facts (via BiologyAdapter) and lets them
 * influence trust, cooperation, inheritance, protection, group identity,
 * and social status through the relationship graph — it never invents or
 * duplicates reproduction logic itself.
 */

import { BiologyAdapter, KinshipFact } from "./contracts";
import { WorldState } from "../core/state/worldState";
import { Relationship } from "./types";
import { SocietyState } from "./state";
import { pairKey } from "./relationships";

/** Baseline trust/loyalty/obligation floors implied by a kinship relation — kin start from a warmer baseline than strangers, without overwriting trust already earned/lost through events. */
const KIN_TRUST_FLOOR: Record<KinshipFact["relation"], number> = {
  parent: 0.4,
  child: 0.4,
  sibling: 0.25,
  mate: 0.35,
}; 
const KIN_LOYALTY_FLOOR: Record<KinshipFact["relation"], number> = {
  parent: 0.5,
  child: 0.5,
  sibling: 0.3,
  mate: 0.45,
};
const KIN_OBLIGATION_FLOOR: Record<KinshipFact["relation"], number> = {
  parent: 0.4,
  child: 0.3,
  sibling: 0.2,
  mate: 0.3,
};

function defaultRelationshipFor(a: string, b: string, tick: number): Relationship {
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

/**
 * Folds this tick's BiologyAdapter kinship facts into the relationship
 * graph: tags the relation type and raises trust/loyalty/obligation to at
 * least the kinship floor (never lowers values already raised by positive
 * interaction history).
 */
export function syncKinship(state: WorldState, society: SocietyState, adapter: BiologyAdapter, tick: number): SocietyState {
  const facts = adapter.listKinshipFacts(state);
  if (facts.length === 0) return society;

  let relationships = society.relationships;
  const sortedFacts = facts.slice().sort((f1, f2) => pairKey(f1.a, f1.b).localeCompare(pairKey(f2.a, f2.b)));

  for (const fact of sortedFacts) {
    const key = pairKey(fact.a, fact.b);
    const existing = relationships[key] ?? defaultRelationshipFor(fact.a, fact.b, tick);
    relationships = {
      ...relationships,
      [key]: {
        ...existing,
        kinship: fact.relation,
        trust: Math.max(existing.trust, KIN_TRUST_FLOOR[fact.relation]),
        loyalty: Math.max(existing.loyalty, KIN_LOYALTY_FLOOR[fact.relation]),
        obligation: Math.max(existing.obligation, KIN_OBLIGATION_FLOOR[fact.relation]),
      },
    };
  }

  return { ...society, relationships };
}

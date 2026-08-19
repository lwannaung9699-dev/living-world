/**
 * Data-driven configuration for Team 08 emergence.
 *
 * Per the approved architecture ("Hardcode ခွင့်ပြုတာ: ရုပ်ပိုင်း/ဇီဝဗေဒ
 * ဆက်ဆံရေးနိယာမ" — relationship rules/formulas may be hardcoded;
 * "Hardcode တားမြစ်တာ: ဘယ် species/history ဖြစ်လာမယ်ဆိုတာ" — specific
 * outcomes may not), everything in this file is a *weight, threshold, or
 * formula constant*, never a decision about which government/leader/state
 * a given world ends up with. All actual choices are made by weighted RNG
 * draws (src/sim/core/rng) over these tables, seeded from world history.
 */

import type { AuthorityFactors, DecisionMethod, PropertyKind, PunishmentKind, SuccessionMethod } from "./contracts";

/** How each raw AuthorityFactors field contributes to the composite authorityScore. Must sum to 1. */
export const AUTHORITY_WEIGHTS: Readonly<AuthorityFactors> = {
  influence: 0.14,
  legitimacyBonus: 0.14,
  trust: 0.12,
  militaryStrength: 0.1,
  wealth: 0.1,
  kinship: 0.1,
  religiousAuthority: 0.1,
  knowledge: 0.1,
  tradition: 0.06,
  institutionalControl: 0.04,
};

/** Minimum times a behavior must be observed-and-reinforced before it can crystallize into customary law. */
export const CUSTOM_TO_LAW_OBSERVATION_THRESHOLD = 6;
/** Minimum enforced-violation events (social punishment actually applied) required alongside observation count. */
export const CUSTOM_TO_LAW_ENFORCEMENT_THRESHOLD = 2;

/** Conditions (see rules.ts) beyond which a customary rule may formalize into codified law. */
export const FORMAL_LAW_POPULATION_THRESHOLD = 80;
export const FORMAL_LAW_MIN_AUTHORITY_CONCENTRATION = 0.2;

/**
 * Candidate decision methods and the settlement/society signal each one
 * scores against. Governance emergence (governance.ts) computes a weight
 * per candidate from these signal readers and lets a deterministic
 * weighted RNG draw pick among them — no method is ever assigned outright.
 */
export const DECISION_METHOD_BASE_WEIGHT: Readonly<Record<DecisionMethod, number>> = {
  individual_ruler: 1,
  elder_council: 1,
  consensus: 1,
  majority_vote: 0.6,
  representative_vote: 0.5,
  merchant_council: 0.7,
  military_council: 0.7,
  religious_authority: 0.8,
  hereditary_succession: 0.8,
};

export const SUCCESSION_METHOD_BASE_WEIGHT: Readonly<Record<SuccessionMethod, number>> = {
  hereditary: 1,
  elected: 0.6,
  appointed: 0.6,
  appointed_by_council: 0.7,
  military: 0.6,
  religious: 0.6,
  merit_based: 0.5,
  contest: 0.4,
};

export const PROPERTY_KIND_BASE_WEIGHT: Readonly<Record<PropertyKind, number>> = {
  personal: 1,
  family: 1,
  clan: 0.8,
  communal: 0.9,
  institutional: 0.4,
  state: 0.3,
};

/** Population + institutional-maturity thresholds that gate later-stage emergence (taxation, public resources, statehood, ...). */
export const EMERGENCE_THRESHOLDS = {
  /** Minimum settlement population before any governance system may emerge at all. */
  governanceMinPopulation: 25,
  /** Minimum accumulated formal rules in scope before taxation can emerge. */
  taxationMinFormalRules: 2,
  /** Minimum settlement wealth proxy before public resources can emerge. */
  publicResourceMinWealth: 40,
  /** Minimum population for a settlement's institutions to be eligible for statehood recognition. */
  statehoodMinPopulation: 150,
  /** Minimum ticks a governance system must have existed, stably, before statehood can be recognized. */
  statehoodMinStableTicks: 40,
  /** Minimum population before political factions can crystallize out of the general population. */
  factionMinPopulation: 60,
  /** Minimum distinct factions with opposed interests before political conflict can ignite. */
  conflictMinOpposedFactions: 2,
} as const;

/** Stability composite weights (sum to 1). See statehood.ts computeStability(). */
export const STABILITY_WEIGHTS = {
  legitimacy: 0.2,
  foodSecurity: 0.15,
  economicHealth: 0.15,
  eliteCohesion: 0.1,
  publicSupport: 0.15,
  militaryLoyalty: 0.1,
  regionalCohesion: 0.1,
  institutionalEffectiveness: 0.05,
} as const;

/** How heavily each institutional-failure factor drags stability down, subtracted after the weighted factor sum. */
export const INSTITUTIONAL_FAILURE_PENALTY = {
  corruption: 0.08,
  nepotism: 0.05,
  eliteCapture: 0.07,
  administrativeInefficiency: 0.05,
  taxEvasion: 0.04,
  abuseOfAuthority: 0.08,
} as const;

/** Below this stability score, a polity accrues rebellion/fragmentation pressure. */
export const STABILITY_CRISIS_THRESHOLD = 0.35;
/** Consecutive ticks below STABILITY_CRISIS_THRESHOLD required before rebellion/fragmentation may trigger. */
export const CRISIS_PERSISTENCE_TICKS_FOR_REBELLION = 15;

/** Sanctions eligible for a freshly-formed rule, weighted by how severe the underlying violation concept sounds structurally (mild default set — societies escalate over time via reinforcement, see rules.ts). */
export const DEFAULT_SANCTION_POOL: readonly PunishmentKind[] = ["warning", "fine", "compensation", "social_exclusion"];
export const ESCALATED_SANCTION_POOL: readonly PunishmentKind[] = [
  "fine",
  "compensation",
  "loss_of_status",
  "social_exclusion",
  "forced_labor",
  "imprisonment",
  "banishment",
];

/** Legitimacy source contribution weights — a source only contributes if the profile has it set. */
export const LEGITIMACY_SOURCE_WEIGHTS = {
  tradition: 0.12,
  popular_support: 0.16,
  religion: 0.12,
  military_victory: 0.1,
  wealth: 0.08,
  law: 0.1,
  kinship: 0.1,
  election: 0.14,
  performance: 0.14,
  fear: 0.06,
} as const;

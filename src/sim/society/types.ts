/**
 * Team 07 (Society & Civilization) — core data types.
 *
 * Every type here is plain-JSON-serializable (readonly interfaces, no
 * class instances, no Map/Set/Date), matching the WorldState contract:
 * this whole module lives at `state.modules.society` and must survive
 * canonicalStringify -> canonicalParse round trips untouched.
 */

import { KinshipRelation } from "./contracts";

/* ------------------------------- groups -------------------------------- */

export interface SocialGroup {
  readonly groupId: string;
  readonly memberIds: readonly string[];
  readonly founderIds: readonly string[];
  readonly leaderIds: readonly string[];
  readonly sharedGoals: readonly string[];
  /** locationId -> influence weight, see territory.ts */
  readonly territory: Readonly<Record<string, number>>;
  readonly resources: {
    readonly pooled: number;
  };
  readonly customs: readonly string[];
  readonly normIds: readonly string[];
  readonly identitySymbolIds: readonly string[];
  readonly foundedTick: number;
  /** Group tension accumulates from unresolved conflict; drives fission. */
  readonly tension: number;
  readonly parentGroupId: string | null;
  readonly active: boolean;
}

/* ---------------------------- relationships ------------------------------ */

export interface Relationship {
  readonly a: string;
  readonly b: string;
  readonly trust: number; // [-1, 1]
  readonly respect: number; // [-1, 1]
  readonly fear: number; // [0, 1]
  readonly loyalty: number; // [0, 1]
  readonly friendship: number; // [-1, 1]
  readonly rivalry: number; // [0, 1]
  readonly obligation: number; // [0, 1]
  readonly kinship: KinshipRelation | null;
  readonly authority: number; // [-1,1] positive: a has authority over b
  readonly lastEventTick: number;
}

export type InteractionKind = "cooperative" | "competitive" | "neutral";

export interface InteractionEvent {
  readonly a: string;
  readonly b: string;
  readonly kind: InteractionKind;
  readonly locationId: string;
  readonly tick: number;
}

/* -------------------------------- roles ---------------------------------- */

export const SOCIAL_ROLES = [
  "hunter",
  "gatherer",
  "builder",
  "healer",
  "craftsperson",
  "trader",
  "scout",
  "guard",
  "leader",
  "teacher",
  "farmer",
  "artisan",
  "storyteller",
] as const;

export type SocialRole = (typeof SOCIAL_ROLES)[number];

/* ------------------------------ settlement -------------------------------- */

export type SettlementType =
  | "temporary_camp"
  | "seasonal_settlement"
  | "hamlet"
  | "village"
  | "town"
  | "city"
  | "fortification"
  | "trading_post"
  | "nomadic_route";

export interface Settlement {
  readonly settlementId: string;
  readonly locationId: string;
  readonly groupId: string;
  readonly foundedTick: number;
  /** Cumulative individual-ticks spent at this location; drives permanence classification. */
  readonly presence: number;
  readonly population: number;
  readonly settlementType: SettlementType;
  readonly defensibility: number; // [0,1], placeholder until Team 02 terrain integration
}

/* --------------------------------- norms ---------------------------------- */

export interface SocialNorm {
  readonly normId: string;
  readonly groupId: string;
  readonly behavior: string;
  readonly reinforcementCount: number;
  readonly establishedTick: number;
  readonly strength: number; // [0,1]
}

export type SanctionKind =
  | "approval"
  | "disapproval"
  | "warning"
  | "social_exclusion"
  | "loss_of_trust"
  | "punishment"
  | "reward";

export interface SanctionRecord {
  readonly sanctionId: string;
  readonly groupId: string;
  readonly targetId: string;
  readonly normId: string;
  readonly kind: SanctionKind;
  readonly tick: number;
}

/* -------------------------------- culture --------------------------------- */

export interface CulturalTrait {
  readonly traitId: string;
  readonly category: "custom" | "ritual" | "value" | "preference" | "tradition";
  readonly label: string;
  readonly originGroupId: string;
  readonly originTick: number;
}

export interface CollectiveMemoryEvent {
  readonly memoryId: string;
  readonly groupId: string;
  readonly event: string;
  readonly importance: number; // [0,1]
  readonly participantIds: readonly string[];
  readonly locationId: string;
  readonly tick: number;
  /** Groups may recall the same underlying event differently; this is this group's own gloss. */
  readonly interpretation: string;
}

export interface Story {
  readonly storyId: string;
  readonly groupId: string;
  readonly sourceMemoryId: string;
  readonly retellingCount: number;
  readonly symbolism: readonly string[];
  readonly createdTick: number;
  readonly lastRetoldTick: number;
  readonly isMyth: boolean;
}

export type SymbolMeaning =
  | "group_identity"
  | "territory"
  | "religion"
  | "authority"
  | "ownership"
  | "warning"
  | "trade"
  | "history";

export interface CulturalSymbol {
  readonly symbolId: string;
  readonly groupId: string;
  readonly meaning: SymbolMeaning;
  readonly token: string;
  readonly createdTick: number;
}

export interface LanguageConcept {
  readonly conceptId: string;
  readonly groupId: string;
  readonly concept: string;
  readonly symbolToken: string;
  readonly createdTick: number;
}

/* ------------------------------ technology --------------------------------- */

export interface Technology {
  readonly technologyId: string;
  readonly label: string;
  readonly originGroupId: string;
  readonly originIndividualId: string;
  readonly originTick: number;
  /** groupIds that currently know this technology. */
  readonly knownByGroupIds: readonly string[];
}

/* --------------------------------- trade ----------------------------------- */

export interface TradeRecord {
  readonly tradeId: string;
  readonly groupA: string;
  readonly groupB: string;
  readonly kind: "exchange" | "gift" | "debt" | "tribute";
  readonly value: number;
  readonly tick: number;
}

/* ------------------------------- migration ---------------------------------- */

export interface MigrationRecord {
  readonly migrationId: string;
  readonly groupId: string;
  readonly fromLocationId: string;
  readonly toLocationId: string;
  readonly reason:
    | "resource_depletion"
    | "population_pressure"
    | "conflict"
    | "trade_opportunity"
    | "predator_pressure";
  readonly tick: number;
}

/* ------------------------------ institutions ---------------------------------- */

export type InstitutionKind =
  | "authority"
  | "religious_organization"
  | "trade_organization"
  | "military_organization"
  | "council"
  | "guild"
  | "clan_authority";

export interface Institution {
  readonly institutionId: string;
  readonly groupId: string;
  readonly kind: InstitutionKind;
  readonly memberIds: readonly string[];
  readonly establishedTick: number;
  readonly stabilityTicks: number;
}

/* ---------------------------- civilization metrics ------------------------------ */

export interface CivilizationMetrics {
  readonly populationDensity: number;
  readonly settlementPermanence: number;
  readonly socialComplexity: number;
  readonly knowledgeDiversity: number;
  readonly institutionCount: number;
  readonly tradeConnectivity: number;
  readonly technologyDiversity: number;
  readonly infrastructure: number;
  readonly culturalDifferentiation: number;
  readonly historicalDepth: number;
}

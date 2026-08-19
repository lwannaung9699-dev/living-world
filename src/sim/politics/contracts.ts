/**
 * LIVING WORLD — Team 08 (Law, Governance, Institutions & Political Emergence)
 *
 * Shared type contracts for everything Team 08 owns: rules, customary law,
 * authority, legitimacy, governance systems, elections, councils,
 * succession, property, taxation, public resources, justice, disputes,
 * punishment, rights/obligations, political factions, diplomacy, treaties,
 * territory, statehood, and political history.
 *
 * Every shape here is plain-JSON-serializable (readonly, no class
 * instances, no Map/Set/Date) so it can live under
 * `WorldState.modules.politics` per Team 01's extensibility contract
 * (see src/sim/core/state/worldState.ts). Nothing here hardcodes a named
 * civilization, government, or outcome — these are data shapes that the
 * emergence logic in the sibling files fills in at runtime from simulated
 * history.
 */

export const POLITICS_CONTRACT_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// 4. Rules & 5/6. Customary → Formal Law
// ---------------------------------------------------------------------------

/** How strictly a SocialRule was arrived at — informal social pressure vs. codified law. */
export type RuleStatus = "customary" | "formal";

export interface SocialRule {
  readonly ruleId: string;
  /** Settlement, faction, polity, or other group id this rule applies within. */
  readonly scope: string;
  /** Actor id, council id, or polity id that created/codified the rule. Null while purely customary and diffuse. */
  readonly creator: string | null;
  readonly enactedAtTick: number;
  readonly concept: string;
  readonly conditions: readonly string[];
  readonly prohibitedActions: readonly string[];
  readonly requiredActions: readonly string[];
  readonly permissions: readonly string[];
  readonly sanctions: readonly PunishmentKind[];
  readonly exceptions: readonly string[];
  /** 0..1 — how consistently violations are actually enforced. */
  readonly enforcementStrength: number;
  /** 0..1 — how broadly the scope's population accepts the rule as legitimate. */
  readonly socialAcceptance: number;
  readonly status: RuleStatus;
}

/** Tracks a repeated behavior within a scope on its way to becoming customary law. */
export interface CustomTracker {
  readonly trackerId: string;
  readonly scope: string;
  readonly concept: string;
  /** Consecutive/cumulative observations of the behavior being followed. */
  readonly observedCount: number;
  /** Observations of the behavior being violated and socially punished. */
  readonly enforcedViolationCount: number;
  readonly firstObservedTick: number;
  readonly lastObservedTick: number;
  /** Set once the tracker has crystallized into a SocialRule. */
  readonly producedRuleId: string | null;
}

// ---------------------------------------------------------------------------
// 7/8. Authority & Legitimacy
// ---------------------------------------------------------------------------

export interface AuthorityFactors {
  readonly influence: number;
  readonly legitimacyBonus: number;
  readonly trust: number;
  readonly militaryStrength: number;
  readonly wealth: number;
  readonly kinship: number;
  readonly religiousAuthority: number;
  readonly knowledge: number;
  readonly tradition: number;
  readonly institutionalControl: number;
}

export interface AuthorityProfile {
  readonly actorId: string;
  readonly scope: string;
  readonly factors: AuthorityFactors;
  /** Weighted composite of factors, 0..1. Never equal to militaryStrength alone. */
  readonly authorityScore: number;
  readonly updatedAtTick: number;
}

export type LegitimacySource =
  | "tradition"
  | "popular_support"
  | "religion"
  | "military_victory"
  | "wealth"
  | "law"
  | "kinship"
  | "election"
  | "performance"
  | "fear";

export interface LegitimacyProfile {
  readonly actorId: string;
  readonly scope: string;
  readonly sources: Readonly<Partial<Record<LegitimacySource, number>>>;
  /** 0..1 composite legitimacy, independent from raw authority/power. */
  readonly legitimacyScore: number;
  readonly updatedAtTick: number;
}

// ---------------------------------------------------------------------------
// 9/10/11. Governance, decision methods, representation
// ---------------------------------------------------------------------------

export type DecisionMethod =
  | "individual_ruler"
  | "elder_council"
  | "consensus"
  | "majority_vote"
  | "representative_vote"
  | "merchant_council"
  | "military_council"
  | "religious_authority"
  | "hereditary_succession";

export type RepresentationStructure =
  | "none"
  | "direct_participation"
  | "selected_representatives"
  | "hereditary_representatives"
  | "guild_representatives"
  | "clan_representatives"
  | "regional_representatives";

export interface GovernanceSystem {
  readonly governanceId: string;
  /** Settlement id, region id, or polity id this governance system administers. */
  readonly scope: string;
  readonly decisionMethod: DecisionMethod;
  readonly representation: RepresentationStructure;
  readonly leaderId: string | null;
  readonly councilId: string | null;
  readonly successionMethod: SuccessionMethod;
  readonly establishedAtTick: number;
  /** Ids of institutions this governance system currently administers (councils, courts, tax policies, ...). */
  readonly administers: readonly string[];
}

// ---------------------------------------------------------------------------
// 12. Elections
// ---------------------------------------------------------------------------

export type VotingMethod = "plurality" | "approval" | "weighted_by_authority" | "acclamation";

export interface Election {
  readonly electionId: string;
  readonly scope: string;
  readonly seat: string;
  readonly candidateIds: readonly string[];
  readonly eligibleVoterIds: readonly string[];
  readonly votingMethod: VotingMethod;
  readonly votes: Readonly<Record<string, string>>; // voterId -> candidateId
  readonly winnerId: string | null;
  readonly calledAtTick: number;
  readonly resolvedAtTick: number | null;
  readonly termLengthTicks: number | null;
}

// ---------------------------------------------------------------------------
// 13. Councils
// ---------------------------------------------------------------------------

export type CouncilSelectionCriterion =
  | "age"
  | "experience"
  | "wealth"
  | "kinship"
  | "prestige"
  | "military_ability"
  | "knowledge"
  | "religious_status"
  | "election"
  | "appointment";

export interface Council {
  readonly councilId: string;
  readonly scope: string;
  readonly memberIds: readonly string[];
  readonly selectionCriteria: readonly CouncilSelectionCriterion[];
  readonly formedAtTick: number;
  readonly seats: number;
}

// ---------------------------------------------------------------------------
// 14. Succession
// ---------------------------------------------------------------------------

export type SuccessionMethod =
  | "hereditary"
  | "elected"
  | "appointed"
  | "appointed_by_council"
  | "military"
  | "religious"
  | "merit_based"
  | "contest";

export interface SuccessionEvent {
  readonly successionId: string;
  readonly scope: string;
  readonly method: SuccessionMethod;
  readonly previousLeaderId: string | null;
  readonly newLeaderId: string | null;
  readonly triggeredAtTick: number;
  readonly reason: "term_end" | "death" | "removal" | "abdication" | "conquest" | "revolution";
}

// ---------------------------------------------------------------------------
// 15/16. Property & land
// ---------------------------------------------------------------------------

export type PropertyKind = "personal" | "family" | "clan" | "communal" | "institutional" | "state";

export interface PropertyRight {
  readonly propertyId: string;
  readonly kind: PropertyKind;
  readonly holderId: string; // actor id, family id, clan id, institution id, or polity id
  readonly resourceRef: string; // opaque reference into Team 03/05 object/resource ids
  readonly establishedAtTick: number;
  readonly basis: "occupation" | "inheritance" | "conquest" | "allocation" | "purchase" | "communal_use" | "religious_ownership" | "state_allocation";
}

export interface LandClaim {
  readonly claimId: string;
  readonly holderId: string;
  readonly territoryId: string;
  readonly basis: LandClaimBasis;
  readonly establishedAtTick: number;
  readonly strength: number; // 0..1, how contested/defensible the claim currently is
}

export type LandClaimBasis = "occupation" | "inheritance" | "conquest" | "allocation" | "purchase" | "communal_use" | "religious_ownership" | "state_allocation";

// ---------------------------------------------------------------------------
// 17. Taxation
// ---------------------------------------------------------------------------

export type TaxType = "food" | "labor" | "goods" | "land" | "money" | "tribute" | "military_service";

export interface TaxPolicy {
  readonly taxId: string;
  readonly scope: string; // polity/governance scope levying the tax
  readonly type: TaxType;
  readonly rate: number; // 0..1 fraction, or units-per-period for labor/military_service
  readonly payerScope: string; // who owes it (settlement, faction, class proxy)
  readonly collectorId: string; // institution/actor responsible for collection
  readonly destination: string; // treasury/public-resource id
  readonly enforcementStrength: number; // 0..1
  readonly complianceRate: number; // 0..1, observed/estimated
  readonly enactedAtTick: number;
}

// ---------------------------------------------------------------------------
// 18. Public resources
// ---------------------------------------------------------------------------

export type PublicResourceKind = "road" | "water" | "storage" | "defensive_structure" | "public_building" | "irrigation" | "market";

export interface PublicResource {
  readonly resourceId: string;
  readonly scope: string;
  readonly kind: PublicResourceKind;
  readonly maintenanceCost: number;
  readonly beneficiaryScope: string;
  readonly controllerId: string;
  readonly fundingSourceId: string | null; // TaxPolicy id, or null if unfunded/at risk
  readonly establishedAtTick: number;
  readonly condition: number; // 0..1, degrades without funding
}

// ---------------------------------------------------------------------------
// 19/20/21. Justice, dispute resolution, punishment
// ---------------------------------------------------------------------------

export type DisputeResolutionMethod =
  | "personal_settlement"
  | "family_mediation"
  | "elder_mediation"
  | "community_council"
  | "judge"
  | "ruler"
  | "court"
  | "religious_authority";

export type PunishmentKind =
  | "warning"
  | "fine"
  | "compensation"
  | "loss_of_status"
  | "social_exclusion"
  | "forced_labor"
  | "imprisonment"
  | "banishment"
  | "physical_punishment"
  | "death_penalty";

export interface Dispute {
  readonly disputeId: string;
  readonly scope: string;
  readonly partyIds: readonly string[];
  readonly concept: string;
  readonly raisedAtTick: number;
  readonly resolutionMethod: DisputeResolutionMethod;
  readonly resolvedAtTick: number | null;
  readonly outcome: string | null;
}

export interface JusticeCase {
  readonly caseId: string;
  readonly scope: string;
  readonly complaintantId: string;
  readonly accusedId: string;
  readonly accusation: string;
  readonly relatedRuleId: string | null;
  readonly evidenceStrength: number; // 0..1, abstracted
  readonly witnessIds: readonly string[];
  readonly filedAtTick: number;
  readonly resolutionMethod: DisputeResolutionMethod;
  readonly judgment: "guilty" | "not_guilty" | "settled" | "pending";
  readonly punishment: PunishmentKind | null;
  readonly compensationOwed: number | null;
  readonly appealOf: string | null;
  readonly resolvedAtTick: number | null;
}

// ---------------------------------------------------------------------------
// 22. Rights & obligations
// ---------------------------------------------------------------------------

export interface Right {
  readonly rightId: string;
  readonly scope: string;
  readonly holderClass: string; // e.g. "all_members", "landholders", "council_members"
  readonly concept: string;
  readonly grantedAtTick: number;
  readonly derivedFromRuleId: string | null;
}

export interface Obligation {
  readonly obligationId: string;
  readonly scope: string;
  readonly bearerClass: string;
  readonly concept: string;
  readonly grantedAtTick: number;
  readonly derivedFromRuleId: string | null;
}

// ---------------------------------------------------------------------------
// 23/24. Political factions & conflict
// ---------------------------------------------------------------------------

export type FactionInterest =
  | "wealth"
  | "land"
  | "trade"
  | "religion"
  | "military"
  | "clan"
  | "workers"
  | "merchants"
  | "farmers"
  | "nobility"
  | "regional_autonomy"
  | "centralization";

export interface PoliticalFaction {
  readonly factionId: string;
  readonly scope: string;
  readonly primaryInterests: readonly FactionInterest[];
  readonly memberIds: readonly string[];
  readonly cohesion: number; // 0..1
  readonly strength: number; // 0..1, derived from members' authority + wealth + numbers
  readonly formedAtTick: number;
}

export type PoliticalConflictKind =
  | "policy_disagreement"
  | "leadership_dispute"
  | "succession_dispute"
  | "class_conflict"
  | "regional_conflict"
  | "resource_conflict"
  | "religious_conflict"
  | "centralization_conflict";

export interface PoliticalConflict {
  readonly conflictId: string;
  readonly scope: string;
  readonly kind: PoliticalConflictKind;
  readonly factionIds: readonly string[];
  readonly startedAtTick: number;
  readonly intensity: number; // 0..1
  readonly resolvedAtTick: number | null;
  readonly resolution: "reform" | "suppression" | "compromise" | "revolution" | "collapse" | null;
}

// ---------------------------------------------------------------------------
// 25/26. Diplomacy & treaties
// ---------------------------------------------------------------------------

export type DiplomaticStance = "peace" | "trade_agreement" | "alliance" | "non_aggression_pact" | "tribute" | "vassal" | "hostility" | "war";

export interface DiplomaticRelation {
  readonly relationId: string;
  readonly polityAId: string;
  readonly polityBId: string;
  readonly stance: DiplomaticStance;
  readonly since: number;
  readonly trust: number; // 0..1
}

export interface Treaty {
  readonly treatyId: string;
  readonly participantIds: readonly string[];
  readonly terms: readonly string[];
  readonly signedAtTick: number;
  readonly durationTicks: number | null; // null = indefinite
  readonly obligations: Readonly<Record<string, readonly string[]>>; // polityId -> obligation concepts
  readonly violations: readonly { readonly polityId: string; readonly atTick: number; readonly concept: string }[];
  readonly terminatedAtTick: number | null;
  readonly terminationReason: string | null;
}

// ---------------------------------------------------------------------------
// 27. Borders / territory
// ---------------------------------------------------------------------------

export interface Territory {
  readonly territoryId: string;
  readonly controllingPolityId: string | null;
  /** Opaque region/settlement ids (Team 02 geography) claimed as part of this territory. */
  readonly memberRegionIds: readonly string[];
  readonly basis: readonly ("settlement" | "population" | "military_control" | "resource_control" | "historical_claim" | "treaty" | "geography")[];
  readonly establishedAtTick: number;
  readonly contested: boolean;
}

// ---------------------------------------------------------------------------
// 28/29/30/34. State formation, fragmentation, composable political entities
// ---------------------------------------------------------------------------

/**
 * A generic composable political entity. Deliberately NOT a hardcoded
 * "Kingdom"/"Empire"/"Republic" class — its character emerges from which
 * institutions it has accumulated (governanceId, decisionMethod,
 * representation, memberPolityIds, subordinateOf, ...).
 */
export interface PoliticalEntity {
  readonly polityId: string;
  readonly name: string | null; // may remain unnamed; Team 08 never invents flavor names
  readonly foundedAtTick: number;
  readonly territoryId: string;
  readonly governanceId: string;
  /** Non-empty when this entity is a composite (federation/confederation/empire) over other polities. */
  readonly memberPolityIds: readonly string[];
  /** Set when this entity is a vassal/tributary/subordinate of another. */
  readonly subordinateOf: string | null;
  readonly dissolvedAtTick: number | null;
  readonly dissolutionReason: PoliticalEntityDissolutionReason | null;
}

export type PoliticalEntityDissolutionReason =
  | "succession_crisis"
  | "rebellion"
  | "regional_independence"
  | "resource_collapse"
  | "civil_conflict"
  | "migration"
  | "external_pressure"
  | "absorbed";

// ---------------------------------------------------------------------------
// 32/33. Institutional failure & stability
// ---------------------------------------------------------------------------

export interface InstitutionalFailureFactors {
  readonly corruption: number;
  readonly nepotism: number;
  readonly eliteCapture: number;
  readonly administrativeInefficiency: number;
  readonly taxEvasion: number;
  readonly abuseOfAuthority: number;
}

export interface StabilityFactors {
  readonly legitimacy: number;
  readonly foodSecurity: number;
  readonly economicHealth: number;
  readonly eliteCohesion: number;
  readonly publicSupport: number;
  readonly militaryLoyalty: number;
  readonly regionalCohesion: number;
  readonly institutionalEffectiveness: number;
}

export interface StabilityProfile {
  readonly polityId: string;
  readonly factors: StabilityFactors;
  readonly failure: InstitutionalFailureFactors;
  /** Composite 0..1, always derived from `factors`/`failure` — never assigned directly. */
  readonly stabilityScore: number;
  readonly updatedAtTick: number;
}

// ---------------------------------------------------------------------------
// 35. Political history (append-only)
// ---------------------------------------------------------------------------

export type PoliticalHistoryEventType =
  | "rule_created"
  | "custom_became_law"
  | "law_created"
  | "leader_selected"
  | "leader_removed"
  | "council_formed"
  | "election_held"
  | "succession_resolved"
  | "property_right_established"
  | "tax_changed"
  | "public_resource_established"
  | "justice_case_resolved"
  | "dispute_resolved"
  | "faction_formed"
  | "political_conflict_started"
  | "political_conflict_resolved"
  | "diplomatic_stance_changed"
  | "treaty_signed"
  | "treaty_violated"
  | "treaty_terminated"
  | "territory_changed"
  | "institution_created"
  | "state_founded"
  | "state_split"
  | "state_dissolved"
  | "war_declared"
  | "rebellion"
  | "revolution";

export interface PoliticalHistoryEvent {
  readonly eventId: string;
  readonly type: PoliticalHistoryEventType;
  readonly tick: number;
  readonly scope: string;
  readonly summary: string;
  readonly refs: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Top-level module state (attaches at WorldState.modules.politics)
// ---------------------------------------------------------------------------

export interface PoliticsModuleState {
  readonly contractVersion: string;
  readonly rules: Readonly<Record<string, SocialRule>>;
  readonly customTrackers: Readonly<Record<string, CustomTracker>>;
  readonly authorities: Readonly<Record<string, AuthorityProfile>>;
  readonly legitimacies: Readonly<Record<string, LegitimacyProfile>>;
  readonly governanceSystems: Readonly<Record<string, GovernanceSystem>>;
  readonly elections: Readonly<Record<string, Election>>;
  readonly councils: Readonly<Record<string, Council>>;
  readonly successions: Readonly<Record<string, SuccessionEvent>>;
  readonly propertyRights: Readonly<Record<string, PropertyRight>>;
  readonly landClaims: Readonly<Record<string, LandClaim>>;
  readonly taxPolicies: Readonly<Record<string, TaxPolicy>>;
  readonly publicResources: Readonly<Record<string, PublicResource>>;
  readonly disputes: Readonly<Record<string, Dispute>>;
  readonly justiceCases: Readonly<Record<string, JusticeCase>>;
  readonly rights: Readonly<Record<string, Right>>;
  readonly obligations: Readonly<Record<string, Obligation>>;
  readonly factions: Readonly<Record<string, PoliticalFaction>>;
  readonly conflicts: Readonly<Record<string, PoliticalConflict>>;
  readonly diplomaticRelations: Readonly<Record<string, DiplomaticRelation>>;
  readonly treaties: Readonly<Record<string, Treaty>>;
  readonly territories: Readonly<Record<string, Territory>>;
  readonly polities: Readonly<Record<string, PoliticalEntity>>;
  readonly stability: Readonly<Record<string, StabilityProfile>>;
  readonly history: readonly PoliticalHistoryEvent[];
  /** Deterministic monotonically-increasing counters used to mint ids without a random UUID draw. */
  readonly idCounters: Readonly<Record<string, number>>;
}

export function createEmptyPoliticsState(): PoliticsModuleState {
  return {
    contractVersion: POLITICS_CONTRACT_VERSION,
    rules: {},
    customTrackers: {},
    authorities: {},
    legitimacies: {},
    governanceSystems: {},
    elections: {},
    councils: {},
    successions: {},
    propertyRights: {},
    landClaims: {},
    taxPolicies: {},
    publicResources: {},
    disputes: {},
    justiceCases: {},
    rights: {},
    obligations: {},
    factions: {},
    conflicts: {},
    diplomaticRelations: {},
    treaties: {},
    territories: {},
    polities: {},
    stability: {},
    history: [],
    idCounters: {},
  };
}

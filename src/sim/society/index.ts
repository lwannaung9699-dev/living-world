/**
 * LIVING WORLD — Team 07 (Society & Civilization Emergence) public API.
 *
 * Consumers outside src/sim/society should import from here rather than
 * reaching into individual files, so internal layout can evolve freely.
 */

export type {
  SocialGroup,
  InteractionEvent,
  SettlementType,
  Settlement,
  SocialRole,
  SocialNorm,
  SanctionKind,
  SanctionRecord,
  CulturalTrait,
  CollectiveMemoryEvent,
  Story,
  SymbolMeaning,
  CulturalSymbol,
  LanguageConcept,
  Technology,
  TradeRecord,
  MigrationRecord,
  InstitutionKind,
  Institution,
  CivilizationMetrics,
} from "./types";
export { SOCIAL_ROLES } from "./types";
export type { Relationship as SocietyRelationship, InteractionKind as SocietyInteractionKind } from "./types";
export * from "./contracts";
export type { SocietyState } from "./state";
export { createInitialSocietyState, readSocietyState, writeSocietyState, SOCIETY_MODULE_KEY, SOCIETY_CONTRACT_VERSION } from "./state";
export type { SocietyTickOptions } from "./tick";
export { societyTick, createSocietyTick } from "./tick";

export { pairKey, getRelationship, generateInteractionEvents, applyInteractionEvents } from "./relationships";
export { syncKinship } from "./kinship";
export {
  createGroup,
  joinGroup,
  leaveGroup,
  splitGroup,
  mergeGroups,
  destroyGroup,
  formGroupsFromTrustClusters,
  evaluateGroupSplits,
  evaluateGroupMerges,
} from "./groups";
export { applyCooperation } from "./cooperation";
export { applyConflict, applyReconciliation } from "./conflict";
export { updateLeadership } from "./leadership";
export { updateRoles } from "./roles";
export { updateSettlements, updateTerritory } from "./settlement";
export { classifySharingMode, settleResourcePool, evaluateTrade } from "./economy";
export { updateNormFormation, recordSanction, deriveConflictSanctions, activeNormsFor } from "./norms";
export {
  recordCollectiveMemory,
  transmitCulture,
  updateStoriesAndMyths,
  developSymbols,
  developLanguageConcepts,
} from "./culture";
export { applyInnovation, applyTechnologyDiffusion } from "./technology";
export { evaluateMigration } from "./migration";
export { updateInstitutions, isStableInstitution, hostilityPosture } from "./institutions";
export { computeCivilizationMetrics } from "./civilization";

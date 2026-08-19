import { PerceivableEntity } from "../perception/perception";
import { Relationship } from "../relationships/relationship";

/** Social classification of a perceived individual (Team 06 §16). Individual-level only — no society/culture. */
export type SocialClassification =
  | "sameSpecies"
  | "differentSpecies"
  | "friend"
  | "family"
  | "mate"
  | "rival"
  | "threat"
  | "unknown";

export interface ClassifiedSocialEntity {
  readonly entity: PerceivableEntity;
  readonly classification: SocialClassification;
  readonly relationship: Relationship | null;
}

const FRIEND_TRUST_THRESHOLD = 0.65;
const RIVAL_HOSTILITY_THRESHOLD = 0.5;
const THREAT_FEAR_THRESHOLD = 0.6;
const FAMILY_TIE_THRESHOLD = 0.8; // familiarity+affection combined signal used as a stand-in for kinship recognition

/**
 * Classifies a perceived individual relative to the observer's own species
 * and any known relationship (§16-17). Does not create or mutate the
 * relationship — that is the caller's responsibility once an interaction
 * actually occurs.
 */
export function classifySocialEntity(
  entity: PerceivableEntity,
  observerSpeciesId: string,
  relationship: Relationship | null,
): ClassifiedSocialEntity {
  if (relationship) {
    if (relationship.fear >= THREAT_FEAR_THRESHOLD) {
      return { entity, classification: "threat", relationship };
    }
    if (relationship.hostility >= RIVAL_HOSTILITY_THRESHOLD) {
      return { entity, classification: "rival", relationship };
    }
    if (relationship.affection >= FAMILY_TIE_THRESHOLD && relationship.familiarity >= FAMILY_TIE_THRESHOLD) {
      return { entity, classification: "family", relationship };
    }
    if (relationship.trust >= FRIEND_TRUST_THRESHOLD) {
      return { entity, classification: "friend", relationship };
    }
  }

  if (!entity.speciesId) {
    return { entity, classification: "unknown", relationship };
  }
  return {
    entity,
    classification: entity.speciesId === observerSpeciesId ? "sameSpecies" : "differentSpecies",
    relationship,
  };
}

export function classifySocialEntities(
  entities: readonly PerceivableEntity[],
  observerSpeciesId: string,
  relationships: Readonly<Record<string, Relationship>>,
): ClassifiedSocialEntity[] {
  return entities.map((entity) => classifySocialEntity(entity, observerSpeciesId, relationships[entity.id] ?? null));
}

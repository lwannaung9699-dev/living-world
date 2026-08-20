import { InvalidStateError } from "../core/errors";

/**
 * The generic catalog of ecological interaction types Team 05 supports as
 * a framework. Not every type has a dedicated subsystem yet (mutualism,
 * commensalism, and parasitism are represented structurally here so they
 * can appear in a FoodWeb / drive interaction-strength math, and so future
 * teams can build dedicated behavior on top, without Team 05 needing to
 * implement every biological behavior itself).
 */
export type InteractionType =
  | "predation"
  | "herbivory"
  | "competition"
  | "mutualism"
  | "commensalism"
  | "parasitism"
  | "resource_consumption"
  | "scavenging";

/**
 * EcologicalInteraction — a directed relationship between two ecosystem
 * participants (a population or a resource), identified generically by id.
 * `sourceId` is the actor (consumer/predator/host-user), `targetId` is the
 * acted-upon (prey/resource/host).
 */
export interface EcologicalInteraction {
  readonly interactionId: string;
  readonly type: InteractionType;
  readonly sourceId: string;
  readonly targetId: string;
  /** 0..1 strength/intensity of the interaction (e.g. predation efficiency, mutualism benefit). */
  readonly strength: number;
  /** Optional named numeric conditions gating or modulating the interaction (e.g. minimum season warmth). */
  readonly conditions?: Readonly<Record<string, number>>;
}

const INTERACTION_TYPES: readonly InteractionType[] = [
  "predation",
  "herbivory",
  "competition",
  "mutualism",
  "commensalism",
  "parasitism",
  "resource_consumption",
  "scavenging",
];

export function validateInteraction(value: unknown): asserts value is EcologicalInteraction {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("EcologicalInteraction must be an object");
  }
  const interaction = value as Partial<EcologicalInteraction>;
  if (typeof interaction.interactionId !== "string" || interaction.interactionId.length === 0) {
    throw new InvalidStateError("EcologicalInteraction.interactionId must be a non-empty string");
  }
  if (!interaction.type || !INTERACTION_TYPES.includes(interaction.type)) {
    throw new InvalidStateError(`EcologicalInteraction.type must be one of ${INTERACTION_TYPES.join(", ")}`);
  }
  if (typeof interaction.sourceId !== "string" || interaction.sourceId.length === 0) {
    throw new InvalidStateError("EcologicalInteraction.sourceId must be a non-empty string");
  }
  if (typeof interaction.targetId !== "string" || interaction.targetId.length === 0) {
    throw new InvalidStateError("EcologicalInteraction.targetId must be a non-empty string");
  }
  if (typeof interaction.strength !== "number" || interaction.strength < 0 || interaction.strength > 1) {
    throw new InvalidStateError("EcologicalInteraction.strength must be within [0, 1]");
  }
}

/** True for interaction types that remove biomass/individuals from the target (consume it). */
export function isConsumptiveInteraction(type: InteractionType): boolean {
  return type === "predation" || type === "herbivory" || type === "resource_consumption" || type === "scavenging";
}

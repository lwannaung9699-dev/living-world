import { InvalidStateError } from "../../core/errors";
import { BiologicalEnvironment } from "../environment/biologicalEnvironment";

/**
 * A generic, extensible trait definition. Trait identity is a plain string
 * id — the engine does not hardcode a fixed list of traits; species content
 * (see species/speciesConfig.ts) decides which traits exist for it and how
 * genes map onto them.
 */
export interface TraitDefinition {
  readonly traitId: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly unit?: string;
  /**
   * Optional mapping from BiologicalEnvironment fields to a weight,
   * expressing how strongly each environmental factor shifts this trait's
   * expressed value. A field absent here is simply not considered for this
   * trait. Weights may be positive or negative.
   */
  readonly environmentalFactors?: Readonly<Partial<Record<keyof BiologicalEnvironment, number>>>;
}

export interface TraitGene {
  readonly geneId: string;
  /** Contribution weight of this gene's expressed value toward the trait's raw value. */
  readonly weight: number;
}

export interface TraitValue {
  readonly traitId: string;
  /** Value before environmental adjustment. */
  readonly rawValue: number;
  /** Final value after environmental adjustment, clamped to [min, max]. */
  readonly value: number;
}

export function validateTraitDefinition(value: unknown): asserts value is TraitDefinition {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("TraitDefinition must be an object");
  }
  const def = value as Partial<TraitDefinition>;
  if (typeof def.traitId !== "string" || def.traitId.length === 0) {
    throw new InvalidStateError("TraitDefinition.traitId must be a non-empty string");
  }
  if (typeof def.min !== "number" || typeof def.max !== "number" || def.min >= def.max) {
    throw new InvalidStateError(`TraitDefinition "${def.traitId}" must have min < max`);
  }
}

/**
 * Example built-in trait definitions (per the design brief: body size,
 * speed, vision, etc). These are illustrative content, not an exhaustive or
 * exclusive list — any TraitDefinition can be authored and used the same
 * way, so future species/content teams can introduce entirely new traits
 * without touching the phenotype engine.
 */
export const EXAMPLE_TRAIT_DEFINITIONS: readonly TraitDefinition[] = [
  { traitId: "bodySize", label: "Body Size", min: 0, max: 10, environmentalFactors: { foodAvailability: 0.5 } },
  { traitId: "bodyMass", label: "Body Mass", min: 0, max: 500, unit: "kg" },
  { traitId: "speed", label: "Speed", min: 0, max: 10 },
  { traitId: "strength", label: "Strength", min: 0, max: 10 },
  { traitId: "vision", label: "Vision", min: 0, max: 10, environmentalFactors: { lightLevel: 0.3 } },
  { traitId: "hearing", label: "Hearing", min: 0, max: 10 },
  {
    traitId: "temperatureTolerance",
    label: "Temperature Tolerance",
    min: -1,
    max: 1,
    environmentalFactors: { temperature: 0.4 },
  },
  { traitId: "waterTolerance", label: "Water Tolerance", min: -1, max: 1, environmentalFactors: { waterAvailability: 0.4 } },
  {
    traitId: "diseaseResistance",
    label: "Disease Resistance",
    min: 0,
    max: 1,
    environmentalFactors: { diseasePressure: -0.3 },
  },
  { traitId: "metabolism", label: "Metabolism", min: 0, max: 10 },
  { traitId: "lifespan", label: "Lifespan", min: 1, max: 20000, unit: "ticks" },
  { traitId: "fertility", label: "Fertility", min: 0, max: 1 },
  { traitId: "growthRate", label: "Growth Rate", min: 0, max: 1 },
  { traitId: "camouflage", label: "Camouflage", min: 0, max: 1, environmentalFactors: { predationPressure: 0.2 } },
  { traitId: "sensoryRange", label: "Sensory Range", min: 0, max: 10 },
] as const;

/** Simple lookup registry so species content can find/extend built-in trait definitions by id. */
export class TraitRegistry {
  private readonly definitions = new Map<string, TraitDefinition>();

  constructor(initial: readonly TraitDefinition[] = EXAMPLE_TRAIT_DEFINITIONS) {
    for (const def of initial) this.register(def);
  }

  register(definition: TraitDefinition): void {
    validateTraitDefinition(definition);
    this.definitions.set(definition.traitId, definition);
  }

  get(traitId: string): TraitDefinition | undefined {
    return this.definitions.get(traitId);
  }

  require(traitId: string): TraitDefinition {
    const def = this.definitions.get(traitId);
    if (!def) throw new InvalidStateError(`Unknown traitId "${traitId}" — register it before use`);
    return def;
  }

  list(): readonly TraitDefinition[] {
    return [...this.definitions.values()];
  }
}

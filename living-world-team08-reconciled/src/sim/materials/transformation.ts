import { InvalidStateError } from "../core/errors";

/**
 * MaterialTransformation — one edge of the material transformation graph
 * (Tree -> Wood -> Plank -> Beam -> House Component, Ore -> Metal,
 * Clay -> Brick, Sand -> Glass, Stone -> Cut Stone, Wood -> Charcoal,
 * Plant Fiber -> Rope, ...).
 *
 * The engine below (`applyTransformation`) is completely generic: it knows
 * nothing about "wood" or "brick" specifically. Every individual recipe is
 * DATA (see `materialCatalogTransformations.ts` for illustrative examples),
 * never a hardcoded branch in this file.
 */
export interface MaterialQuantity {
  readonly materialId: string;
  /** Positive quantity in the material's natural unit (kept abstract/engine-agnostic — e.g. "units", not necessarily kg or m^3). */
  readonly quantity: number;
}

export interface TransformationConditions {
  readonly minTemperatureC?: number;
  readonly maxTemperatureC?: number;
  readonly requiresWater?: boolean;
  readonly requiresFire?: boolean;
}

export interface MaterialTransformation {
  readonly id: string;
  readonly name: string;
  readonly inputs: readonly MaterialQuantity[];
  readonly requiredTools: readonly string[];
  readonly requiredTechnology: readonly string[];
  readonly conditions: TransformationConditions;
  readonly outputs: readonly MaterialQuantity[];
  readonly byproducts: readonly MaterialQuantity[];
  /** Abstract energy/resource cost of performing the transformation once. */
  readonly energyCost: number;
  /** Simulated time (seconds) the transformation takes to complete. */
  readonly timeSeconds: number;
}

export interface TransformationContext {
  readonly availableTools: readonly string[];
  readonly availableTechnology: readonly string[];
  readonly temperatureC: number;
  readonly waterAvailable: boolean;
  readonly fireAvailable: boolean;
  /** materialId -> quantity currently on hand. */
  readonly inventory: Readonly<Record<string, number>>;
}

export type TransformationFailureReason =
  | "missing_input"
  | "insufficient_quantity"
  | "missing_tool"
  | "missing_technology"
  | "temperature_too_low"
  | "temperature_too_high"
  | "water_required"
  | "fire_required";

export interface TransformationResult {
  readonly success: boolean;
  readonly transformationId: string;
  readonly consumed: readonly MaterialQuantity[];
  readonly produced: readonly MaterialQuantity[];
  readonly byproducts: readonly MaterialQuantity[];
  readonly failureReason?: TransformationFailureReason;
  readonly failureDetail?: string;
}

export function validateMaterialTransformation(value: unknown): asserts value is MaterialTransformation {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("MaterialTransformation must be an object");
  }
  const t = value as Partial<MaterialTransformation>;
  if (typeof t.id !== "string" || t.id.length === 0) {
    throw new InvalidStateError("MaterialTransformation.id must be a non-empty string");
  }
  if (typeof t.name !== "string" || t.name.length === 0) {
    throw new InvalidStateError("MaterialTransformation.name must be a non-empty string");
  }
  if (!Array.isArray(t.inputs) || t.inputs.length === 0) {
    throw new InvalidStateError("MaterialTransformation.inputs must be a non-empty array");
  }
  if (!Array.isArray(t.outputs) || t.outputs.length === 0) {
    throw new InvalidStateError("MaterialTransformation.outputs must be a non-empty array");
  }
  for (const q of [...t.inputs, ...t.outputs, ...(t.byproducts ?? [])]) {
    validateMaterialQuantity(q);
  }
  if (!Array.isArray(t.requiredTools)) throw new InvalidStateError("MaterialTransformation.requiredTools must be an array");
  if (!Array.isArray(t.requiredTechnology)) {
    throw new InvalidStateError("MaterialTransformation.requiredTechnology must be an array");
  }
  if (typeof t.conditions !== "object" || t.conditions === null) {
    throw new InvalidStateError("MaterialTransformation.conditions must be an object");
  }
  if (!(typeof t.energyCost === "number" && Number.isFinite(t.energyCost) && t.energyCost >= 0)) {
    throw new InvalidStateError("MaterialTransformation.energyCost must be a non-negative finite number");
  }
  if (!(typeof t.timeSeconds === "number" && Number.isFinite(t.timeSeconds) && t.timeSeconds >= 0)) {
    throw new InvalidStateError("MaterialTransformation.timeSeconds must be a non-negative finite number");
  }
}

function validateMaterialQuantity(value: unknown): asserts value is MaterialQuantity {
  if (typeof value !== "object" || value === null) throw new InvalidStateError("MaterialQuantity must be an object");
  const q = value as Partial<MaterialQuantity>;
  if (typeof q.materialId !== "string" || q.materialId.length === 0) {
    throw new InvalidStateError("MaterialQuantity.materialId must be a non-empty string");
  }
  if (!(typeof q.quantity === "number" && Number.isFinite(q.quantity) && q.quantity > 0)) {
    throw new InvalidStateError(`MaterialQuantity.quantity must be a positive finite number, got ${String(q.quantity)}`);
  }
}

/**
 * Deterministically evaluates and (if all preconditions hold) applies a
 * single MaterialTransformation against a TransformationContext.
 *
 * Pure function: same transformation + same context always yields the same
 * TransformationResult. Never mutates `context.inventory` — callers apply
 * `consumed`/`produced`/`byproducts` themselves.
 */
export function applyTransformation(
  transformation: MaterialTransformation,
  context: TransformationContext,
): TransformationResult {
  validateMaterialTransformation(transformation);

  const fail = (reason: TransformationFailureReason, detail: string): TransformationResult => ({
    success: false,
    transformationId: transformation.id,
    consumed: [],
    produced: [],
    byproducts: [],
    failureReason: reason,
    failureDetail: detail,
  });

  for (const tool of transformation.requiredTools) {
    if (!context.availableTools.includes(tool)) {
      return fail("missing_tool", `Required tool not available: "${tool}"`);
    }
  }
  for (const tech of transformation.requiredTechnology) {
    if (!context.availableTechnology.includes(tech)) {
      return fail("missing_technology", `Required technology not available: "${tech}"`);
    }
  }

  const { minTemperatureC, maxTemperatureC, requiresWater, requiresFire } = transformation.conditions;
  if (typeof minTemperatureC === "number" && context.temperatureC < minTemperatureC) {
    return fail("temperature_too_low", `Requires >= ${minTemperatureC}C, got ${context.temperatureC}C`);
  }
  if (typeof maxTemperatureC === "number" && context.temperatureC > maxTemperatureC) {
    return fail("temperature_too_high", `Requires <= ${maxTemperatureC}C, got ${context.temperatureC}C`);
  }
  if (requiresWater && !context.waterAvailable) {
    return fail("water_required", "Transformation requires water to be available");
  }
  if (requiresFire && !context.fireAvailable) {
    return fail("fire_required", "Transformation requires fire to be available");
  }

  for (const input of transformation.inputs) {
    const have = context.inventory[input.materialId];
    if (have === undefined) {
      return fail("missing_input", `Missing required input material: "${input.materialId}"`);
    }
    if (have < input.quantity) {
      return fail(
        "insufficient_quantity",
        `Insufficient "${input.materialId}": have ${have}, need ${input.quantity}`,
      );
    }
  }

  return {
    success: true,
    transformationId: transformation.id,
    consumed: transformation.inputs,
    produced: transformation.outputs,
    byproducts: transformation.byproducts,
  };
}

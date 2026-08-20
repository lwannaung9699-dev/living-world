import { MaterialRegistry } from "../materials/materialRegistry";
import { InvalidStateError } from "../core/errors";
import { ObjectData } from "./objectData";

export interface ResourceYield {
  readonly materialId: string;
  readonly quantity: number;
}

export interface ResourceExtractionContext {
  /** e.g. "axe", "pickaxe", "bare_hands". Affects `efficiency` defaulting only — no per-tool branching lives here. */
  readonly tool?: string;
  /** e.g. "chop", "mine", "harvest", "butcher". Descriptive only; extraction math is generic. */
  readonly action: string;
  /** Fraction of the theoretical material content actually recovered, in [0, 1]. Defaults to 0.6 (hand tools lose material to waste/inefficiency). */
  readonly efficiency?: number;
}

export function validateResourceExtractionContext(value: unknown): asserts value is ResourceExtractionContext {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("ResourceExtractionContext must be an object");
  }
  const c = value as Partial<ResourceExtractionContext>;
  if (typeof c.action !== "string" || c.action.length === 0) {
    throw new InvalidStateError("ResourceExtractionContext.action must be a non-empty string");
  }
  if (c.efficiency !== undefined && !(typeof c.efficiency === "number" && c.efficiency >= 0 && c.efficiency <= 1)) {
    throw new InvalidStateError(`ResourceExtractionContext.efficiency must be in [0,1], got ${String(c.efficiency)}`);
  }
}

const DEFAULT_EFFICIENCY = 0.6;

/**
 * Generic resource extraction: Tree -> wood, Rock -> stone, Ore deposit ->
 * ore, ... Works purely from ObjectData's own parts/materials/durability —
 * this function has no idea what a "tree" or "rock" *means*, only how to
 * turn volume + material + remaining integrity + extraction efficiency
 * into a deterministic yield. Quantities are expressed in the same
 * abstract "units" MaterialTransformation inputs/outputs use (1 unit per
 * m^3 of recovered material), so extracted output can feed straight into
 * `applyTransformation`.
 *
 * Pure/deterministic: identical (object, materials, context) always
 * produces an identical yield list, sorted by materialId.
 */
export function extractResources(
  object: ObjectData,
  materials: MaterialRegistry,
  context: ResourceExtractionContext,
): readonly ResourceYield[] {
  validateResourceExtractionContext(context);
  const efficiency = context.efficiency ?? DEFAULT_EFFICIENCY;

  const totals = new Map<string, number>();
  for (const part of object.parts) {
    const partIntegrityFraction = part.durability.integrity / part.durability.maxIntegrity;
    for (const assignment of part.materials) {
      materials.get(assignment.materialId); // throws on unknown material id
      const recovered = part.volume * assignment.proportion * partIntegrityFraction * efficiency;
      if (recovered <= 0) continue;
      totals.set(assignment.materialId, (totals.get(assignment.materialId) ?? 0) + recovered);
    }
  }

  return [...totals.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([materialId, quantity]) => ({ materialId, quantity: roundToPrecision(quantity, 6) }));
}

function roundToPrecision(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

import { InvalidStateError } from "../core/errors";

/**
 * MaterialData — Team 03 (Physics/Materials).
 *
 * Deterministic, data-driven description of a single material. Every
 * gameplay/simulation-relevant property a future transformation, damage,
 * decay, or structural calculation might need lives here as plain,
 * JSON-serializable numbers/strings — never as engine-specific colors,
 * shaders, or mesh data (see `colorDescriptor`, which is a semantic
 * descriptor for a future renderer to interpret, not a color value).
 */
export const MATERIAL_DATA_CONTRACT_VERSION = "1.0.0";

export const MATERIAL_CATEGORIES = [
  "soil",
  "sand",
  "stone",
  "wood",
  "metal",
  "water",
  "ice",
  "clay",
  "glass",
  "organic",
  "fabric",
  "composite",
] as const;

export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export const MATERIAL_STATES = ["solid", "liquid", "gas", "powder"] as const;
export type MaterialState = (typeof MATERIAL_STATES)[number];

export interface MaterialTemperatureRange {
  /** Lower bound (Celsius) of the temperature band in which this material remains in `state`. */
  readonly minC: number;
  /** Upper bound (Celsius) of the temperature band in which this material remains in `state`. */
  readonly maxC: number;
}

/**
 * All "intensity" properties are normalized to the unit interval [0, 1] so
 * that transformation/damage/decay/structural math never needs to know a
 * material's absolute units — only its relative behavior.
 */
export interface MaterialData {
  readonly contractVersion: string;
  readonly id: string;
  readonly name: string;
  readonly category: MaterialCategory;
  /** kg/m^3. Must be a positive finite number. */
  readonly density: number;
  readonly hardness: number;
  readonly strength: number;
  readonly toughness: number;
  readonly elasticity: number;
  readonly flammability: number;
  readonly thermalConductivity: number;
  readonly thermalCapacity: number;
  readonly waterResistance: number;
  readonly corrosionResistance: number;
  /** Baseline fractional integrity loss per simulated day under neutral environmental conditions. */
  readonly decayRate: number;
  readonly friction: number;
  /** Semantic color/appearance descriptor for a future renderer (e.g. "warm brown", "weathered grey"). Never a hex/RGB value. */
  readonly colorDescriptor: string;
  readonly state: MaterialState;
  readonly temperatureRange: MaterialTemperatureRange;
}

export type MaterialDataInput = Omit<MaterialData, "contractVersion">;

const UNIT_INTERVAL_FIELDS = [
  "hardness",
  "strength",
  "toughness",
  "elasticity",
  "flammability",
  "thermalConductivity",
  "thermalCapacity",
  "waterResistance",
  "corrosionResistance",
  "decayRate",
  "friction",
] as const satisfies readonly (keyof MaterialData)[];

/** Builds a validated MaterialData record, stamping the current contract version. */
export function createMaterialData(input: MaterialDataInput): MaterialData {
  const material: MaterialData = { contractVersion: MATERIAL_DATA_CONTRACT_VERSION, ...input };
  validateMaterialData(material);
  return material;
}

export function validateMaterialData(value: unknown): asserts value is MaterialData {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("MaterialData must be an object");
  }
  const m = value as Partial<MaterialData>;

  if (typeof m.contractVersion !== "string" || m.contractVersion.length === 0) {
    throw new InvalidStateError("MaterialData.contractVersion must be a non-empty string");
  }
  if (typeof m.id !== "string" || m.id.length === 0) {
    throw new InvalidStateError("MaterialData.id must be a non-empty string");
  }
  if (typeof m.name !== "string" || m.name.length === 0) {
    throw new InvalidStateError("MaterialData.name must be a non-empty string");
  }
  if (!MATERIAL_CATEGORIES.includes(m.category as MaterialCategory)) {
    throw new InvalidStateError(`MaterialData.category invalid: ${String(m.category)}`);
  }
  if (!(typeof m.density === "number" && Number.isFinite(m.density) && m.density > 0)) {
    throw new InvalidStateError(`MaterialData.density must be a positive finite number, got ${String(m.density)}`);
  }
  for (const field of UNIT_INTERVAL_FIELDS) {
    const v = m[field];
    if (!(typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1)) {
      throw new InvalidStateError(`MaterialData.${field} must be a number in [0,1], got ${String(v)}`);
    }
  }
  if (typeof m.colorDescriptor !== "string" || m.colorDescriptor.length === 0) {
    throw new InvalidStateError("MaterialData.colorDescriptor must be a non-empty string");
  }
  if (!MATERIAL_STATES.includes(m.state as MaterialState)) {
    throw new InvalidStateError(`MaterialData.state invalid: ${String(m.state)}`);
  }
  const range = m.temperatureRange;
  if (
    typeof range !== "object" ||
    range === null ||
    typeof range.minC !== "number" ||
    !Number.isFinite(range.minC) ||
    typeof range.maxC !== "number" ||
    !Number.isFinite(range.maxC) ||
    range.minC > range.maxC
  ) {
    throw new InvalidStateError("MaterialData.temperatureRange must be {minC, maxC} with minC <= maxC");
  }
}

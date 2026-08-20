import { InvalidStateError } from "../core/errors";
import { MaterialTransformation, validateMaterialTransformation } from "./transformation";

/** Deterministic id -> MaterialTransformation lookup table, mirroring MaterialRegistry's shape. */
export class TransformationRegistry {
  private readonly byId = new Map<string, MaterialTransformation>();

  static create(transformations: readonly MaterialTransformation[] = []): TransformationRegistry {
    const registry = new TransformationRegistry();
    for (const t of transformations) registry.register(t);
    return registry;
  }

  static fromState(state: Readonly<Record<string, MaterialTransformation>>): TransformationRegistry {
    const registry = new TransformationRegistry();
    for (const [id, t] of Object.entries(state ?? {})) {
      validateMaterialTransformation(t);
      if (t.id !== id) {
        throw new InvalidStateError(`TransformationRegistryState key "${id}" does not match MaterialTransformation.id "${t.id}"`);
      }
      registry.byId.set(id, t);
    }
    return registry;
  }

  register(transformation: MaterialTransformation): MaterialTransformation {
    validateMaterialTransformation(transformation);
    this.byId.set(transformation.id, transformation);
    return transformation;
  }

  get(id: string): MaterialTransformation {
    const t = this.byId.get(id);
    if (!t) throw new InvalidStateError(`Unknown transformation id: "${id}"`);
    return t;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** All transformations that consume the given material as an input, sorted by id. */
  findByInput(materialId: string): MaterialTransformation[] {
    return this.list().filter((t) => t.inputs.some((i) => i.materialId === materialId));
  }

  list(): MaterialTransformation[] {
    return [...this.byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  serialize(): Readonly<Record<string, MaterialTransformation>> {
    const out: Record<string, MaterialTransformation> = {};
    for (const t of this.list()) out[t.id] = t;
    return out;
  }
}

/**
 * DEFAULT_TRANSFORMATIONS — illustrative recipes matching the architecture
 * doc's examples (Wood -> Plank, Ore -> Metal, Clay -> Brick, Sand -> Glass,
 * Stone -> Cut Stone, Wood -> Charcoal, Plant Fiber -> Rope). Pure data;
 * `applyTransformation()` in transformation.ts never references any of
 * these ids directly.
 */
export const DEFAULT_TRANSFORMATIONS: readonly MaterialTransformation[] = [
  {
    id: "wood_to_plank",
    name: "Saw wood into planks",
    inputs: [{ materialId: "oak_wood", quantity: 1 }],
    requiredTools: ["saw"],
    requiredTechnology: [],
    conditions: {},
    outputs: [{ materialId: "plank", quantity: 4 }],
    byproducts: [],
    energyCost: 2,
    timeSeconds: 120,
  },
  {
    id: "wood_to_charcoal",
    name: "Char wood into charcoal",
    inputs: [{ materialId: "oak_wood", quantity: 1 }],
    requiredTools: [],
    requiredTechnology: [],
    conditions: { requiresFire: true, minTemperatureC: 300 },
    outputs: [{ materialId: "charcoal", quantity: 1 }],
    byproducts: [],
    energyCost: 5,
    timeSeconds: 3600,
  },
  {
    id: "ore_to_metal",
    name: "Smelt iron ore into iron",
    inputs: [
      { materialId: "iron_ore", quantity: 2 },
      { materialId: "charcoal", quantity: 1 },
    ],
    requiredTools: ["furnace"],
    requiredTechnology: ["smelting"],
    conditions: { requiresFire: true, minTemperatureC: 1200 },
    outputs: [{ materialId: "iron", quantity: 1 }],
    byproducts: [],
    energyCost: 10,
    timeSeconds: 1800,
  },
  {
    id: "clay_to_brick",
    name: "Fire clay into brick",
    inputs: [{ materialId: "clay", quantity: 1 }],
    requiredTools: ["kiln"],
    requiredTechnology: [],
    conditions: { requiresFire: true, minTemperatureC: 900 },
    outputs: [{ materialId: "brick", quantity: 1 }],
    byproducts: [],
    energyCost: 6,
    timeSeconds: 2400,
  },
  {
    id: "sand_to_glass",
    name: "Melt sand into glass",
    inputs: [{ materialId: "sand", quantity: 1 }],
    requiredTools: ["furnace"],
    requiredTechnology: ["glassworking"],
    conditions: { requiresFire: true, minTemperatureC: 1400 },
    outputs: [{ materialId: "glass", quantity: 1 }],
    byproducts: [],
    energyCost: 8,
    timeSeconds: 1200,
  },
  {
    id: "stone_to_cut_stone",
    name: "Cut raw stone into a building block",
    inputs: [{ materialId: "granite", quantity: 1 }],
    requiredTools: ["chisel"],
    requiredTechnology: [],
    conditions: {},
    outputs: [{ materialId: "cut_stone", quantity: 1 }],
    byproducts: [],
    energyCost: 4,
    timeSeconds: 900,
  },
  {
    id: "fiber_to_rope",
    name: "Twist plant fiber into rope",
    inputs: [{ materialId: "plant_fiber", quantity: 3 }],
    requiredTools: [],
    requiredTechnology: [],
    conditions: {},
    outputs: [{ materialId: "rope", quantity: 1 }],
    byproducts: [],
    energyCost: 1,
    timeSeconds: 300,
  },
];

export function createDefaultTransformationRegistry(): TransformationRegistry {
  return TransformationRegistry.create(DEFAULT_TRANSFORMATIONS);
}

import { MaterialData, MaterialDataInput, createMaterialData, validateMaterialData } from "./materialData";
import { InvalidStateError } from "../core/errors";

/** Canonical (sorted-by-id) serializable snapshot of a MaterialRegistry. */
export type MaterialRegistryState = Readonly<Record<string, MaterialData>>;

/**
 * MaterialRegistry — deterministic id -> MaterialData lookup table.
 *
 * Registration order never affects lookup results (keyed purely by `id`),
 * and `list()`/`serialize()` always return entries sorted by id, so two
 * registries built from the same material set — regardless of the order
 * materials were registered in — are indistinguishable.
 */
export class MaterialRegistry {
  private readonly byId = new Map<string, MaterialData>();

  /** Creates a registry pre-populated with the given materials (order-independent). */
  static create(materials: readonly (MaterialDataInput | MaterialData)[] = []): MaterialRegistry {
    const registry = new MaterialRegistry();
    for (const material of materials) registry.register(material);
    return registry;
  }

  /** Restores a registry from a previously serialized state. */
  static fromState(state: MaterialRegistryState): MaterialRegistry {
    const registry = new MaterialRegistry();
    for (const [id, material] of Object.entries(state ?? {})) {
      validateMaterialData(material);
      if (material.id !== id) {
        throw new InvalidStateError(`MaterialRegistryState key "${id}" does not match MaterialData.id "${material.id}"`);
      }
      registry.byId.set(id, material);
    }
    return registry;
  }

  /** Registers (or overwrites) a material. Accepts either a raw input or an already-validated MaterialData. */
  register(material: MaterialDataInput | MaterialData): MaterialData {
    const record: MaterialData =
      "contractVersion" in material ? (validateMaterialData(material), material) : createMaterialData(material);
    this.byId.set(record.id, record);
    return record;
  }

  /** Looks up a material by id, throwing explicitly if it is not registered. */
  get(id: string): MaterialData {
    const material = this.byId.get(id);
    if (!material) throw new InvalidStateError(`Unknown material id: "${id}"`);
    return material;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** All registered materials, sorted by id for deterministic iteration. */
  list(): MaterialData[] {
    return [...this.byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  serialize(): MaterialRegistryState {
    const out: Record<string, MaterialData> = {};
    for (const material of this.list()) out[material.id] = material;
    return out;
  }
}

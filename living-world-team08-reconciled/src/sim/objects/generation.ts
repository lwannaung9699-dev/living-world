import { RngStreamRegistry } from "../core/rng/rngStreamRegistry";
import { MaterialRegistry } from "../materials/materialRegistry";
import { InvalidStateError } from "../core/errors";
import { createObjectData, IDENTITY_TRANSFORM, ObjectData, ObjectPart, Vector3 } from "./objectData";
import { buildStructuralProperties } from "./structural";
import { deriveObjectId } from "./objectComposition";

/**
 * Every descriptor carries its own `seedNamespace`. The generated object's
 * *id* is derived purely from that namespace via `deriveObjectId` (a
 * content hash — see objectComposition.ts), never from RNG draw order, so
 * two generators run in a different order (or a different number of times)
 * never change any individual object's id. Only the object's *attributes*
 * (height, branch count, dimensions, ...) come from the deterministic RNG
 * stream forked for this namespace.
 */
export interface TreeDescriptor {
  readonly seedNamespace: string;
  readonly trunkMaterialId: string;
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly minBranches: number;
  readonly maxBranches: number;
}

export interface RockDescriptor {
  readonly seedNamespace: string;
  readonly materialId: string;
  readonly minRadius: number;
  readonly maxRadius: number;
}

function makePart(
  id: string,
  name: string,
  materialId: string,
  volume: number,
  position: Vector3,
  maxIntegrity = 1,
): ObjectPart {
  return {
    id,
    name,
    materials: [{ materialId, proportion: 1 }],
    volume,
    transform: { ...IDENTITY_TRANSFORM, position },
    durability: { maxIntegrity, integrity: maxIntegrity },
  };
}

function sphereVolume(radius: number): number {
  return (4 / 3) * Math.PI * radius ** 3;
}

function cylinderVolume(radius: number, height: number): number {
  return Math.PI * radius ** 2 * height;
}

/**
 * Generates a deterministic tree object: a trunk part plus N branch parts,
 * material-assigned, with dimensions and branch count drawn from the RNG
 * stream forked for `descriptor.seedNamespace`. Resource yields (wood) are
 * derived separately by resourceExtraction.ts from the resulting ObjectData
 * — this function only builds the logical object.
 */
export function generateTree(
  descriptor: TreeDescriptor,
  rngRegistry: RngStreamRegistry,
  materials: MaterialRegistry,
): ObjectData {
  validateTreeDescriptor(descriptor);
  materials.get(descriptor.trunkMaterialId); // throws if unknown

  const rng = rngRegistry.fork(`objects/tree/${descriptor.seedNamespace}`);
  const rootId = deriveObjectId(null, descriptor.seedNamespace);

  const height = descriptor.minHeight + rng.nextFloat() * (descriptor.maxHeight - descriptor.minHeight);
  const trunkRadius = Math.max(0.05, height * 0.04);
  const branchCount = rng.nextInt(descriptor.minBranches, descriptor.maxBranches);

  const trunkId = deriveObjectId(rootId, "trunk");
  const trunk = makePart(
    trunkId,
    "Trunk",
    descriptor.trunkMaterialId,
    cylinderVolume(trunkRadius, height),
    { x: 0, y: height / 2, z: 0 },
  );

  const branches: ObjectPart[] = [];
  for (let i = 0; i < branchCount; i++) {
    const branchId = deriveObjectId(rootId, `branch-${i}`);
    const branchHeightFraction = 0.5 + rng.nextFloat() * 0.4;
    const branchLength = height * (0.15 + rng.nextFloat() * 0.2);
    const branchRadius = Math.max(0.02, trunkRadius * 0.3);
    const angle = rng.nextFloat() * Math.PI * 2;
    branches.push(
      makePart(
        branchId,
        `Branch ${i + 1}`,
        descriptor.trunkMaterialId,
        cylinderVolume(branchRadius, branchLength),
        {
          x: Math.cos(angle) * branchLength * 0.5,
          y: height * branchHeightFraction,
          z: Math.sin(angle) * branchLength * 0.5,
        },
      ),
    );
  }

  const parts = [trunk, ...branches];
  const supportPoints = [{ x: 0, y: 0, z: 0 }];
  const structural = buildStructuralProperties(parts, materials, supportPoints, 0.1);

  return createObjectData({
    id: rootId,
    category: "tree",
    name: `Tree (${descriptor.seedNamespace})`,
    parts,
    structural,
  });
}

/**
 * Generates a deterministic rock object: a single part whose size, mass,
 * and hardness/fracture behavior come entirely from the assigned
 * MaterialData plus a randomly (but deterministically) drawn radius.
 */
export function generateRock(
  descriptor: RockDescriptor,
  rngRegistry: RngStreamRegistry,
  materials: MaterialRegistry,
): ObjectData {
  validateRockDescriptor(descriptor);
  const material = materials.get(descriptor.materialId);

  const rng = rngRegistry.fork(`objects/rock/${descriptor.seedNamespace}`);
  const rootId = deriveObjectId(null, descriptor.seedNamespace);

  const radius = descriptor.minRadius + rng.nextFloat() * (descriptor.maxRadius - descriptor.minRadius);
  const bodyId = deriveObjectId(rootId, "body");
  const body = makePart(bodyId, "Rock Body", descriptor.materialId, sphereVolume(radius), { x: 0, y: radius, z: 0 });

  const parts = [body];
  const supportPoints = [{ x: 0, y: 0, z: 0 }];
  // Harder, tougher rock fractures at a lower relative integrity threshold (it holds together longer before failing).
  const fractureThreshold = Math.max(0.05, 0.3 - material.toughness * 0.2);
  const structural = buildStructuralProperties(parts, materials, supportPoints, fractureThreshold);

  return createObjectData({
    id: rootId,
    category: "rock",
    name: `Rock (${descriptor.seedNamespace})`,
    parts,
    structural,
  });
}

function validateTreeDescriptor(d: TreeDescriptor): void {
  if (typeof d.seedNamespace !== "string" || d.seedNamespace.length === 0) {
    throw new InvalidStateError("TreeDescriptor.seedNamespace must be a non-empty string");
  }
  if (!(d.minHeight > 0 && d.maxHeight >= d.minHeight)) {
    throw new InvalidStateError("TreeDescriptor requires 0 < minHeight <= maxHeight");
  }
  if (!(Number.isInteger(d.minBranches) && Number.isInteger(d.maxBranches) && d.minBranches >= 0 && d.maxBranches >= d.minBranches)) {
    throw new InvalidStateError("TreeDescriptor requires 0 <= minBranches <= maxBranches (integers)");
  }
}

function validateRockDescriptor(d: RockDescriptor): void {
  if (typeof d.seedNamespace !== "string" || d.seedNamespace.length === 0) {
    throw new InvalidStateError("RockDescriptor.seedNamespace must be a non-empty string");
  }
  if (!(d.minRadius > 0 && d.maxRadius >= d.minRadius)) {
    throw new InvalidStateError("RockDescriptor requires 0 < minRadius <= maxRadius");
  }
}

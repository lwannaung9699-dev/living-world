import { hash128Hex } from "../core/hash";
import { InvalidStateError } from "../core/errors";
import { ObjectData } from "./objectData";

/**
 * Deterministically derives an object id from its parent id and a stable
 * local key (e.g. "trunk", "wall-2", the descriptor's own seed namespace
 * for a root object). Uses a pure content hash — NOT the RNG stream — so
 * ids never depend on generation order, matching the "Object generation
 * must also be independent of execution order where practical" rule.
 */
export function deriveObjectId(parentId: string | null, localKey: string): string {
  if (typeof localKey !== "string" || localKey.length === 0) {
    throw new InvalidStateError("deriveObjectId requires a non-empty localKey");
  }
  return hash128Hex(`object::${parentId ?? "root"}::${localKey}`).slice(0, 16);
}

/**
 * Attaches `child` under `parent`, returning updated immutable copies of
 * both. `childIds` is kept sorted so that composition order never affects
 * the resulting ObjectData's canonical shape (important for hashing/replay).
 */
export function attachChild(parent: ObjectData, child: ObjectData): { parent: ObjectData; child: ObjectData } {
  if (child.parentId !== null && child.parentId !== parent.id) {
    throw new InvalidStateError(
      `Cannot attach child "${child.id}": it already belongs to parent "${child.parentId}"`,
    );
  }
  const updatedChild: ObjectData = { ...child, parentId: parent.id };
  const childIds = [...new Set([...parent.childIds, child.id])].sort();
  const updatedParent: ObjectData = { ...parent, childIds };
  return { parent: updatedParent, child: updatedChild };
}

/** Detaches a child id from a parent, returning the updated parent. Idempotent. */
export function detachChild(parent: ObjectData, childId: string): ObjectData {
  return { ...parent, childIds: parent.childIds.filter((id) => id !== childId) };
}

/**
 * Walks a flat id -> ObjectData map and returns every descendant of
 * `rootId` (not including the root itself), in deterministic (sorted id)
 * breadth-first order. Throws if a referenced child id is missing from the
 * map, rather than silently skipping it.
 */
export function getDescendants(objects: ReadonlyMap<string, ObjectData>, rootId: string): ObjectData[] {
  const root = objects.get(rootId);
  if (!root) throw new InvalidStateError(`getDescendants: unknown root object id "${rootId}"`);

  const result: ObjectData[] = [];
  const queue: string[] = [...root.childIds].sort();
  const visited = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const object = objects.get(id);
    if (!object) throw new InvalidStateError(`getDescendants: object "${rootId}" references missing child "${id}"`);
    result.push(object);
    queue.push(...[...object.childIds].sort());
  }
  return result;
}

/** True if `candidateAncestorId` is `objectId` itself or any ancestor of it. */
export function isDescendantOf(
  objects: ReadonlyMap<string, ObjectData>,
  objectId: string,
  candidateAncestorId: string,
): boolean {
  let current = objects.get(objectId);
  while (current) {
    if (current.id === candidateAncestorId) return true;
    current = current.parentId ? objects.get(current.parentId) : undefined;
  }
  return false;
}

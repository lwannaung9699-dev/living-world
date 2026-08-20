import { InvalidStateError } from "../../core/errors";

/** Broad memory categories. Data-driven — new subject types can be added without touching this union's consumers. */
export type MemoryType =
  | "entity"
  | "location"
  | "event"
  | "danger"
  | "foodSource"
  | "socialInteraction"
  | (string & {});

export interface MemoryPosition {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
}

/**
 * MemoryEntry — a single persistent memory record (Team 06 §13).
 *
 * `importance` and `emotionalWeight` are both in [0, 1] and jointly
 * determine how slowly a memory decays and how strongly it influences
 * future utility scoring (learning, §14). `confidence` in [0, 1] represents
 * how reliable the creature considers the memory (e.g. a single sighting
 * vs. many repeated confirmations).
 */
export interface MemoryEntry {
  readonly memoryId: string;
  readonly type: MemoryType;
  readonly subject: string; // e.g. a creatureId, resourceId, or free-form label
  readonly location: MemoryPosition | null;
  readonly importance: number; // [0, 1]
  readonly emotionalWeight: number; // [-1, 1] — negative = bad memory, positive = good memory
  readonly confidence: number; // [0, 1]
  readonly createdAt: number; // world tick
  readonly lastRecalled: number; // world tick
  readonly decayRate: number; // fraction of importance lost per tick, before importance floor
}

const MIN_RETAINED_IMPORTANCE = 0.02;

export function validateMemoryEntry(value: unknown): asserts value is MemoryEntry {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("MemoryEntry must be an object");
  }
  const m = value as Partial<MemoryEntry>;
  if (typeof m.memoryId !== "string" || m.memoryId.length === 0) {
    throw new InvalidStateError("MemoryEntry.memoryId must be a non-empty string");
  }
  if (typeof m.type !== "string" || m.type.length === 0) {
    throw new InvalidStateError("MemoryEntry.type must be a non-empty string");
  }
  if (typeof m.subject !== "string" || m.subject.length === 0) {
    throw new InvalidStateError("MemoryEntry.subject must be a non-empty string");
  }
  if (typeof m.importance !== "number" || m.importance < 0 || m.importance > 1) {
    throw new InvalidStateError(`MemoryEntry.importance must be in [0, 1], got ${String(m.importance)}`);
  }
  if (typeof m.emotionalWeight !== "number" || m.emotionalWeight < -1 || m.emotionalWeight > 1) {
    throw new InvalidStateError(`MemoryEntry.emotionalWeight must be in [-1, 1], got ${String(m.emotionalWeight)}`);
  }
  if (typeof m.confidence !== "number" || m.confidence < 0 || m.confidence > 1) {
    throw new InvalidStateError(`MemoryEntry.confidence must be in [0, 1], got ${String(m.confidence)}`);
  }
  if (!Number.isInteger(m.createdAt) || (m.createdAt as number) < 0) {
    throw new InvalidStateError("MemoryEntry.createdAt must be a non-negative integer tick");
  }
  if (!Number.isInteger(m.lastRecalled) || (m.lastRecalled as number) < 0) {
    throw new InvalidStateError("MemoryEntry.lastRecalled must be a non-negative integer tick");
  }
  if (typeof m.decayRate !== "number" || m.decayRate < 0 || m.decayRate > 1) {
    throw new InvalidStateError(`MemoryEntry.decayRate must be in [0, 1], got ${String(m.decayRate)}`);
  }
}

export interface CreateMemoryInput {
  memoryId: string;
  type: MemoryType;
  subject: string;
  location?: MemoryPosition | null;
  importance: number;
  emotionalWeight: number;
  confidence?: number;
  tick: number;
  decayRate?: number;
}

/** Default decay rate is inversely related to importance: important memories decay slower. */
function defaultDecayRateFor(importance: number): number {
  return Math.max(0.001, 0.02 * (1 - importance));
}

export function createMemoryEntry(input: CreateMemoryInput): MemoryEntry {
  const entry: MemoryEntry = {
    memoryId: input.memoryId,
    type: input.type,
    subject: input.subject,
    location: input.location ?? null,
    importance: input.importance,
    emotionalWeight: input.emotionalWeight,
    confidence: input.confidence ?? 1,
    createdAt: input.tick,
    lastRecalled: input.tick,
    decayRate: input.decayRate ?? defaultDecayRateFor(input.importance),
  };
  validateMemoryEntry(entry);
  return entry;
}

/**
 * Decays every memory by one tick's worth of `decayRate`, dropping entries
 * whose importance falls below MIN_RETAINED_IMPORTANCE (forgetting).
 * Important events (`decayRate` computed low, or explicitly reinforced)
 * persist far longer than mundane ones (§13-14).
 */
export function decayMemories(memories: readonly MemoryEntry[]): MemoryEntry[] {
  const next: MemoryEntry[] = [];
  for (const memory of memories) {
    const decayedImportance = memory.importance * (1 - memory.decayRate);
    if (decayedImportance < MIN_RETAINED_IMPORTANCE) continue;
    next.push({ ...memory, importance: decayedImportance });
  }
  return next;
}

/** Recalling a memory (it influenced a decision) slightly reinforces it and updates lastRecalled. */
export function recallMemory(memory: MemoryEntry, tick: number, reinforcement = 0.02): MemoryEntry {
  return {
    ...memory,
    lastRecalled: tick,
    importance: Math.min(1, memory.importance + reinforcement),
  };
}

/** Adds a new memory, capping total stored memories (oldest/least-important pruned first) to bound growth. */
export function addMemory(memories: readonly MemoryEntry[], entry: MemoryEntry, capacity = 64): MemoryEntry[] {
  const next = [...memories, entry];
  if (next.length <= capacity) return next;
  return next.sort((a, b) => b.importance - a.importance).slice(0, capacity);
}

/** Finds memories matching a subject and/or type, most-important first. */
export function recallMemoriesAbout(
  memories: readonly MemoryEntry[],
  filter: { subject?: string; type?: MemoryType },
): MemoryEntry[] {
  return memories
    .filter((m) => (filter.subject ? m.subject === filter.subject : true))
    .filter((m) => (filter.type ? m.type === filter.type : true))
    .slice()
    .sort((a, b) => b.importance - a.importance);
}

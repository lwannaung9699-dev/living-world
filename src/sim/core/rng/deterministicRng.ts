import { InvalidRngStateError } from "../errors";

/**
 * Serializable snapshot of a single DeterministicRng stream.
 *
 * `state` is the raw mulberry32 32-bit generator state — restoring from it
 * reproduces the exact same future sequence as the original stream.
 * `callCount` is diagnostic-only (useful for debugging/tests) and is not
 * required for correct restoration.
 */
export interface RngState {
  readonly namespace: string;
  readonly state: number;
  readonly callCount: number;
}

/**
 * DeterministicRng — a single named, deterministic pseudo-random stream.
 *
 * Backed by mulberry32 (a small, fast, high-quality 32-bit PRNG with
 * well-defined, engine-independent arithmetic). Every method funnels
 * through `stepRaw()`, so the entire class is fully deterministic given its
 * current internal `state`, and fully serializable/restorable.
 *
 * Instances are normally created via RngStreamRegistry.fork(namespace),
 * never directly with `new`.
 */
export class DeterministicRng {
  private state: number;
  private callCount: number;
  public readonly namespace: string;

  private constructor(namespace: string, state: number, callCount: number) {
    this.namespace = namespace;
    this.state = state >>> 0;
    this.callCount = callCount;
  }

  static fromSeed(namespace: string, seedUint32: number): DeterministicRng {
    return new DeterministicRng(namespace, seedUint32 >>> 0, 0);
  }

  static fromState(state: RngState): DeterministicRng {
    if (
      typeof state !== "object" ||
      state === null ||
      typeof state.namespace !== "string" ||
      state.namespace.length === 0 ||
      typeof state.state !== "number" ||
      !Number.isFinite(state.state) ||
      typeof state.callCount !== "number" ||
      !Number.isFinite(state.callCount) ||
      state.callCount < 0
    ) {
      throw new InvalidRngStateError(`Corrupted RNG state: ${JSON.stringify(state)}`);
    }
    return new DeterministicRng(state.namespace, state.state >>> 0, state.callCount);
  }

  /** Low-level generator step. Advances internal state and returns a raw uint32. */
  private stepRaw(): number {
    let a = this.state;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    this.state = a >>> 0;
    this.callCount += 1;
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Uniform float in [0, 1). */
  nextFloat(): number {
    return this.stepRaw() / 4294967296;
  }

  /** Raw uniform unsigned 32-bit integer. */
  nextUint32(): number {
    return this.stepRaw();
  }

  /** Uniform integer in the INCLUSIVE range [min, max]. */
  nextInt(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
      throw new RangeError(`nextInt requires integer min <= max, got min=${min} max=${max}`);
    }
    const range = max - min + 1;
    return min + Math.floor(this.nextFloat() * range);
  }

  /** Bernoulli trial: true with the given probability (default 0.5). */
  boolean(probability = 0.5): boolean {
    return this.nextFloat() < probability;
  }

  /** Uniformly picks one element from a non-empty array. */
  choose<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("choose() called with an empty array");
    return items[this.nextInt(0, items.length - 1)];
  }

  /** Picks one element from a non-empty array of {value, weight} pairs, proportional to weight. */
  weightedChoice<T>(items: readonly { value: T; weight: number }[]): T {
    if (items.length === 0) throw new RangeError("weightedChoice() called with an empty array");
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    if (!(total > 0)) throw new RangeError("weightedChoice() requires a positive total weight");

    let roll = this.nextFloat() * total;
    for (const item of items) {
      roll -= item.weight;
      if (roll <= 0) return item.value;
    }
    return items[items.length - 1].value;
  }

  /** Deterministic Fisher-Yates shuffle. Returns a new array; does not mutate the input. */
  shuffle<T>(items: readonly T[]): T[] {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /** Normally-distributed value via Box-Muller transform. */
  gaussian(mean = 0, stdDev = 1): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.nextFloat();
    while (v === 0) v = this.nextFloat();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + z * stdDev;
  }

  /** Deterministic, non-cryptographic UUID-shaped identifier. */
  uuid(): string {
    const hex = () => this.nextUint32().toString(16).padStart(8, "0");
    return `${hex()}-${hex().slice(0, 4)}-4${hex().slice(1, 4)}-a${hex().slice(1, 4)}-${hex()}${hex().slice(0, 4)}`;
  }

  /** Serializable snapshot for persistence/replay. */
  getState(): RngState {
    return { namespace: this.namespace, state: this.state, callCount: this.callCount };
  }
}

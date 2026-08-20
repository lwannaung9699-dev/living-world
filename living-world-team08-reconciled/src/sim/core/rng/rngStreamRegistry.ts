import { DeterministicRng, RngState } from "./deterministicRng";
import { deriveUint32Seed } from "../hash";
import { InvalidRngStateError } from "../errors";

/** Serializable snapshot of every RNG stream that has been touched so far, keyed by full namespace path. */
export type RngRegistryState = Record<string, RngState>;

/**
 * RngStreamRegistry — manages independent, hierarchical, deterministic RNG
 * sub-streams derived from a single Master Seed.
 *
 * Design goal (per architecture): a subsystem must be able to request its
 * own stream WITHOUT affecting the sequence of any other subsystem. For
 * example, changing how many random draws the NPC decision stream makes
 * must never change the geography generation sequence.
 *
 * This is achieved by deriving each stream's seed directly from
 * `(masterSeedRoot, namespacePath)` — never from another stream's mutable
 * state or call count. Namespace paths are plain strings using "/" to
 * express hierarchy, e.g.:
 *
 *   registry.fork("geography")
 *   registry.fork("biology")
 *   registry.fork("biology/mutation")
 *   registry.fork("biology/reproduction")
 *   registry.fork("npc/decisions")
 *
 * Repeated calls to fork() with the same namespace path return the SAME
 * underlying stream instance, so its sequence correctly continues across a
 * simulation's lifetime instead of resetting back to the same values.
 */
export class RngStreamRegistry {
  private readonly masterSeedRoot: string;
  private readonly streams = new Map<string, DeterministicRng>();

  private constructor(masterSeedRoot: string) {
    this.masterSeedRoot = masterSeedRoot;
  }

  /** Creates a fresh registry with no streams yet materialized. */
  static create(masterSeedRoot: string): RngStreamRegistry {
    if (typeof masterSeedRoot !== "string" || masterSeedRoot.length === 0) {
      throw new InvalidRngStateError("RngStreamRegistry requires a non-empty master seed root string");
    }
    return new RngStreamRegistry(masterSeedRoot);
  }

  /** Restores a registry from a previously serialized state (see serialize()). */
  static fromState(masterSeedRoot: string, state: RngRegistryState): RngStreamRegistry {
    const registry = RngStreamRegistry.create(masterSeedRoot);
    for (const [namespace, rngState] of Object.entries(state ?? {})) {
      if (!rngState || rngState.namespace !== namespace) {
        throw new InvalidRngStateError(
          `RNG state namespace mismatch: key "${namespace}" does not match stored namespace "${String(rngState?.namespace)}"`,
        );
      }
      registry.streams.set(namespace, DeterministicRng.fromState(rngState));
    }
    return registry;
  }

  /**
   * Returns the deterministic RNG stream for the given namespace path.
   * Creates it (deterministically, from masterSeedRoot + namespace) on
   * first use; returns the same instance on subsequent calls.
   */
  fork(namespace: string): DeterministicRng {
    if (typeof namespace !== "string" || namespace.trim().length === 0) {
      throw new InvalidRngStateError("RNG stream namespace must be a non-empty string");
    }

    const existing = this.streams.get(namespace);
    if (existing) return existing;

    const seed = deriveUint32Seed(`${this.masterSeedRoot}::${namespace}`);
    const stream = DeterministicRng.fromSeed(namespace, seed);
    this.streams.set(namespace, stream);
    return stream;
  }

  /** True if the given namespace has already been forked in this registry instance. */
  has(namespace: string): boolean {
    return this.streams.has(namespace);
  }

  /** Canonical (sorted-key) serializable snapshot of every stream touched so far. */
  serialize(): RngRegistryState {
    const out: RngRegistryState = {};
    for (const namespace of [...this.streams.keys()].sort()) {
      out[namespace] = this.streams.get(namespace)!.getState();
    }
    return out;
  }
}

/**
 * Pure, dependency-free, engine-agnostic hashing/PRNG primitives.
 *
 * These functions deliberately avoid:
 *  - Node.js built-ins (e.g. `node:crypto`)
 *  - Browser APIs
 *  - Any JavaScript-engine-specific behaviour (Object key enumeration order,
 *    Map/Set iteration order, default `toString()`/hashCode implementations)
 *
 * so that the exact same input string always produces the exact same
 * numeric/hex output on any JavaScript engine — now, in a browser, in a
 * future Godot/GDScript port, or in any other runtime. Everything here is
 * plain arithmetic using standard ECMAScript operators (Math.imul, `>>>`,
 * `|0`), which have well-defined, engine-independent semantics.
 *
 * Algorithms:
 *  - xmur3      : 32-bit string hash, used to derive PRNG seeds from strings.
 *  - mulberry32 : fast, high-quality 32-bit PRNG used for all simulation
 *                 randomness (see DeterministicRng).
 *  - fnv1a32    : general purpose 32-bit hash, combined 4x to build a
 *                 128-bit hex fingerprint for canonical WorldState hashing.
 */

/** Derives a 32-bit hash generator function from an arbitrary string (xmur3). */
export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function xmur3Step(): number {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** Derives a single stable uint32 seed from an arbitrary string. */
export function deriveUint32Seed(str: string): number {
  return xmur3(str)();
}

/**
 * fnv1a32: general purpose, non-cryptographic 32-bit string hash.
 * Used only for canonical state fingerprints, never for RNG seeding.
 */
export function fnv1a32(str: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function reverseString(str: string): string {
  let out = "";
  for (let i = str.length - 1; i >= 0; i--) out += str[i];
  return out;
}

/**
 * Deterministic 128-bit hex fingerprint (32 hex chars) built from four
 * independent fnv1a32 rounds (different seeds / forward+reverse scan) so
 * that even fairly large canonical JSON strings get good bit dispersion
 * without needing a cryptographic hash library.
 */
export function hash128Hex(str: string): string {
  const reversed = reverseString(str);
  const parts = [
    fnv1a32(str, 0x811c9dc5),
    fnv1a32(str, 0x9e3779b9),
    fnv1a32(reversed, 0x811c9dc5),
    fnv1a32(reversed, 0x85ebca6b),
  ];
  return parts.map((p) => p.toString(16).padStart(8, "0")).join("");
}

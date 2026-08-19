import { deriveUint32Seed } from "../../core/hash";

/**
 * Position-based deterministic sampling primitives.
 *
 * Every field in World Genesis (elevation, climate, soil, resources,
 * biomes, habitats, weather) must be expressible as a PURE FUNCTION of
 * (masterSeedRoot, worldX, worldY[, extra discriminators]) — never as a
 * sequential draw from a mutable RngStreamRegistry stream. A sequential
 * stream's Nth draw depends on everything drawn before it, which would
 * make a chunk's contents depend on which other chunks happened to be
 * generated earlier in the same process — violating the chunk generation
 * order independence requirement (spec §7).
 *
 * These functions instead hash the exact (namespace, coordinates) tuple on
 * every call via `deriveUint32Seed` (Team 01's xmur3-based string hash, see
 * core/hash.ts). Hashing has no memory between calls, so
 * `hash01(root, ns, 4, 7)` always returns the same value no matter what
 * else has or hasn't been sampled before it, in this call or any other
 * process — which is exactly the guarantee chunk-order-independence needs.
 */

/** Deterministic pseudo-random float in [0, 1) for an integer lattice point. */
export function hash01(masterSeedRoot: string, namespace: string, ix: number, iy: number): number {
  const seed = deriveUint32Seed(`${masterSeedRoot}::${namespace}::${ix}:${iy}`);
  return seed / 4294967296;
}

/** Deterministic pseudo-random float in [0, 1) for an arbitrary discriminated key (no coordinates required). */
export function hashKey01(masterSeedRoot: string, namespace: string, key: string): number {
  const seed = deriveUint32Seed(`${masterSeedRoot}::${namespace}::${key}`);
  return seed / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Coherent 2D value noise in [0, 1): smoothly interpolated between
 * deterministic hashed values at integer lattice points. This is the
 * "local variation" ingredient — never used alone (see
 * geography/elevation.ts), always blended with structural ingredients
 * (geological plates, latitude, coastal falloff) so the result reads as a
 * coherent world rather than a plain noise texture (spec §9).
 */
export function valueNoise2D(masterSeedRoot: string, namespace: string, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const sx = smoothstep(x - x0);
  const sy = smoothstep(y - y0);

  const n00 = hash01(masterSeedRoot, namespace, x0, y0);
  const n10 = hash01(masterSeedRoot, namespace, x1, y0);
  const n01 = hash01(masterSeedRoot, namespace, x0, y1);
  const n11 = hash01(masterSeedRoot, namespace, x1, y1);

  const nx0 = lerp(n00, n10, sx);
  const nx1 = lerp(n01, n11, sx);
  return lerp(nx0, nx1, sy);
}

export interface FbmParams {
  /** Number of noise octaves to sum (more = more fine detail). */
  readonly octaves: number;
  /** Frequency multiplier applied per octave (>1 = finer detail per octave). */
  readonly lacunarity: number;
  /** Amplitude multiplier applied per octave (<1 = higher octaves contribute less). */
  readonly gain: number;
  /** Base frequency of the first octave (world units per noise cell). */
  readonly baseFrequency: number;
}

export const DEFAULT_FBM_PARAMS: FbmParams = {
  octaves: 5,
  lacunarity: 2.0,
  gain: 0.5,
  baseFrequency: 1 / 48,
};

/**
 * Fractal Brownian motion: sums multiple octaves of valueNoise2D. Returns a
 * value normalized to [0, 1]. This is the standard "regional + local
 * variation" ingredient referenced throughout §9 (terrain), used as one
 * input among several — never the sole source of any field.
 */
export function fbm2D(
  masterSeedRoot: string,
  namespace: string,
  x: number,
  y: number,
  params: FbmParams = DEFAULT_FBM_PARAMS,
): number {
  let amplitude = 1;
  let frequency = params.baseFrequency;
  let sum = 0;
  let maxSum = 0;

  for (let octave = 0; octave < params.octaves; octave++) {
    sum += amplitude * valueNoise2D(masterSeedRoot, `${namespace}/o${octave}`, x * frequency, y * frequency);
    maxSum += amplitude;
    amplitude *= params.gain;
    frequency *= params.lacunarity;
  }

  return maxSum > 0 ? sum / maxSum : 0;
}

export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

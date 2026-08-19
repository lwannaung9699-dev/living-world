import { InvalidSeedError, InvalidVersionError } from "../errors";

/**
 * Foundation versions.
 *
 * Bumping any of these intentionally changes the deterministic RNG root
 * (see worldSeedToRngRoot) — i.e. it is a conscious "new universe" decision,
 * never an accident of code refactoring.
 */
export const CURRENT_SIMULATION_VERSION = "0.1.0";
export const CURRENT_RULES_VERSION = "0.1.0";
export const CURRENT_INITIAL_STATE_VERSION = "0.1.0";

const SEMVER_LIKE = /^\d+\.\d+\.\d+$/;

/**
 * WorldSeed — the single authoritative Master Seed record for a generated
 * world.
 *
 * The seed does not contain the world's story. It establishes deterministic
 * initial conditions and parameters. Combined with the Rules (later teams)
 * and the Simulation (tick-by-tick interactions over time), it produces an
 * Emergent World whose History is unique.
 */
export interface WorldSeed {
  /** Canonical string form of the master seed value. */
  readonly seed: string;
  /** Version of the simulation tick/engine logic. */
  readonly simulationVersion: string;
  /** Version of the deterministic rule tables used to interpret the seed. */
  readonly rulesVersion: string;
  /**
   * ISO-8601 timestamp — human/record-keeping metadata only.
   * Never affects deterministic simulation output (see worldSeedToRngRoot
   * and core/serialization/stateHash.ts).
   */
  readonly createdAt: string;
  /** Version of the algorithm used to build the world's initial state. */
  readonly initialStateVersion: string;
}

export interface CreateWorldSeedInput {
  seed?: string | number;
  simulationVersion?: string;
  rulesVersion?: string;
  initialStateVersion?: string;
  createdAt?: string;
}

export function createWorldSeed(input: CreateWorldSeedInput = {}): WorldSeed {
  const seed = normalizeSeedValue(input.seed ?? defaultSeedValue());
  const simulationVersion = input.simulationVersion ?? CURRENT_SIMULATION_VERSION;
  const rulesVersion = input.rulesVersion ?? CURRENT_RULES_VERSION;
  const initialStateVersion = input.initialStateVersion ?? CURRENT_INITIAL_STATE_VERSION;
  const createdAt = input.createdAt ?? new Date().toISOString();

  const worldSeed: WorldSeed = { seed, simulationVersion, rulesVersion, createdAt, initialStateVersion };
  validateWorldSeed(worldSeed);
  return worldSeed;
}

/**
 * Fallback seed value used only when the caller supplies none. This path is
 * intentionally NOT reproducible run-to-run (it mixes in wall-clock time) —
 * callers who need reproducibility must always pass an explicit `seed`.
 */
function defaultSeedValue(): string {
  return `auto-${Date.now().toString(36)}`;
}

function normalizeSeedValue(seed: string | number): string {
  if (typeof seed === "number") {
    if (!Number.isFinite(seed)) {
      throw new InvalidSeedError(`Numeric seed must be finite, received ${seed}`);
    }
    return `n:${seed}`;
  }
  if (typeof seed === "string") {
    if (seed.length === 0) {
      throw new InvalidSeedError("Seed string must not be empty");
    }
    return seed;
  }
  throw new InvalidSeedError(`Seed must be a string or a finite number, received ${typeof seed}`);
}

export function validateWorldSeed(value: unknown): asserts value is WorldSeed {
  if (typeof value !== "object" || value === null) {
    throw new InvalidSeedError("WorldSeed must be an object");
  }
  const seed = value as Partial<WorldSeed>;

  if (typeof seed.seed !== "string" || seed.seed.length === 0) {
    throw new InvalidSeedError("WorldSeed.seed must be a non-empty string");
  }
  if (typeof seed.simulationVersion !== "string" || !SEMVER_LIKE.test(seed.simulationVersion)) {
    throw new InvalidVersionError(
      `WorldSeed.simulationVersion must look like a semver string (x.y.z), got "${String(seed.simulationVersion)}"`,
    );
  }
  if (typeof seed.rulesVersion !== "string" || !SEMVER_LIKE.test(seed.rulesVersion)) {
    throw new InvalidVersionError(
      `WorldSeed.rulesVersion must look like a semver string (x.y.z), got "${String(seed.rulesVersion)}"`,
    );
  }
  if (typeof seed.initialStateVersion !== "string" || !SEMVER_LIKE.test(seed.initialStateVersion)) {
    throw new InvalidVersionError(
      `WorldSeed.initialStateVersion must look like a semver string (x.y.z), got "${String(seed.initialStateVersion)}"`,
    );
  }
  if (typeof seed.createdAt !== "string" || Number.isNaN(Date.parse(seed.createdAt))) {
    throw new InvalidSeedError(`WorldSeed.createdAt must be a valid ISO-8601 date string, got "${String(seed.createdAt)}"`);
  }
}

/**
 * Derives the deterministic RNG root string for a given WorldSeed.
 *
 * Intentionally combines `seed` + all three version fields (bumping any of
 * them is a conscious "different deterministic universe" decision) while
 * excluding `createdAt`, which is pure record-keeping metadata and must
 * never influence — or be influenced by — the deterministic simulation.
 */
export function worldSeedToRngRoot(seed: WorldSeed): string {
  return `${seed.seed}::sim=${seed.simulationVersion}::rules=${seed.rulesVersion}::init=${seed.initialStateVersion}`;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createWorldSeed,
  validateWorldSeed,
  worldSeedToRngRoot,
  InvalidSeedError,
  InvalidVersionError,
} from "../index";

test("createWorldSeed produces a valid seed with explicit values", () => {
  const seed = createWorldSeed({ seed: "alpha-world", createdAt: "2024-01-01T00:00:00.000Z" });
  assert.equal(seed.seed, "alpha-world");
  assert.equal(seed.simulationVersion, "0.1.0");
  assert.equal(seed.rulesVersion, "0.1.0");
  assert.equal(seed.initialStateVersion, "0.1.0");
  assert.doesNotThrow(() => validateWorldSeed(seed));
});

test("createWorldSeed normalizes numeric seeds deterministically", () => {
  const a = createWorldSeed({ seed: 12345, createdAt: "2024-01-01T00:00:00.000Z" });
  const b = createWorldSeed({ seed: 12345, createdAt: "2099-12-31T00:00:00.000Z" });
  assert.equal(a.seed, b.seed);
  assert.equal(
    worldSeedToRngRoot(a),
    worldSeedToRngRoot(b),
    "createdAt must not affect the deterministic rng root",
  );
});

test("different seed values produce different deterministic rng roots", () => {
  const a = createWorldSeed({ seed: "world-a" });
  const b = createWorldSeed({ seed: "world-b" });
  assert.notEqual(worldSeedToRngRoot(a), worldSeedToRngRoot(b));
});

test("bumping a version field changes the deterministic rng root even for the same raw seed", () => {
  const a = createWorldSeed({ seed: "same-seed", rulesVersion: "0.1.0" });
  const b = createWorldSeed({ seed: "same-seed", rulesVersion: "0.2.0" });
  assert.notEqual(worldSeedToRngRoot(a), worldSeedToRngRoot(b));
});

test("validateWorldSeed rejects an empty seed string", () => {
  assert.throws(
    () =>
      validateWorldSeed({
        seed: "",
        simulationVersion: "0.1.0",
        rulesVersion: "0.1.0",
        initialStateVersion: "0.1.0",
        createdAt: new Date().toISOString(),
      }),
    InvalidSeedError,
  );
});

test("validateWorldSeed rejects a malformed version string", () => {
  assert.throws(
    () =>
      validateWorldSeed({
        seed: "x",
        simulationVersion: "not-a-version",
        rulesVersion: "0.1.0",
        initialStateVersion: "0.1.0",
        createdAt: new Date().toISOString(),
      }),
    InvalidVersionError,
  );
});

test("validateWorldSeed rejects a non-object value", () => {
  assert.throws(() => validateWorldSeed(null), InvalidSeedError);
  assert.throws(() => validateWorldSeed("not-a-seed"), InvalidSeedError);
});

test("WorldSeed serializes and deserializes as plain JSON without loss", () => {
  const seed = createWorldSeed({ seed: "round-trip" });
  const roundTripped = JSON.parse(JSON.stringify(seed));
  assert.deepEqual(roundTripped, seed);
  assert.doesNotThrow(() => validateWorldSeed(roundTripped));
});

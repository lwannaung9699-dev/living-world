import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createWorldSeed,
  createInitialWorldState,
  tickN,
  serializeWorldState,
  deserializeWorldState,
  canonicalStringify,
  computeStateHash,
} from "../index";

test("serializeWorldState -> deserializeWorldState round-trips to an identical state", () => {
  const seed = createWorldSeed({ seed: "serialize-test" });
  const state = tickN(createInitialWorldState(seed), 25);
  const json = serializeWorldState(state);
  const restored = deserializeWorldState(json);
  assert.deepEqual(restored, state);
  assert.equal(computeStateHash(restored), computeStateHash(state));
});

test("serializeWorldState output is stable across repeated calls (deterministic byte-for-byte)", () => {
  const seed = createWorldSeed({ seed: "serialize-stable", createdAt: "2024-01-01T00:00:00.000Z" });
  const state = tickN(createInitialWorldState(seed), 12);
  const jsonA = serializeWorldState(state);
  const jsonB = serializeWorldState(state);
  assert.equal(jsonA, jsonB);
});

test("canonicalStringify produces identical output regardless of object key insertion order", () => {
  const a = { z: 1, a: 2, m: { y: 1, b: 2 } };
  const b = { a: 2, m: { b: 2, y: 1 }, z: 1 };
  assert.equal(canonicalStringify(a), canonicalStringify(b));
});

test("canonicalStringify handles arrays, nulls, and undefined-as-null consistently", () => {
  assert.equal(canonicalStringify([1, 2, 3]), "[1,2,3]");
  assert.equal(canonicalStringify(null), "null");
  assert.equal(canonicalStringify(undefined), "null");
});

test("deserializeWorldState rejects invalid JSON", () => {
  assert.throws(() => deserializeWorldState("{not-json"));
});

test("deserializeWorldState rejects structurally invalid state", () => {
  assert.throws(() => deserializeWorldState(JSON.stringify({ foo: "bar" })));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { DeterministicRng, RngStreamRegistry } from "../index";

test("DeterministicRng.fromSeed is deterministic across identical seeds", () => {
  const a = DeterministicRng.fromSeed("test", 42);
  const b = DeterministicRng.fromSeed("test", 42);
  const seqA = Array.from({ length: 10 }, () => a.nextFloat());
  const seqB = Array.from({ length: 10 }, () => b.nextFloat());
  assert.deepEqual(seqA, seqB);
});

test("DeterministicRng.nextFloat stays within [0,1)", () => {
  const rng = DeterministicRng.fromSeed("range", 7);
  for (let i = 0; i < 2000; i++) {
    const v = rng.nextFloat();
    assert.ok(v >= 0 && v < 1, `value out of range: ${v}`);
  }
});

test("DeterministicRng.nextInt respects inclusive bounds", () => {
  const rng = DeterministicRng.fromSeed("int", 99);
  const seen = new Set<number>();
  for (let i = 0; i < 1000; i++) {
    const v = rng.nextInt(5, 9);
    assert.ok(Number.isInteger(v) && v >= 5 && v <= 9, `value out of range: ${v}`);
    seen.add(v);
  }
  assert.deepEqual([...seen].sort(), [5, 6, 7, 8, 9]);
});

test("DeterministicRng.choose/weightedChoice/shuffle/gaussian/uuid are all deterministic", () => {
  const rngA = DeterministicRng.fromSeed("pick", 123);
  const rngB = DeterministicRng.fromSeed("pick", 123);
  const items = ["a", "b", "c", "d"];

  assert.equal(rngA.choose(items), rngB.choose(items));

  const weighted = [
    { value: "rare", weight: 1 },
    { value: "common", weight: 9 },
  ];
  assert.equal(rngA.weightedChoice(weighted), rngB.weightedChoice(weighted));
  assert.deepEqual(rngA.shuffle(items), rngB.shuffle(items));
  assert.equal(rngA.gaussian(), rngB.gaussian());
  assert.equal(rngA.uuid(), rngB.uuid());
});

test("DeterministicRng state can be serialized and restored exactly", () => {
  const rng = DeterministicRng.fromSeed("save", 555);
  rng.nextFloat();
  rng.nextFloat();
  const state = rng.getState();
  const restored = DeterministicRng.fromState(state);
  assert.equal(rng.nextFloat(), restored.nextFloat());
  assert.equal(rng.nextFloat(), restored.nextFloat());
});

test("RngStreamRegistry: independent sub-streams do not affect each other", () => {
  const registryA = RngStreamRegistry.create("master-seed-1");
  const geographyA = registryA.fork("geography");
  const geographySequenceBefore = Array.from({ length: 5 }, () => geographyA.nextFloat());

  // A completely separate registry with the SAME master seed, but heavily
  // used on an unrelated stream first — geography must still match exactly.
  const registryB = RngStreamRegistry.create("master-seed-1");
  const npcDecisions = registryB.fork("npc/decisions");
  for (let i = 0; i < 5000; i++) npcDecisions.nextFloat();
  const geographyB = registryB.fork("geography");
  const geographySequenceAfter = Array.from({ length: 5 }, () => geographyB.nextFloat());

  assert.deepEqual(geographySequenceBefore, geographySequenceAfter);
});

test("RngStreamRegistry: same namespace path always derives the same stream for a given master seed", () => {
  const r1 = RngStreamRegistry.create("seed-x");
  const r2 = RngStreamRegistry.create("seed-x");
  assert.equal(r1.fork("biology/mutation").nextFloat(), r2.fork("biology/mutation").nextFloat());
});

test("RngStreamRegistry: different master seeds normally diverge", () => {
  const r1 = RngStreamRegistry.create("seed-x");
  const r2 = RngStreamRegistry.create("seed-y");
  assert.notEqual(r1.fork("evolution").nextFloat(), r2.fork("evolution").nextFloat());
});

test("RngStreamRegistry: fork() returns the same instance so the sequence continues (never resets)", () => {
  const registry = RngStreamRegistry.create("continuity-seed");
  const first = registry.fork("history");
  const value1 = first.nextFloat();
  const second = registry.fork("history");
  const value2 = second.nextFloat();
  assert.equal(first, second, "fork() must return the same stream instance for the same namespace");
  assert.notEqual(value1, value2, "the second draw should continue the sequence, not repeat it");
});

test("RngStreamRegistry: sibling namespaces under the same parent are independent", () => {
  const registry = RngStreamRegistry.create("hierarchy-seed");
  const mutation = registry.fork("biology/mutation");
  const reproduction = registry.fork("biology/reproduction");
  assert.notEqual(mutation.nextFloat(), reproduction.nextFloat());
});

test("RngStreamRegistry: serialize/fromState round-trips exactly, continuing every stream's sequence", () => {
  const registry = RngStreamRegistry.create("roundtrip-seed");
  const geo = registry.fork("geography");
  const bio = registry.fork("biology/mutation");
  geo.nextFloat();
  geo.nextFloat();
  bio.nextFloat();

  const serialized = registry.serialize();
  const restored = RngStreamRegistry.fromState("roundtrip-seed", serialized);

  assert.equal(registry.fork("geography").nextFloat(), restored.fork("geography").nextFloat());
  assert.equal(registry.fork("biology/mutation").nextFloat(), restored.fork("biology/mutation").nextFloat());
});

test("RngStreamRegistry rejects an empty master seed root", () => {
  assert.throws(() => RngStreamRegistry.create(""));
});

test("RngStreamRegistry rejects an empty namespace", () => {
  const registry = RngStreamRegistry.create("edge-case-seed");
  assert.throws(() => registry.fork(""));
});

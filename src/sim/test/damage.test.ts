import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDamage, applyDamageSequence, computeDamageMultiplier, createDefaultMaterialRegistry, InvalidStateError } from "../index";

const materials = createDefaultMaterialRegistry();
const wood = materials.get("oak_wood");
const stone = materials.get("granite");
const iron = materials.get("iron");
const organic = materials.get("plant_fiber");

test("wood takes more fire damage than stone, given identical raw damage amount", () => {
  const woodResult = applyDamage(1, wood, { type: "fire", amount: 0.5 });
  const stoneResult = applyDamage(1, stone, { type: "fire", amount: 0.5 });
  assert.ok(woodResult < stoneResult, `expected wood (${woodResult}) to take more fire damage than stone (${stoneResult})`);
});

test("iron loses integrity gradually under repeated corrosion events", () => {
  let integrity = 1;
  const losses: number[] = [];
  for (let i = 0; i < 5; i++) {
    const next = applyDamage(integrity, iron, { type: "corrosion", amount: 0.05 });
    losses.push(integrity - next);
    integrity = next;
  }
  assert.ok(integrity < 1 && integrity > 0, "expected gradual, non-zero, non-total integrity loss");
  assert.ok(losses.every((loss) => loss > 0), "every corrosion event should reduce integrity somewhat");
});

test("organic material decays faster under decay-type damage than a tough material", () => {
  const organicLoss = 1 - applyDamage(1, organic, { type: "decay", amount: 0.3 });
  const stoneLoss = 1 - applyDamage(1, stone, { type: "decay", amount: 0.3 });
  assert.ok(organicLoss > stoneLoss);
});

test("applyDamage clamps integrity to [0, 1] even under extreme damage", () => {
  assert.equal(applyDamage(0.1, wood, { type: "fire", amount: 5 }), 0);
  assert.equal(applyDamage(1, wood, { type: "fire", amount: 0 }), 1);
});

test("applyDamage rejects a negative amount", () => {
  assert.throws(() => applyDamage(1, wood, { type: "fire", amount: -1 }), InvalidStateError);
});

test("applyDamage rejects an invalid damage type", () => {
  assert.throws(() => applyDamage(1, wood, { type: "lava" as never, amount: 0.1 }), InvalidStateError);
});

test("applyDamageSequence applies events in order, each against the already-reduced integrity", () => {
  const sequential = applyDamageSequence(1, wood, [
    { type: "impact", amount: 0.2 },
    { type: "fire", amount: 0.2 },
  ]);
  const manual = applyDamage(applyDamage(1, wood, { type: "impact", amount: 0.2 }), wood, { type: "fire", amount: 0.2 });
  assert.equal(sequential, manual);
});

test("computeDamageMultiplier is deterministic and bounded for every declared damage type", () => {
  const types = ["impact", "heat", "fire", "water", "corrosion", "decay", "overload"] as const;
  for (const type of types) {
    const a = computeDamageMultiplier(wood, type);
    const b = computeDamageMultiplier(wood, type);
    assert.equal(a, b);
    assert.ok(Number.isFinite(a) && a >= 0);
  }
});

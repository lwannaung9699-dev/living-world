import { test } from "node:test";
import assert from "node:assert/strict";
import { stepMetabolism, DEFAULT_METABOLISM_PARAMS } from "../../biology/entity/metabolism";

test("stepMetabolism reduces energy when food availability is zero", () => {
  const result = stepMetabolism(1, 5, { foodAvailability: 0 });
  assert.ok(result.energy < 1);
  assert.equal(result.starving, false);
});

test("stepMetabolism marks an entity as starving once energy reaches zero", () => {
  const result = stepMetabolism(0.001, 5, { foodAvailability: 0 });
  assert.equal(result.energy, 0);
  assert.equal(result.starving, true);
});

test("stepMetabolism clamps energy to [0, 1] even with abundant food", () => {
  const result = stepMetabolism(0.99, 1, { foodAvailability: 1 });
  assert.ok(result.energy <= 1);
});

test("stepMetabolism: higher mass increases expenditure, all else equal", () => {
  const lightweight = stepMetabolism(1, 1, { foodAvailability: 0.2 }, DEFAULT_METABOLISM_PARAMS);
  const heavy = stepMetabolism(1, 500, { foodAvailability: 0.2 }, DEFAULT_METABOLISM_PARAMS);
  assert.ok(heavy.energy < lightweight.energy);
});

test("stepMetabolism is a pure deterministic function of its inputs", () => {
  const a = stepMetabolism(0.5, 10, { foodAvailability: 0.3 });
  const b = stepMetabolism(0.5, 10, { foodAvailability: 0.3 });
  assert.deepEqual(a, b);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkExtinction } from "../../biology/population/extinction";

test("checkExtinction reports extinct when population size is zero", () => {
  const result = checkExtinction("demo-critter", 0, 500);
  assert.equal(result.extinct, true);
  assert.equal(result.speciesId, "demo-critter");
  assert.equal(result.tick, 500);
});

test("checkExtinction reports extinct once population drops to/below the configured minimum viable population", () => {
  const result = checkExtinction("demo-critter", 3, 500, 5);
  assert.equal(result.extinct, true);
});

test("checkExtinction reports not extinct when population is comfortably above the threshold", () => {
  const result = checkExtinction("demo-critter", 50, 500, 5);
  assert.equal(result.extinct, false);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorldSeed } from "../../index";
import { createGenesisWorldState, generateChunk, sampleCellAt } from "../../worldgen";

/**
 * Spec requirement: "Neighboring chunks must agree at shared borders."
 *
 * Chunks don't overlap — chunk (cx,cy)'s rightmost column and chunk
 * (cx+1,cy)'s leftmost column are two DIFFERENT (but world-adjacent, one
 * cell apart) positions, so "agree" can't mean bit-identical values across
 * the seam. What it must mean, given every field here is a pure function
 * of continuous world coordinates (see chunk/sampleCell.ts), is:
 *   (a) chunk assembly places each cell at exactly the world coordinate it
 *       claims to (no off-by-one/edge-clamping bug that would fabricate a
 *       seam), and
 *   (b) the field values themselves are continuous across the seam — a
 *       step across a chunk boundary shouldn't behave differently from a
 *       step anywhere else.
 */
test("Test: neighboring chunks agree at shared borders (coordinate correctness)", () => {
  const world = createGenesisWorldState(createWorldSeed({ seed: "chunk-border-coords" }));
  const chunkSize = (world.modules.planetary as { chunkSize: number }).chunkSize;

  const chunkA = generateChunk(world, { cx: 3, cy: 5 });
  const chunkB = generateChunk(world, { cx: 4, cy: 5 }); // directly east of A

  for (let localY = 0; localY < chunkSize; localY++) {
    const lastColumnCellA = chunkA.cells[localY][chunkSize - 1];
    const firstColumnCellB = chunkB.cells[localY][0];

    // The two bordering cells must be exactly one world unit apart on x,
    // and share the same world y — proving there's no gap or overlap
    // introduced by chunk assembly at the boundary.
    assert.equal(firstColumnCellB.wx, lastColumnCellA.wx + 1);
    assert.equal(firstColumnCellB.wy, lastColumnCellA.wy);

    // And each stored cell must match an independent direct query at that
    // exact world position — proving the chunk assembler didn't shift,
    // mirror, or clamp anything at the edge.
    assert.deepEqual(sampleCellAt(world, lastColumnCellA.wx, lastColumnCellA.wy), lastColumnCellA);
    assert.deepEqual(sampleCellAt(world, firstColumnCellB.wx, firstColumnCellB.wy), firstColumnCellB);
  }
});

test("Test: neighboring chunks agree at shared borders (field continuity, no seam artifact)", () => {
  const world = createGenesisWorldState(createWorldSeed({ seed: "chunk-border-continuity" }));
  const chunkSize = (world.modules.planetary as { chunkSize: number }).chunkSize;

  const chunkA = generateChunk(world, { cx: 7, cy: 2 });
  const chunkB = generateChunk(world, { cx: 8, cy: 2 }); // directly east of A

  let seamDeltaSum = 0;
  let seamCount = 0;
  for (let localY = 0; localY < chunkSize; localY++) {
    const a = chunkA.cells[localY][chunkSize - 1];
    const b = chunkB.cells[localY][0];
    seamDeltaSum += Math.abs(a.elevation01 - b.elevation01);
    seamCount++;
  }
  const meanSeamDelta = seamDeltaSum / seamCount;

  let interiorDeltaSum = 0;
  let interiorCount = 0;
  for (let localY = 0; localY < chunkSize; localY++) {
    for (let localX = 0; localX < chunkSize - 1; localX++) {
      const left = chunkA.cells[localY][localX];
      const right = chunkA.cells[localY][localX + 1];
      interiorDeltaSum += Math.abs(left.elevation01 - right.elevation01);
      interiorCount++;
    }
  }
  const meanInteriorDelta = interiorDeltaSum / interiorCount;

  // The seam is just another one-cell step in a continuous field. Its
  // average delta should be the same order of magnitude as any interior
  // one-cell step — not a discontinuous jump introduced by chunking.
  // A generous 4x bound comfortably catches real seam bugs (which produce
  // large systematic jumps) while never flaking on ordinary noise variance.
  assert.ok(
    meanSeamDelta <= meanInteriorDelta * 4 + 0.02,
    `seam elevation delta (${meanSeamDelta.toFixed(4)}) is out of line with interior deltas (${meanInteriorDelta.toFixed(4)}) — possible chunk-boundary discontinuity`,
  );
});

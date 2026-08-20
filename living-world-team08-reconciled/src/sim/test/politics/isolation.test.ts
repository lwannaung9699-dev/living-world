import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Team 08's own copy of Team 01's architectural boundary check (see
 * src/sim/test/isolation.test.ts), scoped to src/sim/politics/**. Written
 * as a new file rather than editing Team 01's test, per the brief
 * ("Do NOT rewrite previous teams").
 */

const FORBIDDEN_IMPORT_SPECIFIERS = ["drizzle-orm", '"pg"', "'pg'", "@/db", "next/", '"next"', "'next'", "react", "react-dom", "three"];

const PROJECT_ROOT = process.cwd();
const POLITICS_DIR = path.join(PROJECT_ROOT, "src", "sim", "politics");

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectTsFiles(full, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

function importOrRequireLines(content: string): string[] {
  return content.split("\n").filter((line) => /^\s*import\b/.test(line) || /\brequire\(/.test(line));
}

test("src/sim/politics never imports a database driver, ORM, web framework, UI library, or rendering library", () => {
  const files = collectTsFiles(POLITICS_DIR);
  assert.ok(files.length > 0, "expected to find files under src/sim/politics");

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const line of importOrRequireLines(content)) {
      for (const forbidden of FORBIDDEN_IMPORT_SPECIFIERS) {
        assert.ok(!line.includes(forbidden), `${path.relative(PROJECT_ROOT, file)} imports forbidden specifier "${forbidden}" in line: ${line.trim()}`);
      }
    }
  }
});

test("src/sim/politics only imports from Team 01 Foundation (src/sim/core) and itself — never reaches sideways into a hypothetical Team 02-07 internal path", () => {
  const files = collectTsFiles(POLITICS_DIR);
  const disallowedRelativeRoots = ["../worldgen", "../materials", "../biology", "../evolution", "../ecology", "../npc", "../society"];

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const line of importOrRequireLines(content)) {
      for (const disallowed of disallowedRelativeRoots) {
        assert.ok(!line.includes(disallowed), `${path.relative(PROJECT_ROOT, file)} imports from a Team 02-07 internal path directly: ${line.trim()}`);
      }
    }
  }
});

test("Team 08 runs headless end-to-end: create a seed, attach the politics tick, run 300 ticks, hash the result", async () => {
  const { createWorldSeed, runSimulation } = await import("../../index");
  const { politicsTick } = await import("../../politics/index");
  const seed = createWorldSeed({ seed: "politics-isolation-check" });
  const result = runSimulation(seed, 300, { subsystems: [politicsTick] });
  assert.equal(typeof result.hash, "string");
  assert.equal(result.state.tick, 300);
});

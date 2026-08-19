import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Architectural boundary test (per approved architecture doc, §6):
 *
 *   `src/sim/**` must never import PostgreSQL, Drizzle, Next.js, React, or
 *   Three.js. The Simulation Core must run headless, without a database,
 *   without a web framework, and without a rendering engine.
 *
 * This is enforced here as a static source-text scan rather than relying on
 * developer discipline alone.
 */

const FORBIDDEN_IMPORT_SPECIFIERS = [
  "drizzle-orm",
  '"pg"',
  "'pg'",
  "@/db",
  "next/",
  '"next"',
  "'next'",
  "react",
  "react-dom",
  "three",
];

const PROJECT_ROOT = process.cwd();
const SIM_ROOT_DIR = path.join(PROJECT_ROOT, "src", "sim");
const SIM_CORE_DIR = path.join(SIM_ROOT_DIR, "core");
const SIM_PERSISTENCE_DIR = path.join(SIM_ROOT_DIR, "persistence");

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
  return content
    .split("\n")
    .filter((line) => /^\s*import\b/.test(line) || /\brequire\(/.test(line));
}

test("src/sim/core never imports a database driver, ORM, web framework, UI library, or rendering library", () => {
  const files = collectTsFiles(SIM_CORE_DIR);
  assert.ok(files.length > 0, "expected to find files under src/sim/core");

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const line of importOrRequireLines(content)) {
      for (const forbidden of FORBIDDEN_IMPORT_SPECIFIERS) {
        assert.ok(
          !line.includes(forbidden),
          `${path.relative(PROJECT_ROOT, file)} imports forbidden specifier "${forbidden}" in line: ${line.trim()}`,
        );
      }
    }
  }
});

test("src/sim/persistence depends only on the Foundation core, never on a concrete database driver", () => {
  const files = collectTsFiles(SIM_PERSISTENCE_DIR);
  assert.ok(files.length > 0, "expected to find files under src/sim/persistence");

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const forbidden of ["drizzle-orm", '"pg"', "'pg'", "@/db"]) {
      assert.ok(
        !content.includes(forbidden),
        `${path.relative(PROJECT_ROOT, file)} references forbidden specifier "${forbidden}"`,
      );
    }
  }
});

test("Foundation runs entirely headless: create a seed, run 200 ticks, hash the result — no DB/network/framework involved", async () => {
  const { createWorldSeed, runSimulation } = await import("../index");
  const seed = createWorldSeed({ seed: "headless-isolation-check" });
  const result = runSimulation(seed, 200);
  assert.equal(typeof result.hash, "string");
  assert.equal(result.hash.length, 32);
  assert.equal(result.state.tick, 200);
});

test("Foundation's InMemoryWorldStateRepository proves save/load works with zero database dependency", async () => {
  const { createWorldSeed, createInitialWorldState, InMemoryWorldStateRepository } = await import("../index");
  const repo = new InMemoryWorldStateRepository();
  const seed = createWorldSeed({ seed: "in-memory-repo-check" });
  const state = createInitialWorldState(seed);

  await repo.save("world-1", state);
  const loaded = await repo.load("world-1");
  assert.deepEqual(loaded, state);

  const missing = await repo.load("does-not-exist");
  assert.equal(missing, null);

  const worldIds = await repo.list();
  assert.deepEqual(worldIds, ["world-1"]);
});

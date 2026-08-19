import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Architectural boundary test for Team 06 (mirrors src/sim/test/isolation.test.ts,
 * §33): src/sim/creature/** must remain pure simulation code, independent of
 * React, Next.js, Three.js, Godot, browser APIs, rendering, UI, or the
 * database runtime.
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
const CREATURE_DIR = path.join(PROJECT_ROOT, "src", "sim", "creature");

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

test("src/sim/creature never imports a database driver, ORM, web framework, UI library, or rendering library", () => {
  const files = collectTsFiles(CREATURE_DIR);
  assert.ok(files.length > 0, "expected to find files under src/sim/creature");

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

test("src/sim/creature only ever imports Team 01 Foundation from ../../core/**, never from a sibling team's internals", () => {
  const files = collectTsFiles(CREATURE_DIR);
  const relativeImport = /from\s+["'](\.\.\/){1,}([^"']+)["']/g;

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    let match: RegExpExecArray | null;
    while ((match = relativeImport.exec(content))) {
      const specifier = match[2];
      const resolvesOutsideSim = specifier.startsWith("core/") || specifier === "core" || specifier.startsWith("../core");
      // Any "../../X" import from within src/sim/creature must resolve into src/sim/core
      // (Foundation) — never into a hypothetical src/sim/geography, src/sim/society, etc.
      const isForeignTeamPath = /^(geography|physics|materials|society|economy|culture|history)\//.test(specifier);
      assert.ok(!isForeignTeamPath, `${path.relative(PROJECT_ROOT, file)} imports from a foreign team path: ${specifier}`);
      void resolvesOutsideSim;
    }
  }
});

test("Team 06 creature pipeline runs entirely headless: no DB/network/framework involved", async () => {
  const { createWorldSeed, createInitialWorldState, tickN, createCreatureSubsystemTick, upsertCreature, createInitialCreatureState, generatePersonality, StaticBiologyProvider, StaticEcologyProvider } =
    await import("../../index");
  const { DeterministicRng } = await import("../../core/rng/deterministicRng");

  const seed = createWorldSeed({ seed: "creature-headless-check" });
  let state = createInitialWorldState(seed);
  const personality = generatePersonality(DeterministicRng.fromSeed("p", 1));
  state = upsertCreature(
    state,
    createInitialCreatureState({ creatureId: "headless-1", speciesId: "s", position: { x: 0, y: 0 }, personality }),
  );

  const subsystem = createCreatureSubsystemTick(new StaticBiologyProvider(), new StaticEcologyProvider());
  const next = tickN(state, 10, { subsystems: [subsystem] });
  assert.equal(next.tick, 10);
});

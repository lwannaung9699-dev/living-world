import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Team 03 import-boundary isolation test.
 *
 * Mirrors src/sim/test/isolation.test.ts's approach (static source-text
 * scan) but applied to src/sim/materials and src/sim/objects: these must
 * remain pure TypeScript with zero dependency on Godot/Three.js/React/
 * Next.js/browser APIs/database — AND must never import any concrete Team
 * 02 (World Genesis) generator, only the abstract WorldMaterialContext
 * shape (architecture §16/§17).
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
  "godot",
];

// Team 02 owns these — Team 03 may only depend on the abstract WorldMaterialContext shape it defines itself.
const FORBIDDEN_TEAM02_SPECIFIERS = [
  "TerrainGenerator",
  "ClimateGenerator",
  "HydrologyGenerator",
  "BiomeGenerator",
  "WorldGenesis",
  "ChunkGenerator",
];

const PROJECT_ROOT = process.cwd();
const SIM_ROOT_DIR = path.join(PROJECT_ROOT, "src", "sim");
const MATERIALS_DIR = path.join(SIM_ROOT_DIR, "materials");
const OBJECTS_DIR = path.join(SIM_ROOT_DIR, "objects");

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

test("src/sim/materials never imports a database driver, ORM, web framework, UI library, or rendering library", () => {
  const files = collectTsFiles(MATERIALS_DIR);
  assert.ok(files.length > 0, "expected to find files under src/sim/materials");
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const line of importOrRequireLines(content)) {
      for (const forbidden of FORBIDDEN_IMPORT_SPECIFIERS) {
        assert.ok(
          !line.toLowerCase().includes(forbidden.toLowerCase()),
          `${path.relative(PROJECT_ROOT, file)} imports forbidden specifier "${forbidden}" in line: ${line.trim()}`,
        );
      }
    }
  }
});

test("src/sim/objects never imports a database driver, ORM, web framework, UI library, or rendering library", () => {
  const files = collectTsFiles(OBJECTS_DIR);
  assert.ok(files.length > 0, "expected to find files under src/sim/objects");
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const line of importOrRequireLines(content)) {
      for (const forbidden of FORBIDDEN_IMPORT_SPECIFIERS) {
        assert.ok(
          !line.toLowerCase().includes(forbidden.toLowerCase()),
          `${path.relative(PROJECT_ROOT, file)} imports forbidden specifier "${forbidden}" in line: ${line.trim()}`,
        );
      }
    }
  }
});

test("src/sim/materials and src/sim/objects never import a concrete Team 02 generator", () => {
  const files = [...collectTsFiles(MATERIALS_DIR), ...collectTsFiles(OBJECTS_DIR)];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const forbidden of FORBIDDEN_TEAM02_SPECIFIERS) {
      assert.ok(
        !content.includes(forbidden),
        `${path.relative(PROJECT_ROOT, file)} references forbidden Team 02 specifier "${forbidden}"`,
      );
    }
  }
});

test("src/sim/materials and src/sim/objects only import from within src/sim (relative imports only, no bare package specifiers)", () => {
  const files = [...collectTsFiles(MATERIALS_DIR), ...collectTsFiles(OBJECTS_DIR)];
  const importSpecifierPattern = /from\s+["']([^"']+)["']/g;
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(importSpecifierPattern)) {
      const specifier = match[1];
      assert.ok(
        specifier.startsWith("./") || specifier.startsWith("../"),
        `${path.relative(PROJECT_ROOT, file)} imports non-relative specifier "${specifier}" — Team 03 must depend only on files inside src/sim`,
      );
    }
  }
});

test("Team 03 subsystem runs entirely headless with a mocked WorldMaterialContext — no Team 02 implementation involved", async () => {
  const { createDefaultMaterialRegistry, applyDecay, createInitialDecayState } = await import("../index");
  const materials = createDefaultMaterialRegistry();
  const wood = materials.get("oak_wood");

  // A hand-authored mock standing in for whatever Team 02 will eventually produce.
  const mockedTeam02Context = { terrainType: "forest_floor", temperatureC: 18, humidity: 0.6, waterExposure: 0.1, biomeId: "temperate_forest" };
  const decayed = applyDecay(createInitialDecayState(), wood, mockedTeam02Context, 86_400);
  assert.ok(decayed.integrity <= 1 && decayed.integrity >= 0);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  createWorldSeed,
  createInitialWorldState,
  tick,
  tickN,
  RngStreamRegistry,
  worldSeedToRngRoot,
  serializeWorldState,
  deserializeWorldState,
  computeStateHash,
  validateWorldState,
  createBiologySubsystem,
  createEmptyBiologyModuleState,
  seedPopulation,
  readBiologyModuleState,
  BiologyModuleState,
} from "../../index";
import type { WorldState } from "../../index";
import { DEMO_SPECIES, DEMO_ASEXUAL_SPECIES } from "./fixtures";

function seededInitialState(seedValue: string, species = DEMO_SPECIES, populationSize = 20): WorldState {
  const seed = createWorldSeed({ seed: seedValue, createdAt: "2024-01-01T00:00:00.000Z" });
  const initial = createInitialWorldState(seed);
  const registry = RngStreamRegistry.fromState(worldSeedToRngRoot(seed), initial.rng);
  const biology = seedPopulation(
    createEmptyBiologyModuleState(),
    species,
    populationSize,
    0,
    registry.fork(`biology/${species.speciesId}/seed`),
  );
  return { ...initial, modules: { ...initial.modules, biology }, rng: registry.serialize() };
}

test("full replay determinism: same seed + same species registry + same tick count -> identical state hash", () => {
  const context = { subsystems: [createBiologySubsystem({ [DEMO_SPECIES.speciesId]: DEMO_SPECIES })] };
  const stateA = seededInitialState("bio-replay");
  const stateB = seededInitialState("bio-replay");

  const finalA = tickN(stateA, 40, context);
  const finalB = tickN(stateB, 40, context);

  assert.equal(computeStateHash(finalA), computeStateHash(finalB));
});

test("serialization round-trip: a WorldState with live biology data survives serialize -> deserialize unchanged", () => {
  const context = { subsystems: [createBiologySubsystem({ [DEMO_SPECIES.speciesId]: DEMO_SPECIES })] };
  const state = tickN(seededInitialState("bio-serialize"), 15, context);

  const json = serializeWorldState(state);
  const restored = deserializeWorldState(json);
  assert.deepEqual(restored, state);
  assert.doesNotThrow(() => validateWorldState(restored));

  const biology = readBiologyModuleState(restored.modules) as BiologyModuleState;
  assert.ok(Object.keys(biology.entities).length > 0, "expected some biology entities after ticking");
});

test("tickN(state, N) with the biology subsystem equals calling tick() N times manually (frame-chunking independence)", () => {
  const context = { subsystems: [createBiologySubsystem({ [DEMO_SPECIES.speciesId]: DEMO_SPECIES })] };
  const initial = seededInitialState("bio-chunking");

  let manual = initial;
  for (let i = 0; i < 12; i++) manual = tick(manual, context);
  const bulk = tickN(initial, 12, context);

  assert.equal(computeStateHash(manual), computeStateHash(bulk));
});

test("RNG isolation: one species' population evolution is unaffected by whether a second, independent species is also being simulated", () => {
  const registryBoth = { [DEMO_SPECIES.speciesId]: DEMO_SPECIES, [DEMO_ASEXUAL_SPECIES.speciesId]: DEMO_ASEXUAL_SPECIES };
  const registrySingle = { [DEMO_SPECIES.speciesId]: DEMO_SPECIES };

  const seed = createWorldSeed({ seed: "bio-isolation", createdAt: "2024-01-01T00:00:00.000Z" });
  const initial = createInitialWorldState(seed);
  const registry = RngStreamRegistry.fromState(worldSeedToRngRoot(seed), initial.rng);
  let biology = seedPopulation(createEmptyBiologyModuleState(), DEMO_SPECIES, 15, 0, registry.fork(`biology/${DEMO_SPECIES.speciesId}/seed`));
  biology = seedPopulation(biology, DEMO_ASEXUAL_SPECIES, 15, 0, registry.fork(`biology/${DEMO_ASEXUAL_SPECIES.speciesId}/seed`));
  const stateWithBoth: WorldState = { ...initial, modules: { ...initial.modules, biology }, rng: registry.serialize() };

  const initialSingle = createInitialWorldState(seed);
  const registrySingleRng = RngStreamRegistry.fromState(worldSeedToRngRoot(seed), initialSingle.rng);
  const biologySingle = seedPopulation(
    createEmptyBiologyModuleState(),
    DEMO_SPECIES,
    15,
    0,
    registrySingleRng.fork(`biology/${DEMO_SPECIES.speciesId}/seed`),
  );
  const stateSingle: WorldState = {
    ...initialSingle,
    modules: { ...initialSingle.modules, biology: biologySingle },
    rng: registrySingleRng.serialize(),
  };

  const finalBoth = tickN(stateWithBoth, 25, { subsystems: [createBiologySubsystem(registryBoth)] });
  const finalSingle = tickN(stateSingle, 25, { subsystems: [createBiologySubsystem(registrySingle)] });

  const bothDemoEntities = Object.values(readBiologyModuleState(finalBoth.modules).entities).filter(
    (e) => e.speciesId === DEMO_SPECIES.speciesId,
  );
  const singleDemoEntities = Object.values(readBiologyModuleState(finalSingle.modules).entities).filter(
    (e) => e.speciesId === DEMO_SPECIES.speciesId,
  );

  assert.deepEqual(
    bothDemoEntities.map((e) => ({ id: e.id, genomeId: e.genomeId, lifeStage: e.lifeStage })).sort((a, b) => a.id.localeCompare(b.id)),
    singleDemoEntities.map((e) => ({ id: e.id, genomeId: e.genomeId, lifeStage: e.lifeStage })).sort((a, b) => a.id.localeCompare(b.id)),
  );
});

test("execution-order independence: the species registry's key insertion order does not change any individual species' outcome", () => {
  const orderA = { [DEMO_SPECIES.speciesId]: DEMO_SPECIES, [DEMO_ASEXUAL_SPECIES.speciesId]: DEMO_ASEXUAL_SPECIES };
  const orderB = { [DEMO_ASEXUAL_SPECIES.speciesId]: DEMO_ASEXUAL_SPECIES, [DEMO_SPECIES.speciesId]: DEMO_SPECIES };

  const seed = createWorldSeed({ seed: "bio-order-independence", createdAt: "2024-01-01T00:00:00.000Z" });

  function build(): WorldState {
    const initial = createInitialWorldState(seed);
    const registry = RngStreamRegistry.fromState(worldSeedToRngRoot(seed), initial.rng);
    let biology = seedPopulation(createEmptyBiologyModuleState(), DEMO_SPECIES, 10, 0, registry.fork(`biology/${DEMO_SPECIES.speciesId}/seed`));
    biology = seedPopulation(biology, DEMO_ASEXUAL_SPECIES, 10, 0, registry.fork(`biology/${DEMO_ASEXUAL_SPECIES.speciesId}/seed`));
    return { ...initial, modules: { ...initial.modules, biology }, rng: registry.serialize() };
  }

  const finalA = tickN(build(), 15, { subsystems: [createBiologySubsystem(orderA)] });
  const finalB = tickN(build(), 15, { subsystems: [createBiologySubsystem(orderB)] });

  assert.equal(computeStateHash(finalA), computeStateHash(finalB));
});

test("Team 01 compatibility: the biology subsystem plugs into the unmodified Foundation tick()/tickN() pipeline", () => {
  const context = { subsystems: [createBiologySubsystem({ [DEMO_SPECIES.speciesId]: DEMO_SPECIES })] };
  const initial = seededInitialState("bio-team01-compat");
  const result = tick(initial, context);
  assert.equal(result.tick, initial.tick + 1);
  assert.doesNotThrow(() => validateWorldState(result));
});

// --- Import-boundary isolation (mirrors src/sim/test/isolation.test.ts, extended to src/sim/biology) ---

const FORBIDDEN_IMPORT_SPECIFIERS = ["drizzle-orm", '"pg"', "'pg'", "@/db", "next/", '"next"', "'next'", "react", "react-dom", "three"];

const PROJECT_ROOT = process.cwd();
const BIOLOGY_DIR = path.join(PROJECT_ROOT, "src", "sim", "biology");

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

test("src/sim/biology never imports a database driver, ORM, web framework, UI library, or rendering library", () => {
  const files = collectTsFiles(BIOLOGY_DIR);
  assert.ok(files.length > 0, "expected to find files under src/sim/biology");

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

test("src/sim/biology only reaches into Team 01 via src/sim/core/** (no reaching into src/sim/persistence or app code)", () => {
  const files = collectTsFiles(BIOLOGY_DIR);
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const line of importOrRequireLines(content)) {
      assert.ok(!line.includes("src/app"), `${path.relative(PROJECT_ROOT, file)} imports app code: ${line.trim()}`);
      assert.ok(!line.includes("src/db"), `${path.relative(PROJECT_ROOT, file)} imports db code: ${line.trim()}`);
    }
  }
});

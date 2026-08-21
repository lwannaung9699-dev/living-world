import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  createWorldSeed,
  createInitialWorldState,
  tick,
  tickN,
  canonicalStringify,
  computeStateHash,
} from "../index";
import { createSocietyTick, societyTick } from "../society/tick";
import { updateSettlements } from "../society/settlement";
import { readSocietyState, writeSocietyState, createInitialSocietyState, validateSocietyState } from "../society/state";
import { defaultSocietyAdapters } from "../society/contracts";

const PROJECT_ROOT = process.cwd();
const SOCIETY_DIR = path.join(PROJECT_ROOT, "src", "sim", "society");

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) collectTsFiles(full, out);
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

const FORBIDDEN_IMPORT_SPECIFIERS = ["drizzle-orm", '"pg"', "'pg'", "@/db", "next/", '"next"', "'next'", "react", "react-dom", "three"];

test("28. import isolation: src/sim/society never imports a database driver, ORM, web framework, UI library, or rendering library", () => {
  const files = collectTsFiles(SOCIETY_DIR);
  assert.ok(files.length > 0, "expected to find files under src/sim/society");
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const importLines = content.split("\n").filter((l: string) => /^\s*import\b/.test(l) || /\brequire\(/.test(l));
    for (const line of importLines) {
      for (const forbidden of FORBIDDEN_IMPORT_SPECIFIERS) {
        assert.ok(
          !line.includes(forbidden),
          `${path.relative(PROJECT_ROOT, file)} imports forbidden specifier "${forbidden}" in line: ${line.trim()}`,
        );
      }
    }
  }
});

test("28b. import isolation: src/sim/society never reaches into Team 02/03/04/05/06's internal module paths, only their public contracts via adapters", () => {
  const files = collectTsFiles(SOCIETY_DIR);
  const forbiddenTeamPaths = ["/worldgen/", "/materials/", "/objects/", "/biology/", "/ecology/", "/npc/"];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const line of content.split("\n").filter((l: string) => /^\s*import\b/.test(l))) {
      for (const forbidden of forbiddenTeamPaths) {
        assert.ok(
          !line.includes(forbidden),
          `${path.relative(PROJECT_ROOT, file)} imports directly from another team's internal module path "${forbidden}" instead of going through an adapter: ${line.trim()}`,
        );
      }
    }
  }
});

test("29. Team 01 integration: societyTick is a valid SubsystemTickFn, composes cleanly into tick()/tickN(), and only ever touches modules.society", () => {
  const seed = createWorldSeed({ seed: "team01-integration" });
  let state = createInitialWorldState(seed);
  state = { ...state, modules: { ...state.modules, creature: { creatures: {} }, biology: { kinshipFacts: [] }, ecology: { locationResources: [] } } };

  const before = JSON.parse(canonicalStringify(state.modules)) as Record<string, unknown>;
  const after = tickN(state, 5, { subsystems: [societyTick] });

  assert.equal(after.tick, 5);
  assert.ok("society" in after.modules);
  validateSocietyState(after.modules["society"]);
  // Every other module Team 07 didn't own going in is untouched.
  for (const key of Object.keys(before)) {
    assert.deepEqual(
      JSON.parse(canonicalStringify((after.modules as Record<string, unknown>)[key])),
      before[key],
    );
  }
});

test("29b. Team 01 integration: readSocietyState/writeSocietyState round-trip through modules.society without corrupting the rest of WorldState", () => {
  const seed = createWorldSeed({ seed: "roundtrip" });
  const state = createInitialWorldState(seed);
  const society = createInitialSocietyState();
  const withSociety = writeSocietyState(state, society);
  assert.deepEqual(readSocietyState(withSociety), society);
  assert.equal(withSociety.tick, state.tick);
  assert.equal(withSociety.seed.seed, state.seed.seed);
});

test("30. Team 06 integration: societyTick reads individuals only through the NpcAdapter contract, and runs as a safe no-op when Team 06's module is absent", () => {
  const seed = createWorldSeed({ seed: "no-npc-module" });
  const state = createInitialWorldState(seed); // deliberately no modules.creature at all
  const after = tick(state, { subsystems: [societyTick] });
  const society = readSocietyState(after);
  assert.equal(Object.keys(society.groups).length, 0);
  assert.equal(Object.keys(society.relationships).length, 0);
});

test("30c. Team 06 integration (real wiring): defaultNpcAdapter reads real state.modules.creature.creatures, not the old placeholder state.modules.npc.individuals", () => {
  const seed = createWorldSeed({ seed: "real-creature-wiring" });
  let state = createInitialWorldState(seed);
  // Shaped like Team 06's real CreatureModuleState / CreatureState (duck-typed fields only — no static import of Team 06 types, matching adapter isolation).
  state = {
    ...state,
    modules: {
      ...state.modules,
      creature: {
        creatures: {
          c1: { creatureId: "c1", position: { x: 1, y: 1 }, personality: { sociability: 0.9, aggression: 0.1, riskTolerance: 0.5, independence: 0.5, boldness: 0.5, patience: 0.5, territoriality: 0.5 } },
          c2: { creatureId: "c2", position: { x: 2, y: 2 }, personality: { sociability: 0.9, aggression: 0.1, riskTolerance: 0.5, independence: 0.5, boldness: 0.5, patience: 0.5, territoriality: 0.5 } },
        },
      },
      // Old placeholder key left populated on purpose, to prove the adapter no longer reads it.
      npc: { individuals: [{ id: "should-be-ignored", alive: true, locationId: "loc", traits: { sociability: 1, aggression: 0, ambition: 1, empathy: 1 } }] },
    },
  };

  assert.deepEqual(
    defaultSocietyAdapters.npc.listIndividuals(state).map((i) => i.id).sort(),
    ["c1", "c2"],
    "expected the real Team 06 creature ids, not the ignored legacy npc.individuals entry",
  );

  const after = tickN(state, 30, { subsystems: [societyTick] });
  const society = readSocietyState(after);
  // c1/c2 are close together (same 20-unit grid cell) and highly sociable/non-aggressive — over 30 ticks they should form a real relationship/group keyed by their real creatureIds.
  const allMemberIds = Object.values(society.groups).flatMap((g) => g.memberIds);
  assert.ok(
    Object.keys(society.relationships).length > 0 || allMemberIds.length > 0,
    "expected real creature ids c1/c2 to show up in relationships or group membership after 30 ticks",
  );
  for (const id of allMemberIds) {
    assert.ok(id === "c1" || id === "c2", `expected only real creatureIds in group membership, got "${id}"`);
  }
});

test("30b. Team 06 integration: a custom NpcAdapter can be supplied (e.g. from a future Team 06 real module) via createSocietyTick", () => {
  const customAdapter = {
    ...defaultSocietyAdapters,
    npc: {
      listIndividuals: () => [
        { id: "z1", alive: true, locationId: "loc", traits: { sociability: 0.8, aggression: 0.2, ambition: 0.6, empathy: 0.7 } },
        { id: "z2", alive: true, locationId: "loc", traits: { sociability: 0.8, aggression: 0.2, ambition: 0.6, empathy: 0.7 } },
      ],
    },
  };
  const customTick = createSocietyTick({ adapters: customAdapter });
  const seed = createWorldSeed({ seed: "custom-adapter" });
  const state = createInitialWorldState(seed);
  const after = tickN(state, 30, { subsystems: [customTick] });
  const society = readSocietyState(after);
  // With sustained positive interaction, z1/z2 should end up in a mutually-formed group at some point across 30 ticks.
  assert.ok(Object.keys(society.relationships).length > 0);
});

test("25. deterministic replay: identical seed + identical tick count reproduces an identical society state and hash", () => {
  const seed = createWorldSeed({ seed: "replay-check" });
  // Real Team 06 CreatureState shape (duck-typed), all within the same 20-unit grid cell so they resolve to one locationId.
  const creatures = {
    p1: { creatureId: "p1", position: { x: 3, y: 3 }, personality: { sociability: 0.7, aggression: 0.4, riskTolerance: 0.5, independence: 0.5, boldness: 0.5, patience: 0.5, territoriality: 0.4 } },
    p2: { creatureId: "p2", position: { x: 4, y: 4 }, personality: { sociability: 0.6, aggression: 0.5, riskTolerance: 0.4, independence: 0.5, boldness: 0.5, patience: 0.5, territoriality: 0.4 } },
    p3: { creatureId: "p3", position: { x: 5, y: 5 }, personality: { sociability: 0.5, aggression: 0.6, riskTolerance: 0.6, independence: 0.4, boldness: 0.5, patience: 0.4, territoriality: 0.5 } },
  };
  function run(): unknown {
    let state = createInitialWorldState(seed);
    state = { ...state, modules: { ...state.modules, creature: { creatures }, biology: { kinshipFacts: [] }, ecology: { locationResources: [{ locationId: "cell:0,0", abundance: 0.5 }] } } };
    return tickN(state, 40, { subsystems: [societyTick] });
  }
  const runA = run();
  const runB = run();
  assert.equal(canonicalStringify(runA), canonicalStringify(runB));
  assert.equal(computeStateHash(runA as never), computeStateHash(runB as never));
});

test("26. execution-order independence: subsystem outcome does not depend on Record/array insertion order, only on sorted-key iteration", () => {
  let society = createInitialSocietyState();
  // Build the same set of groups/relationships in two different insertion orders.
  const societyOrderA = {
    ...society,
    groups: {
      "group-b": { groupId: "group-b", memberIds: ["y1"], founderIds: ["y1"], leaderIds: [], sharedGoals: [], territory: {}, resources: { pooled: 0, economicStockTotal: 0 }, customs: [], normIds: [], identitySymbolIds: [], foundedTick: 0, tension: 0, parentGroupId: null, active: true },
      "group-a": { groupId: "group-a", memberIds: ["x1"], founderIds: ["x1"], leaderIds: [], sharedGoals: [], territory: {}, resources: { pooled: 0, economicStockTotal: 0 }, customs: [], normIds: [], identitySymbolIds: [], foundedTick: 0, tension: 0, parentGroupId: null, active: true },
    },
  };
  const societyOrderB = {
    ...society,
    groups: {
      "group-a": societyOrderA.groups["group-a"],
      "group-b": societyOrderA.groups["group-b"],
    },
  };
  const individuals = [
    { id: "x1", alive: true, locationId: "loc", traits: { sociability: 0.5, aggression: 0.5, ambition: 0.5, empathy: 0.5 } },
    { id: "y1", alive: true, locationId: "loc", traits: { sociability: 0.5, aggression: 0.5, ambition: 0.5, empathy: 0.5 } },
  ];
  const resultA = updateSettlements(societyOrderA, individuals, 10);
  const resultB = updateSettlements(societyOrderB, individuals, 10);
  // Normalize both to canonical form (sorted keys) before comparing — insertion order must not leak into the result.
  assert.equal(canonicalStringify(resultA), canonicalStringify(resultB));
});

test("27. serialization: SocietyState round-trips through canonicalStringify/JSON.parse with full fidelity", () => {
  let society = createInitialSocietyState();
  society = {
    ...society,
    nextIdCounter: 7,
    groups: {
      "group-0": {
        groupId: "group-0",
        memberIds: ["a", "b"],
        founderIds: ["a", "b"],
        leaderIds: ["a"],
        sharedGoals: ["survive"],
        territory: { home: 0.6 },
        resources: { pooled: 3.5, economicStockTotal: 0 },
        customs: ["greet-elders"],
        normIds: [],
        identitySymbolIds: [],
        foundedTick: 3,
        tension: 0.1,
        parentGroupId: null,
        active: true,
      },
    },
  };
  const roundTripped = JSON.parse(canonicalStringify(society));
  validateSocietyState(roundTripped);
  assert.deepEqual(roundTripped, JSON.parse(JSON.stringify(society)));
});

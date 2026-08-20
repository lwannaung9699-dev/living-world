import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultSimulationPipeline,
  createInitialWorldState,
  createWorldSeed,
  computeStateHash,
  tickN,
} from "../../index";
import {
  CREATURE_MODULE_KEY,
  CreatureModuleState,
  upsertCreature,
} from "../../creature/tick/creatureTick";
import { createInitialCreatureState } from "../../creature/state/creatureState";
import { generatePersonality } from "../../creature/personality/personality";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { SOCIETY_MODULE_KEY, SocietyState } from "../../society/state";

test("createDefaultSimulationPipeline attaches all implemented Team 04–08 module slices", () => {
  const seed = createWorldSeed({ seed: "default-pipeline-modules" });
  const result = tickN(createInitialWorldState(seed), 3, createDefaultSimulationPipeline());

  assert.equal(result.tick, 3);
  assert.ok(result.modules.biology, "Team 04 biology module should be attached");
  assert.ok(result.modules.ecology, "Team 05 ecology module should be attached");
  assert.ok(result.modules.creature, "Team 06 creature module should be attached");
  assert.ok(result.modules.society, "Team 07 society module should be attached");
  assert.ok(result.modules.politics, "Team 08 politics module should be attached");
});

test("createDefaultSimulationPipeline is deterministic for the same seed and configuration", () => {
  const seedA = createWorldSeed({ seed: "default-pipeline-determinism" });
  const seedB = createWorldSeed({ seed: "default-pipeline-determinism" });
  const resultA = tickN(createInitialWorldState(seedA), 8, createDefaultSimulationPipeline());
  const resultB = tickN(createInitialWorldState(seedB), 8, createDefaultSimulationPipeline());

  assert.equal(computeStateHash(resultA), computeStateHash(resultB));
});

test("Team 06↔07 wiring: every SocialGroup.memberIds entry is a real Team 06 creatureId", () => {
  const seed = createWorldSeed({ seed: "default-pipeline-member-id-linkage" });
  let state = createInitialWorldState(seed);

  // Colocate a small population so trust between them can plausibly cross
  // formGroupsFromTrustClusters' join threshold within a bounded number of
  // ticks (empirically ~50 ticks for 8 colocated individuals with this seed).
  for (let i = 0; i < 8; i++) {
    const personality = generatePersonality(DeterministicRng.fromSeed(`member-linkage-p${i}`, i));
    state = upsertCreature(
      state,
      createInitialCreatureState({
        creatureId: `member-linkage-creature-${i}`,
        speciesId: "human",
        position: { x: 0, y: 0 },
        personality,
      }),
    );
  }

  const result = tickN(state, 80, createDefaultSimulationPipeline());

  const creatureModule = result.modules[CREATURE_MODULE_KEY] as CreatureModuleState | undefined;
  const societyModule = result.modules[SOCIETY_MODULE_KEY] as SocietyState | undefined;
  assert.ok(creatureModule, "Team 06 creature module should be attached");
  assert.ok(societyModule, "Team 07 society module should be attached");

  const realCreatureIds = new Set(Object.keys(creatureModule!.creatures));
  const groups = Object.values(societyModule!.groups);

  // Guard against a vacuously-true assertion: make sure this run actually
  // produced at least one group with members, so the subset check below is
  // exercising real data rather than passing on empty collections.
  const groupsWithMembers = groups.filter((group) => group.memberIds.length > 0);
  assert.ok(groupsWithMembers.length > 0, "expected at least one social group with members after 15 ticks");

  for (const group of groupsWithMembers) {
    for (const memberId of group.memberIds) {
      assert.ok(
        realCreatureIds.has(memberId),
        `SocialGroup member id "${memberId}" should be a real CreatureModuleState.creatures key`,
      );
    }
  }
});

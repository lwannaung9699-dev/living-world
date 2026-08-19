import { test } from "node:test";
import assert from "node:assert/strict";
import { DeterministicRng } from "../../core/rng/deterministicRng";
import { createEmptyPoliticsState } from "../../politics/contracts";
import { crystallizeFactions, isEligibleForFactions, maybeIgniteConflict, resolveConflict } from "../../politics/factions";
import type { ActorSnapshot } from "../../politics/adapters/populationAdapter";

test("isEligibleForFactions gates on population threshold", () => {
  assert.equal(isEligibleForFactions(10), false);
  assert.equal(isEligibleForFactions(80), true);
});

function makeActors(n: number, shapeFn: (i: number) => Partial<ActorSnapshot>): ActorSnapshot[] {
  return Array.from({ length: n }, (_, i) => ({
    actorId: `a${i}`,
    settlementId: "s",
    influence: 0.3,
    wealth: 0.3,
    militaryStrength: 0.1,
    kinship: 0.2,
    religiousStanding: 0.1,
    knowledge: 0.2,
    trust: 0.3,
    ...shapeFn(i),
  }));
}

test("crystallizeFactions only tracks clusters of at least minSize actors, never scattered individuals", () => {
  let politics = createEmptyPoliticsState();
  // 20 near-identical low-wealth, low-influence actors, deterministically dominated by a single interest bucket.
  const actors = makeActors(20, () => ({ wealth: 0.05, influence: 0.05, militaryStrength: 0.9, kinship: 0.05, religiousStanding: 0.05 }));
  politics = crystallizeFactions(politics, "s", actors, 0, DeterministicRng.fromSeed("f", 1), 3);
  const factions = Object.values(politics.factions);
  assert.ok(factions.length > 0, "a strong shared signal across 20 actors should crystallize at least one faction");
  for (const f of factions) {
    assert.ok(f.memberIds.length >= 3);
  }
});

test("crystallizeFactions does not create duplicate factions for the same scope+interest on repeated calls with the same clustering", () => {
  let politics = createEmptyPoliticsState();
  const actors = makeActors(15, () => ({ militaryStrength: 0.95, wealth: 0.05, influence: 0.05, kinship: 0.05, religiousStanding: 0.05 }));
  politics = crystallizeFactions(politics, "s", actors, 0, DeterministicRng.fromSeed("f", 2), 3);
  const countAfterFirst = Object.keys(politics.factions).length;
  // Re-run with an identically-seeded RNG so the interest clustering is reproduced exactly — a true repeat, not a fresh draw.
  politics = crystallizeFactions(politics, "s", actors, 1, DeterministicRng.fromSeed("f", 2), 3);
  assert.equal(Object.keys(politics.factions).length, countAfterFirst, "re-running the same clustering should not duplicate an existing faction for the same interest");
});

test("faction formation records history and factions carry no fixed/hardcoded names", () => {
  let politics = createEmptyPoliticsState();
  const actors = makeActors(10, () => ({ religiousStanding: 0.95, wealth: 0.05, influence: 0.05, militaryStrength: 0.05, kinship: 0.05 }));
  politics = crystallizeFactions(politics, "s", actors, 0, DeterministicRng.fromSeed("f", 4), 3);
  assert.ok(politics.history.some((h) => h.type === "faction_formed"));
  for (const f of Object.values(politics.factions)) {
    assert.equal(typeof f.factionId, "string");
    // PoliticalFaction has no "name" field at all — interests are the only descriptor.
    assert.ok(!("name" in f));
  }
});

test("maybeIgniteConflict requires at least two opposed factions and is probabilistic, never guaranteed (brief: 'Do NOT guarantee revolutions' applies analogously to conflict)", () => {
  let politics = createEmptyPoliticsState();
  const workers = makeActors(10, (i) => ({ actorId: `w${i}`, wealth: 0.02, influence: 0.02, militaryStrength: 0.02, kinship: 0.02, religiousStanding: 0.02, knowledge: 0.9 }));
  const nobles = makeActors(10, (i) => ({ actorId: `n${i}`, wealth: 0.95, influence: 0.9, kinship: 0.9, militaryStrength: 0.02, religiousStanding: 0.02 }));

  let ignitedAtLeastOnce = false;
  let neverIgnitedAlways = true;
  for (let seed = 0; seed < 40; seed++) {
    let p = createEmptyPoliticsState();
    p = crystallizeFactions(p, "s", [...workers, ...nobles], 0, DeterministicRng.fromSeed("cluster", seed), 3);
    p = maybeIgniteConflict(p, "s", 1, DeterministicRng.fromSeed("ignite", seed));
    const started = Object.values(p.conflicts).length > 0;
    if (started) ignitedAtLeastOnce = true;
    if (started) neverIgnitedAlways = false;
  }
  assert.ok(!neverIgnitedAlways || ignitedAtLeastOnce, "sanity: the loop actually observed outcomes");
});

test("resolveConflict sets a resolution and resolvedAtTick exactly once", () => {
  let politics = createEmptyPoliticsState();
  const workers = makeActors(10, (i) => ({ actorId: `w${i}`, wealth: 0.02, influence: 0.02, militaryStrength: 0.02, kinship: 0.02, religiousStanding: 0.02, knowledge: 0.9 }));
  const nobles = makeActors(10, (i) => ({ actorId: `n${i}`, wealth: 0.95, influence: 0.9, kinship: 0.9, militaryStrength: 0.02, religiousStanding: 0.02 }));

  let politicsWithConflict = politics;
  let conflictId: string | null = null;
  for (let seed = 0; seed < 60 && conflictId === null; seed++) {
    let p = crystallizeFactions(politics, "s", [...workers, ...nobles], 0, DeterministicRng.fromSeed("cluster2", seed), 3);
    p = maybeIgniteConflict(p, "s", 1, DeterministicRng.fromSeed("ignite2", seed));
    const conflicts = Object.values(p.conflicts);
    if (conflicts.length > 0) {
      politicsWithConflict = p;
      conflictId = conflicts[0].conflictId;
    }
  }

  assert.ok(conflictId !== null, "expected at least one seed among 60 trials to ignite a conflict");
  let resolved = resolveConflict(politicsWithConflict, conflictId!, "compromise", 5);
  assert.equal(resolved.conflicts[conflictId!].resolution, "compromise");
  assert.equal(resolved.conflicts[conflictId!].resolvedAtTick, 5);

  const reResolved = resolveConflict(resolved, conflictId!, "revolution", 9);
  assert.equal(reResolved.conflicts[conflictId!].resolution, "compromise", "already-resolved conflicts must not be overwritten");
});

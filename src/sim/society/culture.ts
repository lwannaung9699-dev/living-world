/**
 * Culture foundation (spec §17), cultural transmission (§18), collective
 * memory (§19), story/myth foundation (§20), language foundation (§21),
 * and symbols (§22).
 *
 * No fixed mythology or vocabulary is generated. Stories only exist as a
 * transformation of a group's own CollectiveMemory entries over time;
 * symbols and concept-tokens only exist once a group's own history creates
 * a reason for them (a settlement, a norm, a conflict). The set of
 * "concept categories" below (danger/food/etc.) is a controlled vocabulary
 * Team 07 recognizes as socially relevant — it is not a language, and each
 * group generates its own arbitrary token per concept independently, so
 * two groups will not converge on the same "word" for the same idea.
 */

import { DeterministicRng } from "../core/rng/deterministicRng";
import { IndividualSnapshot } from "./contracts";
import { CollectiveMemoryEvent, Story, CulturalSymbol, SymbolMeaning, LanguageConcept } from "./types";
import { SocietyState, sortedEntries } from "./state";
import { getRelationship } from "./relationships";
import { nextId } from "./id";

/* ---------------------------- collective memory --------------------------- */

export function recordCollectiveMemory(
  society: SocietyState,
  groupId: string,
  event: string,
  importance: number,
  participantIds: readonly string[],
  locationId: string,
  tick: number,
  interpretation: string,
): SocietyState {
  const { id: memoryId, state: withCounter } = nextId(society, "memory");
  const memory: CollectiveMemoryEvent = {
    memoryId,
    groupId,
    event,
    importance: Math.max(0, Math.min(1, importance)),
    participantIds,
    locationId,
    tick,
    interpretation,
  };
  return { ...withCounter, collectiveMemories: { ...withCounter.collectiveMemories, [memoryId]: memory } };
}

/* ------------------------------ cultural transmission ------------------------------ */

const TRANSMISSION_BASE_CHANCE = 0.15;

/**
 * Existing customs held by any member of a group may spread to other
 * members. Probability depends on the source's prestige (leadership),
 * the pair's trust, and frequency of contact (approximated by whether they
 * are in the same group at all, since Team 07 doesn't track per-tick
 * contact frequency beyond that without Team 06 event data).
 */
export function transmitCulture(
  society: SocietyState,
  individuals: readonly IndividualSnapshot[],
  rng: DeterministicRng,
): SocietyState {
  let groups = society.groups;
  void individuals; // reserved for future per-individual adoption once Team 06 exposes a personal trait ledger

  // Individual-level custom adoption would live on each NPC's own trait ledger, which is
  // Team 06's scope, not Team 07's WorldState. Team 07 instead represents transmission at
  // group granularity: when members of two different groups interact with high trust, a
  // custom known to one group has a chance to spread to the other — an emergent,
  // measurable transmission event driven by trust/prestige, matching spec §18.
  const groupIds = Object.keys(groups).sort();
  for (let i = 0; i < groupIds.length; i++) {
    for (let j = i + 1; j < groupIds.length; j++) {
      const a = groups[groupIds[i]];
      const b = groups[groupIds[j]];
      if (!a.active || !b.active) continue;

      let bestTrust = -Infinity;
      let bestPair: [string, string] | null = null;
      for (const memberA of a.memberIds) {
        for (const memberB of b.memberIds) {
          const rel = getRelationship(society, memberA, memberB);
          if (rel && rel.trust > bestTrust) {
            bestTrust = rel.trust;
            bestPair = [memberA, memberB];
          }
        }
      }
      if (!bestPair || bestTrust <= 0.1) continue;

      const prestigeA = a.leaderIds.length > 0 ? 0.2 : 0;
      const prestigeB = b.leaderIds.length > 0 ? 0.2 : 0;
      const chance = Math.min(0.9, TRANSMISSION_BASE_CHANCE + bestTrust * 0.3);

      for (const custom of a.customs) {
        if (b.customs.includes(custom)) continue;
        if (rng.boolean(chance + prestigeA)) {
          groups = { ...groups, [groupIds[j]]: { ...groups[groupIds[j]], customs: [...groups[groupIds[j]].customs, custom] } };
        }
      }
      for (const custom of b.customs) {
        if (groups[groupIds[i]].customs.includes(custom)) continue;
        if (rng.boolean(chance + prestigeB)) {
          groups = { ...groups, [groupIds[i]]: { ...groups[groupIds[i]], customs: [...groups[groupIds[i]].customs, custom] } };
        }
      }
    }
  }

  return { ...society, groups };
}

/* -------------------------------- story / myth -------------------------------- */

const STORY_PROMOTION_IMPORTANCE = 0.5;
const STORY_PROMOTION_AGE_TICKS = 50;
const MYTH_RETELLING_THRESHOLD = 5;

/** Promotes sufficiently important, sufficiently old collective memories into stories, and ages existing stories toward myth status through retelling. */
export function updateStoriesAndMyths(society: SocietyState, tick: number, rng: DeterministicRng): SocietyState {
  let current = society;

  for (const [memoryId, memory] of sortedEntries(current.collectiveMemories)) {
    if (memory.importance < STORY_PROMOTION_IMPORTANCE) continue;
    if (tick - memory.tick < STORY_PROMOTION_AGE_TICKS) continue;
    const alreadyStory = Object.values(current.stories).some((s) => s.sourceMemoryId === memoryId);
    if (alreadyStory) continue;

    const { id: storyId, state: withCounter } = nextId(current, "story");
    const story: Story = {
      storyId,
      groupId: memory.groupId,
      sourceMemoryId: memoryId,
      retellingCount: 0,
      symbolism: [],
      createdTick: tick,
      lastRetoldTick: tick,
      isMyth: false,
    };
    current = { ...withCounter, stories: { ...withCounter.stories, [storyId]: story } };
  }

  for (const [storyId, story] of sortedEntries(current.stories)) {
    if (tick - story.lastRetoldTick < 25) continue;
    if (!rng.boolean(0.3)) continue;

    const retellingCount = story.retellingCount + 1;
    const symbolism =
      retellingCount >= MYTH_RETELLING_THRESHOLD && story.symbolism.length === 0
        ? [...story.symbolism, `symbolic-${storyId}`]
        : story.symbolism;

    current = {
      ...current,
      stories: {
        ...current.stories,
        [storyId]: {
          ...story,
          retellingCount,
          symbolism,
          lastRetoldTick: tick,
          isMyth: retellingCount >= MYTH_RETELLING_THRESHOLD,
        },
      },
    };
  }

  return current;
}

/* ---------------------------------- symbols ---------------------------------- */

/** Milestone -> symbol meaning triggers. Each is only checked once per group (a group doesn't regenerate the same symbol meaning twice). */
export function developSymbols(society: SocietyState, tick: number): SocietyState {
  let current = society;

  for (const [groupId, group] of sortedEntries(current.groups)) {
    if (!group.active) continue;
    const existingMeanings = new Set(
      group.identitySymbolIds.map((id) => current.symbols[id]?.meaning).filter((m): m is SymbolMeaning => !!m),
    );

    const wants: SymbolMeaning[] = [];
    if (!existingMeanings.has("group_identity") && group.memberIds.length >= 3) wants.push("group_identity");
    if (!existingMeanings.has("territory") && Object.keys(group.territory).length > 0) wants.push("territory");
    if (!existingMeanings.has("authority") && group.leaderIds.length > 0) wants.push("authority");

    for (const meaning of wants) {
      const { id: symbolId, state: withCounter } = nextId(current, "symbol");
      const symbol: CulturalSymbol = {
        symbolId,
        groupId,
        meaning,
        token: `${groupId}-${meaning}-${symbolId}`,
        createdTick: tick,
      };
      current = {
        ...withCounter,
        symbols: { ...withCounter.symbols, [symbolId]: symbol },
        groups: {
          ...withCounter.groups,
          [groupId]: { ...withCounter.groups[groupId], identitySymbolIds: [...withCounter.groups[groupId].identitySymbolIds, symbolId] },
        },
      };
    }
  }

  return current;
}

/* --------------------------------- language foundation --------------------------------- */

const CONCEPT_VOCABULARY = ["danger", "food", "leader", "territory", "trade", "ally", "enemy", "home"] as const;

/** Groups develop symbolic tokens for concepts once they have social reason to (e.g. "leader" once they have a leader, "territory" once they hold land). Each group's token is independently generated — no shared vocabulary across groups. */
export function developLanguageConcepts(society: SocietyState, tick: number): SocietyState {
  let current = society;

  for (const [groupId, group] of sortedEntries(current.groups)) {
    if (!group.active) continue;
    const known = new Set(
      Object.values(current.concepts)
        .filter((c) => c.groupId === groupId)
        .map((c) => c.concept),
    );

    const relevant: string[] = [];
    if (!known.has("leader") && group.leaderIds.length > 0) relevant.push("leader");
    if (!known.has("territory") && Object.keys(group.territory).length > 0) relevant.push("territory");
    if (!known.has("food") && group.resources.pooled > 0) relevant.push("food");
    if (!known.has("trade") && Object.values(current.trades).some((t) => t.groupA === groupId || t.groupB === groupId)) {
      relevant.push("trade");
    }
    if (!known.has("danger") && group.tension > 0.3) relevant.push("danger");

    for (const concept of relevant.filter((c): c is (typeof CONCEPT_VOCABULARY)[number] => (CONCEPT_VOCABULARY as readonly string[]).includes(c))) {
      const { id: conceptId, state: withCounter } = nextId(current, "concept");
      const record: LanguageConcept = {
        conceptId,
        groupId,
        concept,
        symbolToken: `${groupId}-${concept}-${conceptId}`,
        createdTick: tick,
      };
      current = { ...withCounter, concepts: { ...withCounter.concepts, [conceptId]: record } };
    }
  }

  return current;
}

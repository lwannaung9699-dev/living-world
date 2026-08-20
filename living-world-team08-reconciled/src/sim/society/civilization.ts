/**
 * Civilization metrics (spec §31).
 *
 * Deliberately not `civilizationLevel = 10`. Every field is derived from
 * measurable SocietyState properties. Consumers (UI, later teams, tests)
 * decide for themselves what threshold or combination counts as
 * "civilization" — Team 07 only ever reports the underlying measurements.
 */

import { IndividualSnapshot } from "./contracts";
import { CivilizationMetrics } from "./types";
import { SocietyState } from "./state";

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function computeCivilizationMetrics(
  society: SocietyState,
  individuals: readonly IndividualSnapshot[],
  tick: number,
): CivilizationMetrics {
  const activeGroups = Object.values(society.groups).filter((g) => g.active);
  const livingCount = individuals.filter((i) => i.alive).length;
  const settlements = Object.values(society.settlements);
  const locationsOccupied = new Set(settlements.map((s) => s.locationId)).size;

  const populationDensity = locationsOccupied > 0 ? clamp01(livingCount / (locationsOccupied * 50)) : 0;

  const permanenceScore = (t: Settlement["settlementType"]): number =>
    ({
      temporary_camp: 0,
      seasonal_settlement: 0.15,
      hamlet: 0.35,
      village: 0.55,
      trading_post: 0.5,
      nomadic_route: 0.05,
      town: 0.75,
      fortification: 0.6,
      city: 1,
    })[t];
  const settlementPermanence =
    settlements.length > 0
      ? clamp01(settlements.reduce((sum, s) => sum + permanenceScore(s.settlementType), 0) / settlements.length)
      : 0;

  const roleCount = new Set(Object.values(society.individualRoles)).size;
  const socialComplexity = clamp01(
    (activeGroups.length > 0 ? 0.2 : 0) +
      roleCount / 13 +
      Object.keys(society.norms).length / 20 +
      Object.keys(society.institutions).length / 10,
  );

  const knowledgeDiversity = clamp01(Object.keys(society.technologies).length / 20);
  const institutionCount = Object.keys(society.institutions).length;

  const groupIds = activeGroups.map((g) => g.groupId);
  const possiblePairs = (groupIds.length * (groupIds.length - 1)) / 2;
  const tradedPairs = new Set(
    Object.values(society.trades).map((t) => (t.groupA < t.groupB ? `${t.groupA}::${t.groupB}` : `${t.groupB}::${t.groupA}`)),
  ).size;
  const tradeConnectivity = possiblePairs > 0 ? clamp01(tradedPairs / possiblePairs) : 0;

  const technologyDiversity = clamp01(Object.keys(society.technologies).length / 15);

  const infrastructure = clamp01(
    settlements.reduce((sum, s) => sum + permanenceScore(s.settlementType) * (s.population / 50), 0) / Math.max(1, activeGroups.length),
  );

  const customSets = activeGroups.map((g) => new Set(g.customs));
  let differentiationSum = 0;
  let comparisons = 0;
  for (let i = 0; i < customSets.length; i++) {
    for (let j = i + 1; j < customSets.length; j++) {
      const union = new Set([...customSets[i], ...customSets[j]]);
      const intersection = [...customSets[i]].filter((c) => customSets[j].has(c));
      const similarity = union.size > 0 ? intersection.length / union.size : 0;
      differentiationSum += 1 - similarity;
      comparisons += 1;
    }
  }
  const culturalDifferentiation = comparisons > 0 ? clamp01(differentiationSum / comparisons) : 0;

  const oldestFounding = activeGroups.reduce((min, g) => Math.min(min, g.foundedTick), tick);
  const historicalDepth = clamp01((tick - oldestFounding) / 2000) * clamp01(Object.keys(society.collectiveMemories).length / 30 + 0.3);

  return {
    populationDensity,
    settlementPermanence,
    socialComplexity,
    knowledgeDiversity,
    institutionCount,
    tradeConnectivity,
    technologyDiversity,
    infrastructure,
    culturalDifferentiation,
    historicalDepth,
  };
}

// Local type alias purely for the permanenceScore lookup table's key type.
type Settlement = SocietyState["settlements"][string];

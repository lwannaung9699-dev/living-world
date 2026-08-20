import { NeedsGrowthProfile, DEFAULT_NEEDS_GROWTH_PROFILE } from "../state/needs";
import { PersonalityRangeProfile, DEFAULT_PERSONALITY_RANGES } from "../personality/personality";
import { SensoryProfile, DEFAULT_SENSORY_PROFILE } from "../perception/perception";

/**
 * SpeciesDefinition — the ONLY thing that varies per species (Team 06 §29).
 * No species requires its own code/class: the same intelligence pipeline
 * (perception -> needs -> drives -> goals -> decision -> action) runs
 * identically for every species, parameterized entirely by this data.
 *
 * Team 04 (biology/genetics) is the authoritative source for a species'
 * biological traits; Team 06 only needs the behavioral subset captured
 * here, obtained through the BiologyProvider adapter (see
 * ../integration/biologyAdapter.ts) rather than duplicating genome logic.
 */
export interface SpeciesDefinition {
  readonly speciesId: string;
  readonly sensory: SensoryProfile;
  readonly needsGrowth: NeedsGrowthProfile;
  readonly personalityRanges: PersonalityRangeProfile;
  readonly baseSpeed: number;
  readonly isPredator: boolean;
  readonly dietTags: readonly string[]; // e.g. ["plant"], ["meat"], ["plant", "insect"]
  readonly energyRequirementPerTick: number;
  /** Behavior tendency weights layered on top of raw utility scoring (e.g. a herd species leans toward "socialize"). */
  readonly behaviorTendencies: Readonly<Record<string, number>>;
}

export function createDefaultSpeciesDefinition(speciesId: string, overrides: Partial<SpeciesDefinition> = {}): SpeciesDefinition {
  return {
    speciesId,
    sensory: DEFAULT_SENSORY_PROFILE,
    needsGrowth: DEFAULT_NEEDS_GROWTH_PROFILE,
    personalityRanges: DEFAULT_PERSONALITY_RANGES,
    baseSpeed: 1,
    isPredator: false,
    dietTags: ["plant"],
    energyRequirementPerTick: 0.1,
    behaviorTendencies: {},
    ...overrides,
  };
}

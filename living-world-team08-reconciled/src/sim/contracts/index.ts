/**
 * Shared type contracts (Team 01 / Foundation subset).
 *
 * This barrel re-exports ONLY the type shapes that other Foundation
 * subsystems and later teams (Team 02+) depend on, so consumers can import
 * a stable set of contract types without reaching into internal file
 * paths under src/sim/core/**. As later teams add their own contracts
 * (ChunkData, MaterialData, SpeciesData, NPCData, ...), they extend this
 * barrel rather than modifying the Foundation types themselves.
 */

export type { WorldSeed, CreateWorldSeedInput } from "../core/seed/worldSeed";
export type { WorldState } from "../core/state/worldState";
export type { SimulationTime } from "../core/time/simulationClock";
export type { RngState } from "../core/rng/deterministicRng";
export type { RngRegistryState } from "../core/rng/rngStreamRegistry";
export type { SimulationContext, SubsystemTickFn } from "../core/simulation/simulation";
export type { ReplayResult } from "../core/replay/replay";
export type { WorldStateRepository } from "../persistence/worldStateRepository";

// Team 02 — World Genesis contracts.
export type {
  PlanetaryConditions,
  RockType,
  GeologicalPlate,
  GeologyConditions,
  GeographyConditions,
  Landform,
  HydrologyConditions,
  ClimateConditions,
  ClimateSample,
  WeatherConditions,
  WeatherSample,
  SoilConditions,
  SoilSample,
  ResourceId,
  ResourceDefinition,
  ResourceDepthBand,
  ResourceDeposit,
  ResourcesConditions,
  BiomeDefinition,
  BiomesConditions,
  HabitatsConditions,
  HabitatSample,
  ChunkCoordinate,
  CellData,
  ChunkData,
} from "../worldgen/contracts/types";

// --- Team 03 (Physics + Materials + Procedural Objects) ---------------------
export type { MaterialData, MaterialDataInput, MaterialCategory, MaterialState, MaterialTemperatureRange } from "../materials/materialData";
export type { MaterialRegistryState } from "../materials/materialRegistry";
export type { WorldMaterialContext, MaterialEnvironmentContext } from "../materials/environment";
export type {
  MaterialQuantity,
  MaterialTransformation,
  TransformationConditions,
  TransformationContext,
  TransformationResult,
  TransformationFailureReason,
} from "../materials/transformation";
export type { DamageType, DamageEvent } from "../materials/damage";
export type { DecayState } from "../materials/decay";
export type {
  ObjectData,
  ObjectPart,
  ObjectCategory,
  ObjectState,
  ObjectTransform,
  Vector3,
  MaterialAssignment,
  Durability,
  StructuralProperties,
} from "../objects/objectData";
export type { ResourceYield, ResourceExtractionContext } from "../objects/resourceExtraction";
export type { TreeDescriptor, RockDescriptor } from "../objects/generation";

/**
 * Team 04 (Biology / Genetics / Evolution) contracts.
 *
 * Following the barrel's own convention above: Foundation types are left
 * untouched, and Team 04 only adds its own stable shapes here for later
 * teams (Ecology, NPC, ...) to depend on without reaching into
 * src/sim/biology/** internals.
 */
export type { BioEntity, BiologicalSex, LifeStage } from "../biology/entity/bioEntity";
export type { GenomeData, GeneData, AlleleData, MutationConfig } from "../biology/genetics/geneTypes";
export type { TraitDefinition, TraitGene, TraitValue } from "../biology/traits/traitDefinition";
export type { BiologicalEnvironment } from "../biology/environment/biologicalEnvironment";
export type { SpeciesConfig } from "../biology/species/speciesConfig";
export type { BiologicalEvent } from "../biology/events/biologicalEvents";
export type { BiologyModuleState } from "../biology/tick/biologyModuleState";

/**
 * Team 06 (Individual Creature Intelligence) contracts.
 */
export type { CreatureState } from "../creature/state/creatureState";
export type { NeedsState } from "../creature/state/needs";
export type { PersonalityTraits } from "../creature/personality/personality";
export type { EmotionalState } from "../creature/emotional/emotionalState";
export type { MemoryEntry } from "../creature/memory/memory";
export type { Relationship } from "../creature/relationships/relationship";
export type { Perception, PerceivableEntity, SensoryProfile } from "../creature/perception/perception";
export type { Goal } from "../creature/goals/goals";
export type { ActionProposal, ActionResult } from "../creature/actions/actions";
export type { MovementIntent } from "../creature/movement/movementIntent";
export type { SpeciesDefinition } from "../creature/species/species";
export type { BiologyProvider } from "../creature/integration/biologyAdapter";
export type { EcologyProvider } from "../creature/integration/ecologyAdapter";

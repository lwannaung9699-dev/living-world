/**
 * World Genesis (Team 02) shared type contracts.
 *
 * These are the shapes stored under WorldState.modules.{planetary,
 * geography, geology, hydrology, climate, weather, soil, resources,
 * biomes, habitats} plus the ChunkData shape produced on demand by
 * chunk/generateChunk.ts. Team 03+ should depend on these types (re-
 * exported from src/sim/worldgen/index.ts and src/sim/contracts/index.ts)
 * rather than reaching into individual subsystem files.
 */

// ---------------------------------------------------------------------------
// Planetary
// ---------------------------------------------------------------------------

export interface PlanetaryConditions {
  readonly version: string;
  /** World extent along each axis, measured in chunks. World coordinates run [0, worldSizeChunks * chunkSize). */
  readonly worldSizeChunks: number;
  /** Cells per chunk edge (a chunk is chunkSize x chunkSize cells). */
  readonly chunkSize: number;
  /** World units (cells) per grid cell — always 1; kept explicit for future non-unit spacing. */
  readonly cellSpacing: number;
  /** Relative surface gravity (1.0 = Earth-like baseline). Environmental baseline only; no physics engine yet. */
  readonly gravity: number;
  /** Axial tilt in degrees — drives seasonal amplitude in climate/weather. */
  readonly axialTiltDeg: number;
  /** Simulated ticks per full year, used to derive season phase from SimulationTime. */
  readonly ticksPerYear: number;
  /** Target normalized elevation fraction below which terrain is ocean (see geography.seaLevel, kept equal). */
  readonly waterFraction: number;
}

// ---------------------------------------------------------------------------
// Geology
// ---------------------------------------------------------------------------

export type RockType = "igneous" | "sedimentary" | "metamorphic" | "volcanic";

export interface GeologicalPlate {
  readonly id: number;
  /** Plate center, in world cell coordinates. */
  readonly cx: number;
  readonly cy: number;
  /** Elevation bias this plate imparts on nearby terrain, roughly [-1, 1] (negative = basin-forming, positive = uplift-forming). */
  readonly upliftBias: number;
  readonly rockType: RockType;
  /** Geological activity level [0, 1] — feeds erosion/sedimentation intensity and rare-mineral/volcanic-resource likelihood. */
  readonly activity: number;
}

export interface GeologyConditions {
  readonly version: string;
  readonly plates: readonly GeologicalPlate[];
}

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------

export interface GeographyConditions {
  readonly version: string;
  /** Normalized elevation threshold [0, 1]; elevation below this is ocean. */
  readonly seaLevel: number;
}

export type Landform =
  | "ocean"
  | "coast"
  | "plains"
  | "hills"
  | "mountains"
  | "valley"
  | "plateau"
  | "basin"
  | "cliff";

// ---------------------------------------------------------------------------
// Hydrology
// ---------------------------------------------------------------------------

export interface HydrologyConditions {
  readonly version: string;
  /** Minimum drainage-potential value [0, 1] for a valley cell to be classified as a river. */
  readonly riverThreshold: number;
  /** Minimum drainage-potential value [0, 1] for an enclosed local minimum to be classified as a lake. */
  readonly lakeThreshold: number;
}

// ---------------------------------------------------------------------------
// Climate
// ---------------------------------------------------------------------------

export interface ClimateConditions {
  readonly version: string;
  /** Mean sea-level equatorial temperature, degrees C. */
  readonly equatorTemperatureC: number;
  /** Mean sea-level polar temperature, degrees C. */
  readonly poleTemperatureC: number;
  /** Temperature drop per unit of normalized elevation above sea level, degrees C. */
  readonly elevationLapseRateC: number;
  /** Baseline annual precipitation at sea level in a "wet" region, mm. */
  readonly maxPrecipitationMm: number;
}

/** Annual-mean climate baseline at a location (used for biome/soil classification — not instantaneous weather). */
export interface ClimateSample {
  readonly latitudeDeg: number;
  readonly meanTemperatureC: number;
  readonly annualPrecipitationMm: number;
  readonly humidity01: number;
  readonly windFoundation01: number;
  readonly snowProbability01: number;
}

// ---------------------------------------------------------------------------
// Weather (foundation only — instantaneous, derived on demand, never a full simulation)
// ---------------------------------------------------------------------------

export interface WeatherConditions {
  readonly version: string;
  readonly stormProbabilityBase01: number;
  readonly fogHumidityThreshold01: number;
  readonly snowTemperatureThresholdC: number;
  readonly extremeTemperatureDeltaC: number;
}

export interface WeatherSample {
  readonly temperatureC: number;
  readonly rain01: number;
  readonly isStorm: boolean;
  readonly windSpeedFoundation01: number;
  readonly fog01: number;
  readonly snowProbability01: number;
  readonly isExtremeTemperature: boolean;
}

// ---------------------------------------------------------------------------
// Soil
// ---------------------------------------------------------------------------

export interface SoilConditions {
  readonly version: string;
}

export interface SoilSample {
  readonly moisture01: number;
  readonly nutrients01: number;
  readonly organicMatter01: number;
  readonly sand01: number;
  readonly clay01: number;
  readonly fertility01: number;
  readonly depthM: number;
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export type ResourceId =
  | "stone"
  | "clay"
  | "sand"
  | "iron"
  | "copper"
  | "coal"
  | "salt"
  | "rareMinerals";

export interface ResourceDefinition {
  readonly id: ResourceId;
  readonly label: string;
  /** Rock types this resource preferentially forms in; empty = independent of rock type. */
  readonly preferredRockTypes: readonly RockType[];
  /** Baseline presence probability [0, 1] before geological/environmental modifiers. */
  readonly baseProbability01: number;
  /** How strongly geological activity increases presence probability [0, 1]. */
  readonly activityAffinity01: number;
  /** How strongly proximity to the coast increases presence probability [0, 1] (negative = prefers inland). */
  readonly coastalAffinity: number;
  /** How strongly terrain slope increases presence probability [0, 1] (exposed rock on steep terrain). */
  readonly slopeAffinity01: number;
  /** How strongly local soil clay content increases presence probability [0, 1]. */
  readonly soilClayAffinity01: number;
}

export interface ResourcesConditions {
  readonly version: string;
  readonly definitions: readonly ResourceDefinition[];
}

export type ResourceDepthBand = "shallow" | "moderate" | "deep";

export interface ResourceDeposit {
  readonly resourceId: ResourceId;
  readonly density01: number;
  readonly depthBand: ResourceDepthBand;
}

// ---------------------------------------------------------------------------
// Biomes
// ---------------------------------------------------------------------------

export interface BiomeDefinition {
  readonly id: string;
  readonly label: string;
  readonly idealTemperatureC: number;
  readonly idealPrecipitationMm: number;
  readonly idealMoisture01: number;
  /** If true, this biome can only be selected for ocean cells (elevation < seaLevel); if false, never for ocean cells. */
  readonly requiresOcean: boolean;
}

export interface BiomesConditions {
  readonly version: string;
  readonly definitions: readonly BiomeDefinition[];
}

// ---------------------------------------------------------------------------
// Habitats
// ---------------------------------------------------------------------------

export interface HabitatsConditions {
  readonly version: string;
}

/**
 * Environmental habitat conditions for future Biology/Evolution systems
 * (spec §15). Deliberately contains no organisms, species, or behavior —
 * only the environmental affordances future life systems will read.
 */
export interface HabitatSample {
  readonly temperature01: number;
  readonly moisture01: number;
  readonly nutrients01: number;
  readonly waterAvailability01: number;
  readonly shelterAvailability01: number;
  readonly sunlight01: number;
  readonly terrain: Landform;
  readonly resourceAvailability01: number;
  /**
   * Foundation for the future feedback loop described in spec §16
   * (Rain -> River Flow -> Soil Moisture -> Vegetation Potential -> Future
   * Life). Not vegetation itself — just the environmental potential for it.
   */
  readonly vegetationPotential01: number;
}

// ---------------------------------------------------------------------------
// Chunk
// ---------------------------------------------------------------------------

export interface ChunkCoordinate {
  readonly cx: number;
  readonly cy: number;
}

export interface CellData {
  readonly wx: number;
  readonly wy: number;
  readonly elevation01: number;
  readonly slope01: number;
  readonly landform: Landform;
  readonly isRiver: boolean;
  readonly isLake: boolean;
  readonly waterAvailability01: number;
  readonly climate: ClimateSample;
  readonly soil: SoilSample;
  readonly resources: readonly ResourceDeposit[];
  readonly biomeId: string;
  readonly habitat: HabitatSample;
}

export interface ChunkData {
  readonly version: string;
  readonly coord: ChunkCoordinate;
  readonly chunkSize: number;
  /** Row-major cells: cells[localY][localX]. */
  readonly cells: readonly (readonly CellData[])[];
}

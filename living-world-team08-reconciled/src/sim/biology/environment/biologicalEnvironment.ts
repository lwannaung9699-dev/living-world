/**
 * BiologicalEnvironment — the abstract environmental-pressure interface
 * Team 04 consumes. Team 04 does NOT depend on Team 02 (Geography/Climate)
 * directly; it only depends on this shape. Team 02 will eventually provide
 * a mapping (terrain/biome/climate -> BiologicalEnvironment values). Until
 * then, callers can supply this directly or fall back to
 * NEUTRAL_BIOLOGICAL_ENVIRONMENT.
 *
 * All fields are optional so callers can supply only what they know about;
 * `resolveEnvironment` fills in neutral (0.5) defaults for anything absent.
 * Every field is normalized to roughly [0, 1] except `temperature`, which
 * is normalized to roughly [-1, 1] (cold .. hot) so trait sensitivity math
 * can treat 0 as a meaningful neutral midpoint.
 */
export interface BiologicalEnvironment {
  readonly temperature?: number;
  readonly humidity?: number;
  readonly waterAvailability?: number;
  readonly foodAvailability?: number;
  readonly oxygen?: number;
  readonly toxicity?: number;
  readonly predationPressure?: number;
  readonly diseasePressure?: number;
  readonly terrainDifficulty?: number;
  readonly lightLevel?: number;
}

export const NEUTRAL_BIOLOGICAL_ENVIRONMENT: Required<BiologicalEnvironment> = {
  temperature: 0,
  humidity: 0.5,
  waterAvailability: 0.5,
  foodAvailability: 0.5,
  oxygen: 0.5,
  toxicity: 0,
  predationPressure: 0.5,
  diseasePressure: 0.5,
  terrainDifficulty: 0.5,
  lightLevel: 0.5,
};

/** Fills in neutral defaults for any field the caller did not supply. */
export function resolveEnvironment(env?: BiologicalEnvironment): Required<BiologicalEnvironment> {
  return { ...NEUTRAL_BIOLOGICAL_ENVIRONMENT, ...(env ?? {}) };
}

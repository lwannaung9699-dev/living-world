/**
 * World Genesis versioning (Team 02).
 *
 * Independent from Team 01's WorldSeed versions (simulationVersion,
 * rulesVersion, initialStateVersion). Bumping WORLD_GENERATION_VERSION is a
 * conscious "regenerate the physical world differently" decision — it is
 * folded into every worldgen RNG stream namespace (see
 * `worldgenNamespace()` in `./rngNamespaces`) and stamped onto every
 * genesis module so old worlds are never silently reinterpreted under new
 * generation rules (spec §18).
 */
export const WORLD_GENERATION_VERSION = "0.1.0";

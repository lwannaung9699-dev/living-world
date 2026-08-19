/**
 * LIVING WORLD — Simulation Core public API (Team 01 / Foundation).
 *
 * Anything outside `src/sim` (API routes, future adapters, future clients)
 * should import from "@/sim" rather than reaching into
 * `src/sim/core/**` directly, so the Foundation's internal file layout can
 * evolve freely without breaking consumers.
 *
 * This module — and everything it re-exports — has ZERO dependency on
 * PostgreSQL, Drizzle, Next.js, React, Three.js, or Godot. It runs and is
 * fully testable in a plain Node.js process with no network, no database,
 * and no rendering. See src/sim/test/isolation.test.ts for the automated
 * proof of this boundary.
 */

export * from "./core/errors";
export * from "./core/hash";
export * from "./core/seed/worldSeed";
export * from "./core/rng/deterministicRng";
export * from "./core/rng/rngStreamRegistry";
export * from "./core/state/worldState";
export * from "./core/time/simulationClock";
export * from "./core/simulation/simulation";
export * from "./core/serialization/canonicalJson";
export * from "./core/serialization/stateHash";
export * from "./core/serialization/worldStateSerializer";
export * from "./core/replay/replay";
export * from "./persistence/worldStateRepository";

// --- Team 03 (Physics + Materials + Procedural Objects) ---------------------
// Independent, engine-agnostic subsystem built in parallel with Team 02
// (World Genesis). Depends only on Team 01 Foundation (RngStreamRegistry,
// errors, hash) plus the abstract WorldMaterialContext — never on any
// concrete Team 02 generator. See src/sim/materials and src/sim/objects.
export * from "./materials";
export * from "./objects";

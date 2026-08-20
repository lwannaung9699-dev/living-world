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

// --- Team 02 (World Genesis) ------------------------------------------------
// See src/sim/worldgen/index.ts for the full API surface.
export * from "./worldgen";

// --- Team 03 (Physics + Materials + Procedural Objects) ---------------------
// Independent, engine-agnostic subsystem built in parallel with Team 02
// (World Genesis). Depends only on Team 01 Foundation (RngStreamRegistry,
// errors, hash) plus the abstract WorldMaterialContext — never on any
// concrete Team 02 generator. See src/sim/materials and src/sim/objects.
export * from "./materials";
export * from "./objects";

// --- Team 06 (Individual Creature Intelligence) -------------------------------
// Consumes Team 04 (biology) and Team 05 (ecology) only through its own
// BiologyProvider/EcologyProvider adapters (see src/sim/creature/integration).
// See src/sim/creature/index.ts.
export * from "./creature/index";

// --- Team 04 (Biology / Genetics / Evolution) --------------------------------
// Additive only: Foundation (everything above) is untouched. See src/sim/biology/index.ts.
export * from "./biology";

// --- Team 05 (Ecology + Ecosystem Dynamics) -----------------------------------
// Consumes Team 02 (environment) and Team 04 (biology) only through its own
// abstract adapter shapes (see src/sim/ecology/contracts.ts) — never their
// concrete internals. See src/sim/ecology/index.ts.
export * from "./ecology";

// --- Team 07 (Society & Civilization) -----------------------------------------
// Consumes Team 04 (biology/kinship) and Team 06 (NPC/individuals) only
// through its own adapter shapes that duck-type against state.modules.*,
// degrading to safe no-ops when a dependency hasn't landed yet (Team 06 not
// yet merged as of this pass). See src/sim/society/contracts.ts and index.ts.
export * from "./society";

// --- Team 08 (Law & Governance) -----------------------------------------------
// Consumes Team 06 (NPC) and Team 07 (Society) only through its own
// populationAdapter, which duck-types state.modules.npc/society and falls
// back to a clearly-flagged (`sourced: false`) synthetic population when
// neither has landed yet. See src/sim/politics/index.ts.
export * from "./politics";

// --- Canonical Team 01–08 pipeline ------------------------------------------
// Worldgen remains a one-time bootstrap; this helper composes all tickable
// domains in dependency order: Biology → Ecology → Creature → Society → Politics.
export * from "./pipeline/defaultSimulationPipeline";

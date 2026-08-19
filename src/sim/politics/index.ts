/**
 * LIVING WORLD — Team 08 (Law, Governance, Institutions & Political
 * Emergence) public API.
 *
 * Consumers outside `src/sim/politics/**` (future Team 09+, API routes,
 * tools) should import from here rather than reaching into individual
 * files, so this module's internal layout can evolve without breaking
 * callers — same convention as Team 01's `src/sim/index.ts`.
 */

export * from "./contracts";
export * from "./config";
export * from "./state";
export * from "./rules";
export * from "./authority";
export * from "./governance";
export * from "./property";
export * from "./justice";
export * from "./factions";
export * from "./diplomacy";
export * from "./statehood";
export * from "./tick";
export * from "./adapters/populationAdapter";

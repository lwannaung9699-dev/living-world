/**
 * LIVING WORLD — Ecology + Ecosystem Dynamics (Team 05).
 *
 * Consumers outside src/sim/ecology should import from "@/sim/ecology"
 * rather than reaching into individual files, mirroring the Foundation's
 * own "@/sim" barrel convention (see src/sim/index.ts).
 *
 * To wire Team 05 into a running simulation:
 *
 *   import { tick } from "@/sim";
 *   import { createEcologySubsystem } from "@/sim/ecology";
 *
 *   const nextState = tick(state, {
 *     subsystems: [createEcologySubsystem({ environmentByLocation, biologicalOverrides })],
 *   });
 *
 * Team 05 never modifies src/sim/core/** or src/sim/index.ts -- it only
 * attaches a subsystem via Foundation's existing SubsystemTickFn extension
 * point (core/simulation/simulation.ts) and stores its own state under
 * WorldState.modules.ecology (core/state/worldState.ts's documented
 * per-team module-attachment contract).
 */

export * from "./contracts";
export * from "./niche";
export * from "./resources";
export * from "./population";
export * from "./carryingCapacity";
export * from "./competition";
export * from "./interactions";
export * from "./consumption";
export * from "./predation";
export * from "./herbivory";
export * from "./foodWeb";
export * from "./migration";
export * from "./disease";
export * from "./disturbance";
export * from "./dynamics";
export * from "./metrics";
export * from "./events";
export * from "./spatial";
export * from "./selectionFeedback";
export * from "./state";
export * from "./subsystem";

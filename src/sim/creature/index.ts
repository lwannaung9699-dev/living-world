/**
 * LIVING WORLD — Individual Creature Intelligence (Team 06) public API.
 *
 * Consumers outside src/sim/creature/** should import from here (or from
 * "@/sim", which re-exports this barrel) rather than reaching into
 * internal file paths, mirroring Team 01's contracts barrel convention.
 */

export * from "./state/creatureState";
export * from "./state/needs";
export * from "./state/dailyActivity";

export * from "./personality/personality";
export * from "./emotional/emotionalState";
export * from "./memory/memory";
export * from "./relationships/relationship";

export * from "./perception/perception";
export * from "./social/socialPerception";
export * from "./communication/communication";

export * from "./goals/goals";
export * from "./actions/actions";
export * from "./movement/movementIntent";

export * from "./decision/driveSystem";
export * from "./decision/utilityAI";
export * from "./learning/learning";

export * from "./species/species";
export * from "./integration/biologyAdapter";
export * from "./integration/ecologyAdapter";

export * from "./lod/simulationLod";

export * from "./tick/creatureTick";

/**
 * LIVING WORLD — Biology / Genetics / Evolution domain (Team 04).
 *
 * Consumers outside src/sim/biology should import from "@/sim" or
 * "@/sim/biology" rather than reaching into internal file paths, so this
 * module's internal layout can evolve without breaking callers — same
 * convention as src/sim/index.ts (Team 01).
 */

export * from "./genetics/geneTypes";
export * from "./genetics/genome";
export * from "./genetics/mutation";
export * from "./genetics/inheritance";

export * from "./traits/traitDefinition";
export * from "./traits/phenotype";

export * from "./environment/biologicalEnvironment";

export * from "./entity/bioEntity";
export * from "./entity/lifeCycle";
export * from "./entity/metabolism";

export * from "./species/speciesConfig";

export * from "./reproduction/reproduction";

export * from "./population/fitness";
export * from "./population/selection";
export * from "./population/adaptation";
export * from "./population/speciation";
export * from "./population/extinction";

export * from "./events/biologicalEvents";

export * from "./tick/biologyModuleState";
export * from "./tick/biologySubsystem";

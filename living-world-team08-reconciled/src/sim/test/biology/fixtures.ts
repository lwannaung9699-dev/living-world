import { GeneData, DEFAULT_MUTATION_CONFIG } from "../../biology/genetics/geneTypes";
import { SpeciesConfig } from "../../biology/species/speciesConfig";
import { SpeciesTraitConfig } from "../../biology/traits/phenotype";
import { EXAMPLE_TRAIT_DEFINITIONS } from "../../biology/traits/traitDefinition";

const bodySizeDef = EXAMPLE_TRAIT_DEFINITIONS.find((d) => d.traitId === "bodySize")!;
const speedDef = EXAMPLE_TRAIT_DEFINITIONS.find((d) => d.traitId === "speed")!;
const coldToleranceDef = EXAMPLE_TRAIT_DEFINITIONS.find((d) => d.traitId === "temperatureTolerance")!;

export const DEMO_GENE_TEMPLATE: readonly GeneData[] = [
  {
    geneId: "sizeGene",
    traitId: "bodySize",
    inheritance: "quantitative",
    alleles: [
      { id: "size-a", value: 3 },
      { id: "size-b", value: 3 },
    ],
  },
  {
    geneId: "speedGene",
    traitId: "speed",
    inheritance: "dominant-recessive",
    alleles: [
      { id: "speed-fast", value: 6, dominance: 2 },
      { id: "speed-slow", value: 2, dominance: 1 },
    ],
  },
  {
    geneId: "coldGene",
    traitId: "temperatureTolerance",
    inheritance: "co-dominant",
    alleles: [
      { id: "cold-a", value: 0.2 },
      { id: "cold-b", value: -0.1 },
    ],
  },
  {
    geneId: "sizeRegulator",
    inheritance: "quantitative",
    regulatory: true,
    regulates: "sizeGene",
    alleles: [
      { id: "reg-a", value: 0.1 },
      { id: "reg-b", value: -0.05 },
    ],
  },
];

export const DEMO_TRAIT_CONFIGS: readonly SpeciesTraitConfig[] = [
  { traitId: "bodySize", definition: bodySizeDef, genes: [{ geneId: "sizeGene", weight: 1 }], baseline: 0 },
  { traitId: "speed", definition: speedDef, genes: [{ geneId: "speedGene", weight: 1 }], baseline: 0 },
  {
    traitId: "temperatureTolerance",
    definition: coldToleranceDef,
    genes: [{ geneId: "coldGene", weight: 1 }],
    baseline: 0,
  },
];

export const DEMO_SPECIES: SpeciesConfig = {
  speciesId: "demo-critter",
  traits: DEMO_TRAIT_CONFIGS,
  baseGenomeTemplate: DEMO_GENE_TEMPLATE,
  mutationConfig: DEFAULT_MUTATION_CONFIG,
  reproduction: {
    mode: "sexual",
    maturityAge: 5,
    cooldownTicks: 3,
    minEnergyToReproduce: 0.3,
    offspringCountMin: 1,
    offspringCountMax: 2,
  },
  lifeCycle: {
    maturityAge: 5,
    oldAge: 40,
    maxAge: 60,
    baselineOldAgeMortality: 0.1,
  },
  fitnessProfile: [
    { traitId: "temperatureTolerance", optimalCenter: 0, optimalTolerance: 0.5, weight: 1 },
    { traitId: "speed", optimalCenter: 6, optimalTolerance: 3, weight: 1 },
  ],
  minViablePopulation: 0,
};

export const DEMO_ASEXUAL_SPECIES: SpeciesConfig = {
  ...DEMO_SPECIES,
  speciesId: "demo-asexual-critter",
  reproduction: {
    mode: "asexual",
    maturityAge: 4,
    cooldownTicks: 2,
    minEnergyToReproduce: 0.3,
    offspringCountMin: 1,
    offspringCountMax: 1,
  },
};

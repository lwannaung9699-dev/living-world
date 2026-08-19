import { clamp, traitValue, BiologicalTraits } from "./contracts";
import { DeterministicRng } from "../core/rng/deterministicRng";
import { PopulationData } from "./population";
import { EcologicalInteraction } from "./interactions";
import { ConsumptionDemand } from "./consumption";

/**
 * Computes one herbivore population's grazing demand against a plant/seed/
 * fruit resource for this tick.
 *
 * Feeds the same emergent cycle described in the project philosophy:
 * plant biomass -> herbivore consumption -> plant reduction -> plant
 * regeneration -> herbivore carrying capacity. Team 05 never hardcodes a
 * specific plant species; resource identity comes entirely from data.
 */
export function computeHerbivoryDemand(
  interaction: EcologicalInteraction,
  herbivore: PopulationData,
  herbivoreTraits: BiologicalTraits,
  rng: DeterministicRng,
): ConsumptionDemand {
  const baseIntakePerCapita = interaction.conditions?.intakePerCapita ?? 1;
  const foragingEfficiency = traitValue(herbivoreTraits, "foragingEfficiency", 1);

  const variation = clamp(1 + rng.gaussian(0, 0.05), 0.6, 1.4);

  const amount = Math.max(
    0,
    herbivore.count * interaction.strength * baseIntakePerCapita * foragingEfficiency * herbivore.energy * variation,
  );

  return {
    interactionId: interaction.interactionId,
    consumerId: herbivore.populationId,
    targetId: interaction.targetId,
    amount,
  };
}

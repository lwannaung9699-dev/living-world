import { clamp, traitValue, BiologicalTraits } from "./contracts";
import { DeterministicRng } from "../core/rng/deterministicRng";
import { PopulationData } from "./population";
import { EcologicalInteraction } from "./interactions";
import { ConsumptionDemand } from "./consumption";

/**
 * Computes one predator population's kill demand against one prey
 * population for this tick, from a data-driven interaction (never
 * hardcoded species pairs — see project rule #9).
 *
 * The feedback loop this enables (predator ↑ -> prey mortality ↑ -> prey ↓
 * -> food for predator ↓ -> predator reproduction ↓ -> predator ↓) emerges
 * naturally from this demand being fed into resolveConsumption() alongside
 * the resulting population-dynamics update; Team 05 never scripts the loop
 * directly.
 */
export function computePredationDemand(
  interaction: EcologicalInteraction,
  predator: PopulationData,
  predatorTraits: BiologicalTraits,
  rng: DeterministicRng,
): ConsumptionDemand {
  const baseKillRatePerCapita = interaction.conditions?.killRatePerCapita ?? 0.15;
  const huntingEfficiency = traitValue(predatorTraits, "huntingEfficiency", 1);

  // Small deterministic stochastic variation around the expected demand, so
  // repeated ticks with identical populations don't produce a perfectly
  // static kill count -- but always drawn from this predator's own stream,
  // never a shared/sequential one, preserving order independence.
  const variation = clamp(1 + rng.gaussian(0, 0.08), 0.5, 1.5);

  const amount = Math.max(
    0,
    predator.count * interaction.strength * baseKillRatePerCapita * huntingEfficiency * predator.health * variation,
  );

  return {
    interactionId: interaction.interactionId,
    consumerId: predator.populationId,
    targetId: interaction.targetId,
    amount,
  };
}

/** Biomass gained (as an energy contribution, 0..1-ish scale) per prey individual killed, used to feed predator energy/birth rate. */
export function predationEnergyGain(preyKilled: number, predatorCount: number, biomassPerPrey = 1): number {
  if (predatorCount <= 0) return 0;
  return (preyKilled * biomassPerPrey) / predatorCount;
}

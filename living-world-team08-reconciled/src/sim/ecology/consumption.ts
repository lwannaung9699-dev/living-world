/**
 * Shared machinery for resolving "consumption" interactions (predation,
 * herbivory, resource_consumption, scavenging): every consumer proposes a
 * demand against a shared target (a prey population's count, or a
 * resource's availableAmount), and demands are resolved together, in a
 * single pass, using fair-share scaling when total demand exceeds supply.
 *
 * This is what gives Team 05 execution-order independence (rule #22): the
 * result never depends on which consumer's demand happened to be computed
 * or applied first, because nothing is mutated incrementally — every
 * demand is computed from the same tick's read-only snapshot, then all
 * demands against a given target are summed and scaled together.
 */
export interface ConsumptionDemand {
  readonly interactionId: string;
  readonly consumerId: string;
  readonly targetId: string;
  /** Desired amount to remove from the target this tick (count for a population target, biomass for a resource target). */
  readonly amount: number;
}

export interface ConsumptionResolution {
  /** Actual amount granted per interaction, after fair-share scaling. */
  readonly grantedByInteraction: Readonly<Record<string, number>>;
  /** Total amount removed from each target (sum of all interactions' grants against it). */
  readonly removedByTarget: Readonly<Record<string, number>>;
  /** Total amount gained by each consumer (sum of all interactions it is the source of). */
  readonly gainedByConsumer: Readonly<Record<string, number>>;
}

/**
 * Resolves a batch of consumption demands against known per-target supply.
 * When total demand on a target exceeds its available supply, every demand
 * on that target is scaled down proportionally (fair share) so the target
 * is never driven below zero.
 */
export function resolveConsumption(
  demands: readonly ConsumptionDemand[],
  availableByTarget: Readonly<Record<string, number>>,
): ConsumptionResolution {
  const totalDemandByTarget: Record<string, number> = {};
  for (const demand of demands) {
    if (demand.amount <= 0) continue;
    totalDemandByTarget[demand.targetId] = (totalDemandByTarget[demand.targetId] ?? 0) + demand.amount;
  }

  const scaleByTarget: Record<string, number> = {};
  for (const [targetId, totalDemand] of Object.entries(totalDemandByTarget)) {
    const available = Math.max(0, availableByTarget[targetId] ?? 0);
    scaleByTarget[targetId] = totalDemand > 0 ? Math.min(1, available / totalDemand) : 0;
  }

  const grantedByInteraction: Record<string, number> = {};
  const removedByTarget: Record<string, number> = {};
  const gainedByConsumer: Record<string, number> = {};

  for (const demand of demands) {
    if (demand.amount <= 0) {
      grantedByInteraction[demand.interactionId] = 0;
      continue;
    }
    const scale = scaleByTarget[demand.targetId] ?? 0;
    const granted = demand.amount * scale;
    grantedByInteraction[demand.interactionId] = granted;
    removedByTarget[demand.targetId] = (removedByTarget[demand.targetId] ?? 0) + granted;
    gainedByConsumer[demand.consumerId] = (gainedByConsumer[demand.consumerId] ?? 0) + granted;
  }

  return { grantedByInteraction, removedByTarget, gainedByConsumer };
}

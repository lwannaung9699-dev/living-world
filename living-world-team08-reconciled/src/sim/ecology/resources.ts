import { clamp, EcologicalEnvironment } from "./contracts";
import { InvalidStateError } from "../core/errors";

/**
 * EcologicalResource — a generic biological/environmental quantity that
 * populations consume (plants, seeds, fruit, water, minerals, organic
 * matter, prey biomass, ...). This is intentionally distinct from Team 03's
 * Material system: materials are inert/crafting quantities, ecological
 * resources are living/renewing biological quantities with regeneration
 * dynamics tied to the environment.
 */
export interface EcologicalResource {
  readonly resourceId: string;
  /** Free-form resource type tag (e.g. "plant", "seed", "fruit", "water", "mineral", "organic_matter", "prey_biomass"). */
  readonly resourceType: string;
  readonly location: string;
  readonly availableAmount: number;
  readonly capacity: number;
  /** Fraction of the gap to capacity regenerated per tick, before environmental scaling. */
  readonly regenerationRate: number;
  /** Diagnostic-only: amount actually consumed on the most recently processed tick. */
  readonly consumptionRate: number;
}

export function createResource(input: {
  resourceId: string;
  resourceType: string;
  location: string;
  availableAmount: number;
  capacity: number;
  regenerationRate: number;
}): EcologicalResource {
  const resource: EcologicalResource = {
    resourceId: input.resourceId,
    resourceType: input.resourceType,
    location: input.location,
    availableAmount: input.availableAmount,
    capacity: input.capacity,
    regenerationRate: input.regenerationRate,
    consumptionRate: 0,
  };
  validateResource(resource);
  return resource;
}

export function validateResource(value: unknown): asserts value is EcologicalResource {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("EcologicalResource must be an object");
  }
  const resource = value as Partial<EcologicalResource>;
  if (typeof resource.resourceId !== "string" || resource.resourceId.length === 0) {
    throw new InvalidStateError("EcologicalResource.resourceId must be a non-empty string");
  }
  if (typeof resource.resourceType !== "string" || resource.resourceType.length === 0) {
    throw new InvalidStateError("EcologicalResource.resourceType must be a non-empty string");
  }
  if (typeof resource.location !== "string" || resource.location.length === 0) {
    throw new InvalidStateError("EcologicalResource.location must be a non-empty string");
  }
  if (typeof resource.capacity !== "number" || resource.capacity < 0) {
    throw new InvalidStateError("EcologicalResource.capacity must be a non-negative number");
  }
  if (
    typeof resource.availableAmount !== "number" ||
    resource.availableAmount < 0 ||
    resource.availableAmount > resource.capacity + 1e-9
  ) {
    throw new InvalidStateError("EcologicalResource.availableAmount must be within [0, capacity]");
  }
  if (typeof resource.regenerationRate !== "number" || resource.regenerationRate < 0) {
    throw new InvalidStateError("EcologicalResource.regenerationRate must be a non-negative number");
  }
  if (typeof resource.consumptionRate !== "number" || resource.consumptionRate < 0) {
    throw new InvalidStateError("EcologicalResource.consumptionRate must be a non-negative number");
  }
}

/**
 * Regrows a resource toward its capacity by one tick, scaled by how
 * favorable the environment is (water availability and habitat quality).
 * Disturbances are applied separately (see disturbance.ts) and can push
 * availableAmount down; regeneration only ever pushes it back up.
 */
export function regenerateResource(resource: EcologicalResource, environment: EcologicalEnvironment): EcologicalResource {
  const environmentalFactor = clamp((environment.waterAvailability + environment.habitatQuality) / 2);
  const gap = resource.capacity - resource.availableAmount;
  const growth = gap * resource.regenerationRate * environmentalFactor;
  return {
    ...resource,
    availableAmount: clamp(resource.availableAmount + growth, 0, resource.capacity),
  };
}

/**
 * Removes up to `amount` from a resource (never below zero). Returns the
 * updated resource plus the amount actually removed, so callers can react
 * to partial fulfillment (e.g. scarcity affecting consumer fitness).
 */
export function consumeResource(
  resource: EcologicalResource,
  amount: number,
): { resource: EcologicalResource; consumed: number } {
  const consumed = clamp(amount, 0, resource.availableAmount);
  return {
    resource: {
      ...resource,
      availableAmount: resource.availableAmount - consumed,
      consumptionRate: consumed,
    },
    consumed,
  };
}

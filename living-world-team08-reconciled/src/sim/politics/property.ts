/**
 * Property, land, taxation, and public resources (brief §15–18). Property
 * regimes emerge per-scope from governance conditions rather than being
 * assigned by society "type" — see chooseDominantPropertyKind().
 */

import type { DeterministicRng } from "../core/rng/deterministicRng";
import { EMERGENCE_THRESHOLDS, PROPERTY_KIND_BASE_WEIGHT } from "./config";
import type {
  GovernanceSystem,
  LandClaim,
  LandClaimBasis,
  PoliticsModuleState,
  PropertyKind,
  PropertyRight,
  PublicResource,
  PublicResourceKind,
  TaxPolicy,
  TaxType,
} from "./contracts";
import { appendHistory, mintId } from "./state";

// --------------------------------------------------------------------- //
// Property (§15) & land (§16)
// --------------------------------------------------------------------- //

export function chooseDominantPropertyKind(
  governance: GovernanceSystem,
  cohesion: number,
  inequality: number,
  rng: DeterministicRng,
): PropertyKind {
  const weight: Record<PropertyKind, number> = { ...PROPERTY_KIND_BASE_WEIGHT };
  if (cohesion > 0.6) weight.communal *= 1.6;
  if (inequality > 0.5) {
    weight.personal *= 1.4;
    weight.institutional *= 1.3;
  }
  if (governance.decisionMethod === "elder_council") weight.clan *= 1.7;
  if (governance.decisionMethod === "individual_ruler" || governance.decisionMethod === "hereditary_succession") weight.state *= 1.6;
  if (governance.decisionMethod === "merchant_council") weight.personal *= 1.5;

  const items = (Object.keys(weight) as PropertyKind[]).map((k) => ({ value: k, weight: Math.max(0.01, weight[k]) }));
  return rng.weightedChoice(items);
}

export function establishPropertyRight(
  politics: PoliticsModuleState,
  kind: PropertyKind,
  holderId: string,
  resourceRef: string,
  basis: PropertyRight["basis"],
  tick: number,
): PoliticsModuleState {
  const { id: propertyId, idCounters } = mintId(politics, "property");
  const right: PropertyRight = { propertyId, kind, holderId, resourceRef, establishedAtTick: tick, basis };
  let next: PoliticsModuleState = { ...politics, idCounters, propertyRights: { ...politics.propertyRights, [propertyId]: right } };
  next = appendHistory(next, {
    type: "property_right_established",
    tick,
    scope: holderId,
    summary: `${kind} property right established over ${resourceRef} (basis: ${basis}).`,
    refs: { propertyId },
  });
  return next;
}

export function establishLandClaim(
  politics: PoliticsModuleState,
  holderId: string,
  territoryId: string,
  basis: LandClaimBasis,
  strength: number,
  tick: number,
): { politics: PoliticsModuleState; claim: LandClaim } {
  const { id: claimId, idCounters } = mintId(politics, "land-claim");
  const claim: LandClaim = { claimId, holderId, territoryId, basis, establishedAtTick: tick, strength: clamp01(strength) };
  return { politics: { ...politics, idCounters, landClaims: { ...politics.landClaims, [claimId]: claim } }, claim };
}

// --------------------------------------------------------------------- //
// Taxation (§17)
// --------------------------------------------------------------------- //

const TAX_TYPE_POOL: readonly TaxType[] = ["food", "labor", "goods", "land", "money", "tribute", "military_service"];

export function isEligibleForTaxation(scopeFormalRuleCount: number): boolean {
  return scopeFormalRuleCount >= EMERGENCE_THRESHOLDS.taxationMinFormalRules;
}

export function chooseTaxType(governance: GovernanceSystem, wealth: number, isSubordinate: boolean, rng: DeterministicRng): TaxType {
  const weight: Record<TaxType, number> = Object.fromEntries(TAX_TYPE_POOL.map((t) => [t, 1])) as Record<TaxType, number>;
  if (wealth < 0.3) {
    weight.food *= 1.8;
    weight.labor *= 1.6;
  } else {
    weight.money *= 1.6;
    weight.goods *= 1.4;
  }
  if (governance.decisionMethod === "military_council") weight.military_service *= 2;
  if (isSubordinate) weight.tribute *= 2.2;
  const items = TAX_TYPE_POOL.map((t) => ({ value: t, weight: Math.max(0.01, weight[t]) }));
  return rng.weightedChoice(items);
}

export function enactTaxPolicy(
  politics: PoliticsModuleState,
  scope: string,
  type: TaxType,
  rate: number,
  payerScope: string,
  collectorId: string,
  destination: string,
  tick: number,
): { politics: PoliticsModuleState; tax: TaxPolicy } {
  const { id: taxId, idCounters } = mintId(politics, "tax");
  const tax: TaxPolicy = {
    taxId,
    scope,
    type,
    rate: clamp01(rate),
    payerScope,
    collectorId,
    destination,
    enforcementStrength: 0.4,
    complianceRate: 0.7,
    enactedAtTick: tick,
  };
  let next: PoliticsModuleState = { ...politics, idCounters, taxPolicies: { ...politics.taxPolicies, [taxId]: tax } };
  next = appendHistory(next, {
    type: "tax_changed",
    tick,
    scope,
    summary: `New ${type} tax enacted at rate ${tax.rate.toFixed(2)}.`,
    refs: { taxId },
  });
  return { politics: next, tax };
}

/** Nudges compliance/enforcement toward equilibrium each tick given corruption/administrative-effectiveness pressure. Pure, no RNG needed. */
export function driftTaxCompliance(tax: TaxPolicy, administrativeEffectiveness: number): TaxPolicy {
  const target = clamp01(0.3 + administrativeEffectiveness * 0.6);
  const complianceRate = clamp01(tax.complianceRate + (target - tax.complianceRate) * 0.1);
  return { ...tax, complianceRate };
}

// --------------------------------------------------------------------- //
// Public resources (§18)
// --------------------------------------------------------------------- //

const PUBLIC_RESOURCE_POOL: readonly PublicResourceKind[] = ["road", "water", "storage", "defensive_structure", "public_building", "irrigation", "market"];

export function isEligibleForPublicResource(wealth: number): boolean {
  return wealth * 100 >= EMERGENCE_THRESHOLDS.publicResourceMinWealth;
}

export function chooseNextPublicResourceKind(existingKinds: ReadonlySet<PublicResourceKind>, rng: DeterministicRng): PublicResourceKind {
  const candidates = PUBLIC_RESOURCE_POOL.filter((k) => !existingKinds.has(k));
  const pool = candidates.length > 0 ? candidates : PUBLIC_RESOURCE_POOL;
  return rng.choose(pool);
}

export function establishPublicResource(
  politics: PoliticsModuleState,
  scope: string,
  kind: PublicResourceKind,
  controllerId: string,
  beneficiaryScope: string,
  fundingSourceId: string | null,
  maintenanceCost: number,
  tick: number,
): { politics: PoliticsModuleState; resource: PublicResource } {
  const { id: resourceId, idCounters } = mintId(politics, "public-resource");
  const resource: PublicResource = {
    resourceId,
    scope,
    kind,
    maintenanceCost,
    beneficiaryScope,
    controllerId,
    fundingSourceId,
    establishedAtTick: tick,
    condition: 1,
  };
  let next: PoliticsModuleState = { ...politics, idCounters, publicResources: { ...politics.publicResources, [resourceId]: resource } };
  next = appendHistory(next, {
    type: "public_resource_established",
    tick,
    scope,
    summary: `Public ${kind} established, controlled by ${controllerId}.`,
    refs: { resourceId },
  });
  return { politics: next, resource };
}

/** Degrades condition when unfunded, restores it slowly when funded. Pure, deterministic. */
export function maintainPublicResource(resource: PublicResource): PublicResource {
  const delta = resource.fundingSourceId ? 0.02 : -0.03;
  return { ...resource, condition: clamp01(resource.condition + delta) };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

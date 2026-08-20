/**
 * Team 07 (Society) ↔ Team 09 (Economy) reconciliation — README.md gap #2.
 *
 * Team 09's `EconomyState.stocks` (concrete, typed, per-settlement resource
 * quantities) and Team 07's `SocialGroup.resources.pooled` (an abstract,
 * single-number trade-stub used by ./economy.ts's sharing/trade logic) are
 * two separate, deliberately-unmerged models — see economy/README.md for
 * why unifying them outright is still an open design question, not just an
 * open task.
 *
 * What this file does instead: expose Team 09's real stock as a read-only,
 * per-tick-refreshed *summary* field, `SocialGroup.resources.
 * economicStockTotal`, so the two numbers are at least visible/auditable
 * side by side. It never reads or writes `pooled`, and `pooled` never reads
 * or writes it back — no double-spending, no merged pool, just visibility.
 *
 * Wiring: a settlement (Team 07's `Settlement`, keyed by `settlementId`,
 * owned by exactly one `groupId`) is the join key between the two models —
 * Team 09 tracks stock per settlementId; Team 07 tracks group membership.
 * A group's `economicStockTotal` is the sum of every settlement it owns.
 * Groups that currently own no settlement get 0, not `undefined` or a
 * stale value.
 *
 * This must run *after* Team 09's economy subsystem in the pipeline (see
 * defaultSimulationPipeline.ts) — Society itself runs before Economy each
 * tick, so calling this from inside societyTick would always read last
 * tick's stock. It is intentionally its own pipeline step, not part of
 * createSocietyTick, even though (like every other write to
 * state.modules.society) it is the only thing touching `economicStockTotal`.
 */

import { WorldState } from "../core/state/worldState";
import { SocietyState, sortedEntries } from "./state";
import { EconomyAdapter, defaultEconomyAdapter } from "./contracts";

export function reconcileEconomicStock(
  society: SocietyState,
  state: WorldState,
  adapter: EconomyAdapter = defaultEconomyAdapter,
): SocietyState {
  const stockBySettlement = new Map<string, number>();
  for (const snapshot of adapter.listSettlementStocks(state)) {
    stockBySettlement.set(snapshot.settlementId, snapshot.totalStock);
  }

  const stockByGroup = new Map<string, number>();
  for (const [, settlement] of sortedEntries(society.settlements)) {
    const settlementStock = stockBySettlement.get(settlement.settlementId) ?? 0;
    stockByGroup.set(settlement.groupId, (stockByGroup.get(settlement.groupId) ?? 0) + settlementStock);
  }

  let groups = society.groups;
  for (const [groupId, group] of sortedEntries(groups)) {
    const economicStockTotal = stockByGroup.get(groupId) ?? 0;
    if (group.resources.economicStockTotal === economicStockTotal) continue;
    groups = { ...groups, [groupId]: { ...group, resources: { ...group.resources, economicStockTotal } } };
  }

  return { ...society, groups };
}

# Team 09 — Economy & Trade

Status: **first slice implemented and tested; both original integration
gaps (#1 ecology depletion, #2 Team 07 stock visibility) resolved, plus a
first real Team 06 individual-labor signal wired in (2026-08-21)**, most
of the original spec (markets, trade routes, taxation, crisis dynamics)
still open. Written 2026-08-20 (Session 5), gap #1 resolved and gap #2
opened 2026-08-20/21 (Session 7), gap #2 resolved 2026-08-21 (Session 7,
continued), individual-level labor adapter added 2026-08-21 (Session 9).
Do not report more than what's below as done — check the code, not just
this file, if in doubt.

## What's real (implemented + covered by `src/sim/test/economy/economy.test.ts`)

- `EconomyState`: per-settlement, per-resourceType stock (`stocks`), plus a
  cumulative conservation ledger (`harvestedTotal`, `decayedTotal`).
- **Production/extraction**: each settlement harvests a bounded, population-
  scaled amount of each resource type available at its location (read
  read-only from Team 05 ecology), added to its own stock.
- **Individual labor (first slice)**: a new `LaborAdapter` /
  `defaultLaborAdapter` (`contracts.ts`) reads Team 06's real
  `CreatureState` (via its own public `getCreatureModuleState` helper — no
  guessed shape) and lists every creature currently performing a real
  `"gather"` action, with a per-creature `effort` derived from real
  `energy`/`fatigue`. `harvestForSettlements` (`production.ts`) uses the
  summed real laborer effort at a settlement's location to raise that
  settlement's population-based harvest cap (`laborBonusPerEffort`,
  default 0.15 — i.e. +15% cap per unit of summed effort). This is
  additive and fully backward compatible: an empty/omitted laborer list
  leaves every pre-existing formula and test byte-for-byte unchanged
  (verified — see "harvestForSettlements: ... an empty laborers list
  leaves the pre-labor formula exactly unchanged" in the test file).
  Scoped honestly: there is still no employment/wages/skills system
  anywhere upstream — this reads the one real "an individual is doing
  labor right now" signal Team 06 actually models, nothing more.
- **Storage decay**: a configurable per-resourceType fractional loss per
  tick.
- **Conservation invariant, tested**: for every resourceType, at every
  tick, `harvestedTotal - decayedTotal` exactly equals the sum of that
  resourceType across every settlement's stock. Nothing is created or
  destroyed outside those two accounted paths.
- **Determinism, tested**: same seed + same tick count → identical stocks
  (harvest jitter goes through `rng.fork("economy/harvest")`, isolated from
  every other subsystem's stream).
- Wired into `createDefaultSimulationPipeline` as an additional subsystem
  appended after Politics (order: Biology → Ecology → Creature → Society →
  Politics → **Economy**). Placed last to avoid any behavioral change to
  the previously-verified Biology–Politics chain; nothing currently reads
  Economy's output, so its position relative to Politics doesn't matter
  functionally yet.

## What's explicitly NOT built yet — do not assume these exist

- **Wages, skills, employment relationships, currency, markets, pricing.**
  Labor (above) is real but minimal: a binary "gathering or not" signal
  plus a derived effort scalar. No notion of who employs whom, what a
  laborer is "paid," or price discovery.
- **Trade routes, transportation, inter-settlement exchange of Team 09's
  own stocks.** (Team 07 has its own *separate*, abstract, single-number
  `SocialGroup.resources.pooled` trade stub in `society/economy.ts` —
  unrelated to this module; the two are not reconciled beyond the
  read-only `economicStockTotal` summary — see gap #2 below.)
- **Taxation.**
- **Crisis dynamics**: famine, price shocks, shortages, economic collapse.
- **Replay/performance evidence** beyond what the standard test suite
  already exercises (determinism + conservation tests only).

## Known integration gaps (real, open, not hidden)

1. ~~**Extraction doesn't actually deplete Team 05's ecology resource.**~~
   **RESOLVED (Session 7, 2026-08-21).** `harvestForSettlements` still only
   *reads* `EcologicalResource.availableAmount` as a ceiling — Economy still
   never calls `consumeResource` or writes into `state.modules.ecology`
   directly (that constraint from Team 09's brief is unchanged). Instead:
   every tick, the total harvested per Team 05 `resourceId` is recorded into
   `EconomyState.pendingConsumptionByResourceId` (replaced, not
   accumulated, each tick — see `production.ts`). `EcologyTickContext` now
   accepts an injectable `externalDemandsProvider` (see `ecology/
   subsystem.ts`) that feeds arbitrary external `ConsumptionDemand`s into
   ecology's own `resolveConsumption` pass, resolved fairly alongside
   herbivory/predation. `defaultSimulationPipeline.ts` (the composition
   root — the only file allowed to depend on both teams) wires a default
   provider that reads `state.modules.economy.pendingConsumptionByResourceId`.
   Because Ecology runs *before* Economy each tick, this reads last tick's
   committed harvest — a deliberate one-tick lag, not a bug, that preserves
   single-writer-per-module semantics for both teams. Covered by
   `src/sim/test/economy/economy.test.ts` ("Team 09 settlement harvesting
   actually depletes Team 05's ecology resource pool ... (gap #1)").
   Remaining follow-up: emergent settlement formation is not guaranteed
   within a short tick budget, so the pipeline-level assertion in that test
   falls back to directly exercising the bridge when no settlement forms —
   a longer-running scenario test (or a way to force settlement formation)
   would give stronger end-to-end evidence.
2. ~~**Team 09's stocks and Team 07's `SocialGroup.resources.pooled` are two
   separate, unreconciled numbers.**~~ **RESOLVED as an explicit
   audit/visibility reconciliation (Session 7, 2026-08-21) — deliberately
   NOT a merge.** `SocialGroup.resources.pooled` (Team 07's own abstract
   trade-stub number, still driven only by `society/economy.ts`'s
   sharing/trade logic) and Team 09's concrete `stocks` remain two
   independent numbers with independent write paths — merging them was
   rejected as a design direction, per the open question this gap used to
   pose. Instead, a third, purely-derived field,
   `SocialGroup.resources.economicStockTotal`, was added: a read-only,
   per-tick-refreshed sum of Team 09's real stock across every settlement a
   group owns (join key: `Settlement.groupId` ↔ `Settlement.settlementId`).
   New adapter `EconomyAdapter` / `defaultEconomyAdapter` in
   `society/contracts.ts` reads the real, already-merged Team 09
   `EconomyState.stocks` shape directly (same convention as this file's own
   Team 05/07 adapters). New function `reconcileEconomicStock` (see
   `society/economyReconciliation.ts`) does the summing and is the only
   thing that ever writes `economicStockTotal` — `pooled` is never read or
   written by it. Wired into `defaultSimulationPipeline.ts` as a **new,
   final** pipeline step, appended *after* `createEconomySubsystemTick`
   (not inside `createSocietyTick`, which still runs *before* Economy each
   tick) — so unlike gap #1's ecology bridge, this reconciliation needs no
   one-tick lag and always reflects the current tick's committed economy
   stock. Groups that own no settlement get `economicStockTotal: 0`, not
   `undefined` or a stale value. Covered by two new tests in
   `src/sim/test/economy/economy.test.ts`: a direct unit test of
   `reconcileEconomicStock` (sum-per-group, `pooled` untouched, zero for a
   settlement-less group), and a pipeline-level test that forces a known
   decay amount and asserts `economicStockTotal` matches the *post*-decay
   figure, not the pre-tick one (proving the no-lag wiring, not just the
   arithmetic). Full suite run in-session: **491/491 passing**
   (`tsx --test "src/sim/test/**/*.test.ts"`, executed directly — no
   network/npm install available in this sandbox, see GitHub sync status in
   the Master Project's Continue Here block).
3. **No settlement→locationId resolution nuance.** A settlement harvests
   only resources exactly at its own `locationId` — no hinterland/catchment
   radius, no competition between multiple settlements drawing on the same
   location beyond whatever the `maxFractionOfAvailable` cap happens to
   leave for the next settlement processed that tick (processing order is
   deterministic — sorted settlementId — but not fairness-aware).

## Next actual steps, in likely order

1. ~~Decide on and implement the Team 05 consumption-request adapter (gap
   #1)~~ Done (Session 7) — see above. A stronger long-run scenario test
   proving depletion via genuine emergent settlement formation (not the
   direct-bridge fallback) is a reasonable near-term follow-up.
2. ~~Decide on and implement Team 07 stock visibility (gap #2)~~ Done
   (Session 7) — see above. Reconciliation only runs at the end of the
   pipeline; if a future consumer needs `economicStockTotal` mid-tick (e.g.
   from inside `societyTick` itself) it will still read last tick's value —
   not currently a problem since nothing in `society/**` reads it yet.
3. ~~Individual-level labor: who works, what they produce, tied to Team 06
   individuals via a read-only adapter (same pattern as `contracts.ts`).~~
   Done (Session 9, 2026-08-21) — see "Individual labor (first slice)"
   above. Real Team 06 `CreatureState`/`getCreatureModuleState` read
   directly (no guessed shape — see contracts.ts's file header for why
   that mattered this time). Scoped to a binary gather-action signal plus
   a real-derived effort scalar; wages/skills/employment remain open.
   Full suite run in-session: **495/495 passing**
   (`tsx --test "src/sim/test/**/*.test.ts"`, executed directly against
   the real repo at commit `b6e44f2` — no network/npm install available in
   this sandbox).
4. Only after labor exists does pricing/markets/trade become meaningful —
   building a market on top of population-scaled auto-harvest alone would
   be economically hollow.

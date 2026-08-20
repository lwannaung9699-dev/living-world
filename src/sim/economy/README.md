# Team 09 — Economy & Trade

Status: **first slice implemented and tested**, most of the original spec
still open. Written 2026-08-20 (Session 5). Do not report more than what's
below as done — check the code, not just this file, if in doubt.

## What's real (implemented + covered by `src/sim/test/economy/economy.test.ts`)

- `EconomyState`: per-settlement, per-resourceType stock (`stocks`), plus a
  cumulative conservation ledger (`harvestedTotal`, `decayedTotal`).
- **Production/extraction**: each settlement harvests a bounded, population-
  scaled amount of each resource type available at its location (read
  read-only from Team 05 ecology), added to its own stock.
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

- **Labor, wages, skills, employment.** No individual-level economic
  participation at all yet — extraction is settlement-level and population-
  scaled only.
- **Markets, pricing, currency.** No price discovery, no notion of value
  beyond raw quantity.
- **Trade routes, transportation, inter-settlement exchange of Team 09's
  own stocks.** (Team 07 has its own *separate*, abstract, single-number
  `SocialGroup.resources.pooled` trade stub in `society/economy.ts` —
  unrelated to this module; the two are not reconciled. See "Known
  integration gaps" below.)
- **Taxation.**
- **Crisis dynamics**: famine, price shocks, shortages, economic collapse.
- **Replay/performance evidence** beyond what the standard test suite
  already exercises (determinism + conservation tests only).

## Known integration gaps (real, open, not hidden)

1. **Extraction doesn't actually deplete Team 05's ecology resource.**
   `harvestForSettlements` reads `EcologicalResource.availableAmount` only
   as a ceiling on what a settlement could plausibly draw — it never calls
   ecology's own `consumeResource` to write the depletion back into
   `state.modules.ecology`, because that would mean Economy mutating
   another team's module state (against this team's own brief). A real fix
   needs a consumption-request path Team 05 accepts from external callers,
   mirroring how Team 06 individuals already consume ecology resources
   internally. Until that lands, Team 05's resources and Team 09's harvest
   ceiling can drift apart across a long run.
2. **Team 09's stocks and Team 07's `SocialGroup.resources.pooled` are two
   separate, unreconciled numbers.** A settlement's "wealth" as Team 07's
   trade stub sees it and its concrete resource stock as Team 09 tracks it
   do not affect each other. Unifying them (or deciding they should stay
   separate, with Team 07's pool becoming a derived/summary view of Team
   09's real stocks) is an open design question, not just an open task.
3. **No settlement→locationId resolution nuance.** A settlement harvests
   only resources exactly at its own `locationId` — no hinterland/catchment
   radius, no competition between multiple settlements drawing on the same
   location beyond whatever the `maxFractionOfAvailable` cap happens to
   leave for the next settlement processed that tick (processing order is
   deterministic — sorted settlementId — but not fairness-aware).

## Next actual steps, in likely order

1. Decide on and implement the Team 05 consumption-request adapter (gap #1)
   before building anything that depends on extraction being "real" against
   ecology (crisis/famine detection especially needs this to be honest).
2. Individual-level labor: who works, what they produce, tied to Team 06
   individuals via a read-only adapter (same pattern as `contracts.ts`).
3. Only after labor exists does pricing/markets/trade become meaningful —
   building a market on top of population-scaled auto-harvest alone would
   be economically hollow.

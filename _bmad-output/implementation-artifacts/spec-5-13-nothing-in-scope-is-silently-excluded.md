---
title: 'Story 5.13 — Nothing in scope is silently excluded'
type: 'feature'
created: '2026-10-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '2148e15dfbe2c01eabe298e52879479f2efeee2d'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Period hour honesty is incomplete: the four-bucket sum excluding Opening Balances is not proven on a fixture that includes OB; OB is a project-wide footnote (not the UX-DR23 per-Connector caption); Review lists left-scope Tickets but not the Connector scope change that caused them; and some in-scope Tickets can sit in hour buckets without appearing as mapped or unmapped in the UI — so a client cannot prove nothing was quietly left out (FR-20, UX-DR23).

**Approach:** Prove the four mutually exclusive Period buckets (mapped baselined non-Catch-all; mapped non-baselined non-Catch-all; Catch-all = within + overflow; Unmapped) sum to Period ledger hours excluding OB via an automated fixture test; report OB separately per Connector with the UX-DR23 caption; on Review surface each scope change with the Tickets that left and their hours; ensure every in-scope Ticket is either mapped or reported unmapped — no third silent state. Consume 5.11 Q6→A and 5.12 Catch-all semantics; do not reopen Coverage UI or rewrite the attribution spine.

**Decisions (agent, recorded — not user-visible):**
- Four-bucket sum = `mappedBaselinedMh + mappedNonBaselinedMh + (catchAllMh + catchAllOverflowMh) + unmappedMh === period.totalMh` (OB excluded because Period already skips `opening_balance`). Keep the five-segment Scope Ledger / Coverage chrome from 5.11/5.12; the fixture asserts the collapsed Catch-all total.
- Harden/extend `attribution.test.ts` (and a seed/demo fixture assertion if totals are stable) — never a UI claim of the sum.
- Per-Connector OB: group `opening_balance` ledger rows by owning Connector (`actuals_ledger_entry.connector_id` / ticket owner); thread into Review DTO; do not invent a second ledger.
- Close silent exclusion: Unmapped Review groups must include every in-scope Ticket with null/absent/orphan Mapping head (including 0h and head `wpId` pointing at a missing WP); left-scope stays listed separately (out of shares per 5.11 Q6).
- Load recent `connector_scope_event` into Review (read-only); no new migration.
- Thin wiring only into 5.11 Coverage / 5.12 flag-at-seq — no redesign.
- Sync sprint-status: 5.1–5.12 → done; 5.13 → in-progress during build.

**Decisions (Harry, 2026-10-08):**
- Spec size ~1,900 tokens accepted (**Keep full spec**).
- Q1→**B**: Review + Connectors — each Connector card uses the UX-DR23 per-Connector caption; replace the project-wide Connectors OB row.
- Q2→**A**: Latest scope change per Connector (prev → new scope text + nested left-scope Tickets/hours for that Connector).

## Boundaries & Constraints

**Always:** Four Period buckets mutually exclusive and sum to in-scope Period hours excluding OB; OB reported separately per Connector with the UX-DR23 meaning; every in-scope Ticket mapped or reported unmapped; left-scope + OB stay out of Coverage shares (5.11 Q6→A); Catch-all membership/overflow from 5.12 flag-at-seq.

**Never:** Rework 5.11 Coverage chrome or 5.12 attribution/flag spine beyond thin reads; 5.14 approximate labels; 5.15 Ticket-half fixture; Epic 6; Mapping Rules harden; schedule motion; compaction/retention; Review Re-pin; Resolved UI (B); Story 3.1; Connectors coverage page; reopen 5.11 Q1–Q6.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Period four-bucket sum | Fixture entries spanning all four buckets + OB | `(baselined + non-baselined + catchAllWithin+overflow + unmapped) === period.totalMh`; OB not in Period | Automated test fails if drift |
| OB per Connector | OB entries on ≥2 Connectors | Each Connector shows UX-DR23 caption with its own hours; Project total optional rollup | Missing connector id → refuse row / test fail |
| No OB | Zero `opening_balance` rows | No misleading 0h OB claim; caption omitted or unavailable per presenters | Never show as period metric |
| Scope change + left-scope | New `connector_scope_event` + Tickets with `left_scope` | Review shows the change, those Tickets, and retained hours | Empty left-scope → still show change if event exists |
| Mapped or unmapped | In-scope Ticket with null head, orphan wpId, or 0h unmapped | Listed as unmapped (or mapped if valid leaf WP); never absent from both | N/A |
| Left-scope Ticket | `left_scope = true` | Listed in left-scope surface; out of Coverage shares | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain/src/attribution.ts` — `Buckets` already has the four (+ overflow) fields; `openingBalanceMh` is scalar. Add `openingBalanceMhByConnector: Map<string, Mh>` (needs Connector id on entries or a ticket→connector map in `AttributionInput`). Period buckets already exclude OB via `inPeriod`. Do not rewrite Catch-all LIFO / flag-at-seq.
- `packages/domain/src/attribution.test.ts` — existing `'splits hours into the four mutually exclusive FR-20 buckets…'` sums five fields including overflow into `totalMh` but does not pin Period-excluding-OB on a fixture with OB. Extend/add fixture case for Period invariant + per-Connector OB map.
- `packages/domain/src/types.ts` `LedgerEntry` — domain type lacks `connectorId` though DB `actuals_ledger_entry.connector_id` has it; extend at the boundary (or pass ownership map) so OB can group without inventing a second store.
- `packages/domain/src/review.ts` — `openingBalanceMh`, `scopeLedger`, `unmappedGroups` (skips `m?.wpId` and `mh === 0n` → silent gap), `leftScopeTicketIds`. Add per-Connector OB + scope-change DTO; fix unmapped reporting so every in-scope Ticket is mapped or listed unmapped.
- `packages/domain/src/coverage.ts` — keep OB/left-scope out of shares; thin consume only if Review/Mapping DTO sharing requires it. Do not redesign Coverage UI.
- `packages/db/src/repo.ts` / `packages/app/src/ports/project-read.ts` — already expose `meta.leftScopeTickets`; load Connector scope events (seq, connectorId, scope, at) into Review bundle; ensure ledger→domain carries connector id.
- `packages/app/src/use-cases/get-project-review.ts` (+ mapping load if shared) — thread new DTO fields; no schedule writes.
- `apps/web/src/app/p/[projectId]/review/page.tsx` — per-Connector UX-DR23 OB lines; latest scope-change panel (prev → new + nested left-scope Tickets/hours) per Q2→A.
- `apps/web/src/app/p/[projectId]/connectors/page.tsx` — Q1→B: replace project-wide OB row with per-Connector UX-DR23 caption on each Connector card.
- `packages/i18n/src/messages/{en,ja}.json` — align Review + Connectors OB copy to: "Opening Balance {hours}h — hours before momo-keikaku could observe them. Excluded from period metrics."; add scope-change strings. en+ja.
- Do not change: `mapping-coverage.tsx` chrome; `wp_flag_event` / 5.12 spine; Story 3.1; schedule engine.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain` attribution (+ types) — per-Connector OB map; Period four-bucket sum fixture test excluding OB; unit-test I/O matrix rows for sum/OB/no-OB.
- [x] `packages/domain` review (+ tests) — close silent unmapped gaps; expose per-Connector OB + scope-change rows with left-scope Tickets/hours.
- [x] `packages/db` + `packages/app` ports/loadReview — carry connector id on ledger; load scope events; DTO wiring for Review + Connectors (Q1→B).
- [x] `apps/web` Review + Connectors + `packages/i18n` en/ja — UX-DR23 OB captions; latest scope-change surface (Q2→A); no Coverage redesign.
- [x] `sprint-status.yaml` — 5.1–5.12 → done if lagging; 5.13 → in-progress then review.

**Acceptance Criteria:**
- Given any Reporting Period and Connector, when the four figures are summed, then mapped baselined non-CA + mapped non-baselined non-CA + Catch-all (within+overflow) + Unmapped equal Period ledger hours excluding OB (FR-20).
- Given that sum, when tested, then an automated fixture test proves it — not a UI claim (FR-20).
- Given Opening Balances, when reported, then each Connector shows the UX-DR23 caption with its own hours (FR-20, UX-DR23).
- Given a Connector whose scope changes, when Review renders, then it shows the change, the Tickets that left scope, and their hours (FR-20).
- Given every in-scope Ticket, when reported, then it is mapped or reported unmapped — no third silent state (FR-20).

## Implementation Notes

- `LedgerEntry.connectorId` optional at domain ingest; DB `loadReview` / ingest prior-ledger and demo fixtures stamp it. OB without a resolvable Connector id throws in `attribute`.
- Period honesty fixture: four collapsed buckets (`catchAllMh + catchAllOverflowMh`) === `period.totalMh` on a ledger that also carries OB.
- Unmapped census: null/absent/orphan head + 0h in-scope Tickets listed; left-scope excluded.
- Review DTO: `openingBalanceByConnector`, `latestScopeChanges` (prev→new when ≥2 scope events). Connectors page uses per-Connector UX-DR23 caption only.
- Verified: `pnpm lint`, `typecheck`, `depcruise`, `pnpm test` (1437 passed), `pnpm db:sql` (no migration).
- Review patches: ja UX-DR23 OB copy; Connectors OB outside `hasSnapshot`; `snapshot.ticketCount` full pin; `ownerConnectorByTicket` OB fallback test; demo-golden Period/OB-by-connector pins; seed second scope event + db-round-trip wiring asserts. Deferred: multi-card Connectors list; page HTML tests.

## Spec Change Log

## Review Triage Log

- `medium` → patch — `ja.json` OB / UX-DR23 captions (`connectors.opening_balance_*`, `review.unplanned.opening_balance_*`) stay English while new scope-change keys were localized.
- `low` → reject — leftover `opening_balance_row` / `opening_balance_footnote` / unused `opening_balance_caption` keys: everyday harm low; deletion is cleanup, not a product defect.
- `false` — spec `status: in-progress` vs sprint `review`: process lag during step-04; working tree set to `in-review`.
- `medium` → patch — demo-golden / Period honesty: agent decision asked for a seed/demo assertion when totals are stable; golden still only pins scalar `openingBalanceMh`, not per-Connector OB or Period four-bucket === `period.totalMh`.
- `false` — `diffLedger` OB without `connectorId` hard-fails Review: production load/ingest stamps `connector_id` on insert and `loadReview` maps it; throw is a fixture guard, not a live path.
- `false` — nesting all current left-scope under latest prev→new: matches Q2→A (latest change + that Connector's left-scope Tickets/hours), not a causal time filter.
- `false` — Review ScopeLedgerBar project-wide footnote plus per-Connector OB list: intentional rollup; Q1→B only required Connectors to drop the dishonest project-wide row.
- `false` — UX-DR23 caption omitted FR-42 “counted in cumulative AC”: epic/UX-DR23 text is exactly the shorter caption; Design Notes keep FR-42 for domain, not UI copy.
- `medium` → patch — Connectors OB caption gated behind `hasSnapshot`; move it so a Connector with OB hours is not hidden by the snapshot branch.
- `medium` → patch — no test for `ownerConnectorByTicket` fallback when OB entry lacks `connectorId`.
- `low` → reject — duplicate left-scope under scope-change and `review-left-scope-list`: both surfaces intentional; clarifying copy is polish.
- `medium` → patch — `snapshot.ticketCount` now uses `inScopePinned.length` (excludes left-scope); pre-5.13 used full pin length for the snapshot chrome while coverage shares stay in-scope-only.
- `false` — scope events without `leftScopeTicketDetails`: production `loadReview` always sets both; empty nest only if a unit caller omits details.
- `defer` — Connectors page single `meta.connector` card cannot show every Connector's OB when multi-Connector; pre-existing page shape, not introduced as a multi-card rewrite.
- `medium` → patch (VG) — `db-round-trip` never asserts `bundle.input.connectorScopeEvents` / `leftScopeTicketDetails` (or `review.openingBalanceByConnector` / non-empty `latestScopeChanges` when ≥2 events seeded).
- `defer` (VG) — no web/page tests for new `data-testid`s; repo pins Review at domain/demo-golden/db-round-trip, not page HTML.

## Design Notes

**Four vs five:** UI/Coverage keep five hour segments (Catch-all within vs overflow). The FR-20 honesty invariant collapses Catch-all to one bucket: `catchAllMh + catchAllOverflowMh`.

**Period vs cumulative:** OB still rolls into cumulative AC buckets (FR-42). The fixture sum asserts **Period** totals, which already skip `opening_balance`.

**Silent exclusion sketch:** head `wpId` set but WP missing → treat as unmapped for listing (matches attribution's unmapped push when `!wp`); 0h unmapped in-scope Tickets still appear in Unmapped (count/hours 0) so the census is complete.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm depcruise` — expected: exit 0
- `pnpm test` (domain attribution/review + app/web as touched; REQUIRE_DB only if load path needs it) — expected: new Period sum + OB-by-connector + left-scope/unmapped cases green
- `pnpm db:sql` — expected: no drift (no new migration)

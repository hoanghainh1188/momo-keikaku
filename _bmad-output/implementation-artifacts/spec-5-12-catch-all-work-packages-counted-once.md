---
title: 'Story 5.12 — Catch-all Work Packages, counted once'
type: 'feature'
created: '2026-10-07'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5072d9ae2b71aec6a1a68baabd5573902e8f3f6c'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Catch-all is only a live `work_package.is_catch_all` bit: there is no `wp_flag_event` / `wp_flag_seq_max`, attribution sorts by `seq` alone (not `(window_end, seq)`), EVM LOE still keys off the live flag instead of the Baseline copy, AR-18 golden tests for crossing prorate / negative-delta LIFO are thin, and SM-C1's Catch-all share of total hours is not reported — so overflow can be mis-ordered, double-counted, or hide while Unplanned falls (FR-24, FR-30, AR-18/19/22, SM-C1).

**Approach:** Create append-only `wp_flag_event` (this story owns the table); pin `wp_flag_seq_max` into ComputationInputs; attribution judges Catch-all at the flag head ≤ pin while PV/BAC/LOE read `baseline_wp.is_catch_all`; harden overflow to cumulative `(window_end, seq)` with prorate + LIFO negatives and golden tests; report SM-C1 Catch-all share on Review; let the PM set/clear Catch-all from the Plan grid via events (not a live-only flip).

**Decisions (agent, recorded — not user-visible):**
- Dual-write: append `wp_flag_event` and update `work_package.is_catch_all` as a display/head cache (Plan grid tag). Attribution never trusts the live column for compute — only flag-at-`wp_flag_seq_max`.
- EVM LOE gate reads `baseline_wp.is_catch_all` (thread through domain `BaselineWp`); never live `wp.isCatchAll` for PV/BAC.
- Entry order = `(window_end, seq)`; crossing entry prorated; each part costed at that entry's Rate; negative deltas LIFO from an overflow slice stack per Catch-all WP.
- Leaf non-milestone WPs only may be flagged Catch-all; refuse summary/milestone.
- Set/Re-baseline keeps copying Catch-all into `baseline_wp` from the event head (or live cache, same value after dual-write).
- Close 5.11 deferral: attribution exposes per-Ticket overflow mh so Coverage's catch-all-overflow Ticket set is honest (no invented distinct set).
- Migration `0013_wp_flag_event.sql`; registry `append-only`; seed/fixtures append an initial event for existing Catch-all WPs.
- Do not rework 5.11 Coverage UI beyond thin consumption of flag-at-seq / overflow Ticket ids; do not implement 5.13–5.15 or Epic 6.

**Decisions (Harry, 2026-10-08):**
- Q1→**A**: Plan-grid toggle (checkbox/tag action) appends `wp_flag_event` and dual-writes the live column — Catch-all is a WP attribute on the plan, not a Mapping/Coverage control.
- Q2→**A**: Review shows SM-C1 Catch-all share of total hours near Unplanned / Scope Ledger — counter-metric for honesty, not co-located with SM-5 coverage quality.

</frozen-after-approval>

## Code Map

- `packages/db/src/schema.ts` — add `wpFlagEvent` (`seq` IDENTITY PK, `tenant_id`, `project_id`, `wp_id`, `is_catch_all` bool, `actor`, `at`; UNIQUE `(tenant_id, seq)`; FK to WP; index by WP+seq). Mirror `wp_status_event` / `tracker_account_link_event` (0010). Migration `packages/db/drizzle/0013_wp_flag_event.sql`; `table-classes.ts` `append-only`; `pnpm db:sql`; bump registry/catalog/seed/truncate lists.
- `packages/domain/src/types.ts` `BaselineWp` — add `isCatchAll`; keep live `WorkPackage.isCatchAll` for display/cache only.
- `packages/domain/src/attribution.ts:159–232` — sort `(windowEnd, seq)`; resolve Catch-all via flag head ≤ `wpFlagSeqMax` (pass flag events + pin on input); keep water-level within/over split; replace naïve unwind with LIFO overflow stack for negatives; track `overflowMhByTicket`; cost each part at entry Rate. Tests in `attribution.test.ts` — crossing prorate multi-entry, negative straddling cap, no-Baseline→all Unplanned, order by window_end.
- `packages/domain/src/evm.ts:176–185` — LOE when `baselineWp.isCatchAll && baselineMh > 0n`.
- `packages/domain/src/review.ts` `ReviewInput` — `wpFlagEvents`, `wpFlagSeqMax`; SM-C1 = `(catchAllMh + catchAllOverflowMh) / totalMh` on cumulative (and period if useful); present via existing ratio helpers (never as 0 when unavailable).
- `packages/domain/src/coverage.ts` / `get-project-mapping` — consume honest overflow Ticket ids from attribution; thin flag-at-seq if coverage still needs Catch-all membership at pin (do not redesign 5.11 UI).
- `packages/db/src/repo.ts` — stop stripping `baseline_wp.is_catch_all`; load flag events; pin `wp_flag_seq_max` in review/mapping load paths (watermark lock pattern).
- `packages/app` — use case `set-wp-catch-all` (or plan-input sibling): under project lock, append event, dual-write live column, audit; refuse non-leaf/milestone; roles/audit declarations. Wire Plan-grid toggle (Q1→A).
- `packages/app/src/baseline/append-baseline-version.ts:79` — copy Catch-all from event head / live cache into `baseline_wp`.
- Seed / `scripts/gen-fixtures.ts` / load-gen — for Catch-all leaves, append matching `wp_flag_event` so head ≡ column.
- `apps/web` Plan tree grid — Catch-all toggle/action on leaf rows; Review — SM-C1 caption near Unplanned / Scope Ledger (Q2→A).
- `packages/i18n` en+ja — SM-C1 + Plan-grid flag toggle strings.
- Do not change: schedule engine; 5.9 DnD; 5.10 rules; 5.11 Coverage chrome (except thin reads); 5.13 exclusion UI; approximate labels; Ticket load fixture.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/db` — `wp_flag_event` schema + 0013 migration + registry/RLS/seed/fixtures dual-write.
- [ ] `packages/domain` — flag-at-seq attribution; `(window_end, seq)` + prorate/LIFO goldens; Baseline LOE gate; SM-C1 metric; per-Ticket overflow; I/O matrix tests.
- [ ] `packages/db` + `packages/app` — load pins/events; set/clear Catch-all use case under lock; baseline copy; mapping/review DTOs.
- [ ] `apps/web` + `packages/i18n` — Plan-grid Catch-all toggle (Q1→A) + Review SM-C1 caption (Q2→A); no 5.11 Coverage redesign.
- [ ] `tests/` + `sprint-status.yaml` — fence green; 5.1–5.11 → done if lagging; 5.12 → in-progress; close or keep overflow-Ticket deferral note honestly.

**Acceptance Criteria:**
- Given a WP flagged Catch-all, when recorded, then a `wp_flag_event` row is appended and attribution judges at `wp_flag_seq_max` while PV/BAC read `baseline_wp.is_catch_all` (FR-24, AR-22, AR-19).
- Given Catch-all **with** Baseline hours, when measured, then LOE AC ≤ Baseline hours and overflow is Unplanned on the Project *Unplanned* line only — never double-counted (FR-24, FR-30).
- Given Catch-all **without** Baseline hours, when measured, then all hours are Unplanned (FR-24).
- Given overflow, when computed, then cumulative per Catch-all WP in `(window_end, seq)` vs each entry's active Baseline hours; crossing entry prorated; each part at its Rate; negatives LIFO from overflow (AR-18).
- Given crossing entry and negative delta straddling the cap, when tested, then golden tests cover both (AR-18).
- Given SM-C1, when watched, then Catch-all share of total hours is reported (SM-C1).

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

**Overflow LIFO (golden sketch):** Cap 10h. Entries in `(window_end, seq)`: +8h → within 8; +5h → within 2 + overflow 3 (prorate same Rate); −4h LIFO → clears 3 overflow then −1 within. No-Baseline cap 0 → all hours overflow/Unplanned. Flag cleared at seq F: entries judged with pin ≥ F see non-Catch-all buckets; pin < F still Catch-all.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm depcruise` — expected: exit 0
- `pnpm test` (domain attribution/evm/review + db/app as applicable; `REQUIRE_DB=1` for migration/registry) — expected: new goldens green; fence still green
- `pnpm db:sql` — expected: no drift after registry change

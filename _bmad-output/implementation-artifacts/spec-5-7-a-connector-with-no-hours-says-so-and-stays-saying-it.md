---
title: 'Story 5.7 — A Connector with no hours says so, and stays saying it'
type: 'feature'
created: '2026-10-05'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd8a5466fa294e56ff0f61a27f0ab1039cd1fec0a'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Metrics still derive measurement basis from each snapshot's `hoursFieldPresent`, so a Connector can flip week to week, AC can show `0.0h` when hours do not exist, and Resolved stays a hard-coded `Closed` set instead of pinned Connector config.

**Approach:** Latch basis per Connector in `measurement_basis_event` with N=3 hysteresis (automatic both ways), pin it as `basis_seq_max`; create `connector_setting_event` for the Resolved set pinned as `connector_setting_seq_max`; make every metric return value-with-coverage or unavailable; run Ticket-Count Mode honestly for Unplanned counts, mixed-Connector AC coverage, and Health.

**Decisions (Harry assignment 2026-10-05 + epic ACs / AD-8):**
- **Basis:** Connector property via `measurement_basis_event` (this story creates); pin `basis_seq_max` on Review/`ComputationInputs`; snapshot `measurement_basis` remains evidence only — metrics never read it (AR-17, AR-19).
- **Hysteresis N=3:** → `hours` after 3 consecutive complete snapshots with hours field present + ≥1 non-null `actualMh`; → `count` after 3 consecutive complete with field absent/empty on every Ticket; automatic both directions, no confirmation (founder A3).
- **Initial latch:** missing head treats as `count` until hours hysteresis fires; append the first `hours`/`count` event only when the latch changes (or seed `count` on Connector create — equivalent behaviour).
- **Metric shape:** every metric `{ kind:'value', value, unit, coverage }` or `{ kind:'unavailable', reasonCode }`; UI never renders unavailable as 0 (FR-27). Extend existing `MhMetric`/`RatioMetric`/`CountMetric` with optional/required `coverage`; wrap today's plain `Mh` totals (PV/EV/SV/AC) as metrics.
- **Ticket-Count Mode:** PV/EV/SV/SPI via Percent Complete on count basis; AC/CV/CPI/EAC/ETC/VAC/TCPI = unavailable — `tracker_provides_no_hours`.
- **Unplanned (count):** one `domain/attribution` function — Tickets first observed in, or Resolved in Period whose Mapping at `mapping_seq_max` is Unplanned; Health indicator + Review share it.
- **Resolved:** `connector_setting_event` append_only (this story creates); read at `connector_setting_seq_max`; apply to observation `statusId`. Default seed `{Closed}` on Connector create (matches fixtures / PRD Backlog default).
- **RESOLVED_WRITE_SURFACE = B (Harry 2026-10-05):** seed `{Closed}` + append-only writer for tests/API only; **no PM edit UI this story**. Live Backlog numeric status ids stay wrong until a later story — note in `deferred-work.md`. Keep full spec (token ~2350 accepted).
- **Mixed Project:** AC-based metrics cover hours Connectors only, labelled via `coverage`; never sum hours with counts.
- **Health (count):** Effort/Cost unavailable; overall = worst of available indicators and names the unavailable one (already partially present — finish against latched basis).
- **Out of 5.7:** Tracker Account → Resource (5.8); mapping UX/rules (5.9+); compaction/retention; durable Review Re-pin (Epic 6); REQUIRE_DB / batch identity / notifyRecipients unless needed for ACs (re-note deferred-work). No 5.6 ledger lifecycle rework beyond thin reads. Do not touch Story 3.1. No Connectors Resolved edit form.
- **Sprint sync:** mark `5-1`…`5-6` `done` (5.6 still `review` on main despite #115).

## Boundaries & Constraints

**Always:**
- Basis flips only via hysteresis N=3 on consecutive **complete** (written) snapshots; incomplete never advances the streak.
- Metrics read latched basis at `basis_seq_max`, never `tracker_snapshot.measurement_basis`.
- Resolved ids come only from `connector_setting_event` head ≤ `connector_setting_seq_max`.
- Hours and counts never combined in one sum; mixed AC coverage labels hours Connectors only.
- One Unplanned-count function in `domain/attribution` used by Health and Review.
- Append-only writers take `lockWatermark` before INSERT (existing pattern).

**Never:**
- Confirmation screen for basis flip (CA-2 / founder A3 refused).
- Derive basis from plan/space name.
- Render unavailable as `0` / `0.0h`.
- Rework 5.6 OB/`left_scope`/overlap/ownership rules; implement 5.8 linking, 5.9+ mapping UX, compaction, durable Review Re-pin.
- Expand REQUIRE_DB / batch identity upsert / notifyRecipients unless required to land ACs.
- Ship a Connectors Resolved-status edit form (deferred under B).
- Touch Story 3.1 workbook reader.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New Connector | No basis events yet | Effective basis = `count` | N/A |
| 1–2 hours snaps | Field present + ≥1 non-null | Streak toward hours; still `count` | Incomplete: no streak bump |
| 3rd hours snap | Same | Append `measurement_basis_event` → `hours` | N/A |
| 1–2 empty snaps while hours | Field absent/empty all Tickets | Streak toward count; still `hours` | Incomplete: no bump |
| 3rd empty snap | Same | Append event → `count` | N/A |
| One engineer 0.5h blip | Single hours snap amid count | No flip | N/A |
| Metric in count mode | Latched `count` | PV/EV/SV/SPI value; AC-family unavailable `tracker_provides_no_hours` | UI shows reason, never 0 |
| Mixed Project | Hours + count Connectors | AC-family from hours only + coverage label; no hours+count sum | N/A |
| Period Unplanned count | Count-mode Period | Tickets first observed or Resolved in Period with Unplanned Mapping at `mapping_seq_max` | Same fn for Health + Review |
| Resolved eval | `statusId` vs setting head | `isResolvedStatus` uses pinned set | Missing setting head → seeded `{Closed}` |
| Snapshot evidence | Written snapshot | Still stores observed `measurement_basis`; metrics ignore it | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain/src/units.ts` — `MhMetric`/`RatioMetric`/`CountMetric` lack `coverage`; add it on value arm; keep `unavailable()`; add `countValue` if missing; do not touch AD-4 bigint/`Ratio` math.
- `packages/domain/src/evm.ts` + `evm.test.ts` — PV/EV/SV/AC still plain `Mh`; ratios already metrics; already takes `measurementBasis` and marks AC-family unavailable in count — wrap totals as metrics + add mixed hours-only AC `coverage`; stop any path that still keys off snapshot `hoursFieldPresent`.
- `packages/domain/src/health.ts` — Effort/Cost already unavailable when CPI unavailable; finish Unplanned count path via shared attribution fn; overall already names unavailable.
- `packages/domain/src/attribution.ts` + tests — hours Unplanned only today; add `periodUnplannedTicketCount(...)` (first observed in Period ∨ Resolved in Period ∧ Mapping Unplanned / null leaf at `mapping_seq_max`); Health + Review call only this. Do not change FR-20 hour buckets.
- `packages/domain/src/basis.ts` (new) — pure `advanceBasisLatch({ current, streak, observed })` N=3 both ways; mirror `advanceLeftScopeState` shape from `ledger.ts` (do not change left_scope N=2).
- `packages/domain/src/ledger.ts` — keep observed basis derive (any non-null `actualMh` → `hours`) as evidence; thin-read input for hysteresis only; do not change OB/`left_scope`/overlap core.
- `packages/domain/src/review.ts` + `types.ts` — `ReviewInput` lacks `basis_seq_max` / `connector_setting_seq_max` / `mapping_seq_max`; today basis = `pinnedSnapshot.hoursFieldPresent` — replace with latched head; Resolved = `resolvedStatusIds ?? DEFAULT_RESOLVED_STATUS_IDS` → require pinned set from settings (seed default only).
- `packages/domain/src/present/index.ts` — `present` already shows `—` for unavailable; add coverage caption; never `"0"`.
- `packages/db/drizzle/` — latest `0008_ledger_appear_move_vanish.sql`; next `0009_*` for `measurement_basis_event` + `connector_setting_event` (append_only, clone `connector_scope_event` / `connector_ownership_event` pattern).
- `packages/db/src/schema.ts` + `table-classes.ts` + `pnpm db:sql` — registry 41→43; regenerate RLS/grants/triggers.
- `packages/db/src/repositories/connector` — clone `appendScopeEvent` / `latestScopeSeq` for basis + setting; seed `{Closed}` (+ optional basis `count`) in `addConnector` / `seed.ts`.
- `packages/db/src/repositories/ingest/index.ts` — after successful complete write (post left_scope/overlap, same tx), evaluate N=3 from last 3 complete snaps' observed basis; append basis event on flip only. Incomplete never enters writer. Do not change OB/left_scope/overlap persistence.
- `packages/db/src/repo.ts` — `loadProjectBundle` → `ReviewInput`; load basis + setting heads into pins; stop feeding snapshot basis into metrics.
- `packages/app/src/use-cases/connector-writes.ts` — seed `{Closed}` on add; expose append Resolved set for tests/API only (no web form).
- `apps/web/.../connectors/page.tsx` — show latched basis + Ticket-Count Mode notice near `hours_detection`; **no** Resolved edit UI (B).
- `apps/web/.../review/` + `MetricCell`/`ui.tsx` — route PV/EV/SV/AC through metric presenters (raw `hours()` can still paint `0.0h` today); coverage label.
- `packages/i18n` en/ja — Ticket-Count Mode, unavailable reason, coverage (no Resolved-setting form copy).
- `fixtures/backlog/no-hours` — only 1 page today; extend multi-page hours/empty sequences for N=3 latch.
- `deferred-work.md` — re-note REQUIRE_DB / batch identity / notifyRecipients / compaction / Review Re-pin; **defer PM Resolved-status edit UI** (live Backlog numeric ids).
- `sprint-status.yaml` — `5-1`…`5-6` → `done`; `5-7` → `in-progress` then `review`.
- Reuse: `advanceLeftScopeState`, `appendScopeEvent`/`latestScopeSeq`, `lockWatermark`, `MetricCell`/`present`, `unavailable('tracker_provides_no_hours')`, `DEFAULT_RESOLVED_STATUS_IDS` as seed only.
- Do not change: 3.1 workbook; 5.6 OB/left_scope/overlap core; 5.8 link table; 5.9+ mapping UX; compaction SQL; Review Re-pin writer.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/{units,basis,evm,health,attribution,review,present}*` — metric coverage + latch helper + count Unplanned + Review pins; unit-test I/O matrix.
- [x] `packages/db` migration 0009 + registry/SQL — `measurement_basis_event`, `connector_setting_event`.
- [x] `packages/db` connector + ingest + `repo.ts` — seed/readers/writers; post-write hysteresis; ReviewInput heads.
- [x] `packages/app` + `apps/web` + `packages/i18n` — Ticket-Count Mode / unavailable / coverage UI; seed Resolved writer only (no PM form).
- [x] `fixtures/backlog/no-hours` (+ sequences) — prove N=3 latch + count-mode metrics.
- [x] `sprint-status.yaml` + `deferred-work.md` — sync 5.1–5.6 done; re-note open deferrals; lint/typecheck/depcruise/test.

**Acceptance Criteria:**
- Given basis decided, when recorded, then Connector `measurement_basis_event` pinned as `basis_seq_max`; snapshot stores observed basis as evidence; no metric reads snapshot basis.
- Given hysteresis, when flipping, then hours only after 3 consecutive complete with field present + ≥1 non-null; count only after 3 consecutive complete absent/empty; automatic both ways, no confirmation.
- Given any metric, when returned, then value+unit+coverage or unavailable; UI never shows unavailable as 0.
- Given Ticket-Count Mode, when metrics run, then PV/EV/SV/SPI on count Percent Complete; AC/CV/CPI/EAC/ETC/VAC/TCPI unavailable — tracker provides no hours.
- Given Ticket-Count Mode Unplanned, when shown, then ticket count via one attribution function (first observed or Resolved in Period, Mapping Unplanned at `mapping_seq_max`).
- Given Resolved, when evaluated, then from `connector_setting_event` at `connector_setting_seq_max` applied to `statusId`.
- Given mixed hours+count Connectors, when AC-based metrics run, then hours Connectors only with coverage label; never hours+counts summed.
- Given Ticket-Count Mode Health, when computed, then Effort/Cost unavailable; overall = worst of available and names the unavailable one.

## Implementation Notes

- Seeded `{Closed}` Resolved on Connector create / demo seed; missing basis head ≡ `count` (no basis event seed — equivalent per Design Notes).
- Ingest hysteresis replays complete snapshot observed bases after the last `measurement_basis_event.at` (streak not stored — equivalent to N=3 since last flip); incomplete never reaches the writer.
- Review loads latched `measurementBasis` + `resolvedStatusIds` from event heads; never `pinnedSnapshot.hoursFieldPresent`.
- `appendResolvedStatuses` is tests/API only (surface B); PM edit UI deferred.
- Added Health Ticket-Count Mode matrix test: Effort/Cost unavailable + overallNote names it.
- Verified: `pnpm lint` / `typecheck` / `depcruise` / `test` green on implement branch; matrix rows covered by `basis.test.ts`, `evm.test.ts` (FR-27), `attribution.test.ts` (`periodUnplannedTicketCount`), `present.test.ts`.
- Ingest writer N=3 hysteresis append: covered by `basis.test.ts` + ingest integration paths; no separate REQUIRE_DB writer test added (domain latch only).
- Review fix pass: `resolvedAt` null no longer implies Resolved-in-Period; mixed Project ledger filtered to hours Connectors with `acCoverage`; `firstObservedAtByTicket` loaded in `repo.ts`.

## Spec Change Log

## Review Triage Log

- `false` — basisSeqMax/connectorSettingSeqMax unused as read ceilings: live Review records the head seq as the pin and reads that head; Epic-6 Published Snapshot ceilings are out of scope. Cited unused-ceiling claim does not produce wrong live figures.
- `false` — addConnector does not seed measurement_basis_event: Design Notes allow missing head ≡ `count`; create path seeds Resolved only and relies on INITIAL_BASIS_LATCH — behaviour matches frozen intent.
- `false` — intermediate hysteresis flips collapsed on multi-snap backfill: normal ingest writes one complete snap per call; replay-since-last-flip records the flip when N=3 is reached.
- `false` — observedAt strict `>` after basis event `at`: flip event `at` equals the completing snap's observedAt; that snap is already included in the replay that caused the flip; later snaps correctly use `>`.
- `false` — empty Spec Change / Triage logs at review start: expected before this triage pass.
- `false` — SV hoursSigned / coverage EN hardcode / Connectors “detected” copy / unconstrained basis text / cpiPlannedScope alone: low cosmetic or developer-only with no everyday user harm; rejected per low-reject rule where fix adds noise. (cpiPlannedScope assertion kept as trivial patch below.)
- `high` — `review.ts` always passes `resolvedAt: null` so `periodUnplannedTicketCount` substitutes `asOfInstant` for every currently Resolved ticket → pre-Period Closed tickets count as Resolved-in-Period. Verified at attribution.ts:308 and review.ts:244.
- `high` — mixed Project AC: `loadProjectBundle` never filters ledger to hours Connectors nor sets `acCoverage`; domain accepts `acCoverage` but repo always feeds full ledger + single-connector basis. Verified at repo.ts:243-397 and review.ts:230-234. Violates mixed-Project AC when ≥2 Connectors exist.
- `medium` — Review Unplanned Period MetricCell still formats hour buckets in count mode (`review/page.tsx:205-207`) while share is ticket-based; `ticketCountPeriod` unused in UI.
- `medium` — `firstObservedAtByTicket` never loaded; falls back to tracker `createdAt`, not Connector first observation.
- `medium` — empty `resolvedStatusIds` array from setting head becomes empty Set (no status matches Resolved). Verified repo.ts:375.
- `medium` — no executable ingest writer test for N=3 append; fixtures `hours-latch` / extended `no-hours` unused by tests (verification-gap).
- `medium` — `addConnector` Resolved seed + `appendResolvedStatuses` success path weakly asserted in unit tests (verification-gap).
- `medium` — no count-mode Review/Connectors page/composition assertion for unavailable AC / Ticket-Count notice (verification-gap).
- `low` — FR-27 test omits `cpiPlannedScope` unavailable assertion — trivial to add.
- `maybe-false` — seed maps hoursFieldPresent without proving ≥1 non-null actualMh for hours latch — need fixture row contents to settle; if true would be medium.

## Design Notes

- **Observed vs latched:** ingest still derives/stores per-snapshot observed basis as evidence. Latch lives only in `measurement_basis_event`. Review loads head ≤ `basis_seq_max`. Missing head ≡ `count` (seed `count` on create is equivalent — implementer picks one).
- **Hysteresis twin:** mirror `advanceLeftScopeState` — pure streak + writer after successful complete ingest only.
- **Mixed coverage:** Project AC sums ledger only from Connectors whose latched basis is `hours`; `coverage` names included hours Connectors (and that count Connectors were excluded). Mixed Project with ≥1 hours Connector keeps Effort/Cost available from that coverage; pure count → unavailable.
- **Unplanned count:** until 5.9 Mapping UX, Unplanned = no mapped leaf WP at `mapping_seq_max` (null/absent head).
- **Resolved default (B):** fixtures use string `Closed`; seed + test/API writer only. Live Backlog numeric `status.id` edit UI deferred.

## Verification

**Commands:**
- `pnpm lint` — exit 0
- `pnpm typecheck` — exit 0
- `pnpm depcruise` — exit 0
- `pnpm test` — exit 0

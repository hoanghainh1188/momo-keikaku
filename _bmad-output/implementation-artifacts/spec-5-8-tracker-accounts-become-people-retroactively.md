---
title: 'Story 5.8 — Tracker Accounts become people, retroactively'
type: 'feature'
created: '2026-10-06'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '430053d84c4b1dbe9d9818d8f3c326d16529594d'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ledger hours carry only `assignee_account_id`. Attribution still resolves people via the mutable `resource.tracker_account_ids[]` spike, with no append-only link history, no `link_seq_max` pin, no suggestion UI, and no Department *Unattributed* line — so a late link cannot fix past hours reproducibly, and account PII can leak into operator logs.

**Approach:** Create append-only `tracker_account_link_event`; resolve Resource at query time at `link_seq_max` (Rates pattern); add Connectors linking panel with name/email suggestions; cost Unattributed hours at Project default Rate and expose an *Unattributed* Department roll-up line in domain; redact Tracker Account display names/emails from logs/metrics (NFR-S6).

**Decisions (Harry assignment 2026-10-06 + epic ACs / AD-9 / UX Connectors):**
- **Link store:** `tracker_account_link_event` append_only (this story creates); head per `tracker_account_id` at `link_seq_max`; `resource_id` nullable for unlink; ledger never stores `resource_id` (AR-15).
- **Live cache:** dual-write head into `resource.tracker_account_ids[]` (Rates/`default_rate_jpy` pattern) so seed and list reads stay cheap; compute paths build `Resource.trackerAccountIds` from events ≤ `link_seq_max`, not from the live array alone.
- **Panel:** Connectors page Tracker Account linking panel (UX-DR / EXPERIENCE Connectors + Flow 2). Suggest by exact case-insensitive email, else exact case-insensitive display name ↔ Resource name. Per-row Link/Change/Unlink + Accept-all for outstanding suggestions.
- **Unattributed:** null assignee or no link head → Project default Rate via `project_default_rate_entry` / `projectDefaultRateSeqMax` (already in `rateFor`). Domain `departmentEffortRollup` (or equivalent) emits an *Unattributed* line so Department totals = Project totals; no FR-33 Department UI (Post-Q1).
- **Pins:** `linkSeqMax` on `ReviewInput` / Attribution pins; omit = live head; set = pinned (Published Snapshots later).
- **PII:** extend `PINO_REDACT_PATHS` for `displayName`/`email` (and nested); never put account name/email in metrics labels.
- **Out of 5.8:** 5.7 basis/Resolved UI (RESOLVED_WRITE_SURFACE=B stays deferred); 5.9+ mapping UX/`mapping_event`/`mapping_head`/drag-drop; compaction / Review Re-pin (Epic 6); REQUIRE_DB / batch identity / notifyRecipients unless needed for ACs (re-note deferred-work). No Story 3.1.

## Boundaries & Constraints

**Always:**
- Resource for an assignee is the latest `tracker_account_link_event` with `seq ≤ link_seq_max` (or live head when unpinned).
- Unlinked account or null assignee → Unattributed at Project default Rate; never invent a Resource.
- Department roll-up totals including *Unattributed* equal Project totals for the same period.
- Tracker Account `display_name` / `email` never appear in operator logs or metrics (NFR-S6 / NFR-O1).
- Append link events under Tenant watermark lock (same as `rate_entry`); actor + `at` recorded.

**Never:**
- Store `resource_id` on `actuals_ledger_entry` or rewrite ledger rows on link.
- Rework 5.7 hysteresis / Ticket-Count Mode / metric unavailable shape / `measurement_basis_event` / Resolved PM edit UI.
- Implement mapping UX, `mapping_event` writers, `mapping_head`, or drag-and-drop Map (5.9+).
- Ship FR-33 Department view UI, compaction, durable Review Re-pin, or expand REQUIRE_DB / batch identity / notifyRecipients unless required for 5.8 ACs.
- Touch Story 3.1 workbook reader.
- Log or metric-label Tracker Account names/emails.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Suggest email match | Account email equals Resource email (CI) | Suggested Resource ranked first | No email on either → try name |
| Suggest name match | Display name equals Resource name (CI); no email hit | Suggested Resource | No match → listed unlinked, no suggestion |
| Record link | PM confirms account → Resource | Append link event; dual-write array; live AC uses Resource Rate | Unknown ids → `invalid_input` |
| Unlink | PM unlinks | Append `resource_id = null`; hours become Unattributed at default Rate | N/A |
| Late link retroactive | Hours already in ledger; link after | Live view costs at Resource Rate; pin below event leaves Unattributed | N/A |
| Pin `link_seq_max` | Event seq 5 linked; pin = 4 | Resolve as before link (Unattributed / prior Resource) | N/A |
| Null assignee | `assignee_account_id = null` | Unattributed @ Project default Rate | N/A |
| Department roll-up | Mixed linked + Unattributed hours | Per-home-Department lines + *Unattributed*; sum = Project total Mh/Jpy | N/A |
| Log hygiene | Logger sees observation with displayName/email | Redacted in pino output; metrics use account id only | N/A |

</frozen-after-approval>

## Code Map

- `packages/db/drizzle/` — latest `0009_measurement_basis_and_connector_setting.sql`; next `0010_tracker_account_link_event.sql` (append_only: `seq`, `tenant_id`, `tracker_account_id`, `resource_id` nullable, `actor`, `at`; UNIQUE `(tenant_id, seq)`; FKs to `tracker_account` + `resource`; idx `(tenant_id, tracker_account_id, seq)`).
- `packages/db/src/schema.ts` + `table-classes.ts` + `pnpm db:sql` — registry 43→44; regenerate RLS/grants/triggers.
- `packages/db/src/repo-resource.ts` — clone `appendResourceRate` Tenant-lock pattern: `appendTrackerAccountLink` + `latestLinkSeq` / heads ≤ seqMax; dual-write `resource.tracker_account_ids` on append (add id on link, remove on unlink/relink-away).
- `packages/db/src/repo.ts` `loadProjectBundle` — load link heads → `linkSeqMax` + build each `Resource.trackerAccountIds` from events ≤ pin (stop treating live array as SoT for compute).
- `packages/db/src/seed.ts` / fixtures — for demo links, append link events (do not only stamp the array).
- `packages/domain/src/types.ts` — add `linkSeqMax?: number` beside `RatePins` (or extend pins); keep `Resource.trackerAccountIds` as resolved input to attribution.
- `packages/domain/src/attribution.ts` + tests — `rateFor` already falls back to Project default for miss/null; resolve via pinned link-built `trackerAccountIds`; add `departmentEffortRollup(...)` with *Unattributed* line (Mh + Jpy) so Department sum = Project total; unit-test late link + pin + Unattributed.
- `packages/domain/src/review.ts` — plumb `linkSeqMax` on `ReviewInput` into attribution pins.
- `packages/app/src/use-cases/resource-writes.ts` (or new `link-writes.ts`) — `linkTrackerAccount` / `unlinkTrackerAccount` / `suggestTrackerAccountLinks` (pure match over accounts + Resources); PM + tenant_admin; audit actions; roles declarations.
- `packages/app/src/logger.ts` — extend `PINO_REDACT_PATHS` for `displayName`, `email`, `*.displayName`, `*.email` (+ snake_case if logged); test redaction.
- `apps/web/.../connectors/page.tsx` (+ panel component) — Tracker Account linking panel: unlinked/suggested/linked rows, Link / Change / Unlink / Accept all suggestions; server actions.
- `packages/i18n` en/ja — linking panel copy (no PII in keys).
- `deferred-work.md` — re-note REQUIRE_DB / batch identity / notifyRecipients / compaction / Review Re-pin / RESOLVED_WRITE_SURFACE=B; note FR-33 Department UI still Post-Q1.
- `sprint-status.yaml` — `5-1`…`5-7` → `done` if still wrong; `5-8` → `in-progress` then `review`.
- Reuse: `lockWatermark` Tenant, `appendResourceRate`, `rateFor` / `projectDefaultOnDate`, Connectors page Section pattern, pino redact merge.
- Do not change: 3.1 workbook; 5.7 basis/Resolved UI; 5.9+ mapping; compaction SQL; Review Re-pin writer; ledger schema `resource_id`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/db` migration 0010 + registry/SQL — `tracker_account_link_event`.
- [x] `packages/db` resource repo + `repo.ts` + seed — append/latest/heads; dual-write array; load `linkSeqMax` into Review bundle.
- [x] `packages/domain` attribution + types + review — pinned link resolution; Department *Unattributed* roll-up; unit-test I/O matrix.
- [x] `packages/app` link use cases + logger redact + audit/role wiring — suggest/link/unlink; NFR-S6 tests.
- [x] `apps/web` + `packages/i18n` — Connectors linking panel + Accept all.
- [x] `sprint-status.yaml` + `deferred-work.md` — sync 5.1–5.7 done; re-note open deferrals; lint/typecheck/depcruise/test.

**Acceptance Criteria:**
- Given observed Tracker Accounts, when the PM opens the Connectors linking panel, then suggestions match names/emails from observation display name + email (FR-13, AR-12).
- Given a link (or unlink), when it is recorded, then it appends `tracker_account_link_event` (FR-13, AR-19).
- Given a link after hours were recorded, when figures are computed live, then Resource resolves at query time at `link_seq_max` and is retroactive; under a lower pin it stays as before (AR-18, AR-15).
- Given unlinked account hours or null assignee, when attributed, then Unattributed at Project default Rate (FR-13, AR-18).
- Given Unattributed hours, when Department roll-up is computed in domain, then an *Unattributed* line keeps Department totals equal to Project totals (FR-13).
- Given Tracker Account names/emails, when logged or metric-labelled, then they never reach operator logs or metrics (AR-12, NFR-O1, NFR-S6).

## Implementation Notes

- Resource has no email column — email suggestions match `account.email` CI to `resource.name`.
- Link writers stay off the use-cases barrel (like `confirmConnectorOwnership`); unit-tested; harness deferred.
- Seed appends `tracker_account_link_event` after Tracker Account upsert; live array still stamped on Resource insert.
- `loadProjectBundle` rebuilds `Resource.trackerAccountIds` from link heads when events exist; exposes `meta.trackerAccounts` for the panel.
- PINO redacts `displayName`/`email` (+ snake_case / nested).
- Verification: `pnpm lint`, `pnpm typecheck`, `pnpm depcruise`, `pnpm test` — all exit 0.
## Spec Change Log

## Review Triage Log

- `false` — formal blind/edge/verification-gap subagent layers not launched this session (worker may not spawn nested reviewers); verification was `pnpm lint`/`typecheck`/`depcruise`/`test` all exit 0 against the I/O matrix unit tests. No code change from skipped layers.
- `false` — email suggest vs Resource email column: Resource has no email; Design Notes document match against `resource.name`; tests cover email CI and name CI.
- `medium` — `linkTrackerAccount` / `unlinkTrackerAccount` off use-cases barrel: deferred-work notes harness gap; unit tests cover writers (same pattern as `confirmConnectorOwnership`).
- `low` — global pino `email` redact may hide auth_user emails in operator logs too — acceptable under NFR-S6 personal-data hygiene.

## Design Notes

- **Event vs array:** events are SoT for compute/pins; `resource.tracker_account_ids` is a live cache updated in the same transaction as the append (mirrors `project.default_rate_jpy`).
- **Match order:** email CI equality beats name CI equality. Resource has no `email` column — email match is `account.email` CI equals `resource.name` CI (names that are emails); else `displayName` CI equals `resource.name`. Multiple Resources with the same name → list all as suggestions, PM picks.
- **Link key:** event `tracker_account_id` is the internal `tracker_account.id` (composite FK); dual-write and attribution use observation `account_id` on `resource.tracker_account_ids` so `rateFor` still matches `assignee_account_id`.
- **Department helper:** pure domain over attributed entries + Resource.home `departmentId`; hours with no Resource go to `unattributed` line — not a fake Department row id.
- **Negative deltas:** continue through existing `rateFor` / most-recent-positive path; no separate 5.8 change beyond link resolution input.

## Verification

**Commands:**
- `pnpm lint` — exit 0
- `pnpm typecheck` — exit 0
- `pnpm depcruise` — exit 0
- `pnpm test` — exit 0

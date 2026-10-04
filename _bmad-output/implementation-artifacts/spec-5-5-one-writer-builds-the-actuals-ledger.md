---
title: 'Story 5.5 — One writer builds the Actuals Ledger'
type: 'feature'
created: '2026-10-04'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ca1f9b2a006c10d8656ffb8f21336b0ac4dcd47c'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Complete reads stop at `read_complete_writer_pending`, so no durable `tracker_snapshot` / `ticket_observation` / Actuals Ledger rows exist and the pin stays seed-only.

**Approach:** Wire `runIngestSnapshotJob` past admit into one locked `ingestSnapshot` writer transaction that persists whitelist observations and ledger deltas, creates `project_setting_event`, and alerts on invariant violation — without Story 5.6 mid-flight OB/`left_scope` hardening or compaction.

**Decisions (Harry assignment 2026-10-04 + epic ACs):**
- **5.5 owns:** durable writer for snapshot/observation/ledger; FR-19 whitelist on write; null-hours / `hours_cleared`; `prev_snapshot_id`; idempotent `(connector_id, observedAt)`; `project_setting_event` + Period via `periodOf`; Mapping Rules re-eval on ingest; invariant check + operator alert; NFR-P1 write-path proof against the load fixture (best-effort in CI).
- **Compaction:** Story 5.5 ACs do not place it — re-defer to maintenance (keep 5.4 deferred-work row; do not implement).
- **5.6 keeps:** two-consecutive `left_scope`, mid-flight Opening Balance after scope change, overlap/ownership tables.
- **First-snapshot OB:** keep domain first-sighting `opening_balance` when `prev === null`; later first-sightings stay `delta`.
- **left_scope in 5.5:** domain returns absences; writer does not reverse hours; durable two-read flag stays 5.6.
- **Negative costing:** ledger records negatives; Resource/Rate of most recent positives stays query-time attribution (no `resource_id` on entry).
- **Pre-writer stop removed:** admitted → writer; success attempt reason `snapshot_written` (or no pending row); failures keep existing reasons.

## Boundaries & Constraints

**Always:**
- Only the ingest writer inserts `tracker_snapshot`, `ticket_observation`, `actuals_ledger_entry` (AR-15).
- Full-scope read outside the transaction; one Project `lockWatermark` then write; record adapter kind + `scope_seq`; upsert ticket/tracker_account; append ledger for numeric `actualMh` changes; re-eval Mapping Rules; idempotent on `(connector_id, observedAt)`.
- Entry stores Ticket, delta, window, assignee at later snapshot, `prev_snapshot_id`, `snapshot_id`, `active_baseline_version_seq` — never `resource_id`.
- `active_baseline_version_seq` = latest Baseline by `seq` committed before the lock (not vs `observedAt`).
- `actualMh = null` → no entry; value→null → `hours_cleared=true`, no negative; only numeric→numeric deltas; negatives kept; corrections = new entries.
- Create `project_setting_event` (tz / teirei); Period = `periodOf(window_end, …)` from its head.
- On commit, `Σ delta_mh` per Ticket = last observed `actualMh` (null observed treated as no hours demand); violation → operator alert.

**Never:**
- Compaction/retention deletes; Story 3.1; Story 5.6+ tables (`connector_overlap`, ownership, measurement_basis_event, etc.) beyond rule re-eval.
- Second write path for snapshot/ledger; UPDATE of ledger entries; store Resource on entry.
- Leave `read_complete_writer_pending` as the success terminal for admitted reads.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First admitted write | `prev=null`, numeric hours | Snapshot+obs; OB ledger rows; pin sees new snapshot | N/A |
| Numeric delta | Hours 10→14 | One `delta` +4; `prev_snapshot_id` set | N/A |
| Null hours / cleared | `actualMh=null` or value→null | No ledger entry; `hours_cleared` on obs when clearing | N/A |
| Negative delta | 10→7 | Negative entry kept | N/A |
| Idempotent replay | Same `(connector, observedAt)` | No second snapshot/ledger; job ok | Unique conflict → treat as already written |
| Adapter kind change | prev≠next kind | Refuse write | `AdapterKindMismatchError` operator-alert |
| Invariant break | Σ≠ observed | Transaction fails | Operator alert; no partial commit |
| Mapping rules | Unmapped ticket matches rule | Append `mapping_event` source `rule` | Manual/disposition head wins |
| Incomplete / refuse | Existing 5.3/5.4 gates | No writer call | Prior attempt reasons |

</frozen-after-approval>

## Code Map

- `packages/domain/src/ledger.ts` — fix null/`hours_cleared`; expose cleared ticket ids; keep OB/delta/leftScope/kind-mismatch; extend entry shape with snapshot ids at app layer if pure stays seq-only.
- `packages/domain/src/types.ts` — observation may carry `hoursCleared` only as write input if needed; prefer DB column set by writer.
- `packages/db/src/schema.ts` + `drizzle/0007_*` — `hours_cleared` on `ticket_observation`; `prev_snapshot_id` on ledger; unique `(tenant_id, connector_id, observed_at)` on snapshot; `project_setting_event` table.
- `packages/db/src/table-classes.ts` + generated `rls.sql`/`grants.sql`/`triggers.sql` — register `project_setting_event` append-only.
- `packages/db/src/repositories/tracker` or new `snapshot` repo — `writeIngestSnapshot` under `lockWatermark(project)`; upsert identity; insert snapshot/obs/ledger; load prev snapshot+obs; load mapping rules/head; append rule mappings; seed `project_setting_event` head from `project` columns when missing.
- `packages/db/src/repositories/baseline` — reuse `latestVersionSeq` before lock.
- `packages/app/src/ports/connector-write.ts` + connector repo — load prev SnapshotRead; expose writer port on transaction scope.
- `packages/app/src/use-cases/connector-ingest.ts` — after admit, call writer; replace `writer_pending` success with `written` / idempotent ok; drop pending attempt on success path.
- `packages/app/src/use-cases/connector-ingest.test.ts` + domain ledger tests — matrix above.
- `apps/worker` — no queue change beyond outcome handling if needed.
- `packages/db/src/seed.ts` — align with new columns; ensure `project_setting_event` seeded.
- `deferred-work.md` — note compaction re-deferred (AC did not place); resolve durable-write deferral as done by this story.
- `sprint-status.yaml` — 5.4 `done`; 5.5 `in-progress`→`review`.
- Do not change: workbook 3.1, compaction SQL, 5.6 overlap tables.

## Tasks & Acceptance

**Execution:**
- [x] Domain `ingestSnapshot` — null-hours / cleared / no false zeroing; tests.
- [x] Migration 0007 + registry/SQL — schema columns + `project_setting_event`.
- [x] DB ingest writer + port — lock, idempotent insert, whitelist obs, ledger, identity upsert, rules re-eval, baseline-by-seq, invariant.
- [x] `runIngestSnapshotJob` — call writer after admit; success outcome; remove pending-as-success.
- [x] Operator alert on invariant / kind mismatch (mail or attempt+alert shape consistent with existing operator-alert).
- [x] NFR-P1 write-path harness or timed fixture ingest proof; document if REQUIRE_DB-only.
- [x] Sync sprint-status + deferred-work; verify lint/typecheck/depcruise/test.

**Acceptance Criteria:**
- Given anything writing snapshot/observation/ledger, when inspected, then only the ingest writer path does (AR-15).
- Given ingest, when it runs, then read outside tx; one locked tx writes snapshot+obs+ledger+identity+rules; idempotent on `(connector_id, observedAt)`.
- Given a ledger entry, when stored, then Ticket, delta, window, assignee, `prev_snapshot_id`, `snapshot_id`, `active_baseline_version_seq` — no Resource.
- Given baseline choice, when locked, then latest Baseline by `seq` before lock.
- Given null / cleared hours, when observed, then no false negative zeroing; `hours_cleared` set on clear.
- Given negative delta, when recorded, then kept (costing at query time).
- Given commit, when invariant fails, then operator alert and no commit.
- Given `project_setting_event`, when Period needed, then `periodOf(window_end, tz, teirei)` from its head.
- Given compaction ACs, when this story ships, then still deferred.

## Implementation Notes

- Domain `ingestSnapshot`: null hours no longer coerce to `0n`; value→null yields `hoursCleared` (no ledger row); null→numeric is a full-amount `delta`; `checkLedgerInvariant` skips null observed; added `LedgerInvariantError` (operator-alert).
- Migration `0007_actuals_ledger_writer`: `hours_cleared`, `prev_snapshot_id` (+ MATCH SIMPLE FK), unique `(tenant_id, connector_id, observed_at)`, `project_setting_event` append-only; registry/SQL regenerated via `pnpm db:sql`.
- `packages/db/src/repositories/ingest`: `writeIngestSnapshot` — Baseline-by-seq then `lockWatermark(project)`, idempotent snapshot insert, identity upsert, whitelist obs, ledger with `prev_snapshot_id`, rule re-eval, invariant before commit; seeds `project_setting_event` head from `project` when missing.
- Port: `ConnectorWriteScope.ingestWrite`; wired in `inTenantTransaction`.
- `runIngestSnapshotJob`: after admit → writer; outcomes `snapshot_written` / `already_written` / `operator_alert`; no success attempt row; rate-limit pacing still after a successful write.
- Operator alerts: `AdapterKindMismatchError` / `LedgerInvariantError` → best-effort mail via `notifyRecipients` + `mailer`.
- NFR-P1: always-on domain derive timing (`ledger-nfr.test.ts`); durable write timing REQUIRE_DB-only (`ingest-nfr.test.ts`).
- Deferred-work: durable-write row resolved; compaction re-deferred (AC did not place). Sprint `5-5` → `review`.
- Worker mints snapshot/row ids via `uuidV7IdsOn`.
- Idempotency: pre-check `(connector_id, observedAt)` under the Project lock instead of catching `23505` mid-transaction (Postgres aborts the tx). `ensureProjectSettingHead` also runs under that lock.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Writer shape:** `writeIngestSnapshot({ projectId, connectorId, read: ScopeRead })` inside `deps.transaction`; read already complete; load prev header+obs → `SnapshotRead`; `activeBaselineVersionSeq = latestVersionSeq` then `lockWatermark`; domain derive; INSERT; `checkLedgerInvariant` over prior entries for in-scope tickets + new ones (or cumulative Σ for tickets in `next`).
- **Idempotency:** UNIQUE on `(tenant_id, connector_id, observed_at)`; catch unique_violation → return already_written without appending another attempt as failure.
- **Success attempt:** either skip attempt row on success (pin uses snapshot) or append `snapshot_written` — prefer no pending reason; optional success attempt only if PM list needs it (default: no row on success, matching "failed attempts" table purpose).
- **project_setting_event:** keys `tz_offset_minutes` / `teirei_weekday` (or single JSON payload); first writer ensures a head exists by copying `project` columns; later Project settings stories may append — R0 read head for `periodOf` callers that today use `project` directly can stay on `project` until a thin helper lands (create table + seed is the AC).

## Verification

**Commands:**
- `pnpm lint` — exit 0
- `pnpm typecheck` — exit 0
- `pnpm depcruise` — exit 0
- `pnpm test` — exit 0

---
title: 'Story 5.5 — One writer builds the Actuals Ledger'
type: 'feature'
created: '2026-10-04'
status: 'done'
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
- Review patches: load prev under lock; prior-Σ adjust for null→numeric after clear; periodOf from `project_setting_event` head; operator_alert attempt rows; chunked prior-ledger load; incomplete/observedAt guards; NFR asserts obs+ledger counts; drizzle meta 0007; sprint last_updated 23:55.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---------|---------|------------------|
| loadPrevSnapshot before lockWatermark (stale prev under concurrency) | high | **patch** — load prev under the Project lock |
| null→numeric after hours_cleared uses full nowMh and breaks invariant | high | **patch** — prior Σ map; delta = nowMh − prior Σ |
| periodOf still reads project columns not project_setting_event head | high | **patch** — Review bundle reads setting head with project fallback |
| Operator alert mails only; no attempt; worker has no notifyRecipients | medium | **patch** — always append `operator_alert` attempt; wire recipients deferred (pre-existing credential gap) |
| Missing drizzle meta `0007_snapshot.json` | medium | **patch** — added journal-linked meta snapshot |
| NFR harness only checked snapshot.ticketCount | medium | **patch** — assert observation + ledger row counts |
| Idempotent already_written only mocked | medium | **defer** — REQUIRE_DB replay case; pre-check under lock is in place |
| hours_cleared / prev_snapshot_id / mapping re-eval unverified at writer boundary | medium | **defer** — REQUIRE_DB matrix cases |
| loadPriorLedger unchunked inArray for 2k tickets | medium | **patch** — chunk by 500 |
| sprint last_updated moved backward | low | **patch** — set to 10-04-2026 23:55 |
| Vacuous `base.writes` assertion on throwing writer test | low | **patch** — assert attempt row instead |
| Design Notes still mention catch unique_violation | low | **patch** — notes updated to under-lock pre-check |
| prev_snapshot_id on later first-sighting deltas | false | Window starts at prev snapshot; first-sighting OB is the `windowStart === null` case only |
| Incomplete read.complete false reaching writer | low | **patch** — refuse when `complete !== true` |
| Invalid observedAt opaque DB error | low | **patch** — validate before INSERT |
| ApprovalRequiredError inside writer rethrows | maybe-false | Gate already ran; domain still checks approval; settle with a job test if gate/writer race appears |
| Seed remains a second insert path vs AR-15 | false | AR-15 covers runtime ingest; seed/demo fixtures are not the worker writer |
| One-by-one identity upserts under lock (NFR bottleneck) | medium | **defer** — batch upsert optimization |
| Empty Spec Change / Triage logs mid-review | false | Filled by this review pass |
| Adapter-kind refuse / incomplete complete guard at app only | false | Writer now also refuses incomplete; kind mismatch still thrown from domain before INSERT |

## Design Notes

- **Writer shape:** `writeIngestSnapshot({ projectId, connectorId, read: ScopeRead })` inside `deps.transaction`; read already complete; under Project lock load prev header+obs → `SnapshotRead`; `activeBaselineVersionSeq = latestVersionSeq` then lock; domain derive with prior ledger Σ; INSERT; `checkLedgerInvariant` over prior + new entries.
- **Idempotency:** UNIQUE on `(tenant_id, connector_id, observed_at)`; under the lock, SELECT existing row first and return `already_written` — never catch `23505` mid-transaction (Postgres aborts the tx).
- **Success attempt:** no attempt row on success (pin uses snapshot); operator alerts append `operator_alert` attempt + best-effort mail.
- **project_setting_event:** writer seeds head from `project` columns under the lock; Review bundle `periodOf` reads the head (fallback to `project` columns when empty).
- **Null→numeric after clear:** domain adjusts delta = nowMh − prior Σ so retained history after `hours_cleared` does not break the invariant.

## Verification

**Commands:**
- `pnpm lint` — exit 0
- `pnpm typecheck` — exit 0
- `pnpm depcruise` — exit 0
- `pnpm test` — exit 0

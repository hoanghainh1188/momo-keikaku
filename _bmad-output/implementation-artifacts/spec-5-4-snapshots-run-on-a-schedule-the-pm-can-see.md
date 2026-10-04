---
title: 'Story 5.4 — Snapshots run on a schedule the PM can see'
type: 'feature'
created: '2026-10-04'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '31e687167b280f5e84f46dbb966181e820adb1c4'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Connectors can be approved and read completely (5.1–5.3), but nothing runs them on a clock the PM can see — no hourly tick, no `ingest-snapshot` queue, no Refresh now, and no attempt/schedule UI.

**Approach:** Register an Asia/Tokyo hourly `snapshot-tick` (`missed: 'skip'`), enqueue due Connectors onto a `stately` `ingest-snapshot` queue (retry 3 + visible attempts), expose top-bar pin / Refresh / Re-pin + attempt list + next run, and slow the schedule when Search budget or `rateLimit` says so — without the 5.5 ledger/snapshot writer or compaction.

**Decisions (Harry / assignment 2026-10-04):**
- **5.4 owns:** schedule tick, due enqueue, queue+retry, pin/Refresh/Re-pin, attempt list, schedule visibility, Search-budget slowdown + `rateLimit` pacing, expose `search_limit` when needed, whitelist/NFR-P1 awareness only.
- **5.5 owns:** durable `tracker_snapshot` / `ticket_observation` / Actuals Ledger writer. Compaction out of 5.4 (deferred).
- **Pre-writer job body:** gate approval → load creds → `readScope` → `admitScopeRead`; on `admitted`, append attempt `read_complete_writer_pending` and stop. Failures keep existing attempt reasons.
- Epic ACs that require a durable snapshot write, lossless ledger diff, whitelist persist, compaction, or NFR-P1 full write stay deferred to 5.5.

## Boundaries & Constraints

**Always:**
- Hourly tick `tz: Asia/Tokyo`, `missed: 'skip'`; handler asks `domain/calendar` for 09:00–19:00 JST on a JP or VN working day.
- Inside window → enqueue due Connectors hourly; outside → ≥6 h since last enqueue/attempt for that Connector.
- `createQueue('ingest-snapshot', { policy: 'stately' })`; jobs use `singletonKey = connectorId`, `retryLimit: 3`, backoff < 45 minutes.
- Each failed and writer-pending outcome is a `tracker_snapshot_attempt` row.
- Top-bar pin shows snapshot age (live each minute); popover: time, Connectors, next scheduled, Refresh now; Review pin older than latest → "Newer snapshot available — Re-pin".
- Over Search budget (`ceil(N/100)+2 > 0.25 * search_limit`) → skip hourly enqueue (keep ≥6 h floor); pace using `ScopeRead.rateLimit` when present.
- Worker is inbound adapter only (use cases + i18n); Clock from composition.

**Never:**
- Implement or call `ingestSnapshot` / insert snapshot, observation, or ledger rows (5.5).
- Compaction/retention deletes (deferred).
- Create the queue as `standard` with only `singletonKey`.
- Touch Story 3.1 or expand into 5.5+ beyond deferred-work.
- Change 5.3 set-up Search refuse semantics.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Business-hour tick | JST weekday 10:00, JP/VN working day | Due Connectors enqueued hourly | N/A |
| Off-window tick | JST 22:00 or both JP+VN holiday | Enqueue only if ≥6 h since last enqueue/attempt | N/A |
| Missed ticks | Worker down across hours | `missed: skip` — no backlog replay | N/A |
| On-demand Refresh | PM clicks Refresh now | `ingest-snapshot` send with `singletonKey`; coalesces behind active | Auth/reach → `not_found` |
| Stately coalesce | Second Refresh while job active | One queued; further drops | N/A |
| Incomplete read | `admitScopeRead` → incomplete | Attempt `read_incomplete`; no writer | Existing 5.3 path |
| Admitted pre-5.5 | Complete read | Attempt `read_complete_writer_pending`; no durable snapshot | N/A |
| Over Search budget | estimate > 25% of `search_limit` | Skip hourly enqueue; ≥6 h cadence; slowdown visible | Operator-visible copy |
| rateLimit pacing | `remaining` low / `resetAt` future | Delay next send until reset | Retry / deferred enqueue |
| Re-pin prompt | Review pin older than latest | Re-pin offer; figures stay until Re-pin | N/A |

</frozen-after-approval>

## Code Map

- `apps/worker/src/boss.ts` — `schedule: true`; keep migrate/DDL flags false.
- `apps/worker/src/index.ts` — createQueue `ingest-snapshot` (`stately`); register `snapshot-tick` + job handlers; wire Clock/TrackerPort/connector deps; db-backed `FixtureCursorPort` when fixture override.
- `packages/domain/src/calendar` — pure `isSnapshotBusinessWindow(instant, cal)` (09–19 JST + working day).
- `packages/app/src/use-cases/connector-schedule.ts` (new) — due selection, next-run, slowdown, enqueue helpers for worker + Refresh.
- `packages/app/src/use-cases/connector-ingest.ts` — job path through admit; terminal `read_complete_writer_pending`.
- `packages/app/src/ports/connector-write.ts` + `packages/db/.../connector` — expose `searchLimit`; list attempts; latest snapshot; list connectors for tenant due scan.
- `packages/app` index + role declarations — `requestSnapshotRefresh`, `listSnapshotAttempts`, pin helpers; PROJECT_REACH.
- `apps/web` shell/layout/actions + Review — pin popover, live age, Refresh, attempts, Re-pin banner.
- `packages/i18n` en/ja — pin/Refresh/Re-pin/attempt/slowdown copy.
- Reuse: `gateIngestApproval`, `admitScopeRead`, `notifyCredentialFailure`, `appendSnapshotAttempt`, `createBoss`, `.snapshot-pin`.
- Do not change: compaction SQL, 3.1 workbook, 5.3 set-up refuse.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/calendar` — business-window predicate + tests.
- [x] `packages/db` + connector port — expose `searchLimit`; list attempts; tenant connectors + latest snapshot for due/pin.
- [x] `packages/app` — schedule/ingest use cases (due, slowdown, refresh enqueue, job body); roles + matrix tests.
- [x] `apps/worker` — enable schedule; stately queue; tick + job handlers (`retryLimit: 3`); composition.
- [x] `apps/web` + i18n — pin popover, Refresh, next scheduled, attempts, Review Re-pin.
- [x] `deferred-work.md` — compaction + durable-write epic ACs → 5.5; leave `changeConnectorScope` budget reassess deferred.
- [x] `sprint-status.yaml` — 5.1–5.3 `done`; 5.4 `in-progress` then `review`.
- [x] Verify `pnpm lint`, `typecheck`, `depcruise`, `test`.

**Acceptance Criteria:**
- Given cron cannot express JP/VN working days, when registered, then hourly tick Asia/Tokyo `missed: skip` and the handler uses `domain/calendar` for 09–19 JST.
- Given that window, when enqueued, then hourly inside and ≥6 h outside.
- Given the ingest queue, when created, then `stately` + `singletonKey = connectorId`.
- Given a failed attempt, when retried, then `retryLimit: 3`, backoff < 45 min, visible attempt row.
- Given latest successful snapshot (seeded until 5.5), when project surfaces render, then pin shows age (live/min) and popover has time, Connectors, next scheduled, Refresh now.
- Given a Review pinned older than latest, when pin renders, then Re-pin is offered (no silent change).
- Given Search budget overrun, when tick runs, then schedule slows with PM-visible reason; `rateLimit` paces sends.
- Given epic write/compaction/NFR-P1 write ACs, when this story ships, then they remain deferred — not implemented.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

- **Due watermark:** `max(latest snapshot.observedAt, latest attempt.attemptedAt)`; add a column only if that proves ambiguous.
- **Tenant fan-out:** `tenant` has no RLS — list tenant ids, then `withTenant` per tenant for due Connectors.
- **Worker context:** service `RequestContext` with `tenant_admin` so existing PROJECT_REACH gates reuse without a human session.
- **NFR-P1 awareness:** singletonKey + pacing; full 2k Ticket write proof waits for 5.5.

## Verification

**Commands:**
- `pnpm lint` — exit 0
- `pnpm typecheck` — exit 0
- `pnpm depcruise` — exit 0
- `pnpm test` — exit 0

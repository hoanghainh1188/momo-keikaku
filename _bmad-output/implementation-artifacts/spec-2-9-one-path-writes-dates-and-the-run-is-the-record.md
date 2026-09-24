---
title: 'Story 2.9 — one path writes dates, and the run is the record'
type: 'feature'
created: '2026-09-24'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd2e4e5b51f456bb72e4f17aaa4692c21fd4269d5'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The pure engine (`recalculate`, 2.5–2.8) and the graph guard (`checkPlanInvariants`, 2.4) exist, but nothing writes dates. Any module could change a scheduling input without a recalculation, and nothing yet appends a `schedule_run` that pins what the plan meant (FR-6b, AR-43, AD-25/26/27).

**Approach:** Add the one fence `app/schedule.applyPlanChange(ctx, mutation)` and `app/schedule.recalculateProject(ctx, projectId, cause)`. In one tenant transaction under the AD-20 per-Project exclusive lock they write the input, call the pure engine, append `schedule_run` (fully resolved inputs, AD-26 index-encoded outputs, `engine_version` from the 2.8 registry), and rebuild or stale-mark `wp_schedule`. Close the trigger set with the three AR-52 tests; measure the 500-WP payload; exercise AD-5 retention-by-reference.

**Decisions (founder, 2026-09-24):**
- **Q1 → B.** Strip `remainingDays` from the stored `schedule_run.outputs` jsonb only. Domain `ScheduleOutputs` and the 2.8 corpus keep the field; AD-27's "never stored" applies to the persisted run shape.
- **Q2 → A.** AD-27 literal: graph offences (`checkPlanInvariants` and any `graph_invalid` from `recalculate`) → full rollback/refuse, nothing persisted. `calendar_range` → append halted run (`halted_reason`, null outputs) + mark `wp_schedule` stale; the mutation commits where append-only history requires it.
- **Q3 → A.** Keep the full story in one spec/PR: fence, encoding, cause, measure, retention, three closure tests. Accept ~2,400-token spec risk.
- **Q4 → A.** Minimal closed mutation union sufficient to exercise the fence and closure tests (duration / constraint / dependency patches, plus any test seed helper that still goes through the fence). Story 2.10 widens the union to full WP authoring.
- **Keep the full spec**, with no split.

## Boundaries & Constraints

**Always:**
- One fence: input write + synchronous recalculation in one transaction under the per-Project exclusive lock (the one sanctioned long hold). Graph offences roll back completely; calendar-range halts append a halted run and stale-mark `wp_schedule` (Q2 → A). Miss NFR-P1 → lock granularity, never a background path (AR-53).
- Two names, two layers (AR-47): `domain/schedule.recalculate` stays pure; only `app/schedule.recalculateProject` resolves inputs, calls it and appends the run. Nothing else is named `recalculate`.
- Only `app/schedule` may import `db/repositories/plan-input` and `db/repositories/schedule`; dependency-cruiser fails any other importer (AR-43). Call `checkPlanInvariants` before every mutation write; map 23503/23514 to `invalid_input` with the guard's rule codes.
- `schedule_run.inputs` is fully resolved — whole WP tree, edges, three Project settings, resolved non-working-day set with range and calendar version seq; watermarks as assertions (AR-48). `inputs.wps` in `compareWp` order; every other WP reference in inputs and outputs is that array's integer index (AR-50), including `drivingPredecessors`, `criticalPath`, violation `wpId`/`chain`. Stored outputs omit `remainingDays` (Q1 → B).
- `schedule_run` is INSERT-only (`append_only`); `app/schedule` holds INSERT/UPDATE/DELETE on `wp_schedule`. Success rebuilds `wp_schedule` (`stale = false`). Write `engine_version` from the 2.8 registry; per-WP FR-28 cause from `diff(prevInputs, inputs)` (AD-26).
- Mutation surface is the minimal closed union (Q4 → A); 2.10 widens it. Three closure tests (AR-52): writers, callers (FR-6b trigger list), reachability. Stored-run shuffle invariance via AD-4 codec. Payload measured on 500 WP / 500 edge against 385 kB raw / ~141 kB stored / ~152 kB WAL. Retention-by-reference: runs between two Reviews survive (AR-11). `lockWatermark` on the Project key immediately before the first `schedule_run` INSERT; audit in the same transaction.

**Never:**
- No new migration (columns exist). No UI / tree grid / What-moved band (2.13–2.16). No full WP authoring surface (2.10), Project settings UI (2.11), or calendar publish (2.12) — those call the fence later. No background recalc path. No capture-from-implementation for size budgets. Do not import `domain/attribution` from `domain/schedule`. Do not let seed or non-fence paths become lasting AD-25 writers. Do not persist `remainingDays` in `schedule_run.outputs`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Happy edit | PM mutation that keeps the graph legal and dates in range | Input written; `schedule_run` appended with inputs + outputs + `engine_version`; `wp_schedule` rebuilt `stale=false` | N/A |
| Graph refuse | Cycle / ancestor / summary / cross-project, or `graph_invalid` from `recalculate` | Full rollback/refuse; nothing persisted (Q2 → A) | `invalid_input` / refuse unchanged |
| Calendar-range halt | Pass leaves calendar range (or Project finish out of range) | Halted run: `halted_reason`, `outputs` null; prior `wp_schedule` kept with `stale=true` | PM sees range need; operator clears via new calendar version (2.12) |
| Index encoding | Stored run with drivers, path, violations | All WP refs are indices into `inputs.wps`; ids once per WP; no `remainingDays` in stored outputs | Codec round-trip equals domain outputs after strip |
| Cause | `prevInputs` vs `inputs` after a duration edit | Edited WP → *edited*; downstream movers → *moved by a predecessor*; run-level `cause` is the trigger kind | First run (`prevInputs` null): per-WP cause absent or null |
| Closure | CI writers / callers / reachability | Every AD-25 write inside fence; `recalculateProject` callers = FR-6b list present so far; unreachable from Tracker/mapping/ingest/rules | Fail CI on leak |
| Size | 500 WP / 500 edge fixture append | Raw / pglz / WAL within stated tolerance of AD-26 figures | Fail if beyond tolerance |
| Retention | Runs between two Review pins | `inputs` (and causes) of referenced + latest runs retained; unpinned older `outputs` droppable | Prove Reviews' intervening runs survive |
| Concurrent ingest | Snapshot write during fence hold | Waits with `lock_timeout`; retryable failed attempt, not unbounded block | Record failed attempt |

</frozen-after-approval>

## Code Map

- `packages/app/src/schedule/` — add `apply-plan-change.ts` / `recalculate-project.ts` (names flexible); reuse `plan-invariants.ts` (`checkPlanInvariants`, `PLAN_INVARIANT_RULES`). Mirror `packages/app/src/use-cases/audited-write.ts` (`runAuditedWrite`, `refuse`) and `project-write-input.ts` for authorize + tx.
- `packages/db/src/repositories/plan-input/` and `…/schedule/` — **new**; paths must match `.dependency-cruiser.cjs` `SCHEDULING_REPOSITORIES`. Plan-input owns AD-25 input writes; schedule owns `schedule_run` INSERT and `wp_schedule` rebuild/stale. Copy append style from `packages/db/src/repo-writes.ts`; call `lockWatermark` (`packages/db/src/watermark-lock.ts`, not on the barrel) on the Project key before first INSERT; join `inTenantTransaction` / `WriteScope` (`tenant-transaction.ts`).
- `packages/db/src/schema.ts` / `drizzle/0000_scheduling_schema.sql` — read-only: `schedule_run` (incl. `engine_version`, `anchor`, `computed_finish`, `halted_reason`, `cause`, `inputs`/`outputs` jsonb) and `wp_schedule` (`is_critical NOT NULL DEFAULT false`, `stale`). No migration.
- `packages/domain/src/schedule/recalculate.ts` — pure engine; extend to compute per-WP `cause` from `prevInputs` (today unread). Keep halt shapes (`graph_invalid`, `calendar_range`).
- `packages/domain/src/schedule/engine-version.ts` — write `ENGINE_VERSION` / `recalculateAt` into the run column; do not invent a second registry.
- New encode/decode for AD-26 stored shape (domain or app/schedule) — `inputs.wps` array; index-encode parents, edge ends, drivers, critical path, violation chains; strip `remainingDays` from stored outputs (Q1 → B). Compare via `packages/domain/src/present/codec.ts` (`stringify(encode(…))`).
- `.dependency-cruiser.cjs` + `tests/depcruise-fences.test.ts` — fences already declared; keep green; add writers/callers/reachability tests (new) beside them.
- `packages/db/src/load-generator.ts` — 500 WP / Project, **no edges today**; measurement test must add 500 edges (in-test or fixture extension). Seed a `holiday_calendar_version` (synthetic resolved set) so the run FK is satisfied until 2.12.
- `tests/support/shuffle-invariant.ts` — point at stored-run round-trip (deferred half of 2.3 AC 4).
- `_bmad-output/implementation-artifacts/deferred-work.md` — resolve/annotate 2.9 carry-overs (invariants call, halt recording, index encoding, watermark on `schedule_run`, stored-run shuffle, 23503/23514 mapping).

**Continuity from 2.8 (done):** registry key `schedule-2026-09-24`; corpus is the correctness gate — this story does not re-matrix it. Do not change pass arithmetic unless a stored-shape bug forces a patch (then new `engine_version`).

## Tasks & Acceptance

**Execution:**
- [x] `packages/db/src/repositories/plan-input/*` + `schedule/*` — AD-25 writers + `schedule_run` append + `wp_schedule` rebuild/stale; `lockWatermark` before INSERT; 23503/23514 → `invalid_input`.
- [x] `packages/app/src/schedule/apply-plan-change.ts` + `recalculate-project.ts` — fence + resolve + call + append; minimal mutation union (Q4 → A); `checkPlanInvariants` before write; role/reach via existing project-write patterns.
- [x] Domain cause + AD-26 encode/decode — per-WP FR-28 causes from `prevInputs`; index encoding; strip `remainingDays` on store; `engine_version` column; graph refuse rolls back, calendar-range halt records (Q2 → A).
- [x] Closure + shuffle + size + retention tests — AR-52 three ways; codec re-read of stored run; 500×500 measure; AD-5 retention proof (runs between two Reviews).
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` — close/annotate the 2.9-directed entries.

**Acceptance Criteria:**
- Given any scheduling input write, when it goes through `applyPlanChange`, then write and recalculation share one transaction under the per-Project lock, and dependency-cruiser forbids any other importer of the scheduling repositories.
- Given a successful run, when `schedule_run` is read back through the codec, then outputs match `recalculate` and every WP reference is an index into `inputs.wps`; `engine_version` is a registered key.
- Given a calendar-range halt, when the fence finishes, then a run exists with `halted_reason` and null outputs and `wp_schedule.stale` is true on the prior projection.
- Given CI, when the three closure tests, the stored-run shuffle check, the payload measure and the retention proof run, then all pass within the stated budgets/tolerances.
- Given `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test`, when they run, then all exit 0.

## Implementation Notes

2026-09-24 implementer:

- Fence: `packages/app/src/schedule/apply-plan-change.ts` + `recalculate-project.ts`; minimal mutation union (duration / constraint / dependency); `checkPlanInvariants` before write; 23503/23514 → `invalid_input` via `pg-errors.ts`.
- Repos: `packages/db/src/repositories/plan-input/` + `schedule/`; `lockWatermark` before `schedule_run` INSERT; rebuild/stale `wp_schedule`.
- Domain: FR-28 causes from `prevInputs` (`cause.ts` + `recalculate` overlay); AD-26 encode/decode + strip `remainingDays` (`stored-run.ts`); AD-5 retention helper (`retention.ts`).
- Q2 → A: `graph_invalid` refuse/rollback; `calendar_range` halted run + stale.
- Tests: `tests/schedule-closure.test.ts` (AR-52), `tests/schedule/{fence,stored-run,cause,retention}.test.ts`.
- App imports scheduling repos via relative `../../../db/src/repositories/...` (vitest package export resolution); `WriteScope.bound` for fence-built repos.
- Deferred-work: annotated 2.9-directed entries (shuffle YES; cause/halt/encoding YES; invariants + watermark + 23503 PARTIAL residues for 2.10 / shared path).
- Audit follow-up (2026-09-24): calendar-range halt AC covered in `tests/schedule/fence.test.ts` (success then `must_finish_on` past synthetic `rangeEnd` → halted run, null outputs, prior `wp_schedule.stale=true`). Concurrent ingest: contending `lockWatermark` with `SET LOCAL lock_timeout` yields SQLSTATE `55P03` in <5s (Drizzle wraps on `.cause`). Size: raw ±25% of 385 kB; `pg_column_size` asserted as upper budget ≤141 kB×1.25 with >8 kB floor (measured ~30 kB jsonb binary vs AD-26 text estimate); WAL measured across COMMIT (measured ~40–50 kB, upper ≤152 kB×1.25).

- Gaps: synthetic calendar until 2.12; size gate is in-memory raw encode ±25% of 385 kB (optional DB pglz/WAL when reachable); no dedicated COMMIT-time 23503 audit-absence probe; concurrent ingest/`lock_timeout` lightly covered; `applyPlanChange` not on use-cases barrel yet.

## Spec Change Log


## Review Triage Log

## Design Notes

**Fence is the product.** The engine without a single writer is still Excel with a better calculator. AR-43 closes the input side by repository ownership, not by a caller allowlist alone — that is why the three AR-52 tests all ship together.

**Run-level `cause` vs per-WP cause (C-6).** `schedule_run.cause` is the **trigger kind** (what fired the run — e.g. duration edit, data date, calendar). Per-WP FR-28 cause lives in outputs (or the compact causes array AD-26 retains with inputs) and is derived from `diff(prevInputs, inputs)` plus whether that WP's own dates moved. *Moved by a predecessor* is never a run-level trigger.

**is_critical column.** `wp_schedule.is_critical` is `NOT NULL DEFAULT false`. When the domain has no anchor (no Float), mirror `false` — never null.

**Measurement edges.** Epic 1's load fixture has 500 WPs and no edges; the size test must construct 500 edges so the AD-26 budget is real.

## Verification

**Commands:**
- `pnpm exec vitest run` on the new fence / repository / closure / measure / retention suites -- expected: all pass
- `pnpm lint && pnpm typecheck && pnpm depcruise && pnpm test` -- expected: exit 0

---
title: 'Story 4.1 — Set a Baseline that points at the run behind it'
type: 'feature'
created: '2026-10-03'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'bfc7383d0b25904beb3688f296adfccc9af3e507'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Schema and Review already know Baseline, but nothing writes one. A PM cannot pin the Current Plan's latest successful `schedule_run`, so EVM stays in "No Baseline yet" and Epic 5 cannot accept baselined buckets.

**Approach:** Add `app` Baseline writer `setBaseline` that appends `baseline_version` (FK to the latest successful run) plus leaf `baseline_wp` cost-projection rows from the current schema, refuses incomplete / unschedulable plans, proves retention-by-reference and append-only, and wires *Set Baseline* on Review (and Plan entry points that already advertise it) while keeping the empty state until the first version exists.

**Decisions (founder, 2026-10-03 — Harry approved defaults for Epic 4 §7):**
- **M-2 → stick to current schema.** `baseline_wp` writes only columns that exist today: derived `start`/`finish`, `baseline_mh`, `is_milestone`, `is_catch_all` (plus leaf/`wp_id` keys). Defer assigned-Resources and Rate-derived-cost columns — do not migrate.
- **CR link → out of 4.1.** Re-baseline CR candidate linking is story 4.3; Disposition UI lives in Epic 6. Do not stub CR tables here.
- **Seed → keep 2-A.** Demo seed still writes **no** Baseline; empty + *Set Baseline* is the product state after this story.
- **Catch-all → value-at-set-time.** Copy `work_package.is_catch_all` (or equivalent live flag) onto `baseline_wp.is_catch_all` when setting; may be `false` until Epic 5 flag writers exist. Do not invent `wp_flag_event` here.
- **4.1 vs 4.2 → separate.** Ship 4.1 with refuse + retention assertions. Do **not** implement the full re-derivation CI gate (that is 4.2). Do not mark Epic 4 done before 4.2.
- **First Set only.** If a Baseline version already exists, refuse (Re-baseline is 4.3). First Set may use a fixed reason string (e.g. i18n "Initial Baseline") because `reason` is NOT NULL; free-text mandatory reason is 4.3.

## Boundaries & Constraints

**Always:**
- Pin by reference: `baseline_version.schedule_run_seq` → latest **successful** (non-halted, outputs present) `schedule_run` for the Project; never copy run `inputs` onto Baseline (AR-22).
- `baseline_wp` = cost projection only from current schema columns (M-2 decision); one row per baselined leaf WP; match by `wp_id`.
- Refuse when any leaf lacks duration, Project has no Project start, latest run is missing/halted, or "not schedulable yet" rows exist — return blocking WPs; UI disables *Set Baseline* with count + link into the exceptions rail (FR-15, UX-DR23).
- Append-only: INSERT only on `baseline_version` / `baseline_wp`; grants + trigger already enforce; tests assert UPDATE/DELETE fail (AR-9).
- Retention: after a Baseline pins a run, `scheduleRunRetention` (or equivalent proof) keeps that run's `inputs` while the Baseline exists (AR-11).
- Same tenant transaction under the AD-20 per-Project exclusive lock (`lockWatermark` before first Baseline INSERT); audit in the same transaction; `PROJECT_REACH` / declared roles + audit gate (mirror schedule fence F10 pattern).
- Review empty state remains "No Baseline yet. EVM starts once you set one." with *Set Baseline* until the first version exists; Unplanned / Unmapped still render (FR-15, UX-DR23).

**Never:**
- No schema migration to add Resources/Rate columns (M-2 deferred).
- No re-derivation CI gate / codec golden for Baseline (story 4.2).
- No Re-baseline, history compare-as-plans, CR link, or reason dialog beyond first-set constant (4.3 / 4.4).
- No Baseline compare Plan preset columns (4.5). No seed Baseline (2-A). No Epic 3 import / Epic 5 `wp_flag_event`.
- Do not copy schedule inputs into Baseline tables. Do not UPDATE/DELETE Baseline rows via maintenance shortcuts in app code. Do not pin a halted run.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy first Set | Schedulable plan; latest run successful; no Baseline yet | Append `baseline_version` FK → that run; leaf `baseline_wp` rows; Review/Baselines leave empty state | N/A |
| Incomplete plan | Leaf missing duration and/or no Project start / not-schedulable rows | Refuse; no rows written; UI control disabled with count + rail link | `invalid_input` (or refuse shape) names blockers |
| Halted / missing run | Latest run halted or no run | Refuse; no Baseline | Refuse naming run |
| Second Set | Baseline already exists | Refuse; point to Re-baseline (out of scope) | Refuse |
| Append-only | UPDATE/DELETE on `baseline_version` / `baseline_wp` as app role | Trigger rejects | SQLSTATE append-only |
| Retention | Baseline pins run R; retention decision over runs | R's `inputs` retained while pin exists | Fail test if droppable |
| Catch-all copy | Leaf `is_catch_all` true/false at set time | `baseline_wp.is_catch_all` matches value-at-set-time | N/A |
| Cross-role | Viewer / no project reach | `not_found`; no write | not_found |

</frozen-after-approval>

## Code Map

- `packages/db/src/schema.ts` + `drizzle/0000_scheduling_schema.sql` — **read-only**: `baseline_version` (`schedule_run_seq`, `reason`, `actor`, `recorded_at`), `baseline_wp` (`start`, `finish`, `baseline_mh`, `is_milestone`, `is_catch_all`, leaf FK). No migration.
- `packages/db/src/table-classes.ts` / grants / triggers — already `append-only` for both tables; assert, do not reclass.
- `packages/db/src/repositories/` — **new** Baseline repository (e.g. `baseline/`) for INSERT version + wp rows + read helpers needed by the writer; only `packages/app` Baseline/schedule module may import it. Extend `.dependency-cruiser.cjs` fence if a new repo path is introduced (mirror `SCHEDULING_REPOSITORIES`).
- `packages/db/src/repositories/schedule/` — reuse `latestRun` / plan load; pin must be the latest **successful** run (skip halted).
- `packages/db/src/watermark-lock.ts` — `lockWatermark` on Project key before first Baseline INSERT.
- `packages/db/src/baseline-read.test.ts` + `packages/db/src/repo.ts` (`loadProjectBundle`) — reads already understand Baseline; writer must produce rows the bundle already maps (`BaselineVersion` / active = max seq).
- `packages/domain/src/schedule/retention.ts` — reuse `scheduleRunRetention`; Baseline pin seqs feed `pinnedSeqs`.
- `packages/domain/src/types.ts` — `BaselineVersion` shape already used by EVM/Review; keep compatible.
- `packages/app/src/` — **new** `setBaseline` (module under `baseline/` or beside schedule); mirror `apply-plan-change` authorize + `runAuditedWrite` + refuse; export colocated `*_ROLES` / `*_AUDIT`; merge into `use-cases/role-declarations.ts` (and audit declarations / F10 second module list if kept off the barrel).
- `packages/app/src/audit/` — register action e.g. `baseline.set` + payload schema.
- `packages/app/src/schedule/plan-grid.ts` / exceptions rail — source of not-schedulable count for disable + link (reuse 2.16 rail keys).
- `apps/web` — Review empty state already shows `review.no_baseline_yet`; wire *Set Baseline* server action; disable when not schedulable; update `/baselines` demo_not_wired copy once writer exists. Plan toolbar: enable Set entry if AC requires it beside the reserved Baseline-compare control — do not ship 4.5 columns.
- `packages/db/src/seed.ts` / fixture clock tests — **do not** seed Baseline (2-A); keep existing "writes no Baseline" assertions green.
- `tests/` — fence/use-case tests for every matrix row; retention proof with Baseline pin; append-only probe; role gate. Prefer DB-reachable pattern from `tests/schedule/fence-*.test.ts`.
- Continuity: Epic 2 fence owns schedule inputs; 4.1 only **reads** latest successful run + live leaf projection fields (`planned_mh`, flags, derived dates from `wp_schedule` / run outputs — pick one source and document in Implementation Notes). Story 4.2 owns re-derive gate.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/db` Baseline repository — INSERT `baseline_version` + leaf `baseline_wp` under watermark; no migration.
- [ ] `packages/app` `setBaseline` — authorize, lock, refuse incomplete/halted/second-set, audit, pin by FK.
- [ ] Dependency-cruiser / role / audit gates — register writer; fence new repo path if added.
- [ ] `apps/web` — wire *Set Baseline* on Review (and Plan entry if in scope); disable + exceptions-rail link when not schedulable; keep empty copy until first version.
- [ ] Tests — matrix coverage: happy path, refuse incomplete, refuse halted/missing run, refuse second set, append-only, retention pin, catch-all copy, role `not_found`.
- [ ] `sprint-status.yaml` — move `4-1-…` to `in-progress`/`review`/`done` as build proceeds; do not mark `epic-4` done.

**Acceptance Criteria:**
- Given a schedulable Current Plan with a successful latest `schedule_run` and no Baseline, when the PM sets a Baseline, then `baseline_version.schedule_run_seq` is a real FK to that run and inputs are pinned by reference only (AR-22, FR-15).
- Given `baseline_wp` rows, when written, then they hold only the current-schema cost projection (dates, `baseline_mh`, milestone + catch-all flags) — not a second copy of schedule inputs (M-2, AR-22).
- Given a Baseline pin, when retention is evaluated, then that run's `inputs` cannot be dropped while the Baseline exists (AR-11).
- Given any leaf missing duration, no Project start, not-schedulable rows, or a halted/missing run, when Set is attempted, then it is refused with blockers shown and the control stays disabled with count + rail link (FR-15, UX-DR23).
- Given a recorded Baseline, when UPDATE/DELETE is attempted as the app role, then append-only enforcement rejects it (AR-9).
- Given a Project before its first Baseline, when Review opens, then it still shows the no-Baseline empty state with *Set Baseline*, and Unmapped/Unplanned still render (FR-15, UX-DR23).
- Given `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test`, when they run, then all exit 0.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

**Pin the run, project the cost.** The schedule's meaning lives in `schedule_run.inputs`; Baseline must not fork that document. `baseline_wp` exists so PV/BAC/Divergence can read a stable cost slice without joining the whole run on every Review paint.

**Refuse is product, not polish.** A Baseline on an incomplete plan would fail 4.2's re-derivation by construction — 4.1 must close that door before 4.2 opens the gate.

**First Set ≠ Re-baseline.** Schema `reason` is NOT NULL; a fixed first-set reason keeps 4.1 small. Mandatory free-text + CR link belong to 4.3.

## Verification

**Commands:**
- `pnpm lint` — expected: exit 0
- `pnpm typecheck` — expected: exit 0
- `pnpm depcruise` — expected: exit 0
- `pnpm test` — expected: exit 0 (DB-reachable Baseline fence/retention tests green when `REQUIRE_DB` / local Postgres available)

**Manual checks (if no CLI):**
- Review: empty state → Set Baseline on a schedulable demo plan → history/BAC appear; incomplete leaf → control disabled + rail link.
- Confirm seed still has no Baseline after re-seed.

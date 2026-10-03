---
title: 'Story 4.1 — Set a Baseline that points at the run behind it'
type: 'feature'
created: '2026-10-03'
status: 'in-review'
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
- [x] `packages/db` Baseline repository — INSERT `baseline_version` + leaf `baseline_wp` under watermark; no migration.
- [x] `packages/app` `setBaseline` — authorize, lock, refuse incomplete/halted/second-set, audit, pin by FK.
- [x] Dependency-cruiser / role / audit gates — register writer; fence new repo path if added.
- [x] `apps/web` — wire *Set Baseline* on Review (and Plan entry if in scope); disable + exceptions-rail link when not schedulable; keep empty copy until first version.
- [x] Tests — matrix coverage: happy path, refuse incomplete, refuse halted/missing run, refuse second set, append-only, retention pin, catch-all copy, role `not_found`.
- [x] `sprint-status.yaml` — move `4-1-…` to `in-progress`/`review`/`done` as build proceeds; do not mark `epic-4` done.

**Acceptance Criteria:**
- Given a schedulable Current Plan with a successful latest `schedule_run` and no Baseline, when the PM sets a Baseline, then `baseline_version.schedule_run_seq` is a real FK to that run and inputs are pinned by reference only (AR-22, FR-15).
- Given `baseline_wp` rows, when written, then they hold only the current-schema cost projection (dates, `baseline_mh`, milestone + catch-all flags) — not a second copy of schedule inputs (M-2, AR-22).
- Given a Baseline pin, when retention is evaluated, then that run's `inputs` cannot be dropped while the Baseline exists (AR-11).
- Given any leaf missing duration, no Project start, not-schedulable rows, or a halted/missing run, when Set is attempted, then it is refused with blockers shown and the control stays disabled with count + rail link (FR-15, UX-DR23).
- Given a recorded Baseline, when UPDATE/DELETE is attempted as the app role, then append-only enforcement rejects it (AR-9).
- Given a Project before its first Baseline, when Review opens, then it still shows the no-Baseline empty state with *Set Baseline*, and Unmapped/Unplanned still render (FR-15, UX-DR23).
- Given `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test`, when they run, then all exit 0.

## Implementation Notes

- **Date source for `baseline_wp`:** derived `start`/`finish` come from the pinned successful run's **outputs** (`earlyStart`/`earlyFinish`), matched by `wp_id` via `inputs.wps` order — not from live `wp_schedule`. Effort and flags (`baseline_mh`, `is_milestone`, `is_catch_all`) are copied from live `work_package` at set time (M-2 / catch-all value-at-set-time).
- **First-set reason:** constant `FIRST_SET_REASON = 'Initial Baseline'` (DB + audit); free-text reason is 4.3.
- **Latest-run refuse:** if the Current Plan's latest `schedule_run` is halted or missing outputs, Set is refused even when an older successful run exists — do not pin behind a halted head.
- **Fences:** `packages/db/src/repositories/baseline` only from `packages/app/src/baseline`; schedule repos also readable from `app/baseline` for `latestSuccessfulRun`. Writer stays off the use-cases barrel (F10 list).
- **UI:** Review empty copy shortened to UX-DR23 wording; Plan toolbar + Baselines get the same control; disabled state links to `/plan?exceptions=not_schedulable`.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---------|---------|------------------|
| Concurrent first-Set: gate before `lockWatermark`, no re-read (`set-baseline.ts:86-140`) | high | Real TOCTOU — two transactions can both pass `existingBaselineSeq === null` and both INSERT. Route: **patch** — lock then re-load + re-gate before INSERT. |
| `writeLanded(Result<SetBaselineResult>)` vs `Result<void>` (`baselines/actions.ts:14`) | high | Confirmed: `pnpm --filter @momo/web typecheck` fails TS2345; CI runs this step. Root `pnpm typecheck` excludes `apps`. Route: **patch** — widen `writeLanded` to `Result<unknown>` (or discard value). |
| UI rail link only when `notSchedulableCount > 0`; `blockingWpIds` unused (`set-baseline-button.tsx` / control) | medium | Incomplete / no-start can refuse with blockers while engine NS count is 0; control shows generic `set_blocked` and no Plan link. Route: **patch** — show count+link when `notSchedulableCount > 0` **or** `blockingWpIds.length > 0` (count = max of both). |
| `no_project_start` sets `notSchedulableCount = missingDuration.length` (`gates.ts:100-106`) | medium | Mis-labels duration gaps as NS count for the UI string. Same patch group as UI affordance — drive UI from blockers + real NS length. |
| Deep-link `?exceptions=not_schedulable` opens drawer but never selects NS rail key (`plan-tree-grid.tsx:810-818`) | medium | Effect only `setDrawerOpen(true)`. Route: **patch** — select first `not_schedulable:*` key (or group) on mount. |
| Halted-head refuse not exercised through DB/`setBaseline` fence | medium | Pre-verified gap — only `gates.test.ts` unit; fence "no run" is not halted-head. Route: **patch** — add fence case. |
| `getBaselineSetState` happy / hasBaseline / href untested | medium | Pre-verified gap — only incomplete path. Route: **patch** — extend fence assertions. |
| Set Baseline web UX (button/control/deep-link) has no unit test | medium | Pre-verified gap. Route: **patch** — small `apps/web` unit tests. |
| New baseline depcruise rules not probed | medium | Pre-verified gap — rules can be deleted without CI noticing. Route: **patch** — temp-file probes in `depcruise-fences.test.ts`. |
| Fence incomplete asserts `notSchedulableCount > 0` for missing-duration | medium | Gate NS count is engine-only; assertion can be wrong for pure incompleteness. Route: **patch** — assert `blockingWpIds` / `canSet` instead (covered by UI patch + state tests). |
| Append-only probes only UPDATE version + DELETE wp | low | Half of AR-9 matrix per table missing. Route: **patch** — add UPDATE wp + DELETE version. |
| Retention test hand-builds `pinnedSeqs`; `pinnedScheduleRunSeqs` unused | low | AR-11 proof via `scheduleRunRetention` meets matrix; GC wiring not in 4.1. Route: **patch** — fence should call `pinnedScheduleRunSeqs` into retention. Unused helper alone is not a product defect. |
| `sprint-status.yaml` `last_updated` moved backward to `11:20` | low | Tracking hygiene. Route: **patch** — set a current timestamp. |
| `baselines.initial_reason` i18n unused; writer uses `FIRST_SET_REASON` | low | Cosmetic dead key. Reject — unlikely everyday harm; deleting key is optional cleanup (not required). |
| `ja.json` Set Baseline strings still English | low | Pre-existing ja locale pattern (many product strings English). Route: **defer**. |
| Server action swallows refuse with no toast | false | Same `writeLanded` early-return pattern as other write actions; disabled control is the product gate. |
| Review mounts Set Baseline only on `section === 'status'` | false | One primary CTA in the status empty state; other sections keep the tag without duplicating the control. |
| Duplicate `SetBaselineButton` / `SetBaselineControl` | false | RSC vs client needed for Plan toolbar pending; shared props already align. |
| AC only lists `pnpm typecheck` so web TS error is out of scope | false | Intent + CI require web typecheck green; defect is real at `actions.ts`. |

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

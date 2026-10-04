---
title: 'Story 4.5 — Baseline comparison as columns on the Plan grid'
type: 'feature'
created: '2026-10-04'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b2c1c77532d71ed5fd0748181a4bae156a4bdf08'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-set-a-baseline-that-points-at-the-run-behind-it.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-2-the-re-derivation-test.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-3-re-baseline-with-a-reason-and-a-history.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-4-compare-two-versions-as-plans-not-only-as-rows.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Plan grid still stubs **Baseline compare**. A PM with an active Baseline cannot see Baseline dates/duration/effort beside the Current Plan with Δ columns — R0 has no bars (FR-7, UX-DR4).

**Approach:** Land the sized **Baseline compare** preset on the Plan tree grid: active Baseline vs Current Plan derived + signed Δ for start, finish, duration, and effort. Domain Divergence for that Baseline half follows AR-22 (`baseline_wp` vs the pinned `schedule_run` — outputs for dates, inputs for effort). No Baseline → preset disabled with "No Baseline yet"; Schedule/Progress keep working.

**Decisions (founder frozen, 2026-10-04 — Harry):**
- Preset columns (order): Baseline start / derived start / Δ; Baseline finish / derived finish / Δ; Baseline duration / duration / Δ; Baseline effort / effort / Δ — as columns, no bars (FR-7, UX-DR4, Core).
- No Baseline yet → Baseline compare disabled with "No Baseline yet"; other presets still work (UX-DR23).
- Divergence compares `baseline_wp` with the pinned `schedule_run` (`outputs` for dates, `inputs` for effort) — never `wp_schedule` or a `work_package` column (AR-22).
- Plan-grid display columns: **active Baseline** (`baseline_wp` for the max `baseline_version.seq`) vs **Current Plan** derived + Δ ("what moved since the Baseline").
- Sized preset: fits grid width like Schedule/Progress; adding a column takes width from another (UX-DR4). *All* stays later/disabled.
- Still pin by FK; refuse incomplete; retention-by-reference; append-only history; plan-level version compare — **reuse 4.1–4.4, do not fork**.
- Do **not** start Epic 5, Story 3.1, or invent `epic-4-retrospective` in this build. After 4.5 lands, epic-4 may move toward done; retro stays optional/later.

## Boundaries & Constraints

**Always:**
- Active Baseline = highest `baseline_version.seq` for the Project (same as Review/EVM).
- Baseline start/finish/effort from active `baseline_wp` (`start`, `finish`, `baseline_mh`); Baseline duration from that version's **pinned** run `inputs.wps[].durationDays` matched by `wp_id` (no duration column on `baseline_wp`).
- Current Plan derived start/finish/duration/effort for the preset columns come from the Plan's current schedule presentation already used by the grid (latest successful run / `PlanGridRow`), plus planned effort exposed on the row — never invent a second schedule.
- Domain Divergence helper: per leaf WP, compare `baseline_wp` to the **pinned** run only (`outputs.earlyStart|earlyFinish`, `inputs.plannedMh` / `durationDays` as needed) — AD-10-safe; unit-tested.
- Δ: signed `+`/`−` (real minus); zero is `0`; N/A is dash (DESIGN). Date/duration Δ in working days where a calendar is available; effort Δ in the same milli-hour display family as elsewhere.
- Leaf-only `baseline_wp`: summary rows show Baseline-side N/A (dash); derived/effort still follow Current Plan roll-up rules already on the grid.
- Preset key `3` switches to Baseline compare when enabled; persist per user per project with Schedule/Progress; keep focused row (UX-DR24).
- Match WPs by `wp_id`; `wbs_code` sorts only.

**Never:**
- No schema migration; no UPDATE/DELETE on Baseline / `schedule_run`.
- No re-implement of `setBaseline`, `reBaseline`, re-derivation gate, retention helper, or 4.4 version-to-version compare (`compareBaselinePlans` / `/baselines` A/B panel).
- Do not enable *All*; do not start Epic 5 / 3.1; do not invent an epic-4 retrospective.
- Domain Divergence must not read `wp_schedule` or live `work_package` columns.
- Do not mark stories other than 4.5 done; epic-4 → `done` only when 4.5 is done and Harry/process allows — this story may update sprint-status for 4.5 and epic-4 accordingly at close, not invent a retro.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy columns | Active Baseline; Current Plan dates/effort differ | Preset shows 12 data cols; Δ non-zero where moved | N/A |
| No Baseline | `latestVersionSeq === null` | Baseline compare disabled; title/caption "No Baseline yet"; keys `1`/`2` work; `3` no-op | N/A |
| After Set/Re-baseline | New max seq | Preset uses new active `baseline_wp` + that version's pin for Divergence | N/A |
| Divergence source | Domain helper given baseline_wp + pin run | Dates vs `outputs`; effort vs `inputs.plannedMh`; never wp_schedule/WP cols | N/A |
| Summary WP | Non-leaf row | Baseline start/finish/dur/effort = N/A (—); derived from Current Plan | N/A |
| Width | Baseline compare selected | Sized preset fits like Schedule/Progress (no horizontal scroll required for the preset itself); widths trade off within the budget | N/A |
| Focus persist | Switch Schedule ↔ Baseline compare | Focused row kept; preset persisted | N/A |
| Cross-role | Viewer / no reach | Plan load already `not_found`; no new write surface | not_found |
| Append-only / pin reuse | Existing Baseline + pin | Untouched; read-only path | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/components/plan-tree-grid.tsx` — enable Baseline compare when `hasBaseline` / setBaseline model says a version exists; disable + "No Baseline yet" otherwise; leave *All* stubbed. Add `renderBaselineCompareCells` + colgroup widths summing into the sized budget (~1229px with frozen 82+214+34). Wire digit key `3`.
- `apps/web/src/lib/plan-grid-format.ts` — extend `PlanPreset` with `'baseline'`; `readStoredPreset` / `writeStoredPreset` / `presetFromDigitKey` (`3` → baseline when allowed).
- `apps/web/src/lib/plan-grid-view.ts` — `BASELINE_COMPARE_COLUMNS` constant (12 headers) mirroring EXPERIENCE order.
- `apps/web/src/app/p/[projectId]/plan/page.tsx` — pass active-Baseline presence (already has `baselineSetState` / `hasBaseline`) into the grid; ensure plan-grid payload includes Baseline compare fields once loaded.
- `packages/app/src/schedule/plan-grid.ts` — extend `PlanGridRow` (or sibling map) with Baseline compare fields: baseline start/finish/duration/effort, current effort (`plannedMh`), and precomputed Δs **or** load active baseline + pin alongside grid state and let domain format. Prefer one authorised read path: reuse `baseline.latestVersionSeq` / wp rows + `latestPinnedScheduleRunSeq` + `schedule.runBySeq` for the pin; Current Plan dates/duration from existing row assembly; expose `plannedMh` from plan-input load already in scope. **Do not** change Schedule/Progress cell semantics.
- `packages/db/src/repositories/baseline/index.ts` — **reuse** `latestVersionSeq`, `latestPinnedScheduleRunSeq`, add read of active version's `baseline_wp` rows if missing (leaf projection for display). No writer changes.
- `packages/domain/src/` — **new** pure Divergence helper (name flexible, e.g. `divergenceFromPinned`): `baseline_wp` rows + decoded pinned run → per-`wp_id` date/effort(/duration) deltas vs pin. Unit matrix locks AR-22 sources. May also export Plan-column Δ helpers (Current Plan vs baseline_wp) that the app calls with already-loaded Current Plan figures — keep pin Divergence separate so the AC is unambiguous.
- `packages/domain/src/present/` — reuse date/hours/signed formatters (`formatPlanDate`, `hoursSigned` / float-style signed ints); add tiny signed working-day helper if absent.
- `packages/domain/src/calendar` — reuse `workingDaysBetween` for date Δ when Current Plan calendar is in hand; if calendar unavailable in the Plan read, document fallback (calendar-day integer Δ) in Implementation Notes and cover with a test.
- `packages/i18n` `en.json` / `ja.json` — toolbar title "No Baseline yet"; column headers if externalised (follow existing plan-grid pattern — Schedule headers are currently inline English in the grid).
- `apps/web/.../baseline-compare.tsx` / `compare-baseline-plans` — **do not change** (4.4 version A/B).
- `packages/app/src/baseline/set-baseline.ts` / `re-baseline.ts` / `gates.ts` / `re-derive-pinned.ts` — **read-only reuse**; no forks.
- `tests/schedule/fence-4-5-*.test.ts` — happy Δ after plan edit; no-Baseline disable contract; Divergence unit/fence asserts pin sources; summary N/A; role reach unchanged. Reuse fence-harness + 4.1/4.3 prepare (setBaseline / reBaseline).
- Continuity from 4.4: Plan toolbar was intentionally left stubbed; `/baselines` compare stays; this story owns the preset only.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain` — Divergence-from-pin pure helper + Plan Δ helpers; unit matrix (AR-22 sources + signed Δ).
- [x] `packages/db` / `packages/app` — authorised Plan-grid (or baseline read) load of active `baseline_wp` + pin metadata; expose Baseline compare fields on Plan rows; no writers.
- [x] `apps/web` — Baseline compare preset columns, widths, enable/disable "No Baseline yet", key `3`, i18n as needed; *All* remains stub.
- [x] `tests/schedule/fence-4-5-*.test.ts` — I/O matrix (DB fence + UI contract where cheap).
- [x] `sprint-status.yaml` — move `4-5-baseline-comparison-as-columns-on-the-plan-grid` through `ready-for-dev` / `in-progress` / `review`; when 4.5 is done, epic-4 may become `done`; do **not** invent `epic-4-retrospective` content.

**Acceptance Criteria:**
- Given the Plan grid's Baseline compare preset, when it renders with an active Baseline, then it shows Baseline start, derived start and Δ; Baseline finish, derived finish and Δ; Baseline duration, duration and Δ; Baseline effort, effort and Δ as columns (FR-7, UX-DR4, Core).
- Given a Project with no Baseline, when the preset control is shown, then it is disabled with "No Baseline yet" and Schedule/Progress still work (UX-DR23).
- Given Divergence, when computed, then it compares `baseline_wp` with the pinned `schedule_run` (outputs for dates, inputs for effort) and never with `wp_schedule` or a `work_package` column (AR-22).
- Given the preset, when sized, then it fits the grid width like Schedule/Progress and column widths trade within that budget (UX-DR4).
- Given `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test`, when they run, then all exit 0.

## Implementation Notes

- **Domain:** `divergenceFromPinned` (AR-22: `baseline_wp` ↔ pin outputs dates / inputs effort+duration) and `planBaselineCompare` (Plan columns: active Baseline ↔ Current Plan) stay separate. Date Δ uses `CalendarVersion` working-day positions when available; otherwise calendar-day integer Δ.
- **DB:** `baseline.loadActiveBaselineWps` reads leaf rows for max `seq`. No writers.
- **App:** `loadActiveBaselineForGrid` (fenced in `app/baseline`) feeds `getPlanGridState`; Baseline Read fields land on `PlanGridRow` + `hasBaseline`. Current Plan effort from `loadPlanRows.plannedMh` with summary roll-up of descendant leaves.
- **Web:** Preset `'baseline'`, key `3`, disable title "No Baseline yet", twelve cols summing ≤899px scrolling; *All* still stubbed. `/baselines` 4.4 compare untouched.
- **Fallback:** When Plan calendar is missing, pin calendar is used for working-day Δ; if both absent, calendar-day Δ applies (covered by domain unit).

## Spec Change Log

## Review Triage Log

## Design Notes

**Two comparisons, one preset.** The Plan columns answer "what moved since the Baseline?" (active `baseline_wp` vs Current Plan). AR-22 Divergence is the cost-projection check against the **pin** and must stay AD-10-clean. Do not collapse them into one function that secretly reads `wp_schedule`.

**Duration is not on `baseline_wp`.** Baseline duration comes from the pinned run's `inputs.durationDays` for that `wp_id`. Baseline dates/effort stay on `baseline_wp`.

**Width contract.** Twelve scrolling columns must share ~899px (Schedule's scrolling budget). Prefer compact Δ (~40–48px) and slightly tighter date/effort columns; never introduce horizontal scroll for this sized preset.

**Leave 4.4 alone.** `/baselines` A/B plan compare is version↔version; this preset is active Baseline↔Current Plan on the Plan surface.

## Verification

**Commands:**
- `pnpm lint` — expected: exit 0
- `pnpm typecheck` — expected: exit 0
- `pnpm depcruise` — expected: exit 0
- `pnpm test` — expected: exit 0 (domain units + DB fence when Postgres available)

**Manual checks (if no CLI):**
- Plan: with Baseline, key `3` / toolbar → twelve Baseline compare columns with signed Δ; without Baseline, control disabled "No Baseline yet"; Schedule/Progress unchanged; *All* still disabled; `/baselines` 4.4 compare still works.

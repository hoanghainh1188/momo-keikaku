# Verification Gap Review — Story 2.11

Review content: `diff.patch` / embedded unified diff in `prompt-verification-gap.md`.
Tests read: `tests/schedule/fence-2-11.test.ts`, `tests/schedule-closure.test.ts` (writers grep), `tests/schedule/fence-2-10.test.ts` / `fence.test.ts` (fixture patterns only). Symbol searches across `tests/` and `*.{ts,tsx}` for `set_project_start`, `clear_project_start`, `patch_project_finish`, `patch_data_date`, `remainingLeafCount`, `dataDateBlockers`, `getPlanThinUiState`, `setProjectStart`, `NO_PROJECT_START_YET`, `dataDate: ['required']`.

### Set Project start default Data Date (project tz) is never exercised

- **Changed surface:** `set_project_start` defaults omitted `dataDate` to today via `projectDate(stamp.at…, tzOffsetMinutes)` at `packages/app/src/schedule/apply-plan-change.ts:487-492` (FR-43: never UTC `toISOString().slice(0,10)` alone).
- **Impacted consumer or site:** Plan and settings write paths omit `dataDate` — `setProjectStartPlanAction` → `setProjectStartSetting({ projectId, projectStart })` at `apps/web/src/app/p/[projectId]/plan/actions.ts:115-119`, and `setProjectStartAction` at `apps/web/src/app/p/[projectId]/settings/actions.ts:42-46`; both go through `setProjectStart` which only spreads `dataDate` when present (`packages/app/src/schedule/plan-edit.ts:256-261`).
- **Existing test evidence:**
  - `Regression gap`: The only `set_project_start` case is `tests/schedule/fence-2-11.test.ts:110-190`, which always passes explicit `dataDate: '2026-09-24'` (lines 119-123) and asserts that literal (161-165). Repo-wide search of `tests/` for `kind: 'set_project_start'` / omitted-`dataDate` callers finds no other case; `projectDate(` is never used in these tests.
- **Missing verification:** An assertion that omitting `dataDate` writes `project.data_date` equal to `projectDate(stamp, project.tzOffsetMinutes)` (and not UTC calendar date).
- **Demonstration:**
  - Replace the default with `stamp.at.toISOString().slice(0, 10)`, or stop passing `dataDate` into `patchProjectStart` when the mutation omits it: the fence-2-11 set-start test still passes because it supplies `dataDate`. Production Plan/settings submits would get the wrong day (or leave `data_date` null and fail resolve).
- **Consequence:** The FR-43 first-action default that every real UI call uses can regress without CI noticing.
- **Disposition:** `patch` — extend `fence-2-11` with a set-start case that omits `dataDate`, fixes the write stamp / project `tzOffsetMinutes`, and asserts the stored `data_date` matches `projectDate`.

### Advance-preview remaining count is formatter-only; `remainingLeafCount` is untested

- **Changed surface:** `planInput.remainingLeafCount` counts leaf WPs with no head `actualFinish` (`packages/db/src/repositories/plan-input/index.ts:804-841`); `getPlanThinUiState` exposes it (`packages/app/src/schedule/plan-edit.ts:113-129`).
- **Impacted consumer or site:** Project settings page builds the named preview with that count at `apps/web/src/app/p/[projectId]/settings/page.tsx:29-30` and shows it in `ProjectScheduleSettingsForm` (`apps/web/src/components/project-schedule-settings.tsx:185-193`).
- **Existing test evidence:**
  - `Broken-verification gap`: `tests/schedule/fence-2-11.test.ts:101-107` only unit-tests `dataDateAdvancePreview('2026-09-26', 78)` string formatting. Symbol/import search for `remainingLeafCount` and `getPlanThinUiState` under `tests/` returns no matches; production references are only plan-input, plan-edit, settings page/component.
- **Missing verification:** A DB-backed assertion that `remainingLeafCount` (or `getPlanThinUiState`) equals leaves without finished heads for a seeded graph (e.g. one finished leaf + one open leaf → count `1`).
- **Demonstration:**
  - Make `remainingLeafCount` always return `0`, or count finished leaves too: the preview string test still passes with hardcoded `78`; fence Data Date advance/refuse cases do not read the count. Settings would show a wrong “re-dates N remaining work packages” line.
- **Consequence:** UX-DR14’s named remaining-WP count can ship wrong while the suite still looks green on “advance preview.”
- **Disposition:** `patch` — add a fence-2-11 (or plan-edit) case that seeds actual finishes and asserts `remainingLeafCount` / preview input count.

### Set/clear Project finish never asserts the finish column was written

- **Changed surface:** `patch_project_finish` persists via `planInput.patchProjectFinish` at `packages/app/src/schedule/apply-plan-change.ts:502-507`.
- **Impacted consumer or site:** Settings finish forms call `patchProjectFinishAction` → `patchProjectFinishSetting` (`apps/web/src/app/p/[projectId]/settings/actions.ts:61-78`, `packages/app/src/schedule/plan-edit.ts:288-299`).
- **Existing test evidence:**
  - `Regression gap`: `tests/schedule/fence-2-11.test.ts:205-265` seeds a duration run, sets finish to `2026-12-31`, asserts only that `wp_schedule` early start/finish are unchanged (252-253), then clears finish and asserts only `clearFinish.ok` (264). It never selects `project.projectFinish`, never checks audit before/after, and never checks `schedule_run.cause === 'project_dates'`. No other `patch_project_finish` tests in the repo.
- **Missing verification:** Assert `project.projectFinish` after set and `null` after clear (and preferably cause / audit previous value).
- **Demonstration:**
  - No-op the `patch_project_finish` branch (skip `patchProjectFinish`): early dates still match the prior run, both calls still return ok, and the test passes — finish never lands for settings.
- **Consequence:** “Finish moves no WP” is checked, but “finish is actually set/cleared” is not; a broken writer ships as a false green.
- **Disposition:** `patch` — in the same fence-2-11 case, assert `projectFinish` before/after set and after clear (and optionally cause `project_dates`).

### Clear Project start audit before/after and `runSeq: null` are unchecked

- **Changed surface:** Clear-start skips recalc and audits with `runSeq: null` plus settings before/after at `packages/app/src/schedule/apply-plan-change.ts:649-663` (FR-43 / Q2→A).
- **Impacted consumer or site:** Settings “Clear Project start” → `clearProjectStartAction` → `clearProjectStart` (`apps/web/src/app/p/[projectId]/settings/actions.ts:52-58`, `packages/app/src/schedule/plan-edit.ts:267-277`).
- **Existing test evidence:**
  - `Regression gap`: `tests/schedule/fence-2-11.test.ts:168-203` asserts `projectStart` null and equal `schedule_run` count before/after. It does not read `audit_log`. The set-start case alone checks audit before/after (`:148-165`). Search of `tests/schedule` for clear-start audit / `runSeq` on clear finds nothing.
- **Missing verification:** Assert the clear-start audit payload has `kind: 'clear_project_start'`, `runSeq: null`, and before/after `projectStart` (and that `dataDate`/`projectFinish` are left alone if that is part of the audited contract).
- **Demonstration:**
  - Drop `audit.record` from the clear branch, or omit `settingsAudit` / set a non-null `runSeq`: the clear test still passes. Audit consumers lose the previous-value trail for the only mutation that must not create a run.
- **Consequence:** The Q2→A “still audited with before/after, no FR-6b” contract can regress undetected.
- **Disposition:** `patch` — extend the clear-start fence case with audit payload assertions (mirror the set-start audit checks).

### `resolveScheduleInputs` refuse-null Data Date / stop-invent has no failing Demonstration

- **Changed surface:** After start exists, null `dataDate` refuses with `dataDate: ['required']` and no longer falls back to `stamp.at…slice(0,10)` (`packages/app/src/schedule/recalculate-project.ts:111-114`, `:142`).
- **Impacted consumer or site:** Every fence path that recalculates after a write — `applyPlanChange` → `resolveScheduleInputs` at `packages/app/src/schedule/apply-plan-change.ts:666` (set start, finish, standalone Data Date, and non-settings mutations).
- **Existing test evidence:**
  - `Regression gap`: No test under `tests/` asserts `dataDate: ['required']` or a project with `projectStart` set and `dataDate` null. Fence fixtures always set both (`fence-2-11.test.ts:95`, `prepareSchedulable`; same pattern in `fence.test.ts` / `fence-2-10.test.ts`). Restoring invent changes no observed assertion in green paths.
- **Missing verification:** A recalc (e.g. `patch_duration` or `patch_data_date` setup) against `projectStart` set + `dataDate` null that expects refuse `dataDate: ['required']` (and does not invent a schedule run).
- **Demonstration:**
  - Revert to `const dataDate = plan.project.dataDate ?? stamp.at.toISOString().slice(0, 10)` and remove the null refuse: all current fence-2-11 / fence-2-10 / fence cases still pass because they never hit the null-`dataDate` branch.
- **Consequence:** The continuity fix from 2.10 review #7 (do not invent Data Date on resolve) can silently return without any suite failure.
- **Disposition:** `patch` — one fence case that plants start-without-dataDate and asserts resolve/recalc refuse.

## Other findings

- While tracing, noted that the 2.10 actuals compound still uses `plan.project.dataDate ?? stamp.at.toISOString().slice(0, 10)` at `packages/app/src/schedule/apply-plan-change.ts:435` for the advance-cover check — intentional continuity with the unchanged compound path, not a missing 2.11 adoption site.
- Clear-start test title claims “restores no-start” but does not assert that `dataDate` / `projectFinish` remain unchanged after clear (`plan-input` documents leaving them alone); same case can cover that if audit assertions are added.

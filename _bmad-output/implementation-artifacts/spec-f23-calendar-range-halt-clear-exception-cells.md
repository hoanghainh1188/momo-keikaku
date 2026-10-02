---
title: 'Epic 2 retro F23 — clear Exception cells on calendar_range halt'
type: 'bugfix'
created: '2026-10-03'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '80bdaa2dda6ba9a7a36e65e4f87812c6280754a1'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-retro-2026-09-27.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-16-the-schedule-exceptions-rail-and-its-three-explainers.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When the latest schedule run is halted for `calendar_range`, the exceptions rail is correctly empty (no decode from null outputs), but Plan grid rows can still paint Exception cells from stale `wp_schedule.notSchedulableReason` while violation/OOS maps stay empty — rail and cells disagree (Epic 2 retro F23).

**Approach:** When `haltedReason !== null`, force row `exception` to `null` (same halt gate as `emptyExceptionsRail`). Extend the existing fence `calendar_range` halt test to assert all row exceptions are null. Close sprint action item `epic-2-retro-item-14-…`.

## Boundaries & Constraints

**Always:**
- Align Exception cells with story 2.16 halt rule: do not surface exception chrome from stale projection when the latest run is halted (any halt reason, not only `calendar_range`).
- Keep `blankDerivedDates` last-good dates on `calendar_range`; keep rail `emptyExceptionsRail` behaviour unchanged.
- Fence regression on the existing `calendar-range halt` test in `tests/schedule/fence.test.ts`.

**Never:**
- No Epic 3 / story 3.1 work. No formatter collapse (F2/F5). No rail/explainer UX changes.
- Do not decode exceptions from halted runs. Do not change `markWpScheduleStale` or recalculate halt writers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| calendar_range halt | Latest run halted; stale `wp_schedule` with `notSchedulableReason` | Rail empty; every row `exception === null`; banner bounds unchanged | N/A |
| Other halt | Latest run halted (`graph_invalid` etc.) | Row `exception === null`; rail empty | N/A |
| Scheduled run | `haltedReason === null`; stale notSchedulable on a row | Exception cell still resolves via `resolveException` | N/A |

</frozen-after-approval>

## Code Map

- `packages/app/src/schedule/plan-grid.ts` — `getPlanGridState` row map (~1070–1128): gate `exception` when `haltedReason !== null`; optional small helper `planGridExceptionCell` for unit tests (same file as `resolveException` ~718–745). Halt branch ~1030–1048 unchanged.
- `packages/app/src/schedule/plan-grid.test.ts` — unit test for `planGridExceptionCell` halt vs scheduled paths.
- `tests/schedule/fence.test.ts` — `'calendar-range halt appends…'` (~344–356): assert `grid.value.rows.every((r) => r.exception === null)`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `epic-2-retro-item-14-on-calendar_range-halt-clear-exception-c` → `done`; refresh `last_updated`.
- Read-only: `spec-2-16` halt/rail AC; `epic-2-retro-2026-09-27.md` F23 evidence.

## Tasks & Acceptance

**Execution:**
- [x] `plan-grid.ts` — null Exception cells when latest run is halted; extract/test helper if needed.
- [x] `plan-grid.test.ts` — unit coverage for halted vs non-halted exception cell.
- [x] `fence.test.ts` — assert all row exceptions null on `calendar_range` halt grid snapshot.
- [x] `sprint-status.yaml` — mark retro item-14 `done`; refresh `last_updated`.

**Acceptance Criteria:**
- Given a `calendar_range` halt with stale `wp_schedule` that would otherwise show `not_schedulable`, when `getPlanGridState` runs, then every row has `exception === null` and the rail remains empty.
- Given any halted latest run, when rows are built, then `exception` is never resolved from stale projection fields.
- Given a successful latest run, when a row has a schedulable exception, then `resolveException` behaviour is unchanged.
- Given the fence suite with DB reachable, when the calendar-range halt test runs, then it passes including the new row assertion.
- Given sprint status, when F23 is verified, then action item 14 is `done`.

## Implementation Notes

- Added `planGridExceptionCell(haltedReason, …)` — returns null when halted; otherwise `resolveException`.
- `getPlanGridState` row map uses the helper so Exception cells stay empty with the rail on any halt.
- Fence halt test seeds stale `notSchedulableReason: 'no_duration'` after halt, asserts `rows.length > 0`, leaf `notSchedulable === true`, and every `exception === null`.
- Sprint `epic-2-retro-item-14-…` → `done`.

## Spec Change Log

## Review Triage Log

Review pass 1 (2026-10-03), Blind Hunter (BH), Edge Case Hunter (EC), Verification Gap (VG).

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | BH | JSDoc for `resolveException` sits above `planGridExceptionCell` | false | After reorder, JSDoc documents `resolveException` at L715–717; helper follows at L747 | reject |
| 2 | BH, VG | Fence assert does not seed stale `notSchedulableReason` so F23 mismatch may not reproduce | high | Confirmed; patched fence to seed `no_duration` and assert leaf `notSchedulable` + all `exception === null` | patch |
| 3 | BH | No fence for non-`calendar_range` halt | false | `graph_invalid` refuses at write (no persisted halt grid path); unit covers `graph_invalid` → null | reject |
| 4 | BH | Halted unit test does not prove ungated path would be non-null | medium | Patched: assert `resolveException(base)` non-null before halt clears | patch |
| 5 | BH | No violation/OOS through `planGridExceptionCell` | low | `resolveException` already covers those branches; helper only gates | reject |
| 6 | BH | Sprint `done` without marking execution tasks | low | Spec tasks marked `[x]` at close | patch |
| 7 | BH | No test coupling rail `haltedReason` to cell helper call site | maybe-false | Call site uses same `haltedReason` local; no everyday harm beyond existing fence | reject |
| 8 | EC | `rows.every(exception === null)` vacuously true if rows empty | medium | Patched `rows.length > 0` | patch |
| 9 | VG | Same as #2 — getPlanGridState gate could regress while unit helper stays green | high | Same fence seed patch | patch |

## Verification

**Commands:**
- `pnpm exec vitest run packages/app/src/schedule/plan-grid.test.ts` — expected: all pass.
- `pnpm exec vitest run tests/schedule/fence.test.ts -t "calendar-range halt"` — expected: pass when `DATABASE_URL` / `APP_DATABASE_URL` reachable (skip otherwise).

---
title: 'Story 2.12 — The Holiday Calendar and its dated versions'
type: 'feature'
created: '2026-09-25'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f2f89038f76d5a050e9f790069184826bc90da5a'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Recalculation still bootstraps a weekends-only `holiday_calendar_version` (`synthetic-2.9`). There is no `calendar_day_event`, no 2026–2028 national dataset, and no `publishCalendarVersion` — so JP/VN holidays and Project days never pin as an immutable resolved set, and an October Baseline can silently re-date when November holidays land.

**Approach:** Ship the national dataset (coverage from **2025-01-01** through 2028), create `calendar_day_event`, resolve/merge into exhaustive `CalendarVersion` at publish time, and add `app/calendar.publishCalendarVersion` (per-Project lock, append version, `recalculateProject` with run cause `calendar`). Extend Project settings for JP/VN toggles and Project non-working days. Retire the synthetic weekends-only bootstrap. Operator national-table corrections fan out serially with per-Project `audit_log` only (`operator_audit` deferred).

**Decisions (founder, 2026-09-25):**
- **Keep the full spec** (~2200 tokens accepted; same posture as 2.10/2.11).
- **Q1 → B.** Per-Project `audit_log` on publish/fan-out; defer `operator_audit` table+writer to Epic 8 (AR-57 AC gap accepted; see `deferred-work.md`).
- **Q2 → A.** Extend `/p/[projectId]/settings` with national toggles + Project non-working-day list (thin UI); mutations append events / patch flags then publish for that Project.
- **Q3 → B.** Default publish range covers **`2025-01-01` … `2028-12-31`** with weekends listed exhaustively and JP/VN nationals for those years in the versioned dataset — so history-ish / demo plans with 2025 actuals do not halt; extending beyond `range_end` remains an operator publish.

## Boundaries & Constraints

**Always:**
- Versions store the **fully resolved** `non_working_days date[]` over `[range_start, range_end]` — weekends + nationals (per `project.calendar_jp` / `calendar_vn`) + live `calendar_day_event` heads — never a calendar name (AR-57 / AD-29).
- Domain stays pure: `domain/calendar` takes the resolved set; no weekend rule inside the scheduler (existing `CalendarVersion` contract).
- `publishCalendarVersion` is an **operator use case** (AR-54 / AR-57): one Project lock at a time, never two; append version + `recalculateProject({ cause: 'calendar' })` in that Project's tenant transaction; halted Project does not stop the fan-out; per-Project success / halt / failure reported; **per-Project `audit_log` only** (Q1→B).
- Run-level cause is `'calendar'`; per-WP FR-28 cause remains `'calendar changed'` when dates move after a calendar diff (already in `deriveWpCauses`).
- Every `holiday_calendar_version` / `calendar_day_event` INSERT calls `lockWatermark` first; register `calendar_day_event` as `append_only` in `table-classes.ts` in the same change (AR-38).
- Versioned static national dataset in-repo covers **2025–2028**; id recorded as `national_dataset_version` provenance (FR-14; Q3→B). Default publish range is `2025-01-01` … `2028-12-31` unless the operator publishes a different explicit range.
- PM configures calendar on **Project settings** (Q2→A): JP/VN toggles + add/remove Project non-working days; each commit publishes a new version for that Project.
- Outside loaded range: halted run + `wp_schedule.stale` (already 2.9); extending range is an **operator** action (AR-58). Banner chrome may stay thin — full exceptions rail is 2.16.
- Widen AR-52 callers allow-list so `publishCalendarVersion` may import `recalculateProject`; do not fork a second fence for calendar-driven recalcs.

**Never:**
- No silent weekends-only `ensureCalendarVersion` bootstrap on resolve after this story.
- Do not edit an existing `holiday_calendar_version` row; append only.
- Do not store unresolved calendar names as schedule inputs; do not put weekend rules back into the engine.
- Do not create `operator_audit` in this story (Q1→B / Epic 8).
- No tree grid / Schedule preset / exceptions rail / What-moved (2.13–2.16); no Import confirm; no Gantt; no Epic 8 operator console.
- Do not replace corpus hand-built `CAL_JP` / `CAL_VN` — fixtures may stay synthetic (2.8 Q3).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| First real publish | Project flags JP and/or VN; no project days | Appends version over `2025-01-01`…`2028-12-31`: weekends + nationals; `national_sets` / dataset id set; run cause `calendar`; WP moves get `calendar changed`; Project `audit_log` | Missing start/data_date → refuse (existing resolve) |
| Add Project non-working day | PM adds a date on settings → `calendar_day_event` + publish | New version includes that date; prior version unchanged; Baseline pinned to old `seq` re-derives old dates | Duplicate live day → refuse |
| Remove Project day | Compensating append (tombstone head) + publish from settings | New version excludes it; history intact | N/A |
| Toggle national sets | Settings flips `calendar_jp` / `calendar_vn` + publish | New version merges new sets; provenance updated | Both false → weekends (+ project days) only |
| Operator national correction | Dataset bump affecting N Projects | Serial per-Project tx+lock; per-Project `audit_log`; report mix of ok/halt/fail; one halted does not abort others | Lock timeout / failure recorded per Project; no `operator_audit` row |
| Past range | Engine needs a day outside `[range_start, range_end]` | Halted run, stale `wp_schedule` (2.9 behaviour) | Operator extends range via new publish |
| Resolve without version | No `holiday_calendar_version` after retirement | Refuse — do not invent weekends-only | Force explicit publish / seed |

</frozen-after-approval>

## Code Map

- `packages/db/drizzle/0002_pct_override_and_custom_fields.sql` — expand/contract template for new append-only table; next file creates `calendar_day_event`.
- `packages/db/src/schema.ts` `holidayCalendarVersion` (L602–626) — already has resolved `nonWorkingDays`, range, `nationalSets`, `nationalDatasetVersion`; **reuse, do not reshape**. `project.calendarJp` / `calendarVn` (L258–259) are flags only — no version FK on project; runs pin via `schedule_run.holiday_calendar_version_seq`.
- `packages/db/src/table-classes.ts` — register `calendar_day_event` as `append_only`; regenerate RLS/grants/triggers.
- `packages/db/src/repositories/schedule/index.ts` — `ensureCalendarVersion` (`nationalDatasetVersion: 'synthetic-2.9'`), `latestCalendarVersionSeq`, `loadPlanRows` calendar projection; **replace bootstrap writer** with append-from-publish; keep load shape.
- `packages/db/src/watermark-lock.ts` — call before every calendar append (same as `appendRun` / plan-input).
- `packages/app/src/schedule/recalculate-project.ts` L116–140 — **retire** weekends-only invent; refuse when calendar missing.
- `packages/app/src/schedule/apply-plan-change.ts` — widen only if PM calendar mutations go through the fence; calendar publish stays a separate AR-54 caller.
- `packages/app/src/calendar/` (**new**) — `publishCalendarVersion`: resolve merge → per-Project lock → append version → `recalculateProject(..., 'calendar')` → audits; serial fan-out for operator national correction.
- `packages/domain/src/calendar.ts` — `CalendarVersion`, `workingDayIndex`, legacy `JP_HOLIDAYS_2026` / `VN_HOLIDAYS_2026` / `buildCalendar` (EVM); **extend nationals to 2025–2028 versioned dataset** (Q3→B); scheduler path must not gain weekend rules.
- `packages/domain/src/schedule/cause.ts` — run cause `'calendar'` already; WP `'calendar changed'` already; do not invent parallel names.
- `packages/domain/src/schedule/corpus/fixtures.ts` — `CAL_JP` / `CAL_VN` hand-built; **leave alone**.
- `packages/app/src/use-cases/org-writes.ts` — `NEW_PROJECT_DEFAULTS.calendarJp/Vn`; create-project still sets flags; first publish (or seed) must materialise a real version.
- `apps/web/src/app/p/[projectId]/settings/` — **Q2→A surface**: add JP/VN toggles + Project non-working-day list beside the three schedule settings; server actions → calendar mutations + publish.
- `tests/schedule-closure.test.ts` — allow `packages/app/src/calendar/publish-calendar-version.ts` (or final path) as `recalculateProject` importer; widen writers greps for calendar tables.
- Continuity from 2.11 (done): fence owns Project start/finish/data_date; Never was "No Holiday Calendar publish (2.12)" — this story owns it. Do not disturb settings date mutations.

## Tasks & Acceptance

**Execution:**
- [x] `packages/db/drizzle/0003_*.sql` + `schema.ts` + `table-classes.ts` + generated SQL — create `calendar_day_event` (append_only); register; RLS/grants/triggers.
- [x] `packages/domain/src/calendar/**` — versioned JP/VN national dataset **2025–2028** + pure merge helper → exhaustive `nonWorkingDays` (weekends listed) over default `2025-01-01`…`2028-12-31`.
- [x] `packages/db/src/repositories/schedule/*` (+ calendar-day writer) — append version / append day events with `lockWatermark`; stop synthetic seed path.
- [x] `packages/app/src/calendar/publish-calendar-version.ts` (+ audit payloads) — per-Project publish + serial operator fan-out; cause `calendar`; per-Project `audit_log` only (no `operator_audit`).
- [x] `packages/app/src/schedule/recalculate-project.ts` — refuse missing calendar version (no weekends invent).
- [x] `apps/web/.../settings/` + plan-input/calendar writers — JP/VN toggles + Project day add/remove → append + publish for that Project (Q2→A).
- [x] `tests/schedule/fence-2-12*.test.ts` + `tests/schedule-closure.test.ts` — matrix + AR-52 allow-list + lock serialisation smoke.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` — `operator_audit` (Q1→B) already appended; annotate other residues (full range banner chrome) only if they surface.

**Acceptance Criteria:**
- Given Project settings calendar controls, when the PM toggles JP/VN or adds/removes a Project non-working day, then a new resolved version is published for that Project and recalculation uses it.
- Given a published version, when inspected, then it stores the fully resolved `date[]` (weekends + selected nationals + Project days) over at least `2025-01-01`…`2028-12-31` by default, with dataset id provenance — never a calendar name.
- Given `calendar_day_event` exists as `append_only` in the table-class registry, when a Project day is added or removed, then a new version is appended (not edited).
- Given `publishCalendarVersion` for a national correction across several Projects, when it runs, then it takes **one Project lock at a time**, appends + recalculates per Project, writes per-Project `audit_log` (not `operator_audit`), reports per-Project success/halt/failure, and a halt does not stop the rest.
- Given a plan that needs a day outside the loaded range, when recalculation runs, then the run is halted with `halted_reason`, `wp_schedule` stays stale, and extending range remains an operator publish.
- Given the Current Plan after a new version, when dates move, then the run cause is `calendar` and moved WPs carry FR-28 `calendar changed`.
- Given resolve with no calendar version, when recalculation is attempted, then it refuses — the synthetic weekends-only bootstrap is gone.
- Given corpus fixtures `CAL_JP` / `CAL_VN`, when the golden corpus runs, then they remain hand-built and green.
- Given `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test`, when they run, then all exit 0.

## Implementation Notes

Implemented 2026-09-25 on `cursor/story-2-12-holiday-calendar-6085`.

- Migration `0003_calendar_day_event`: append-only `calendar_day_event(day, effect add|remove)` with registry + generated RLS/grants/triggers.
- Domain `packages/domain/src/calendar/`: `national-2025-2028-v1` JP/VN dataset + `resolveCalendarVersion` (weekends + nationals + Project days → exhaustive `nonWorkingDays`).
- Schedule repo: `appendCalendarVersion` / `appendCalendarDayEvent` / `liveProjectNonWorkingDays` / `patchNationalFlags`; `ensureCalendarVersion` removed.
- `publishCalendarVersion` (+ flags / add-day / remove-day / serial fan-out) under `packages/app/src/calendar/`; audit action `calendar.publish_version`; run cause `calendar`.
- `resolveScheduleInputs` refuses when no version (`details.calendar: ['required']`).
- Seed materialises a real version per Project; settings UI adds JP/VN toggles + Project day list.
- Depcruise + AR-52 allow-list widened for `app/calendar`.
- Verified: `pnpm lint`, `typecheck`, `depcruise`, `test` all exit 0 (1341 tests).

Residues: full range-halt banner chrome stays 2.16; `operator_audit` stays Epic 8 (already in deferred-work). Org `createProject` does not auto-publish — seed or settings/publish must materialise the first version.

Matrix gap fixes (2026-09-25): fence-2-12 now asserts FR-28 WP cause `'calendar changed'` when a publish moves dates (run cause `'calendar'` alone is insufficient); both-flags-false resolves to weekends (+ Project days) only with `2026-01-01` absent; fence calendar-range comment updated for default `2025-01-01`…`2028-12-31` (2031 constraint kept).

Review patches (2026-09-25): refuse out-of-range Project days before append; map RangeError on inverted/invalid publish range to `invalid_input` `{ range: ['invalid'] }`; fan-out try/catch so throws become `failed` and the loop continues; seed `lockWatermark` before `holiday_calendar_version` insert; table-classes header 33; journal trailing newline; fence asserts thin UI flags/days, cleared publish (no schedule_run), halted-then-continues fan-out, and explicit stored range columns.

## Spec Change Log

## Review Triage Log

| ID | Source | Verdict | Route | Evidence |
|----|--------|---------|-------|----------|
| BH1 | blind | medium | defer | Verified: `drizzle/meta/` has 0000–0002 snapshots only; journal refs 0003. Kit history incomplete; regenerating full snapshot is tooling — defer. |
| BH2 | blind | low | patch | Verified: header still says "32 tables" while registry expects 33. Trivial comment fix. |
| BH3 | blind | medium | patch | Verified: `seed.ts` raw-inserts `holiday_calendar_version` without `lockWatermark`; Always requires lock on every INSERT. |
| BH4 | blind | false | reject | Documented residue: createProject sets flags only; settings flag-save / add-day publishes. Not a silent defect. |
| BH5 | blind | high | patch | Verified: `resolveCalendarVersion` drops projectDays outside range (`calendar/index.ts`); add path never refuses — UI can list a day the version omits. |
| BH6 | blind | medium | defer | Calendar settings copy hardcoded English — same i18n backlog pattern as 2.11 BH8. |
| BH7 | blind | false | reject | Empty triage at review start is process state; this log fills it. |
| BH8 | blind | false | reject | Fan-out is serial by construction (tested). Concurrent lock smoke was aspirational, not an AC failure. |
| BH9 | blind | low | patch | Journal missing trailing newline — trivial. |
| BH10 | blind | low | reject | Orphan `remove` is harmless for live heads; refuse-not-live adds complexity without user-facing harm. |
| BH11 | blind | medium | patch | Verified: inverted `rangeStart`/`rangeEnd` throws `RangeError` through `runAuditedWrite` (only catches Refusal) → 500. |
| BH12 | blind | false | reject | Bare `publishProjectCalendar` unused by UI; flag-save/add-day still materialise a version. |
| EC1 | edge | medium | patch | Same root as BH11 — inverted range → unhandled RangeError. |
| EC2 | edge | medium | patch | Verified: fan-out has no try/catch; a thrown RangeError (or other) aborts remaining Projects. |
| EC3 | edge | high | patch | Same root as BH5 — out-of-range Project day. |
| EC4 | edge/claim | false | reject | Code already `continue`s on `halted`; gap is missing test (VG3), not missing behaviour. |
| VG1 | verif-gap | medium | patch | Pre-verified: no test reads `getPlanThinUiState` calendar fields after writes. |
| VG2 | verif-gap | medium | patch | Pre-verified: every publish path uses `prepareSchedulable`; `cleared` branch untested. |
| VG3 | verif-gap | medium | patch | Pre-verified: fan-out test only covers `failed`, not `halted` continuation. |
| VG4 | verif-gap | medium | patch | Pre-verified: optional custom `rangeStart`/`rangeEnd` never asserted. |
| VG5 | verif-gap/other | false | reject | Matrix "missing start → refuse" names resolve refuse; publish intentionally returns `cleared` — code matches Design/Implementation Notes. |

Grouped routes: patch groups (out-of-range day; range validation + fan-out try/catch; seed lock; comment/newline; VG1–4 tests). Defer BH1 + BH6. Rejected BH4/BH7/BH8/BH10/BH12/EC4/VG5.


## Design Notes

**Resolved set at publish, not at read.** Baselines pin `schedule_run` → `holiday_calendar_version_seq`. Merging nationals + Project days only at publish time keeps October Baselines stable when November holidays arrive (FR-14 / AD-11).

**Two callers, one engine.** AR-54 names operator calendar publish beside Import confirm as the non-PM paths into `recalculateProject`. Keep publish outside `applyPlanChange`, but under the same per-Project lock discipline so ingest cannot deadlock against a fan-out.

**Cause naming.** Docs often say `cause = 'calendar changed'`; the stored run enum is `'calendar'`, and FR-28 uses the phrase on WPs. Map once in publish — do not widen the enum with a duplicate string.

**Synthetic retirement.** Existing `synthetic-2.9` rows may remain as historical versions; new work must not create more. First real publish for a Project appends a proper resolved set from flags + dataset + day events.

## Verification

**Commands:**
- `pnpm lint` — expected: exit 0
- `pnpm typecheck` — expected: exit 0
- `pnpm depcruise` — expected: exit 0
- `pnpm test` — expected: exit 0 (includes fence-2-12 + schedule-closure)

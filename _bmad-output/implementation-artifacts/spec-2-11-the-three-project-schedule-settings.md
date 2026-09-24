---
title: 'Story 2.11 — The three Project schedule settings'
type: 'feature'
created: '2026-09-24'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5ff76f6885a2b677940a68f66ae1f8f9d351422c'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Columns `project.project_start` / `project_finish` / `data_date` exist (2.1) and the fence can advance Data Date only as a compound of actuals (2.10 Q2→A). A PM still has no standalone way to set Project start (with Data Date defaulting to today), set or clear Project finish with teaching copy, or advance Data Date with a named re-date preview — so FR-43's "no project start yet" state and the three settings as scheduling inputs have no home.

**Approach:** Widen `applyPlanChange` + `plan-input` for the three Project schedule settings (set/clear start; set/clear finish; standalone Data Date patch with latest-actual-finish refuse and remaining-WP preview). Ship a **dedicated Project settings route** for the three fields **plus** thin Plan "no project start yet" / *Set Project start* (Q1→B). Full schedule-strip chrome and What-moved stay 2.15. Keep the 2.10 actuals+Data Date compound unchanged.

**Decisions (founder, 2026-09-24):**
- **Keep the full spec**, with no split (~2355 tokens accepted; same posture as 2.10).
- **Q1 → B.** Dedicated Project settings route for Project start / Project finish / Data Date, **plus** thin Plan "no project start yet" / *Set Project start*. Full strip chrome still 2.15.
- **Q2 → A.** Allow clearing Project start — returns to "no project start yet"; FR-6b does not run; derived dates show "—" — so the named state stays reachable after first set.

## Boundaries & Constraints

**Always:**
- One fence only — every write to `project.project_start` / `project_finish` / `data_date` goes through `app/schedule.applyPlanChange` → `db/repositories/plan-input` (AR-43 / AD-25). Widen the union; do not invent a second mutator.
- No Project start → "no project start yet"; `FR-6b` does not run; derived date cells show "—" with that accessible name; Plan carries *Set Project start* (FR-43, UX-DR23). Clearing start is allowed and restores that state (Q2→A).
- First *Set Project start* writes `project_start` and `data_date` in the **same** fence call. Data Date defaults to **today in the Project's tz** (Clock + `projectDate` / `tzOffsetMinutes`) — never a date read from plan contents, never UTC `toISOString().slice(0,10)` alone (FR-43; continuity from 2.10 review #7).
- Thereafter only the PM advances Data Date. Standalone advance names the effect before confirm — e.g. "Advancing to 26 Sep re-dates 78 remaining work packages" — and never auto-advances (FR-43, UX-DR14). Count = leaf WPs with no `actualFinish` (remaining + in progress).
- Data Date earlier than the latest actual finish is refused with the blocking WP ids (FR-43). Same rule already used by the 2.10 compound path — reuse it.
- Setting or clearing Project finish is confirmed with exact teaching copy: "This moves no work package. It changes what Float is measured against, and lets Float go negative." Commit moves no WP dates; only the backward-pass anchor changes (FR-43, UX-DR5). Cause `project_dates`.
- Surface (Q1→B): Project settings route owns editing the three fields (finish teaching confirm, Data Date advance with preview, clear start). Plan page owns the no-start named state and *Set Project start* only — not the full strip.
- Every committed change to any of the three triggers full recalculation through the fence and is audited with author, time, and **previous value** (before/after) (FR-43, AR-26 / NFR-A1). Widen `schedule.apply_plan_change` audit payload accordingly. Clearing start: no recalc (FR-6b does not run); still audited with before/after.
- Tracker Snapshot / ledger / Mapping / Mapping Rule never write the three settings or derived dates — AR-52 reachability from 2.9 continues to hold; widen writers grep for `project_start` / `project_finish` / `data_date` updates (FR-43).
- Stop the silent `dataDate ?? stamp.at…` fallback in `resolveScheduleInputs` once a Project has a start: after start is set, `data_date` must be present (written by the set-start compound). While start is null, refuse recalc (`projectStart: required`) and do not invent a Data Date.

**Never:**
- No full schedule strip chrome, sticky Float anchor sentence, or What-moved band (2.15). Q1→B is settings route + thin Plan no-start / *Set Project start* only.
- No Holiday Calendar publish (2.12); no tree grid / Schedule preset / exceptions rail (2.13–2.16); no Review Progress & Dates panel period-boundary offer (later Review surface); no Import confirm flow (Epic 3); no Gantt.
- Do not treat the 2.10 actuals+Data Date compound as finishing this story; do not remove or fork it.
- Do not auto-advance Data Date from Tracker/Mapping/ledger; do not default Data Date from latest actual or imported date; do not move WPs when finish is set/cleared; do not amend `0000_scheduling_schema.sql` (columns already exist — no migration).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| No Project start | Project opened with `project_start` null | Plan: "no project start yet"; no FR-6b; *Set Project start* offered | N/A |
| Set Project start | PM sets start (Data Date omitted) from Plan or settings | Same fence call writes start + `data_date = today (project tz)`; recalc; cause `project_dates`; audit before/after | Invalid date → refuse |
| Clear Project start | PM clears start (Q2→A) | `project_start` (and scheduling) cleared; back to "no project start yet"; no FR-6b; dates "—"; audited | N/A |
| Set/clear finish | First set or clear of `project_finish` after teaching confirm (settings route) | Finish persisted; WP early dates unchanged vs prior run; Float anchor flips; cause `project_dates` | Decline confirm → no write |
| Data Date advance | PM chooses a later date on settings; preview shows remaining count | `data_date` patched; full recalc; cause `data_date`; audit before/after | Auto-advance never happens |
| Data Date too early | Proposed date &lt; latest actual finish | Refuse; list blocking WP ids | Whole mutation rolls back |
| Actuals compound | Actual finish after Data Date (2.10 path) | Unchanged compound behaviour | Decline advance → refuse |
| Closure | New project-settings writers | AR-52 grep covers `project_start` / `project_finish` / `data_date`; only fence imports plan-input | Fail CI on leak |

</frozen-after-approval>

## Code Map

- `packages/app/src/schedule/apply-plan-change.ts` — widen `planMutationSchema` with `set_project_start` (optional explicit `dataDate`; default today), `clear_project_start` (Q2→A), `patch_project_finish` (nullable), `patch_data_date`; map causes (`project_dates` / `data_date`); load before values for audit; call new plan-input writers; keep actuals compound. Clear-start skips recalc. Do not change auth/tx/lock shape.
- `packages/app/src/schedule/recalculate-project.ts` — `resolveScheduleInputs`: remove silent UTC Data Date fallback when start exists; keep `projectStart === null` → refuse. First set-start path writes both columns before resolve runs.
- `packages/db/src/repositories/plan-input/index.ts` — add `patchProjectStart` (nullable for clear), `patchProjectFinish`; keep/extend `patchDataDate`; optionally one `patchProjectScheduleSettings` helper. Latest-actual-finish scan for refuse (reuse status heads). Reuse `requireProject`.
- `packages/db/src/repositories/schedule/index.ts` — already loads the three settings; no schema change. May expose a read helper for settings UI (current values + latest actual finish + remaining leaf count).
- `apps/web/src/app/p/[projectId]/settings/` (new, Q1→B) — Project settings route: edit the three fields; finish teaching confirm; Data Date advance with named remaining count; clear start. Server actions → fence only.
- `apps/web/src/app/p/[projectId]/plan/` + `packages/app/src/schedule/plan-edit.ts` — thin Plan: "no project start yet" + *Set Project start* only; colocate with 2.10 thin UI. No strip chrome.
- `packages/app/src/audit/payloads.ts` — widen `schedule.apply_plan_change` with optional `before`/`after` for the three dates (and keep `kind` / `runSeq` / `haltedReason`).
- `packages/domain/src/schedule/cause.ts` — `ScheduleRunCause` already has `data_date` and `project_dates`; do not invent parallel names.
- `packages/app/src/schedule/plan-edit.ts` `proposedCompleteDay` / `projectDate` — reuse for "today" in project tz with Clock.
- `.dependency-cruiser.cjs` + `tests/schedule-closure.test.ts` — widen writers grep for `projectStart` / `projectFinish` / `dataDate` updates on `s.project`.
- `tests/schedule/fence*.test.ts` (new `fence-2-11` cases) — set start+today; clear start → no-start state; finish set/clear leaves early dates; Data Date refuse with blockers; advance preview count; audit before/after; AR-52 still green.
- Continuity from 2.10 (done): compound actuals+`advanceDataDate` stays; Never was "No standalone Project settings UI (2.11)" — this story owns that surface (Q1→B).

## Tasks & Acceptance

**Execution:**
- [x] `packages/db/src/repositories/plan-input/*` — project start (set/clear) / finish / data_date writers; latest-actual-finish blockers; no migration.
- [x] `packages/app/src/schedule/apply-plan-change.ts` + `recalculate-project.ts` + `audit/payloads.ts` — widen mutation union; stop silent Data Date invent; clear-start without recalc; audit before/after; causes mapped.
- [x] `apps/web/.../settings/` + Plan thin UI + server actions (Q1→B) — settings route for three fields; Plan no-start / *Set Project start*; finish teaching confirm; Data Date advance with named remaining count.
- [x] `tests/schedule-closure.test.ts` + `tests/schedule/fence-2-11*.test.ts` — matrix + AR-52 coverage for the three writers (incl. clear start).
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` — annotate any 2.11 residues (period-boundary offer, full strip) only if they surface during implement.

**Acceptance Criteria:**
- Given a Project with no Project start, when it is opened, then "no project start yet" replaces derived dates, FR-6b does not run, and *Set Project start* is the offered action on Plan.
- Given *Set Project start*, when it commits, then Data Date is set in the same action to today (project tz), never from plan contents, and a `schedule_run` with cause `project_dates` exists.
- Given clear of Project start (Q2→A), when it commits, then the Project returns to "no project start yet", FR-6b does not run, and derived dates show "—".
- Given set or clear of Project finish after teaching confirm on Project settings, when it commits, then no WP early dates move; only the Float anchor changes.
- Given a Data Date earlier than the latest actual finish, when submitted, then it is refused with the blocking WPs.
- Given a Data Date advance offer on Project settings, when shown, then it names the remaining-WP re-date count and never advances without an explicit PM confirm.
- Given any of the three settings changing, when it commits, then (when start is present) fence recalculation runs and audit carries author, time, and previous value.
- Given Tracker / Mapping / ledger activity, when it occurs, then WP dates and the three settings are unchanged; AR-52 still passes.
- Given `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test`, when they run, then all exit 0.

## Implementation Notes

- 2026-09-24: Baseline `5ff76f6` on `main`. Approved Checkpoint 1 (Keep full; Q1→B; Q2→A). Sprint → `in-progress`.
- Fence widened: `set_project_start` (+ data_date same UPDATE), `clear_project_start` (no recalc), `patch_project_finish`, `patch_data_date` (blockers via status heads). Audit payload carries before/after for settings kinds; `runSeq` nullable on clear.
- `resolveScheduleInputs` refuses null `dataDate` once start exists — no silent UTC invent.
- UI: `/p/[projectId]/settings` + Plan no-start band / *Set Project start*; shell nav pin; finish teaching + advance preview copy.
- Tests: `fence-2-11.test.ts` covers matrix; schedule-closure greps projectStart/Finish; watermark probe seqs moved off 940/950 to avoid parallel collision with fence 2.9/2.10.
- Deferred intentionally (per Never): full strip chrome (2.15), period-boundary Data Date offer (Review), calendar publish (2.12). Review BH8 (English settings/Plan product copy) appended to deferred-work.md.

## Spec Change Log

## Review Triage Log

| ID | Source | Verdict | Route | Evidence |
|----|--------|---------|-------|----------|
| BH1 | blind | high | patch | Verified: re-set with existing `data_date` always wrote today. Fixed: `writingDataDate` leaves existing alone unless caller supplies `dataDate`. |
| BH2 | blind | medium | patch | Verified: server froze preview to `thin.dataDate ?? proposedToday`. Fixed: client `advancePreviewFor(dataDateValue, …)`. |
| BH3 | blind | false | reject | Submit button + live sentence naming the chosen day is the explicit PM confirm for Data Date. Finish’s checkbox teaches “moves no WP” — different teaching, not a missing confirm gate. |
| BH4 | blind | high | patch | Verified: fence accepted `patch_data_date` with null start. Fixed: refuse `projectStart: ['required']` (same for finish). |
| BH5 | blind | high | patch | Verified: blockers ignored `is_leaf` / `deleted_at`. Fixed: live-leaf filter before head compare. |
| BH6 | blind | medium | patch | VG: only explicit `dataDate` tested. Fixed: omitted-`dataDate` + tzOffset 540 case. |
| BH7 | blind | medium | patch | VG: clear asserted null start / no run only. Fixed: audit `kind`/`runSeq: null`/before/after + finish/dataDate left alone. |
| BH8 | blind | medium | defer | Real: settings/Plan teaching & preview stay English; `ja.json` only gained shell nav. i18n product-copy backlog — not a 2.11 fence defect. |
| BH9 | blind | medium | patch | Verified: empty finish + confirm submitted null via Set. Fixed: `required`, disable Set when `!finishValue`. |
| BH10 | blind | medium | patch | Verified: useState init-only. Fixed: prop sync `useEffect`s after revalidate. |
| BH11 | blind | medium | patch | Verified: clear returned `{ seq: 0, kind: 'scheduled' }`. Fixed: `{ kind: 'cleared', seq: null }`. |
| BH12 | blind | medium | patch | Verified: `aria-label` on actual-dates cell. Fixed: `DerivedDateCell` carries `NO_PROJECT_START_YET` when no start. |
| BH13 | blind | medium | patch | VG: invent-removal unguarded. Fixed: start-without-dataDate → `dataDate: ['required']`. |
| EC1 | edge | high | patch | Same root as EC6/BH1 path: set-start wrote dataDate without blockers. Fixed: `dataDateBlockers` before write. |
| EC2 | edge | high | patch | Same root as BH1 (re-set clobber). Carried with BH1 fix. |
| EC3 | edge | high | patch | Same root as BH5. Carried with live-leaf filter. |
| EC4 | edge | medium | patch | Same root as BH2. Carried with live preview. |
| EC5 | edge | medium | patch | Verified: finish UI enabled without start then fence refused. Fixed: disable finish/data-date controls when `!hasStart` + fence refuse. |
| EC6 | edge/claim | high | patch | AC “early Data Date → blockers” was falsified on set-start. Fixed + fence case asserting set-start refuse. |
| VG1 | verif-gap | medium | patch | Omitted-dataDate → `projectDate` tz. Covered in fence-2-11. |
| VG2 | verif-gap | medium | patch | `remainingLeafCount` DB-backed: finish one leaf → count −1. |
| VG3 | verif-gap | medium | patch | Set/clear finish asserts `project.projectFinish` + `project_dates` cause. |
| VG4 | verif-gap | medium | patch | Clear-start audit before/after + `runSeq: null`. |
| VG5 | verif-gap | medium | patch | Resolve refuse null dataDate with start set. |

Grouped routes: all patch groups applied in-tree; BH3 rejected; BH8 deferred to `deferred-work.md`.

## Design Notes

**Widen, don't fork.** 2.10 left standalone settings to this story. The product rule remains one fence; the actuals compound is one statement about "how far the plan has got" and stays. Standalone `patch_data_date` is the PM's deliberate advance of the plan through time.

**Start + Data Date are one first action.** A Project is created with none. Scheduling cannot invent a Data Date on resolve — that would hide the FR-43 default rule. The set-start mutation is the only place "defaults to today" is applied.

**Finish moves no WP.** Backward-pass anchor only. Teaching copy is product text, not a paraphrase — keep the epic wording.

**Advance preview count.** Leaves without `actualFinish` match "remaining work packages" in the UX example without a dry-run of the engine. Period-boundary suggestion lives on Review Progress & Dates, not here.

**2.15 still owns strip chrome.** Q1→B ships the Project settings route and Plan no-start / *Set Project start* only. Sticky Float-anchor sentence, What-moved, and polished inline strip edits that mirror settings 1:1 are 2.15's job.

**Clear start (Q2→A).** Clearing start is a fence write without recalculation — the Project is not scheduled, so there is no run to append with outputs. Audit still records before/after.

## Verification

**Commands:**
- `pnpm lint` — expected: exit 0
- `pnpm typecheck` — expected: exit 0
- `pnpm depcruise` — expected: exit 0
- `pnpm test` — expected: exit 0 (includes schedule-closure + fence-2-11 cases)

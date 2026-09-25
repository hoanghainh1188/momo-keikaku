# Handoff — 2026-09-25 (story 2.12 closed: Holiday Calendar and dated versions)

**Latest (2026-09-25): story 2.12 merged via PR #76 (`b1ed332`) and is `done`.** Epic 2 remains
`in-progress` (2.13–2.17 backlog). Engine slice 2.3–2.12 is complete; the plan **surface** line
(2.13–2.16) starts here.

## Story 2.12 (recap) — Holiday Calendar and its dated versions
- `calendar_day_event` (append_only, add/remove tombstones) + registry/RLS/grants/triggers;
  migration `0003_calendar_day_event` (+ `meta/0003_snapshot.json` for the drift gate).
- Domain: versioned JP/VN national dataset **`national-2025-2028-v1`**, default publish range
  **`2025-01-01` … `2028-12-31`** (Q3 → B); `resolveCalendarVersion` merges weekends + nationals +
  live Project days into an exhaustive `nonWorkingDays` (no weekend rule in the engine).
- `app/calendar.publishCalendarVersion` (+ flag patch / add-day / remove-day / serial fan-out):
  one Project lock at a time; append version; `recalculateProject` with run cause **`calendar`**
  (WP FR-28 cause remains **`calendar changed`**). Per-Project `audit_log` only.
- **Q1 → B:** `operator_audit` deferred to Epic 8 (`deferred-work.md`).
- **Q2 → A:** Project settings — JP/VN toggles + Project non-working-day list; each commit
  publishes for that Project.
- Synthetic weekends-only bootstrap **retired**; resolve refuses when no version
  (`details.calendar: ['required']`). Seed materialises a real version; `createProject` still
  does **not** auto-publish (first version via seed or settings/publish).
- Review patches: out-of-range day refuse; inverted range → `invalid_input`; fan-out try/catch;
  seed `lockWatermark`; thin-UI / cleared / halt-continuation / custom-range fence cases.
- Deferred from review: calendar settings i18n (BH6); full range-halt banner chrome stays **2.16**.
- Spec: `spec-2-12-the-holiday-calendar-and-its-dated-versions.md`. Corpus `CAL_JP` / `CAL_VN` stay
  hand-built (2.8 Q3).

## Carried forward
- **2.13 (next):** Plan tree grid + Schedule preset (ARIA treegrid; frozen WBS/Name/state; Schedule
  columns; Data Date ink split; summary em dash; negative Float; Critical word+glyph; Recorded %).
  Progress preset Epic-2 columns ship here; Observed/Gap/Evidence → Epics 5–6; Baseline compare →
  Epic 4; All = Comfort. Strip chrome / What-moved = **2.15**; exceptions rail = **2.16**;
  deps+constraints typing = **2.14**.
- **2.14–2.17:** deps+constraints UX; strip + What-moved; exceptions rail; Organisation UI.
- **Still open (unchanged):** unratified 2.5 corpus edges; Epic 6 / FR-31 health vs actuals;
  `applyPlanChange` on use-cases barrel / audit gate enumeration; COMMIT-time 23503 audit-absence
  probe residue (PARTIAL from 2.9/2.10); settings/Plan English product copy (2.11 BH8 + 2.12 BH6).

## Next: story 2.13 — The Plan tree grid and its Schedule preset
Things to know before starting:
- **Surface line, not engine.** Engine + fence + calendar publish are done. 2.13 is the first
  real Plan grid; today's `plan/page.tsx` is still the thin 2.10/2.11 shell.
- **Layout order (UX-DR2):** schedule strip → toolbar → tree grid (+ exceptions rail right);
  What-moved between toolbar and grid after recalc. Strip polish and What-moved behaviour stay
  **2.15** — size 2.13 for grid + Schedule preset (and Progress Epic-2 columns) without pulling
  full strip chrome unless the founder keeps the full epic AC.
- **Planned dates are never typed** (FR-5 / UX-DR12). Inline edit commits through the existing
  fence; FR-6a rejects change nothing and trigger no recalc. Derived-date teaching refuse already
  exists from 2.10 — reuse it.
- **ARIA treegrid** with `aria-level` / `expanded` / `posinset` / `setsize`; frozen leading three
  columns are visual-only (same reading order).
- **Manual checks deferred from 2.5–2.7** land on this grid: slip moves the chain; milestone after
  Friday → Monday; Float with anchor; negative Float; Critical; calendar-range halt banner (full
  rail still 2.16).
- Spec does not exist yet — Build creates it. Epics AC: `epics.md` § Story 2.13. Continuity from
  `spec-2-12-…` (done) + thin Plan/`settings` surfaces.
- Kickoff: `/bmad-build Story 2.13 — The Plan tree grid and its Schedule preset`
  Sprint key: `2-13-the-plan-tree-grid-and-its-schedule-preset`

## Earlier: Handoff — 2026-09-25 (stories 2.10 + 2.11 closed: fence authoring and Project schedule settings)

**Latest (2026-09-25): story 2.11 merged via PR #73 (`f07adcf`) + docs #74 (`911e841`); story 2.10
merged via PR #72 (`5ff76f6`). Both are `done`.** Epic 2 remains `in-progress` (2.12–2.17 backlog).

## Story 2.10 (recap) — WP authoring, actuals, CFs through the fence
- Fence mutation union widened: create/delete/move/re-parent WP, name/duration/effort/resources/
  milestone/constraint, actuals (`wp_status_event`), Recorded % (`pct_override_event`, append_only),
  CF definition + value writers. `checkPlanInvariants` + `lockWatermark` on new append-only paths.
- **Q2 → A:** actual finish after Data Date may advance `project.data_date` in the **same** fence
  call when the PM confirms (compound). Standalone settings stayed 2.11.
- Thin Plan UI (Q1 → B): complete / delete confirm / derived-date teaching refuse; first-observed
  evidence + accept → `source = accepted-from-proposal` only.
- Leaf→summary same-statement clear; soft-delete WP + hard-delete edges (no relink).
- Spec: `spec-2-10-work-packages-actual-dates-and-custom-fields-edited-through.md`.

## Story 2.11 (recap) — three Project schedule settings
- Fence kinds: `set_project_start` (first write pairs start + Data Date today in Project tz),
  `clear_project_start` (Q2 → A: restore "no project start yet", **no** recalc, still audited),
  `patch_project_finish` (teaching copy; moves no WP), `patch_data_date` (preview remaining leaves;
  refuse earlier than latest live-leaf actual finish).
- **Q1 → B:** `/p/[projectId]/settings` owns the three fields; Plan owns no-start band + *Set Project
  start* only. Strip chrome / What-moved stay **2.15**.
- `resolveScheduleInputs`: no silent Data Date invent once start exists; null start → refuse FR-6b.
- Review triage patched clobber-on-re-set, live-leaf blockers, preview sync, finish required, audit
  gaps, etc. Deferred: English product copy on settings/Plan (BH8 → `deferred-work.md`).
- Spec: `spec-2-11-the-three-project-schedule-settings.md`.

## Carried forward
- **2.12 (next):** resolve `holiday_calendar_version` → exhaustive `CalendarVersion` (weekends +
  JP/VN nationals + Project days); create `calendar_day_event` (append_only); national dataset
  2026–2028; `app/calendar.publishCalendarVersion` — **one Project lock at a time**, append version,
  `recalculateProject(cause = 'calendar changed')`, operator_audit + per-Project audit; retire
  synthetic weekends-only seed / corpus `CAL_JP`/`CAL_VN` as the production path (fixtures may stay
  hand-built). `lockWatermark` on calendar version appends.
- **2.13+:** tree grid / preset; deps+constraints UX; strip + What-moved; exceptions rail;
  Organisation UI (2.17).
- **Still open (unchanged):** `range_start` must cover Project history; unratified 2.5 corpus edges;
  Epic 6 / FR-31 health vs actuals; `applyPlanChange` on use-cases barrel / audit gate enumeration;
  COMMIT-time 23503 audit-absence probe residue (PARTIAL from 2.9/2.10).

## Next: story 2.12 — The Holiday Calendar and its dated versions
Things to know before starting:
- **Versions are immutable resolved `date[]`.** Never store a calendar *name* as the schedule input;
  merge nationals + Project days at publish time (AR-57).
- **Domain stays pure.** `domain/calendar` takes the resolved set; no weekend rule inside the engine.
- **Fan-out cannot deadlock.** National-table publish loops Projects serially under each Project's
  AD-20 lock; one halted Project does not stop the rest.
- **Past-range plans halt** with `calendar_range` / stale `wp_schedule`; extending range is an
  **operator** action (AR-58, UX-DR23).
- **Do not fork the fence** for calendar-driven recalcs — call `recalculateProject` with cause
  `calendar changed` after the version append in the same Project transaction.
- Spec does not exist yet — Build creates it. Epics AC: `epics.md` § Story 2.12.
- Kickoff: `/bmad-build Story 2.12 — The Holiday Calendar and its dated versions`

## Earlier: Handoff — 2026-09-24 (story 2.9 closed: one path writes dates, and the run is the record)

**Latest (2026-09-24, evening): story 2.9 merged via PR #70 (`49c01a4`) and is `done`.**
Walkthrough approved; fence observation suite green (happy path / cycle refuse / calendar-range
halt / lock_timeout).
- **The fence lands.** `app/schedule.applyPlanChange` + `recalculateProject` write the input and
  recalculate in one tenant transaction under the AD-20 per-Project exclusive lock for the whole
  mutation + recalc (sanctioned long hold). Only `app/schedule` may import
  `db/repositories/plan-input` and `db/repositories/schedule`; dependency-cruiser fails any other
  importer (AR-43).
- **Two layers, two names.** `domain/schedule.recalculate` stays pure; only
  `app/schedule.recalculateProject` resolves inputs, calls it, and appends the run (AR-47).
- **Stored run.** Fully resolved inputs (AR-48); AD-26 index encoding into `inputs.wps`;
  `remainingDays` stripped from stored outputs only (Q1 → B); FR-28 per-WP causes from
  `prevInputs`; `engine_version` from the 2.8 registry (`schedule-2026-09-24`).
- **Halt split (Q2 → A).** Graph offences → full rollback/refuse. `calendar_range` → halted run
  (`halted_reason`, null outputs) + `wp_schedule.stale = true`. Success rebuilds `wp_schedule`
  (`stale = false`); `schedule_run` is INSERT-only.
- **Minimal mutation union (Q4 → A).** Duration / constraint / dependency patches through the
  fence. Story 2.10 widens authoring (create/delete/move/re-parent, actuals, recorded %, CFs).
- **Closure / measure / retention.** AR-52 writers / callers / reachability; codec shuffle of
  stored shape; 500 WP / ~500 edge size vs AD-26 budgets (raw ±25%; `pg_column_size` / WAL as
  upper bounds); AD-5 retention-by-reference helper + proof.
- **Founder decisions (walkthrough / build Q1–Q4):** strip stored `remainingDays`; AD-27 halt
  split; keep full story; minimal mutation union first.
- **Carried forward (`deferred-work.md`).**
  - **2.10:** widen `applyPlanChange` mutation union (WP create/delete/move/re-parent,
    actuals via `wp_status_event`, Recorded % via new `pct_override_event`); keep
    `checkPlanInvariants` on every mutation; finish COMMIT-time 23503/23514 → `invalid_input`
    audit-absence probe / generic `runAuditedWrite` mapper residue; `lockWatermark` on every new
    append-only writer.
  - **2.12:** resolve `holiday_calendar_version` into exhaustive `CalendarVersion` (retire
    synthetic weekends-only seed).
  - **Unratified 2.5 edges (Q2 → B):** stay out of the corpus until the founder ratifies.
- **Still open:**
  - `range_start` must cover the Project's history (carry from 2.5).
  - Manual check on 2.13's grid (Float with anchor, negative Float, Critical, constraint /
    violation markers).
  - Epic 6 / FR-31: Health may compare constraint dates to actuals for complete / in-progress.
  - `applyPlanChange` not yet on the use-cases barrel / audit gate enumeration.
- **Next: story 2.10** (Work Packages, actual dates and Custom Fields, edited through the fence).
  Things to know before starting:
  - **All edits go through the fence.** No second writer of AD-25 inputs. Widen the mutation
    union; do not invent a parallel path.
  - **Planned dates are never typed** (FR-5 / UX-DR12). Refuse derived-date edits with teaching
    copy and move focus to the constraint cell.
  - **`wp_status_event` is the home of actual dates** (AD-25 / AR-42). Marking complete asks for
    actual finish (propose today); first-observed activity is evidence only, never auto-written.
  - **`pct_override_event` is created here** (append_only, table-class registry) for Plan-grid
    Recorded %. FR-30's audited override (mandatory reason, Observed-vs-Recorded) is Epic 6.
  - **Leaf → summary.** Same action must resolve duration/constraint/deps (move to child or
    drop); clear leaf-only columns in the same statement as `child_count` (CHECK is not
    deferrable).
  - **Delete with edges.** Incoming/outgoing edges deleted with the WP and listed in confirm;
    never auto-relink predecessor-to-successor.
  - **Actual finish after Data Date** → ask to advance Data Date in the same action (FR-43).
  - **Custom Fields:** text/number/date/single-select; 100 CFs is the NFR-P1 tested bound.
  - Call `checkPlanInvariants` before every new mutation shape; map 23503/23514; `lockWatermark`
    before first INSERT on `wp_status_event` / `pct_override_event`.
- Spec: `spec-2-9-one-path-writes-dates-and-the-run-is-the-record.md`.

## Earlier: Handoff — 2026-09-24 (story 2.8 closed: the golden scheduler corpus)


**Latest (2026-09-24, afternoon): story 2.8 merged via PR #68 (`c7f2db9`) and is `done`.**
- **The correctness gate lands.** Five other scheduler CI gates only prove self-consistency;
  the corpus is the only place that fails when the arithmetic is wrong (AR-35 / AD-27).
- **Hand-computed expectations only.** Ten cases under `packages/domain/src/schedule/corpus/`
  carry inputs, expected `ScheduleOutputs`, and a short prose note of the arithmetic. Never
  capture-from-implementation. Compare through `stringify(encode(…))` (AD-4).
- **`engine_version` registry.** `packages/domain/src/schedule/engine-version.ts` registers
  `schedule-2026-09-24` with a multi-version API from day one (`registeredEngineVersions`,
  `engineAt`, `recalculateAt`). CI re-derives every golden under its own recorded key (AR-51).
  Unknown keys throw `RangeError`. The `schedule_run.engine_version` column is written by 2.9.
- **Synthetic JP / VN calendars.** `CAL_JP` / `CAL_VN` list weekends exhaustively and differ by
  a mid-week holiday (Wed 7 Oct vs Tue 13 Oct). No national dataset; 2.12 still owns that.
  Chains are A(5)→B(3) so both holidays bite early dates. Future calendars stay compatible via
  `CalendarVersion`'s exhaustive `nonWorkingDays`.
- **Minimum coverage (AR-35) plus deferred 2.6 pins.** Named cases: `jp-weekend-slip`,
  `vn-weekend-slip`, `mid-flight`, `negative-float`, `out-of-sequence`, `mfo-six-weeks`
  (daysLate 30; Float / critical path identical to the asap twin), `milestone`, `no-duration`,
  `anchor-cap` (2.6 Q6), `all-complete` (2.6 Q7).
- **Corpus conventions (founder decisions Q1–Q5).**
  - **Q1:** registry API now, even with one entry.
  - **Q2:** keep cases off the unratified 2.5 implementer edges (deferred-work).
  - **Q3:** synthetic JP/VN `CalendarVersion`s, not a national dataset.
  - **Q4:** TypeScript modules + short hand-computation notes (demo-golden style).
  - **Q5:** implementer hand-computes in the PR; review / founder checks the arithmetic.
- **Carried forward (`deferred-work.md`).**
  - **2.9:** one fence `app/schedule.applyPlanChange`; write `schedule_run` (including
    `engine_version`); AD-26 index-encode `drivingPredecessors`, `criticalPath`, and violation
    `wpId` / `chain` into `inputs.wps`; record both halts; measure the 500-WP payload against
    AD-26's 385 kB / ~141 kB / ~152 kB WAL; retention-by-reference; the three closure tests
    (writers / callers / reachability); NFR-P1 under the per-Project lock.
  - **Unratified 2.5 edges (Q2 → B):** actual finish on a non-working day; complete+null
    duration; actual finish without start; milestone remaining-duration edges — stay out of the
    corpus until the founder ratifies.
  - **2.12:** resolve a `holiday_calendar_version` into an exhaustive `CalendarVersion`.
- **Still open from 2.5 / 2.6 / 2.7:**
  - `range_start` must cover the Project's history.
  - `remainingDays` in the stored outputs.
  - The manual check on 2.13's grid (Float with its anchor, negative Float in red, Critical,
    constraint / violation markers when the surface lands).
  - Epic 6 / FR-31: Health may compare constraint dates to actuals for complete / in-progress
    WPs (left out of `recalculate` by 2.7 Q5).
- **Next: story 2.9** (one path writes dates, and the run is the record; heaviest in the plan).
  Things to know before starting:
  - **Fence.** `app/schedule.applyPlanChange(ctx, mutation)` does the input write **and** the
    synchronous recalculation in one transaction under the AD-20 per-Project exclusive lock.
    Only `app/schedule` may import `db/repositories/plan-input` (and schedule); dependency-cruiser
    fails on any other importer (AR-43). A rejected edit rolls back completely — nothing persists.
  - **Two layers, two names.** `domain/schedule.recalculate` stays pure; `app/schedule.recalculateProject`
    resolves inputs, calls it, and appends the run. Nothing else is called `recalculate` (AR-47).
  - **Fully resolved inputs.** `schedule_run.inputs` carries the whole WP tree, edges, Project
    settings, and the resolved non-working-day set itself — no pointers a pure function would
    have to dereference (AR-48). Watermarks travel as assertions.
  - **AD-26 index encoding.** `inputs.wps` is the array; every other reference — parent, edge
    ends, `drivingPredecessors`, `criticalPath`, violation `wpId` / `chain` — is that array's
    integer index in `compareWp` order. Write `engine_version` from the 2.8 registry.
  - **Halts and projection.** Record `graph_invalid` and `calendar_range` as halted runs with
    `halted_reason` and no outputs; mark `wp_schedule` stale. On success, rebuild `wp_schedule`
    from the latest run (`stale = false`); INSERT-only on `schedule_run`.
  - **Measure.** 500 WP / 500 edge from Epic 1's fixture against AD-26's measured sizes; NFR-P1
    300 ms p95 under the lock. Miss → lock granularity, never a background path. Exercise AD-5
    retention (runs between two Reviews survive).
  - **Three closure tests.** Writers (every AD-25 input write is inside the fence); callers
    (`recalculateProject` callers = FR-6b's trigger list); reachability (unreachable from
    `ingestSnapshot`, `evaluateRules`, mapping, Tracker jobs). All three required (AR-52).
  - Call `checkPlanInvariants` on every mutation before the write (deferred from 2.4). Map
    23503/23514 to `invalid_input` with the guard's rule codes when a writer first lands.
  - Expect intent-gap questions on cause derivation (`prevInputs`), halt recording shape, and
    how far the first PR splits the fence vs the measurement vs the retention tests.
- Spec: `spec-2-8-the-golden-scheduler-corpus.md`.

## Earlier: Handoff — 2026-09-24 (story 2.7 closed: constraints are soft, reported, and stay on their own Work Package)

**Latest (2026-09-24, midday): story 2.7 merged via PR #66 (`f30d6cc`) and is `done`.**
- **Soft constraints land on the forward pass.** `recalculate` is still the one entry point (AD-25).
  Helpers live in `packages/domain/src/schedule/constraints.ts` (internal). `backward.ts` is
  untouched: a constraint is never an anchor, and a violation changes no Float and never
  displaces the critical path.
- **New inputs on `ScheduleWp`:** `constraintType` (`asap` | `must_start_on` | `must_finish_on`)
  and `constraintDate` (`IsoDate | null`). They mirror `work_package`; the DB CHECK keeps them
  on leaves only. Fixtures default to `asap` / `null`. A mismatched pair throws at the entry.
- **New output:** `ScheduleOutputs.violations` — asked date (unrolled), derived date, working days
  late (> 0), constraint type, and the first-driver chain. Sorted by days late descending, then
  `compareWp`.
- **MSO** holds a remaining WP back: early start = max(graph start, rolled date via
  `ceilPosition`). Where the graph forces a later start, the graph wins and a violation is
  reported. Drivers clear when the bound alone sets the start.
- **MFO** is report-only: it never delays a WP that could finish earlier. A derived finish after
  the rolled date (`floorPosition`) is a violation.
- **Halt:** `calendar_range` also fires for a constraint date outside the range, or a rolled
  position still out of range — including remaining `no_duration` leaves. Complete and
  in-progress constraints are ignored (Q5).
- **Constraint conventions (founder decisions Q1–Q7).** 2.8's corpus is hand-computed against these.
  - **Q1:** MSO is hold-back only (start ≥ date).
  - **Q2:** MFO only reports misses; finishing early is success.
  - **Q3:** a *satisfied* MSO that delays a WP may move other WPs' Float; only *violations* are
    barred from changing Float / the path.
  - **Q4:** non-working dates roll (MSO forward, MFO back); out of range / roll-off-end halts.
  - **Q5:** complete / in-progress constraints are ignored for dates and the violation list.
  - **Q6:** days late are non-negative working days; only misses appear on the list.
  - **Q7:** the chain is the whole first-driver walk (`drivingPredecessors[0]` each step).
- **Carried forward (`deferred-work.md`).**
  - **2.9:** index-encode violation `wpId` and `chain` into `inputs.wps` (with the 2.6 encoding of
    `drivingPredecessors` / `criticalPath`); write the new fields into the stored run.
  - **2.8:** pin 2.6's Q6/Q7, negative Float against a PM-set finish, and a `must_finish_on` missed
    by six weeks that must not displace the critical path.
  - **Epic 6 / FR-31:** Health may compare constraint dates to actuals for complete / in-progress
    WPs (left out of `recalculate` by Q5 → A).
- **Still open from 2.5 / 2.6:**
  - `range_start` must cover the Project's history.
  - `remainingDays` in the stored outputs.
  - The manual check on 2.13's grid (Float with its anchor, negative Float in red, Critical,
    and now constraint / violation markers when the surface lands).
- **Next: story 2.8** (the golden scheduler corpus; the only correctness gate). Things to know
  before starting:
  - Expected outputs are **hand-computed and recorded**, never captured from the implementation.
  - Compare through the AD-4 codec's canonical form. Register `engine_version`; each case re-derives
    under its own recorded version (AR-51).
  - **Minimum coverage (AR-35 / AD-27):** a slip across a JP and a VN weekend; mid-flight
    complete / in-progress / remaining against a Data Date; negative Float against a PM-set
    finish; an out-of-sequence actual start; a `must_finish_on` missed by six weeks that does not
    displace the critical path; a zero-duration milestone; a leaf with no duration.
  - Also pin from deferred work: 2.6 Q6 (no late finish past the anchor under strongly negative
    lag) and Q7 (computed finish ignores complete-only plans).
  - Hand-compute against the 2.5 date conventions, the 2.6 backward conventions, and the 2.7
    soft-constraint conventions above — they are the product now.
  - The five other scheduler CI gates (fence, trigger call-sites, reachability, shuffle,
    re-derivation) stay separate; this story is correctness only.
- Spec: `spec-2-7-constraints-are-soft-reported-and-stay-on-their-own-work-pac.md`.

## Earlier: Handoff — 2026-09-24 (story 2.6 closed: the backward pass, Float and the critical path)

**Latest (2026-09-24, late morning): story 2.6 merged via PR #64 (`6c93bcb`) and is `done`.**
- **`recalculate` now runs both passes.** It is still the one entry point (AD-25), and no second
  pass function is exported. The pass lives in `packages/domain/src/schedule/backward.ts`, which is
  internal. The plan structure moved to `schedule/plan.ts` with no change in behaviour. Test
  builders are shared from `tests/support/schedule-fixtures.ts`.
- **New input:** `ScheduleInputs.projectFinish: IsoDate | null`. It moves no early date.
- **New outputs.**
  - Per WP: `lateStart`, `lateFinish`, `floatDays`, `isCritical` and `drivingPredecessors`.
    - `drivingPredecessors` lists every tied driver of a remaining WP in `compareWp` order,
      bridged and complete ones included (AR-56). It is empty when the Data Date or the Project
      start alone set the start.
    - `isCritical` is always a boolean.
  - Per Project: `anchor` (`{ kind: 'project_finish' | 'computed_finish', date } | null`),
    `computedFinish` and `criticalPath`.
    - The anchor reports the Project finish as the PM set it, not rolled.
    - The critical path is the **minimum-Float** set, ordered by early start, then `compareWp`.
  - The `calendar_range` halt gains the anchor `project_finish`: it fires when a Project finish
    is outside the range. A late date before `rangeStart` halts naming the WPs instead.
- **Backward conventions (founder decisions Q1–Q7).** 2.8's corpus is hand-computed against these.
  - **Q1:** it mirrors (1 + L). A work predecessor's late finish = min(successor LS − L − 1), and a
    milestone's = min(LS − L). A milestone's LS equals its LF.
  - **Q2:** a complete WP has no late dates or Float. An in-progress WP's Float is measured from
    where it resumes. Edges into complete or in-progress WPs are ignored on the way back, so
    Float is never negative against the computed finish.
  - **Q3:** bridging on the way back: P →(a) X →(b) S holds P back as P →(a+b) S.
  - **Q4:** a Project finish on a non-working day rolls back to the last working day on or before
    it.
  - **Q5:** a late date before `rangeStart`, or a Project finish outside the range, halts.
  - **Q6:** no late finish is later than the anchor. Otherwise a lag of −2 or less would leave a
    plan with no zero-Float WP.
  - **Q7:** the computed finish counts only remaining and in-progress WPs, so an all-complete Plan
    has no computed finish and no critical path.
- **Carried forward (`deferred-work.md`).**
  - **2.9:** encode `drivingPredecessors` and `criticalPath` as indices into `inputs.wps` (AD-26).
    Write `anchor` and `computed_finish` to `schedule_run`, mirror the per-WP fields into
    `wp_schedule`, and record the new halt.
  - **2.8:** pin Q6 and Q7 with hand-computed cases, plus negative Float against a PM-set finish.
- **Still open from 2.5:**
  - `range_start` must cover the Project's history.
  - `remainingDays` in the stored outputs.
  - The manual check on 2.13's grid, which now also covers Float with its anchor, negative Float
    in red and the Critical marker.
- **Next: story 2.7** (constraints are soft, reported, and stay on their own Work Package; cut-order
  item 1, so it is the first to go if the plan is cut). Things to know before starting:
  - **Inputs.** `ScheduleWp` gains `constraintType` (`asap` | `must_start_on` | `must_finish_on`)
    and `constraintDate`. They mirror `work_package.constraint_type/constraint_date`; the DB CHECK
    keeps them on leaves only.
  - **Outputs.** It adds the violation list: asked date, derived date, working days late, and the
    chain. It is sorted by days late descending, then `compareWp`.
    - The chain can be walked from `drivingPredecessors`, taking the first driver at each step
      (AR-56: the UI names the first).
    - A violation changes no WP's Float and never displaces the critical path. So constraints
      must not enter `backward.ts`: a constraint is never an anchor.
  - A milestone's target **is** its `must_finish_on`.
  - **Expect intent-gap questions:**
    - Does *must start on* only hold a WP back (start ≥ date)? And does *must finish on* only
      report (finish > date is a violation), or does it also delay a WP that could finish
      earlier?
    - When a satisfied *must start on* delays a WP, its early dates move, and so does the Float
      of everything that depends on it. Is that intended? It is not a violation.
    - A constraint date on a non-working day, or outside the calendar range.
    - A constraint on a complete or in-progress WP: judged against its actuals, or ignored?
    - Is "days late" in working days, and signed or clamped at 0?
    - Is the chain the whole first-driver walk back to a WP with no driver, or only the direct
      driver?
  - The shuffle invariance (N ≥ 50) and the 2,500-leaf timing must keep passing with
    constraints in the plan.
- Spec: `spec-2-6-the-backward-pass-float-and-the-critical-path.md`.

## Earlier: Handoff — 2026-09-24 (story 2.5 closed: the forward pass)

**Latest (2026-09-24, morning): story 2.5 merged via PR #62 (`373da72`) and is `done`.**
- **`recalculate(inputs, prevInputs)`** (`packages/domain/src/schedule/recalculate.ts`) is AD-25's
  pure forward pass. It returns `{ kind: 'scheduled', outputs }` or a `halted` result, never a
  partial output. There are two halts:
  - `graph_invalid` carries `validate`'s four lists. `validate` runs first.
  - `calendar_range` carries `anchors: [{ anchor, side }]` and `wps: [{ wpId, side }]`. WPs
    downstream of one that left the range are not evaluated, so they are not named.

  `prevInputs` is accepted but not read (Q5 → A).
- **Inputs are keyed by id, in any order.** `ScheduleWp` extends `PlanGraphWp` with
  `durationDays`, `plannedMh`, `actualStart`, `actualFinish` and `recordedPct: Ratio | null`, and
  `ScheduleEdge` adds `lagDays`. `projectStart` must be non-null: the "no project start yet" gate
  is the app's.
- **Outputs are keyed by `wpId`,** in `compareWp` order. AD-26's index-referenced encoding is
  2.9's.
  - Per WP: `state`, `earlyStart`, `earlyFinish`, `remainingDays`, `notSchedulableReason`
    (`no_duration`) and `plannedMh`.
  - Per Project: `outOfSequence` and `notSchedulable`.
- **A bounded calendar.** `CalendarVersion { nonWorkingDays, rangeStart, rangeEnd }` lives in
  `packages/domain/src/calendar.ts`, and `workingDayIndex` turns it into integer positions, so
  every shift is O(1). **The non-working-day set is exhaustive: weekends are listed, and the
  domain applies no weekend rule.** The old unbounded `HolidayCalendar` helpers (`evm`,
  `forecast`) are untouched.
- **Date conventions pinned by founder decisions (Q2–Q4).** 2.8's corpus is hand-computed against
  these:
  - Start and finish are inclusive.
  - FS lag L starts the successor (1 + L) working days after the predecessor's finish: lag 0 is
    the next working day, −1 the finish day, −2 the day before.
  - A Data Date or Project start on a non-working day rolls forward.
  - An in-progress WP resumes at the later of its actual start and the Data Date. Unfinished
    predecessors do not drive it.
  - A milestone's start = finish = its earliest start, and a lag-L successor starts L days after
    it.
  - Across a no-duration WP, P →(a) X →(b) S drives S as P →(a+b) S.
- **Conventions the implementer chose, which the founder has not ratified.** They are in the
  spec's Implementation Notes; confirm them before 2.8 hand-computes against them.
  - An actual finish on a non-working day drives from the last working day on or before it. A
    complete milestone drives from the first working day on or after it.
  - A complete WP with a null duration keeps its actuals and is not "not schedulable".
  - An actual finish with no actual start throws as a caller defect. The import flags such rows
    first.
  - A milestone's remaining duration stays 0: the "minimum 1" applies to work.
- **Carried forward (`deferred-work.md`).**
  - **2.9:** the per-WP cause from `diff(prevInputs, inputs)`; recording both halts
    (`halted_reason`, no outputs, `wp_schedule.stale`); and the stored-run half of the shuffle
    check.
  - **2.12:** resolve a `holiday_calendar_version` row into `CalendarVersion` with weekends
    listed.
- **Open for the founder (from the walkthrough).**
  - **`range_start` must cover the Project's history.** A complete WP whose actual finish is
    before `rangeStart` halts the whole run once it has a successor to drive. If 2.12's dataset
    starts 2026-01-01, a Project with a task that finished in December 2025 never schedules.
  - **`remainingDays` in outputs.** The AC says remaining duration is "never stored", and 2.9
    will store `outputs`. Either confirm it is a derived output, or drop it before 2.9 fixes the
    stored shape.
  - **Manual check deferred to 2.13's grid.** On the grid, check that a slip moves the chain,
    that a milestone after a Friday finish reads Monday, and that the calendar-range halt shows
    a banner.
- **Next: story 2.6** (the backward pass, Float and the critical path; cut-order item 2, built
  before 2.7). Things to know before starting:
  - **It extends `recalculate`; it adds no second function.**
    - Per WP it adds `lateStart`, `lateFinish`, `floatDays` and `isCritical`.
    - Per Project it adds the critical path (ordered by early start, then `compareWp`), the
      anchor and the computed finish.
    - `ScheduleInputs` has no `projectFinish` yet; add it (`IsoDate | null`).
  - **One anchor, only one.** It is the PM-set Project finish, otherwise the computed finish (the
    latest early finish). A constraint is never the anchor. Float is negative only against a
    PM-set finish. **The critical path is the minimum-Float set, never the zero-Float set.**
  - **Driving predecessors (AR-56) are not recorded yet.** 2.5's `Drives` map keeps the latest
    drive per source but not which predecessors tie. 2.6 must record every tied driver in
    `compareWp` order, bridged ones included.
  - **Expect intent-gap questions:**
    - the reverse of the (1 + L) convention, and a milestone's late date;
    - how complete and in-progress WPs take part in the backward pass, and whether they get
      Float at all;
    - backward bridging across no-duration WPs;
    - a PM-set finish on a non-working day (roll back?);
    - a late date before `rangeStart`: does it halt, like the forward pass?
  - The shuffle invariance (N ≥ 50) and the 2,500-leaf timing must keep passing with the new
    fields.
- Spec: `spec-2-5-the-forward-pass-a-slip-moves-the-tasks-that-depend-on-it.md`.

## Earlier: Handoff — 2026-09-23 (story 2.4 closed: the four graph rules as invariants)

**Latest (2026-09-23, late night): story 2.4 merged via PR #60 (`718a4cb`) and is `done`.**
- **`validate(plan, edges)`** (`packages/domain/src/schedule/validate.ts`) returns the four
  offence lists separately: `cycles`, `ancestorDescendant`, `summaryEndpoints` and
  `crossProject`.
  - Each list is in `compareWp` order, and it never stops at the first offence.
  - Leafness comes from the plan's own `parentId` links, never the stored `is_leaf`. A re-parent
    that makes a legal edge illegal, with no edge touched, is therefore caught.
  - Cycles use Tarjan's algorithm (iterative): one cycle per strongly connected component, the
    shortest one through its `compareWp`-minimum WP.
  - It **throws** on caller defects: an edge naming a WP that is not in `plan.wps`, a duplicate
    WP id, or a loop in the parent links. `hasOffences(result)` is the "any rule broken"
    predicate.
- **`checkPlanInvariants(plan, edges)`** (`packages/app/src/schedule/plan-invariants.ts`) is the
  fence's pre-write guard (founder decisions Q1 → B, Q3). It returns `invalid_input` with
  `details.dependencies` listing the rule codes `dependency_cycle`, `ancestor_descendant_link`,
  `summary_endpoint` and `cross_project_link`, in that fixed order. It is not a use case and
  touches no port.
- **DB backstops are proved** in `schema-catalog.test.ts`:
  - a cross-project edge passes the INSERT and is refused at COMMIT with 23503 on
    `wp_dependency_successor_fk`;
  - `SS`, `FF` and `SF` are refused with 23514 on `wp_dependency_type_check`.
- **Carried forward (`deferred-work.md`):**
  - 2.9's `applyPlanChange` calls the guard on every mutation. The caller contract: supply every
    WP any edge names (foreign endpoints included), and drop a deleted WP's edges.
  - 2.5's `recalculate` calls `validate` before the passes and halts (Q4).
  - The 23503/23514 → `invalid_input` mapping moves to the first writer, 2.9 or 2.10 (Q2).
- **Next: story 2.5** (the forward pass, 20 h, **never cut**). Things to know before starting:
  - **Name and shape are fixed by AD-25:** `domain/schedule.recalculate(inputs, prevInputs) →
    outputs` is pure, and nothing else may be called `recalculate`. 2.5 owns the forward pass,
    the three leaf states, remaining duration, the "not schedulable yet" block, the summary
    roll-up and the calendar-range halt. Float and the critical path are 2.6, constraints 2.7,
    the stored run 2.9.
  - **Two deferred entries land here.** Call `validate` first and halt when `hasOffences`, naming
    the edges. Then point `expectShuffleInvariant` (`tests/support/shuffle-invariant.ts`) at
    `recalculate`'s `outputs` in codec-canonical form, N ≥ 50 shuffles of WPs and edges.
  - **The calendar is demo-grade.** Working-day maths is in `packages/domain/src/calendar.ts`
    (`addWorkingDays`, `nextWorkingDay`, `workingDaysBetween`). It only has 2026 JP/VN data and
    no notion of a version's `range_end`. The AC's "halts rather than guessing" past `range_end`
    needs a bounded calendar input. Expect an intent-gap question on how much of the calendar
    2.5 builds and how much 2.12 does.
  - **Expect a date-convention question too.** Is a finish date inclusive? Where does an FS
    successor start at lag 0 and at a negative lag? How is a zero-duration WP placed (the
    milestone target itself is 2.7)? Pin these in the spec's I/O matrix before coding; the
    golden corpus (2.8) is hand-computed against them.
  - **Remaining duration** is `ceil(duration × (1 − recorded_pct))`, with a minimum of 1,
    computed on the `Ratio` form (`packages/domain/src/units.ts`) and never stored.
- Spec: `spec-2-4-the-four-graph-rules-are-invariants-not-entry-checks.md`.

## Earlier: Handoff — 2026-09-23 (story 2.3 closed: one canonical order)

**2026-09-23, late night: story 2.3 merged via PR #58 (`e04d1c9`) and is `done`.**
- **`compareWp`** (`packages/domain/src/schedule/order.ts`) is the single total order for WPs:
  1. NFKC first, then split on `.`.
  2. Each segment compares in natural order: ASCII `[0-9]` runs as `BigInt`, other runs by true
     code point, a digit run before a non-digit run.
  3. Fewer runs or segments sort first once the shared ones tie.
  4. Then the lowercase `wp_id`, then the raw `wp_id`.

  Result: `3` < `3a` < `3b` < `4` < `10`, and it never returns 0 for two distinct WPs.
- **`canonicalWps`** is the one place the order is applied (AD-26's `inputs.wps` plus an
  id → index map).
- **Review page:** its milestone and Divergence rows sort through `compareWp`.
  `compareNfkcNumeric` is deleted, and `compareNfkc` now compares true code points, not UTF-16
  code units.
- **AD-28 was amended (founder decision T-A).** Its literal step 2 was intransitive for mixed
  segments (`2` < `10` < `1a` < `2`). AD-28, AR-55, story 2.3's AC and `epic-2-context.md` were
  updated after two adversarial review rounds; the details are in the spec's Implementation Notes.
- **Carried forward (`deferred-work.md`).** AC 4 at engine level: point
  `tests/support/shuffle-invariant.ts` (`expectShuffleInvariant`) at `recalculate` in 2.5 and at
  the stored run in 2.9.
- **Next: story 2.4** (the four graph rules as invariants, 12 h). Things to know before starting:
  - Its "the fence calls `validate` on every mutation and `recalculate` calls it" criterion has
    no fence (`app/schedule.applyPlanChange`, 2.9) or `recalculate` (2.5) to attach to yet.
    Expect an intent-gap question on that, as 2.3 had for its AC 4.
  - The cross-project FK (`MATCH FULL`) and `CHECK (type = 'FS')` already landed with 2.1's
    migration (`schema-catalog.test.ts` pins them), so 2.4 likely only proves them.
  - `deferred-work.md` asks 2.4/2.10/2.14 to check graph rules app-side before writing, and to
    turn constraint errors into `AppError` rather than a 500.
  - A rejected cycle is reported rotated to its `compareWp`-minimum WP.
- Spec: `spec-2-3-one-canonical-order-for-everything-the-scheduler-reports.md`.

## Earlier: Handoff — 2026-09-23 (Epic 1 closed: `pnpm dev` in one command, checkpoint taken)

**Latest (2026-09-23, night): story 1.1 slice B3 merged via PR #56 (`0350e5b`). Story 1.1 and
Epic 1 are `done`.** `pnpm dev` (with `pnpm demo` as an alias) takes a clean clone through compose,
`db:migrate`, `pgboss:migrate`, `db:policies`, a seed that runs only on an empty database, and then
`web` + `worker` under one supervisor (`scripts/dev/supervise.ts`: prefixed output, one Ctrl-C
stops both, SIGHUP forwarded). **The first run writes a gitignored root `.env.local`** with the
compose URLs and a random Better Auth secret and demo password. A shell key wins over the file,
and `seed`/`db:*`/`pgboss:migrate` read the file too. **After pulling:** your first `pnpm dev`
generates new keys. If the database was seeded under another password, run `pnpm seed`;
`pnpm dev` warns you. `pnpm dev:web` is the old web-only command. The restart on the shared
volume was verified by hand: `compose down` then `pnpm dev` kept identical row counts.
**The Epic 1 velocity checkpoint is taken** (PRD §13): `E` ≈ 273 against 28.6, so the rule does
not fire and R0 stays 2027-04-14. The founder worked 16 h (about 28 h/week), about 9.75
estimated hours closed per hour worked. Pulling R0 earlier is a §8.1 decision, not yet taken.
Next: story **2.3**. The monthly §13 line (stories plus hours) is due on 2026-11-01.

## Earlier: Handoff — 2026-09-23 (story 1.2 closed: watermark slice merged)

**Latest (2026-09-23, evening): story 1.2's watermark slice merged via PR #54 (`724a494`), and
story 1.2 is `done`.** Every production append to an append-only table now takes
`pg_advisory_xact_lock(namespace, key)` through `packages/db/src/watermark-lock.ts` (1 = Project,
2 = Tenant) before its `seq`; `mapping_event.seq` and `actuals_ledger_entry.seq` became identity
columns in migration `0001` (the first expand/contract migration). The `mapping_event_pkey` 23505
flake is gone. Two unrelated flakes remain (`seed-sequences`, `membership`; `deferred-work.md`).
An early velocity reading is recorded (PRD §13): `E` ≈ 301 over 4 days, which decides nothing —
§6 uses a trailing 8-week window. **The Epic 1 checkpoint is still owed**, at 1.1's close or
2026-11-15, and it should carry hours worked. **After pulling `main`, run `pnpm db:migrate` then
`pnpm db:policies`** — the second grants `momo_app` USAGE on the two new identity sequences.
Next: story 1.1 slice B3, then story **2.3**.


State at `main` (PR #52, `005798a`). **Stories 2.1 (the scheduling schema lands in one
migration) and 2.2 (the demo spike is disposed of) are `done`.** Both were implemented,
reviewed and walked through by the founder, and merged with CI green (1028/1028 tests).
Epic 2 is `in-progress`. Next: story 1.2's watermark slice (it is now the cause of flaky tests),
story 1.1 slice B3 (now unblocked), and the next build story, **2.3**.

**Latest (2026-09-23): stories 2.1 and 2.2 merged together via PR #52 (founder decision 1-A:
one branch, one PR, so `main` never went red).**
- **Migrations replace `push`.** The schema now arrives through **one** migration,
  `packages/db/drizzle/0000_scheduling_schema.sql`, applied by `pnpm db:migrate` (AD-19/AD-30).
  **The expand/contract exemption is spent**: every migration from `0001` onward is expand/contract.
- **Hand-written clauses.** `MATCH FULL` and the `DEFERRABLE INITIALLY DEFERRED` leaf FKs on
  `wp_dependency` are written by hand. `packages/db/src/schema-catalog.test.ts` pins them against
  `pg_constraint`/`pg_attribute`, and a CI "Migration drift" step fails when `schema.ts` and the
  committed migration diverge.
- **Foreign keys.** 34 composite FKs, each `tenant_id`-led and NO ACTION. The seven with a
  nullable member are MATCH SIMPLE (decision 3-A; the list is `FK_MATCH_SIMPLE` in `schema.ts`).
- **New tables.** `wp_dependency`, `wp_status_event` (the only home of actual dates),
  `holiday_calendar_version`, `schedule_run` and `wp_schedule`.
- **`work_package`.** It gains `duration_days`, `constraint_type`, `constraint_date`, `child_count`
  and a STORED `is_leaf`, and loses its four date columns. `baseline_version` points at
  `schedule_run`.
- **The seed writes no Baseline** (decision 2-A), so the demo has no Baseline until Epic 4.
  `computeReview` handles a missing Baseline: EVM, forecast and milestone divergence are null, and
  all three health indicators are `unavailable` (amended Q1-A). Coverage, AC and the Unplanned
  split still compute. `demo-golden` keeps the full EVM figures in memory from the fixture Baseline.
- **Domain type.** `WorkPackage` has no planned dates; `actualStart`/`actualFinish` come from
  the head `wp_status_event`.
- **Removed.** `gantt.tsx`, `client-view.ts`, the `c/[projectId]` page and `getClientView`, and
  everything that existed only for them. The 46-file disposition table is in the 2.2 spec.
- **`pnpm db:migrate` guard.** It refuses a database created by `push` and prints the recreate
  command.
- **Deferred** (in `deferred-work.md`):
  - two goals split out of 2.2: moving page arithmetic into use cases (plus the SV note fix), and
    extending the +30% layout gate;
  - constraint errors should become `AppError` rather than a 500 — including a deferred FK failing
    at COMMIT — and 2.4/2.10/2.14 must check graph rules app-side before writing;
  - no web `error.tsx`;
  - no page render tests;
  - the ledger→Baseline FK is Tenant-scoped only;
  - no FKs to `tenant(id)`;
  - migrations run as the owner, not `migrator`;
  - `child_count` semantics under soft delete.
- Specs: `spec-2-1-the-scheduling-schema-lands-in-one-migration.md` and
  `spec-2-2-the-demo-spike-is-disposed-of-file-by-file.md`, each with a review triage log.

**Previous (2026-09-23): story 1.9 merged via PR #43.** `@momo/i18n` with identically keyed
`en`/`ja` catalogs (ja = English mirror), `t` / `renderMail` / `buildResetPasswordMail`; next-intl
on web with R0 UI forced to English; password-reset mail rendered from catalog in
`auth_user.locale`; use-case `messageKey` mapped at the web edge; `domain/text.compareNfkc` (+
numeric WBS segments); locale-aware `yen` / report dates; `tenant.currency` default JPY with
`changeTenantCurrency` (Admin only) refusing once any Rate exists — registered in the isolation /
audit harness as a Rate-locked refusal (probe Tenants already have Rates). Shell +30% layout gate
covers auth/admin/chrome only; Project/Client layout gate deferred to Epic 2.2. CI follow-up
`c34736d` fixed harness registration, fixture-clock auth mock hours export, and bare-`db` naming
in `repo-tenant-currency`. Deferred from 1.9: Project/Client +30% layout gate; currency TOCTOU
between `hasAnyRate` and `setCurrency` (see `deferred-work.md`).

**Previous (2026-09-22): story 1.8 merged via PR #42.** `SEED_PROFILE=demo|load` (default demo);
in-process deterministic 5×500 load generator (no committed load JSON); required
`DEPLOYMENT=local|staging|production` with AD-17 refusals of `CLOCK_MODE=fixture`,
`MAILER=console`, and `TRACKER_ADAPTER_OVERRIDE=fixture` outside `local`; shared
`productClockOn` / `DEMO_LATEST_OBSERVED_OFFSET_MS` in `@momo/adapters` for web + worker;
`scripts/seed.ts` injects the product Clock (Better Auth / `identity_event` stay on
`systemClock`); fixture-relative identity seqs via `OVERRIDING SYSTEM VALUE` +
`syncIdentitySequences` after write (truncate no longer uses `RESTART IDENTITY`); Rate
`effectiveFrom` stays `2026-01-01` so the fixture timeline stays covered. CI fixed two
regressions on the way in (seq collisions after OVERRIDE; Rate dates must not follow Clock
"now"). Deferred L82/108, L257/280/307, L516–517 Clock half, L539–545, L835–836 recorded
resolved / partial in `deferred-work.md`. Still open from 1.8 review: stale `evidence:` text
on some resolved Clock deferred rows (docs-only).

**Earlier (2026-09-22): story 1.7 merged via PR #41.** `listAuditLog` is the first
Tenant-Admin-only read (`projectScoped: false`); refusal is `not_found`. Payload decode schemas
live in `packages/app/src/audit/payloads.ts` (write harness imports them). `IdentityPort.lookupUser`
resolves actors and the top-bar chip (name or email · role); user menu links Admins to
`/admin/audit`. `audit_log` left `UNREACHED_TENANT_OWNED_TABLES`. Shared `createLogger` (pino
10.3.1, AD-16 redact paths, `syncStdout` for the worker) in `packages/app`; ESLint bans
`dangerouslySetInnerHTML`. Probe suite `tests/audit-log.test.ts` (base ≥ 850_000_000). Deferred
L268 (`audit_log` reach), L427–430 / L489–491 (payload schemas, map partial), L590 (identity
lookup) recorded resolved / partial in `deferred-work.md`.

**Earlier (2026-09-22): story 1.6 merged via PR #40.** `project_default_rate_entry` is registered
append-only (24 tables / 17 tenant-owned); seed and `createProject` dual-write the first row at
yen 0 with `project.default_rate_jpy` as the live cache; `appendProjectDefaultRate` updates both.
`createResource` (`tenant_admin` | `pm`), `appendResourceRate` and `appendProjectDefaultRate`
(`tenant_admin` only) are audited use cases with role declarations (third shape: Admin|PM, no
Project). Domain `rateOnDate` / attribution accept optional `rate_seq_max` /
`project_default_rate_seq_max` pins; live unpinned default still reads the column. No Resources &
Rates UI. Probe suite `tests/resources-rates.test.ts` (base ≥ 830_000_000). Deferred L512–513 Rate
half resolved; Clock / `demo_anchor` half closed in story 1.8.

**Earlier (2026-09-22): story 1.5 (roles decide what each person can reach) is implemented and
reviewed.** Declared-roles helper in `packages/app/src/authz/authorize.ts` (`authorize` /
`reachesProject`): every use-case export declares roles; membership and Organisation writes are
`tenant_admin` only (role check before parse); Project reads and Plan/Mapping writes are
`tenant_admin` | `pm` plus Project reach (a Tenant Admin's `projectIds` are never a limit). Refusal
is always `not_found`. Mechanical gate: `tests/role-declarations.test.ts` — enumeration of
`USE_CASE_ROLES` (pinned by an inline snapshot) plus a behavioural check that every export, called
as a viewer with throwing deps and malformed input, answers `not_found` without touching a port, and
that every export not declared for `pm` refuses a PM the same way. Two code reviews applied (spec
"Review Findings" and "second pass"). Open from the review: project writes can name another
Project's Tickets or WPs (`deferred-work.md`); `/` still redirects to `prj-ec2`, which a PM not
assigned it now meets as `not_found`; AD-23's "until story 1.5 … check `tenant_admin` themselves" and
the matching `epic-1-context.md` line are stale and need a spine amendment.

**Earlier (2026-09-22): story 1.4 slice 4 (password reset) is implemented.** A new `MailerPort`
(`packages/app/src/ports/mailer.ts`), satisfied by `mailerConsoleOn` (`packages/adapters`,
`MAILER=console` by default; `ses` is accepted in config but fails at the composition root until
Epic 8) and handed to `createAuth` as an argument, exactly as `google` is. `packages/db/auth`
gained `reset.ts` (the pure link and mail-copy builder) and two callbacks on `emailAndPassword`
(`sendResetPassword`, `onPasswordReset`) plus two pinned settings (`resetPasswordTokenExpiresIn:
3600`, `revokeSessionsOnPasswordReset: true`) and two bindings (`requestPasswordReset`,
`resetPassword`), both server actions only — `/request-password-reset` and `/reset-password` stay
in `DISABLED_PATHS` and 404 over HTTP, unchanged. A new global, insert-only `identity_event` table
(`packages/db/src/schema.ts`, `table-classes.ts` — 23 tables now) records a completed reset (never
a request, to avoid a write amplifier on an unauthenticated, enumerable endpoint); a Google-only
user gets no mail and no account row. `apps/web` gained `/forgot-password` and `/reset-password`
(public, server actions, one generic answer/refusal each — NFR-S5), and a "Forgot your password?"
link from `/sign-in`. One generic answer covers a known email, an unknown one and a Google-only
account alike; a mailer failure is logged without the address and the request still answers as on
success. The suite is **758 tests across 43 files** (verified locally in this session against a
native Postgres 16, since Docker was unavailable in the sandbox — CI's `postgres:18.6-alpine`
service should be re-verified once a session has Docker again). Two of the acceptance criteria's
six sabotages were caught as real pass→fail transitions: `revokeSessionsOnPasswordReset` removed
(a session survives the reset) and `identity_event` granted UPDATE (caught by both the registry
assertion and the SQL-drift check). **Correction (post-implementation review, 2026-09-22): the
other four were mis-modelled or already true regardless.** `resetPasswordTokenExpiresIn` removed
changes no behaviour (Better Auth's own default is already 3600 s); `/reset-password` added to
`SERVED_AUTH_ENDPOINTS` alone still 404s (`DISABLED_PATHS` blocks it independently); "the generic
sentence replaced by a distinguishable one" is asserted by no test today. Most notably: **the
boundary's lowercasing is NOT load-bearing** — Better Auth lowercases the address itself inside
`findUserByEmail`, and the integration test hands the binding an upper-cased email and still
expects mail. Removing `.toLowerCase()` from the `forgot-password` action changes no observable
system behaviour; only `.trim()` matters, and the one test that fails on its removal
(`forgot-password/actions.test.ts`) is pinning the call shape, not a real security boundary. See
the spec's own Spec Change Log and Review Triage Log for the full accounting; do not read the
sabotage table above as six independently-verified guarantees. `next build` succeeds and both
routes compile and render as dynamic routes. Manual browser verification of `/forgot-password`
and `/reset-password` under `next dev` was completed 2026-09-22: sign-in → forgot link → submit →
console mail → reset with token → sign-in with the new password landed on `/p/prj-ec2/review`.
Re-seed after that check to restore the demo password.

**Earlier (2026-09-22): story 1.4 slice 3 (Google sign-in) is merged (PR #32)**
(`spec-1-4-google-sign-in.md`, `done`: two adversarial spec rounds, one code review), and the
spine is amended to match it (two adversarial rounds, rubric and tech-currency reviews).
Google is one OIDC provider discovered from an issuer URL — a fake in-repo provider
(`tests/support/fake-oidc.ts`, `pnpm fake-oidc`) locally and in CI — off unless
`AUTH_GOOGLE=on`, linking by verified email to existing users only. The suite is
**722 tests across 38 files** (678 across 36 before); the seven sabotages in the spec's acceptance criteria were
each watched to fail. What remains for story 1.4 is slice 4 (password reset), then the
whole-story code review.

**Earlier (2026-09-21, fourth session): story 1.4 slice 2 is merged.** A Tenant
Admin can revoke a membership, change its role, and assign or unassign a PM's
Projects — four audited use cases; a revoked user is signed out on their next
request. The suite is **678 tests across 36 files**. Story 1.4 stays
`in-progress` — slices 3 (Google) and 4 (password reset) remain. **The next
session builds slice 4, or slice 3 once the founder decides on OAuth
credentials** — see "Next, in order".

**Earlier the same day (third session): story 1.4 slice 1 was merged.** People sign
in with email + password; every request resolves a `RequestContext` from its
session and the `tenant_membership` bridge, and the audit actor is the signed-in
user. The suite is **570 tests across 34 files**. Story 1.4 is still
`in-progress` — slices 2–4 remain. **The next session builds story 1.4 slice 2**
— see "Next, in order".

Two earlier sessions are covered below. **2026-09-20** took the project from "planning
finished, no CI, 46 tests" to "three build slices merged, six CI gates, 123
tests, tenant isolation enforced in the database". **2026-09-21** added the
cross-tenant harness — **NFR-S1 is discharged** — finished every unblocked
slice of story 1.2 (reads and writes onto `packages/app` use cases,
**dependency-cruiser on**, exact arithmetic and one codec, the `apps/web →
domain/present` edge decided), and then built **story 1.3 end to end**: the
audit mechanism (PR #23), the organisation hierarchy (PR #24), and a four-layer
code review whose nine fixes are PR #25. **Story 1.3 is `done`.** The suite is
**510 tests across 29 files**. Story 1.2 is left with only its blocked watermark
slice. **The next session starts story 1.4** — see "Next, in order".

---

## Where the plan stands

**Planning is closed.** OQ-10, OQ-11 and OQ-12 are all resolved in the PRD.

- R0 is sized at **1,180 h across 70 stories**, range 826–1,652.
- The date for §8.1 is **2027-04-14**, range 2027-02-12 … 2027-07-06, at a
  founder capacity of **40 h/week**.
- The frozen 36-FR list was **re-affirmed in full** — the founder raised
  capacity rather than cut, because the entire §8.3 cut order is worth 9 % of
  R0 and doubling capacity is worth 50 %.
- **R1's Q1 2027 date is withdrawn** and carries no replacement. The §8.1 gate
  needs four consecutive weekly Reviews *after* R0 is in use, so the earliest
  gate pass is 2027-05-12 — already Q2 — and R1 has never been sized.

### The date-slip rule, which someone must actually run

PRD §6 replaced the old cut trigger. The measured quantity is **`E` = estimated
hours closed per week**. The plan needs `E` = 40; the 2027-07-06 upper bound
needs `E` ≥ **28.6**.

- **First checkpoint: Epic 1 closing, or 2026-11-15, whichever comes first.**
  At plan velocity Epic 1 (156 h) closes 2026-10-17. If `E` < 28.6, re-derive
  the R0 date and bring it back to §8.1 **before story 2.1's migration is
  written** — 2.1 spends the expand/contract exemption once.
  **Taken 2026-09-23** at Epic 1's close (PRD §13: `E` ≈ 273, 16 h worked, rule not fired). The note that follows is historical. Epic 1 was then still open (story 1.1 slice B3), so the checkpoint fell at 1.1's
  close or 2026-11-15, whichever comes first. Its "before 2.1 is written" half was breached: 2.1's
  migration merged (PR #52) before Epic 1 closed and before any `E` existed. An early reading is
  in PRD §13 (2026-09-23: `E` ≈ 301 over 4 days, which decides nothing under §6's trailing
  8-week window). When the checkpoint is taken, record hours worked too, and bring any date
  change to §8.1.
- **Monthly from 2026-11-01**: append one line to PRD §13 with the stories
  closed and hours worked. Any two consecutive months both below 28.6 fire the
  §8.3 cut order at item 0.

**Caveat on the first reading.** Story 1.1 slice A took about two hours against
a 24 h estimate for the whole story, but do not read that as velocity: most of
the work was investigation and review rather than typing, and all three
breakages were things the plan had not anticipated. Slice B1 and B2 were closer
to their share. Track upgrade-style work separately from feature work.

---

## What is built

| PR | What |
|---|---|
| #5 | Sprint planning: OQ-12 closed, `sprint-status.yaml` generated |
| #6 | CI created from nothing |
| #7 | Story 1.1 slice A — toolchain to the decided stack |
| #8 | Persistence round-trip test |
| #9 | Story 1.1 slice B1 — workspace skeleton, config port, clock fence |
| #10 | Story 1.1 slice B2 — pg-boss on separated database roles |
| #11 | `.nvmrc`, plus two decisions recorded where they bind |
| #12 | Story 1.2 slice 1 — table-class registry, RLS, `withTenant` |
| #13 | Handoff for the next session |
| #14 | Story 1.2 slice 2 — the cross-tenant harness; **NFR-S1 discharged** |
| #15 | Sprint-status correction and handoff |
| #16 | Story 1.2 slice 3 — the seven read call sites onto `packages/app` use cases |
| #17 | Slice 3's AC-2/AC-5 wording; AD-1's composition-root carve-out |
| #18 | Story 1.2 slice 4 — the five writes onto use cases; **dependency-cruiser on** |
| #19 | AD-1 states what the gate enforces and what it does not; rules narrowed to the carve-outs |
| #20 | Story 1.2 slice 5 — exact arithmetic (`bigint`, `Ratio`, `compareRatio`) and the one jsonb codec |
| #21 | `apps/web` imports `domain/present` only; Client View and Mapping reads; AD-1/AD-4/AD-12 amended |
| #22 | Handoff |
| #23 | Story 1.3 slice 1 — the audit mechanism: one tenant transaction per write, `audit.record`, closed `AUDIT_ACTIONS`, the audited-use-case gate |
| #24 | Story 1.3 slice 2 — `program`, eight audited org writes (`before`/`after`), `Clock` and UUIDv7 id ports; AD-1: the composition root may import `packages/adapters` |
| #25 | Story 1.3 code review — nine fixes (monotonic UUIDv7, seed truncate gate, whole-Tenant write checks, full `project.create` audit, indexes); this handoff |
| #26 | Story 1.4 slice 1 spec |
| #27 | Story 1.4 slice 1 — Better Auth tables + `tenant_membership`, `@momo/db-auth`, `RequestContext`/`resolveRequestContext`, email + password sign-in, Node middleware; AD-1/AD-15 amended |
| #28 | Handoff after story 1.4 slice 1 |
| #29 | Story 1.4 slice 2 — revoke, change role, assign/unassign a PM's Project as audited use cases; one writer of `tenant_membership` with one ordered lock; the last Tenant Admin protected |
| #30 | Handoff after story 1.4 slice 2 |
| #31 | AD-21/AD-23 — the membership bridge's one writer (spine) |
| #32 | Story 1.4 slice 3 — Google sign-in: one `genericOAuth` provider from an issuer URL, off unless `AUTH_GOOGLE=on`, link-never-create by verified email, provider-aware allowlist, two auth instances, the in-repo fake OIDC provider (`pnpm fake-oidc`) |
| #33 | AD-1/AD-15/AD-16/AD-17/AD-23 spine amendment for Google sign-in; `epic-1-context.md` regenerated; handoff |
| #34 | Story 1.4 slice 4 — password reset: `MailerPort`/`mailer-console`, global insert-only `identity_event`, `sendResetPassword`/`onPasswordReset`, `/forgot-password` + `/reset-password`; whole-story review of 1.4 (five passes); 1.4 `done` |
| (next) | AD-1/5/14/15/16/17/18/19/21/23 spine amendment for password reset and `identity_event`; `epic-1-context.md` regenerated; this handoff |

**CI has ten steps**, all watched to fail before being trusted: lint (the
clock/env fence, the tenant bans, and AD-4's arithmetic fences — rounding only
in `domain/present`, `JSON.stringify` only in the codec), three typechecks,
**dependency-cruiser** (no database), a Postgres 18.6-alpine service, a prepare
step (schema → pgboss roles → RLS/grants/triggers → seed), and the suite.
**722 tests across 38 files**, up from 46 across 3. The gates report and do not
block (no branch protection on a private free-plan repo).

**The import direction is gated.** `.dependency-cruiser.cjs` fails on: Drizzle
in any `apps/*` file; `packages/db` from `apps/web` except the composition root
(`apps/web/src/server/composition.ts`) and `packages/db/auth`; `packages/db`
from any other app; `packages/adapters` from any `apps/*` file but the composition
root, and from `packages/app|domain|db` at all; `better-auth` anywhere but
`packages/db/auth`, and `packages/db/auth` from any `apps/web` file but the
composition root; `apps/web` importing any `packages/domain` module but
`present/index.ts`; `tests/support/` from `apps/` or `packages/`; the AD-1 scheduling edges (forward-looking); and any import
it cannot resolve. What it does not enforce yet is listed in AD-1 and tracked in
`deferred-work.md` — the worker's `pg-boss`/`pg`, package-to-package
directions, raw `pg` in `apps/web`, and pages' own `bigint` arithmetic.

**Numbers are exact until presentation (AD-4).** `Mh`/`Jpy` are `bigint` from
the row to `domain/present`; every ratio is an unreduced `Ratio`, compared to a
threshold only through `compareRatio`; `domain/present/codec` is the one path
for `jsonb`. `tests/lint-fences.test.ts` proves the lint fences still fire.

**Every audited change is recorded in its own transaction (AD-14).** A write use
case opens exactly one tenant transaction through `TenantTransaction`
(`packages/app/src/ports/tenant-transaction.ts`, satisfied by `packages/db`'s
`inTenantTransaction`); the change and `audit.record(scope, stamp, action,
target, payload)` run in that scope, so a rolled-back change leaves no audit
row. `AUDIT_ACTIONS` (`packages/app/src/audit`) is closed — six Disposition/
Mapping actions, then eight org actions — and refused on every path.
`tests/audited-use-cases.test.ts` enumerates the use-case surface with no
database; Postgres rollback tests prove the rule for real. Org writes stamp
`at` from the `Clock` port; project writes still use the Project's
`demoAnchor` (tracked).

**Tenant isolation is real**, verified directly in SQL: as the application role
with no tenant set a read returns 0 rows, with the right tenant 1, with a wrong
tenant 0. `FORCE ROW LEVEL SECURITY` is on for the 16 tenant-owned tables.

**And it is now proved at the use-case level, not only the table level.**
`tests/cross-tenant.test.ts` seeds two probe Tenants — each a
bijectively relabelled copy of the demo dataset — and
drives every read use case against both as the restricted role. The covered set
is read off the read surface's module namespace, so an exported read with no
registry entry fails **with no database at all**, naming it. Reach is measured
with a query logger: 14 of the 16 tenant-owned tables; `program` and
`audit_log` are declared unreached with reasons, and either direction of change
fails the build.

**Every request is signed in (story 1.4 slice 1).** The four Better Auth tables
(`auth_user`, `session`, `account`, `verification`) and `tenant_membership` are
`global`, with no RLS; the registry flags `tenant_membership` as the one table
carrying `tenant_id` without a policy, and gives the app role DML on the four
Better Auth tables only. `resolveRequestContext` (`packages/app/src/authz`)
reads the session through `IdentityPort` and the bridge through its one reader
(`membershipsOf`, pinned by `source-discipline.test.ts`), deletes a session
whose active Tenant has no membership, picks and persists a single membership,
and answers `no_access` for zero or several. The composition root resolves it
once per render (React `cache()`); a server action resolves once and passes it
down; there is no constant Tenant or actor left in `apps/web` (a text-scan test
pins that). A Node-runtime `middleware.ts` slides the session (8 h idle,
`updateAge` 5 min, cookie cache off) and redirects to `/sign-in`. The route
handler serves `/get-session`, `/sign-out`, `/sign-in/email` and 404s the rest.
Demo users `linh` (PM) and `hoang` (Tenant Admin) are seeded with fixed UUIDv7
ids and the password from `SEED_DEMO_PASSWORD`. Verified in a real browser
against `next start`, including `next build`.

**Access can be taken away (story 1.4 slice 2).** `revokeMembership`,
`changeMemberRole`, `assignMemberProject` and `unassignMemberProject`
(`packages/app/src/use-cases/membership-writes.ts`) each require `tenant_admin`
in the context — checked before any parse, answering `not_found` — and run
through `runAuditedWrite` with four new `AUDIT_ACTIONS` (`membership.*`,
target = the member's user id, previous value recorded). The one writer,
`packages/db/src/repo-membership-write.ts` (the `membership` family of the write
scope), filters every statement by `tenant_id` itself (the bridge has no RLS)
and takes **one ordered `FOR UPDATE` statement** — the Tenant's admin rows plus
caller and target, by `user_id` — so concurrent writes queue instead of
deadlocking. Inside it the caller must still be an admin (a context resolved
once per action can be stale), the target must exist, and the last Tenant
Admin can be neither revoked nor demoted (`last_tenant_admin`). Revocation
deletes the row; the resolver then ends the session on the next request (a
session with no active Tenant yet answers `no_access` instead). The app role
holds SELECT, UPDATE, DELETE on the bridge — no INSERT: adding someone is
invitation work. No screen yet; four bindings wait in the composition root.
Story 1.5 replaced the local `tenant_admin` pre-check with the declared-roles
helper; the in-transaction lock re-check stays.

---

## The pattern that mattered most, and should continue

Four times across two sessions a gate looked green and proved nothing. **Reading
the diff never found one of them. Deliberate sabotage found every one.**

| Slice | What passed that should not have |
|---|---|
| B1 | The ESLint fence had four holes: `Date()` without `new`, `process` aliasing, `.js`/`.mjs` files entirely, and warnings that could never fail CI |
| B2 | Changing the worker to connect as the **superuser** passed typecheck and all 56 tests — the composition root was never executed |
| 1.2 | Setting the ledger's policy to `USING (true)`, leaking every tenant's money, left **all 96 tests passing** |
| 1.2 s2 | `USING (true)` on `baseline_wp` leaked every Tenant's rows into the process and **all twenty** harness assertions stayed green |
| 1.4 s2 | The revoked-member cleanup could be deleted with every test green: `beforeEach` restored the memberships before cleanup ran; and a PM-context harness made the cross-tenant write check pass on the role refusal alone. Both found by review, not by sabotage of the code under test |
| 1.4 s1 | depcruise's `exclude: dist` dropped every edge into `better-auth`'s `dist/`, so `better-auth-only-in-db-auth` could **never** fire; found by the adversarial review of the spine amendment, fixed by narrowing `exclude` to our own build output |

**So: after adding any gate, break the thing it guards and watch it fail.** The
CI header and each spec's Verification section record the probes that have been
run; keep adding to them rather than trusting a green check.

**And one sharper rule, learned on 2026-09-21 at the cost of a real finding:
when a gate covers a CLASS of things, sabotage every member, not a
representative.** Four reads in `repo.ts` carry no `WHERE` at all. Sabotaging
one of them (`actuals_ledger_entry`) failed six assertions and looked like
proof for all four. It was not: `baseline_wp` and `rate_entry` are re-filtered
in memory by a key that differs per Tenant, so a wide-open policy on either
left every assertion green. That is why the harness now also asserts isolation
at the table level, over the set the query logger **measures** the use cases
reading.

---

## Next, in order

### 1. Epic 1 shippable line 1.3–1.9 — DONE on `main`

- 1.3 Organisation + audit — done earlier
- 1.4 Sign-in / revoke — PR #34 (+ spine docs)
- 1.5 Roles — PR #37–#39
- 1.6 Resources & Rates — PR #40
- 1.7 Audit log — PR #41
- 1.8 Load fixture + fixture Clock + `DEPLOYMENT` — PR #42 (`57ada6a`)
- 1.9 i18n + currency lock — PR #43 (`acbefa6`)

`sprint-status.yaml` still shows **1.1** and **1.2** as `in-progress` for unfinished slices
that are blocked below — do not treat those as the next build target.

### 2. Optional — Epic 1 retrospective (`bmad-retrospective` / `[ER]`)

Optional but useful before Epic 2: capture lessons, open action items, and whether any
Correct Course is needed. Status key: `epic-1-retrospective: optional`.

### 3. Stories 2.1 + 2.2 — DONE on `main` (PR #52, `005798a`)

See "Latest" at the top. After pulling `main`, recreate the local database once (see
Environment notes): `pnpm db:migrate` refuses a database created by `push`.

### 4. The velocity checkpoint — still owed (early reading recorded 2026-09-23, PRD §13)

Due at story 1.1's close or 2026-11-15, whichever comes first (see "Where the plan stands").
An early reading only is in PRD §13; it decides nothing. Record hours worked with the checkpoint.

### 5. Story 1.2's watermark slice — DONE on `main` (PR #54, `724a494`)

Take `pg_advisory_xact_lock` before allocating `seq`. **It is now the cause of flaky tests.** A
full `pnpm test` failed 2 of 17 local runs with `mapping_event_pkey` 23505 from
`packages/db/src/repo-writes.ts:107`, and `membership`, `org-writes` and `seed-sequences` failed
in the same runs. If CI goes red in those suites, re-run it. Epic 2's writers (2.9, 2.10) need the
per-Project lock anyway, so it no longer waits on Epic 5.

### 6. Story 1.1 slice B3 — unblocked

`pnpm dev` in one command. It was blocked on story 2.1's migration, which has now landed.

### 7. Next build story: **2.3** — one canonical order for everything the scheduler reports

Start `bmad-build` for story 2.3 in a fresh context. The engine chain (2.3 → 2.4 → 2.5 → 2.6 →
2.7) is pure and needs no database. Two goals split out of 2.2 are waiting in `deferred-work.md`,
each small enough to be a story of its own:
- moving the pages' arithmetic into use cases, plus the SV note fix;
- the +30% Project layout gate.

What story 1.3 left, in `deferred-work.md`: the Program-within-Department rule is held by use
cases and row locks, with no foreign key and no concurrency test; `audit_log.at` for project
writes still mixes `demoAnchor` (Epic 2); the audited-use-case gate trusts declarations rather
than NFR-A1's list; CI never runs `next build` (it passed locally for story 1.4 slice 1).

---

## Standing decisions

- **Node**: `.nvmrc` = 24.21.0, CI reads it via `node-version-file`. No
  `engines` — an exact pin would refuse to install on the founder's 24.13.0.
- **Branch protection**: off. GitHub refuses it on a private repo on a free
  plan, so the nine gates **report and do not block**. Revisit when a second
  person can merge. Recorded in the CI header.
- **The hardcoded DSN fallback**: removed in story 1.2, as decided.
- **Connector order after R0**: Jira first, Redmine after. Revisit 2027-01-01.
- **A second AD-1 carve-out**, decided 2026-09-21 and written into
  ARCHITECTURE-SPINE's AD-1 the same day (after an adversarial review that
  narrowed a first draft): `apps/web/src/server/composition.ts` is the only
  file under `apps/web` permitted to import `packages/db`, it exports use-case
  bindings only, `apps/worker` has no such file, and `tests/` sits outside the
  AD-1 graph. The dependency-cruiser rule names that exact path. Amending the
  spine makes the cached `epic-1-context.md` stale, so the next `/bmad-build`
  recompiles it.
- **`apps/web → packages/domain` is allowed for `domain/present`'s entry
  module only**, decided by the founder 2026-09-21 and recorded in AD-1: pages
  import formatters and presentation types, never computation; figures needing
  domain rules arrive from a use case. `present/index.ts`'s export list is
  pinned by a test.
- **The dependency-cruiser gate takes AC-6's wording, not full AD-1.** It bans
  `apps/*` importing a repository or Drizzle. Full AD-1 would also flag
  `apps/worker`'s `pg-boss` and `pg` and drag the queue-adapter move into
  `packages/adapters` with it — the day-one-red the epic warns about. The
  uncovered half is recorded in `deferred-work.md`.
- **`sprint-status.yaml` records a story `in-progress` until every slice of it
  is done**, corrected 2026-09-21. Build's own step-05 marks a story `review`
  when a slice finishes, which for a multi-slice story is wrong and made the
  status view recommend a code review of unfinished work. Stories 1.1 and 1.2
  were both showing `review` with slices outstanding.
- **All three constraint types stay in R0**; the critical path is the
  minimum-Float chain.
- **The composition root may also import `packages/adapters`** (founder,
  2026-09-21, AD-1 amended after two adversarial rounds) to wire the `Clock`
  and the UUIDv7 id generator; ids take their millisecond from the Clock and
  keep a monotonic counter. `apps/worker` gets its own named composition root
  the day it first needs an adapter.
- **Story 1.3 decisions (founder, 2026-09-21)**: no Organisation UI until
  sign-in and roles exist; PM assignment belongs to 1.4/1.5; no deleting or
  archiving org units, no name-uniqueness rule; new Projects take documented
  defaults (`NEW_PROJECT_DEFAULTS`) for columns later stories own, including a
  default Rate dual-writes `project_default_rate_entry` (story 1.6).
- **Story 1.4 decisions (founder, 2026-09-21)**: split into four slices (1
  identity + context + email/password, 2 revocation and membership writes, 3
  Google, 4 password reset); the seed creates `linh` (PM) and `hoang` (Tenant
  Admin) with the password from a required `SEED_DEMO_PASSWORD`, and there is no
  provisioning script yet; a user with zero or several memberships signs in but
  sees "no access" until a tenant switcher exists; every route but `/sign-in`,
  `/no-access` and `/api/auth/*` requires sign-in, `/c/` included (a PM/Admin
  preview until OQ-8); `@momo/db-auth` exports a factory and the composition
  root builds the one instance lazily; Better Auth's own `Date` is a named AD-15
  exception; the sign-in rate limit is deferred on purpose.
- **Story 1.4 slice 2 decisions (founder, 2026-09-21)**: the membership use
  cases require `tenant_admin` (a local check ahead of 1.5, `not_found`
  otherwise — replaced by 1.5's declared-roles helper); the last Tenant Admin cannot be revoked or demoted; adding a user
  to a Tenant is invitation work, so no INSERT grant; no Users screen yet.
- **Story 1.4 slice 4 decisions (founder, 2026-09-22)**: identity events that happen before any
  Tenant exists (a password reset today; later a link, an unlink, an invitation acceptance) land
  in one new global, insert-only `identity_event` table, never in `audit_log` or an
  `operator_audit`; a completed reset sets `email_verified` (redeeming a mailed token is what
  proves the address), written from `onPasswordReset` before session revocation; the sign-in
  throttle stays deferred to Epic 8, so R0 runs unthrottled locally; `mailer-console` is the only
  mailer this release ships, with `mailer-ses` moving to Epic 8 where the AWS account exists to
  test it against.

---

## Open, and genuinely waiting

- **OQ-2** — do the five target Backlog spaces expose actual hours? The note
  said "check the 5 spaces this week", written 2026-09-20. Epic 5's fixtures
  should be re-recorded once known. Does not block.
- **OQ-3** — which client specifically. Contract type decided (準委任/labo).
- **OQ-4** pricing, **OQ-5** AI provider, **OQ-7** competitive watch (re-check
  2026-12-01), **OQ-8** client sign-in, **D2** the 30 UX assumptions.
- **Google refusal URL disclosure** — Better Auth appends `error=signup_disabled`
  vs `error=account_not_linked` to `/sign-in?google=refused`, which tells a visitor
  whether an email has an account. Decide with the NFR-S5 check sheet (Epic 8).

---

## Environment notes

- Postgres `18.6-alpine` runs in `infra/docker-compose.yml` on host port
  **55433**; volume `infra_momo-pgdata` persists.
- Local commands need both variables — there is no fallback any more:
  ```
  export DATABASE_URL='postgres://momo:momo@localhost:55433/momo_keikaku'
  export APP_DATABASE_URL='postgres://momo_app:momo_app@localhost:55433/momo_keikaku'
  ```
  `REQUIRE_DB=1` additionally turns an unreachable database into a failure
  rather than a skip, which is what CI sets.
- Since story 1.4 the seed also needs `SEED_DEMO_PASSWORD` (8+ characters), and
  the web process `BETTER_AUTH_SECRET` (32+) and `BETTER_AUTH_URL`
  (`http://localhost:3101`); `SESSION_IDLE_TIMEOUT_HOURS` is optional (default
  8). A shell without `apps/web/.env.local` sourced runs the DB suites as
  file-level failures, not skips, under `REQUIRE_DB=1` — `set -a; .
  apps/web/.env.local; set +a` first. The tests that build an auth instance take their own values. The local
  seed password in use is `momo-demo-2026`; sign in as
  `linh@momo-digital.example` or `hoang@momo-digital.example`. Re-seeding
  truncates `session`, so everyone is signed out.
- **Since story 2.1 the schema arrives by migration, not `push`.** `pnpm db:migrate` refuses a
  database created by `drizzle-kit push`, which means any database from before 2.1. Recreate it
  once:
  `docker exec momo-keikaku-postgres sh -c 'dropdb -U momo --force momo_keikaku && createdb -U momo momo_keikaku'`,
  then `pnpm demo`, or run the prepare steps below. Never run `drizzle-kit push` against a
  migrated database: it can reconcile away the hand-written `MATCH FULL` and `DEFERRABLE` clauses.
- **Verify the way CI does.** Run `pnpm seed`, not `tsx scripts/seed.ts`. `pnpm seed` loads
  `apps/web/.env.development` (`CLOCK_MODE=fixture`). Without it the seed stamps `demo_anchor` from
  the wall clock, the current Reporting Period comes out empty, and `db-round-trip` fails for no
  real reason. A throwaway database (for example `momo_verify` in the same container) keeps
  verification off the working database.
- `.claude/launch.json` starts the web app on 3101 for the agent harness. It
  reads `apps/web/.env.local` (gitignored) for the database URLs and the Better
  Auth pair; create it if it is missing.
- The agent does not type passwords into a browser: a real-browser sign-in
  check needs the founder at the keyboard for that one step.
- A shell without `pnpm` needs `corepack enable` once; `packageManager` pins
  pnpm 12.4.2.
- If Postgres is not answering on 55433, Docker Desktop may be stopped: start it,
  then `pnpm db:up`. After a schema change, re-run the prepare steps
  (`pnpm db:migrate`, `pnpm pgboss:migrate`, `pnpm db:policies`, `pnpm seed`).
- A PreToolUse hook blocks `git commit` in any Bash command that also contains
  an `-n` flag (it reads it as `--no-verify`); run `grep -n`/`sed -n` separately.
- **The local clone goes stale**: work lands via PRs merged from other
  sessions. `git fetch` before measuring anything, or a stale ref reads exactly
  like a missing artifact.

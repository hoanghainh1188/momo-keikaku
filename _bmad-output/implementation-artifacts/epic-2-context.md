# Epic 2 Context: A plan that re-dates itself when the work slips

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A PM builds a Plan by hand and it schedules itself. Leaf Work Packages (WPs) carry a duration, finish-to-start dependencies with lag, and one of three constraint types. The Project carries a start, an optional finish and a Data Date, over a versioned JP/VN working-day calendar. A slipped task moves the tasks that depend on it. Float and the critical path are always current, and every constraint violation, out-of-sequence link and unschedulable WP is listed with the chain behind it. This is the riskiest epic: no scheduling code existed, and automatic recalculation is why the plan can leave Excel. The tree grid is the only R0 scheduling surface; the Gantt is R1. Stories 2.1 and 2.2 are done: the schema migration landed and the demo spike was disposed of. Next is 2.3. Size the engine (2.3–2.12) and the plan surface (2.13–2.16) separately. Story 2.17 is not scheduling work. It adds the Organisation screens that Epic 1 claimed and did not ship, so size it separately too.

## Stories

- Story 2.1: The scheduling schema lands in one migration (done)
- Story 2.2: The demo spike is disposed of, file by file (done)
- Story 2.3: One canonical order for everything the scheduler reports
- Story 2.4: The four graph rules are invariants, not entry checks
- Story 2.5: The forward pass — a slip moves the tasks that depend on it
- Story 2.6: The backward pass, Float, and the critical path
- Story 2.7: Constraints are soft, reported, and stay on their own Work Package
- Story 2.8: The golden scheduler corpus
- Story 2.9: One path writes dates, and the run is the record
- Story 2.10: Work Packages, actual dates and Custom Fields, edited through the fence
- Story 2.11: The three Project schedule settings
- Story 2.12: The Holiday Calendar and its dated versions
- Story 2.13: The Plan tree grid and its Schedule preset
- Story 2.14: Dependencies and constraints are created and explained on the grid
- Story 2.15: The schedule strip and the What-moved band
- Story 2.16: The schedule-exceptions rail and its three explainers
- Story 2.17: The Tenant Admin can see and run the organisation

## Requirements & Constraints

- **Planned dates are never typed; the scheduler derives them.** On a leaf, a PM sets name, duration (working days), effort, an optional constraint, actual start and finish, Resources, Custom Fields and the milestone flag. Scheduling inputs exist on leaves only. A summary WP rolls up from its children (earliest start, latest finish, summed effort), and a pass never reads a roll-up back.
- **Dependencies are FS only and leaf-to-leaf only.** Lag is in working days and may be negative. Four graph rules hold as invariants on every mutation and before every pass. Each offence is reported separately, not just the first: cycles, ancestor/descendant links (a separate check from cycles), summary endpoints, and cross-project links.
- **The recalculation trigger set is closed:** duration; a dependency added, removed or re-lagged; a constraint; WP create, delete, move or re-parent; actual start or finish; Recorded % Complete; calendar version; Data Date, Project start or Project finish. **Nothing derived from Tracker evidence is ever a scheduling input.** Snapshots, the ledger, Mappings, Rules and Observed % never move a date.
- **Forward pass.** Each leaf is in one of three states:
  - *Complete*: its actual dates stand.
  - *In progress*: it starts at its actual start and runs its remaining duration from no earlier than the Data Date.
  - *Remaining*: it starts at the latest of the Data Date, the Project start, and each predecessor's finish plus lag.

  Remaining duration is `ceil(duration × (1 − recorded_pct))`, with a minimum of 1. It is never stored, and a missing Recorded % counts as 0%.

  **An actual date always wins.** When one conflicts with the graph, the pair is flagged out-of-sequence.

  A leaf with no duration is left out of both passes and the critical path and listed as "not schedulable yet". It never counts as 0 or 1.

  A pass that runs past the calendar's loaded range halts instead of guessing.
- **Backward pass.** It has one anchor: the PM-set Project finish, otherwise the computed finish. A constraint is never the anchor. Float = late start − early start, as an integer. Float is negative only against a PM-set finish. **The critical path is the minimum-Float set, never the zero-Float set.** Float is always shown with its anchor.
- **Constraints are soft.** A constraint is applied as a bound where the graph allows it and reported where it does not. The report gives the date asked for, the date derived, the working days late and the chain that forced it. A violation changes no WP's Float and never displaces the critical path. A milestone is a zero-duration leaf, and its target date *is* its `must_finish_on` constraint.
- **Project settings:**
  - With no Project start, the Project shows a "no project start yet" state and is not scheduled.
  - The Data Date defaults to today and only the PM advances it. It is never advanced automatically.
  - The Data Date cannot be set before the latest actual finish.
  - An actual date later than the Data Date offers to advance the Data Date in the same action.
  - Setting or clearing the Project finish moves no WP.
- **Calendar:** JP and/or VN national holidays (Tết included), plus Project-specific non-working days. A new version is appended when a Project day changes, when the choice of national calendars changes, or when a national table is corrected. The 2026–2028 national data ships as a versioned static dataset.
- **Custom Fields:** text, number, date and single-select, usable as columns and grouping axes. The tested bound is 100 per Project. A 101st is allowed with a warning.
- **Cut order:** 2.5 is never cut. The first cut is 2.7, which also removes milestone target dates, so FR-31's milestone rules lose their input (this is still an open question for sprint planning). The second cut is 2.6. Build 2.6 before 2.7.
- **NFRs, measured on Epic 1's 5×500-WP fixture:**
  - Full recalculation under 300 ms p95.
  - Plan edits under 500 ms p75 and 1 s p95, recalculation included.
  - Grid load under 2 s p75 and 4 s p95.
  - Determinism is exact under shuffled input order.
  - Every edit writes its audit row in the same transaction, with the previous value, and for actual dates the source (typed, imported, or accepted from evidence).
  - WCAG 2.1 AA, and nothing is conveyed by colour alone.

## Technical Decisions

- **Schema as landed (2.1).** The schema comes from `0000_scheduling_schema.sql` through `pnpm db:migrate`. **The expand/contract exemption is spent**, and every later migration (`0001` onward) is expand/contract, with backfills through `maintenance`. Tables and columns:
  - `wp_dependency` (`mutable_audited`): a `CHECK type='FS'`; `SS/FF/SF` stay expressible values. Its leaf FKs are `DEFERRABLE INITIALLY DEFERRED`.
  - `wp_status_event` (`append_only`) is **the only home of actual dates**.
  - `holiday_calendar_version` and `schedule_run` (`append_only`), and `wp_schedule` (`derived`).
  - `work_package` gains `duration_days`, `constraint_type` and `constraint_date` with a leaf-only CHECK, plus an app-maintained `child_count` and a STORED `is_leaf`. It has no start, finish, `completed_at` or `milestone_done_at`.
  - `project` gains `project_start`, `project_finish` and `data_date`.
  - `baseline_version` has an FK to `schedule_run`.

  There are 34 composite, `tenant_id`-led FKs with NO ACTION. They are `MATCH FULL`, except the seven with a nullable member, which are `MATCH SIMPLE`. `schema-catalog.test.ts` pins the hand-written clauses, and a CI drift step fails if `schema.ts` and the migration diverge. The seed writes no Baseline. Register every new table in `table-classes.ts` in the same change.
- **Tables this epic still creates:** `pct_override_event` (2.10) and `calendar_day_event` (2.12), both `append_only`.
- **Every append-only writer must call `lockWatermark`** (per-Project advisory lock, two-argument form) right before its first INSERT: `schedule_run`, `wp_status_event`, `holiday_calendar_version`, `pct_override_event` and `calendar_day_event`. Nothing enforces this mechanically.
- **Two layers, two names.** `domain/schedule.recalculate(inputs, prevInputs) → outputs` is pure. `app/schedule.recalculateProject(ctx, projectId, cause)` resolves the inputs and appends the run. Nothing else may be called `recalculate`. `domain/schedule` must not import `domain/attribution`.
- **One fence.** `app/schedule.applyPlanChange(ctx, mutation)` does the input write and the synchronous recalculation in one transaction, under the per-Project lock. Only `app/schedule` may import `db/repositories/plan-input` and `db/repositories/schedule`, and dependency-cruiser enforces this. A rejected edit rolls back completely. If the latency budget is missed, the fix is lock granularity, never a background path. An ingest arriving concurrently waits under a `lock_timeout` and records a retryable failure.
- **Only two callers are not PM edits:** `publishCalendarVersion` (operator, one Project lock at a time) and `confirmImport` (Epic 3).
- **Check graph rules app-side before writing** (2.4, 2.10, 2.14). The DB FKs are only the backstop. Map 23503/23514 errors, including a deferred FK failing at COMMIT, to `invalid_input` with a named rule, never a 500.
- **`schedule_run.inputs` is fully resolved, with no pointers:**
  - the whole WP tree, the edges, the three settings, and the resolved non-working-day set;
  - watermarks as assertions, not filters;
  - `inputs.wps` ordered by `compareWp`, with every other reference an integer index into it.

  Measure the payload against about 385 kB raw, ~141 kB stored and ~152 kB of WAL. Retention is by reference, and the runs between two Reviews must survive.

  `outputs` has two parts:
  - Per WP: early start/finish (the "derived" dates), late start/finish, Float, is_critical, state, `not_schedulable_reason` and the cause.
  - Per Project: violations, out-of-sequence rows, the ordered critical path, the anchor and the computed finish.

  A calendar-range halt appends a run with `halted_reason` and no outputs, and marks `wp_schedule` `stale`.
- **Ordering.** `compareWp` in `domain/schedule/order` is the only place order is decided, and it is total:
  - WBS codes are NFKC-normalised first (a missing code becomes `''`), then split on `.`.
  - Segments compare left to right in natural order:
    - maximal `[0-9]` runs compare as arbitrary-precision integers, so `1` and `01` tie and the comparison continues;
    - other runs compare by true code point through `compareNfkc`;
    - a digit run sorts before a non-digit run;
    - once the shared runs tie, fewer runs sort first, so the empty segment comes first.
  - Once every shared segment ties, fewer segments sort first (`1.2` < `1.2.1`). This is a tie-break, not a count comparison: `1.1` still sorts before `2`.
  - When the codes compare equal, the lowercase `wp_id` (Unicode default lowercasing) breaks the tie, then the raw `wp_id`, both by code point. Two distinct WPs therefore never compare equal.
  - AD-28 was amended on 2026-09-23 because the code-point rule for mixed segments was intransitive (`2` < `10` < `1a` < `2`). Result: `3` < `3a` < `3b` < `4` < `10`.

  **A WBS code orders WPs but never identifies them.** Matches across runs use `wp_id`. Tied driving predecessors are all recorded, in `compareWp` order. A cycle is rotated to start at its minimum WP. Violations sort by days late descending, then `compareWp`.
- **Integer discipline.** Working days are integers and ratios use `{num, den}`. Compare outputs in the codec's canonical decoded form, never as `jsonb` text. Working-day math lives only in `domain/calendar`, and wall time comes only from the `Clock` port.
- **CI gates owned here:** input-writer fence, trigger call-site, `recalculateProject` reachability (unreachable from ingest, rules, mapping and Tracker jobs), shuffled-input determinism, and the **golden corpus**.
  - The corpus is hand-computed and is the only correctness gate.
  - It must cover:
    - a slip across JP and VN weekends;
    - a mid-flight plan;
    - negative Float;
    - an out-of-sequence start;
    - a `must_finish_on` missed by six weeks that does not displace the critical path;
    - a zero-duration milestone;
    - a leaf with no duration.
  - `engine_version` is a registry key, and each case re-derives under its own version.
- **Carry-overs landing in this epic:**
  - The first real WP writer (2.10) should switch to app-generated UUIDv7 ids and `Clock`-stamped times; Project writes still stamp `demoAnchor`.
  - Settle `child_count` semantics under soft delete.
  - The 2.2 follow-ups are still open: move the pages' `bigint` and date arithmetic into use cases (and fix the SV note), and extend the +30% JA layout gate to the Project surfaces.
- **2.17** reuses the existing audited org write use cases and adds no new write path. It adds read use cases, registered in the cross-tenant harness, and removes their tables from `UNREACHED_TENANT_OWNED_TABLES`. Rates are append-only. A PM gets `not_found` through the role gate. It narrows `loadProjectBundle`'s unscoped `resource` and `rate_entry` reads to the Project. Invitations are out of scope.

## UX & Interaction Patterns

- **Plan layout, top to bottom:** schedule strip, toolbar, tree grid, with the exceptions rail on the right. The What-moved band appears between the toolbar and the grid after each recalculation.
  - Three columns are frozen, visually only: WBS, Name with the expand control, and the state glyph.
  - The grid is an ARIA treegrid.
- **Presets.** Keys `1`–`4` switch preset and keep the focused row. The choice is saved per user per project.
  - Schedule is the default and is complete in this epic: derived start/finish, duration, predecessors, constraint, Float, Critical, Exception. It must fit 1,232px at a 1280px viewport.
  - Progress ships only its Epic 2 columns here.
  - Baseline compare is finished in Epic 4.
  - All is Comfort tier.
- **Cell rules:**
  - Typing into a derived date cell shows "Planned dates are derived. To pin a date, set a constraint." and moves focus to the constraint cell.
  - Dates on or before the Data Date use muted ink.
  - Summary cells show an em dash with an accessible name, never a blank.
  - Negative Float keeps its minus sign.
  - A critical row shows the word "Critical" with a rule, and the column header names the anchor.
  - Exceptions show a glyph, a word and a number: "▲ Late 6d", "⇄ Out of sequence", "⊘ No duration".
  - Out-of-sequence uses neutral ink.
  - Nothing is edited by dragging.
- **Predecessor cell.** It takes MS-Project syntax (`2.3FS+2d, 2.4`), with autocomplete over leaf WPs only. A rejection appears under the cell and names the offence and the WPs involved. The cell keeps the typed text, and the rejection is announced assertively.
- **Constraint cell.** One column that reads like "Must finish on 18 Mar 2027", edited as type then date. Milestone targets are edited here. The Links panel (`l`) is Comfort tier.
- **Schedule strip.** It shows the start, the finish (or *not set*), the Data Date, the computed finish, the minimum Float, and the anchor written as a sentence. It never scrolls away, and its fields are editable inline through the fence.
- **What-moved band.** A one-line summary, then *See what moved*, which groups moved WPs under the seven causes.
  - When nothing moved it says "No dates moved".
  - Another PM's edit is shown with their name and has no Undo.
  - During a recalculation, affected cells show "…".
  - Changed cells get a 300 ms highlight that respects reduced motion.
- **Exceptions rail.** Three groups, always in this order: violations (worst first), out-of-sequence, not schedulable.
  - It is pinned at ≥1680px and becomes a drawer below that. The drawer toggle always shows the total.
  - When empty it says "No schedule exceptions".
  - The violation explainer names the calendar version and the chain.
  - The out-of-sequence explainer offers no fix.
  - The not-schedulable explainer has an inline duration field.
  - If the plan has an illegal edge, a banner names it and the grid shows the last good schedule, marked stale.
- **Mark complete** (`Shift+Enter`) proposes today as the actual finish. The first observed Ticket activity is shown only as evidence, with a one-click fill. The system never writes that date itself.

## Cross-Story Dependencies

- 2.1 and 2.2 are done, and Story 1.1's `pnpm dev` is now unblocked and closed.
- The engine (2.3 → 2.4 → 2.5 → 2.6 → 2.7) is pure and needs no database. 2.8 locks in its correctness. 2.9 wraps the engine in the fence and `schedule_run`, and it is the heaviest story in the plan. 2.10–2.12 write inputs through the fence. 2.13–2.16 build the surface on top. 2.17 reuses the 2.2 shell and the 2.13–2.16 grid.
- From Epic 1 this epic uses: the table-class registry, RLS and `withTenant`, audit in the same transaction, `runAuditedWrite`, `lockWatermark`, the `Clock` port, the role gate, `compareNfkc`, and the load fixture.
- Recorded % Complete has no real writer until Epic 3 (import) and Epic 6 (the audited override), so the in-progress branch is exercised only by the seed and the golden corpus. Epics 5 and 6 complete the Progress preset. Epic 4 completes Baseline compare and pins a `schedule_run` by reference. Epic 6's Review re-captures `schedule_run_seq` after each PM write.

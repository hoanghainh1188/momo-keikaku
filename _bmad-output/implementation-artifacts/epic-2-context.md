# Epic 2 Context: A plan that re-dates itself when the work slips

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A PM builds a Plan by hand and it schedules itself. Leaf Work Packages (WPs) carry a duration, finish-to-start dependencies with lag, and one of three constraint types. The Project carries a start, an optional finish and a Data Date, over a versioned JP/VN working-day calendar. A slipped task moves the tasks that depend on it. Float and the critical path are always current, negative Float shows as a negative number against a Project finish the PM set, and every constraint violation, out-of-sequence link and unschedulable WP is listed with the chain behind it. This is the riskiest epic, because automatic recalculation is the reason the plan can leave Excel. The tree grid is the only R0 scheduling surface; the Gantt is R1. Stories 2.1–2.5 are done (schema, spike disposal, `compareWp`, graph invariants, forward pass). **Next is 2.6: the backward pass, Float and the critical path.** Size the engine (2.3–2.12) and the plan surface (2.13–2.16) separately. Story 2.17 is the Organisation UI that Epic 1 did not ship, and it is not scheduling work.

## Stories

- Story 2.1: The scheduling schema lands in one migration (done)
- Story 2.2: The demo spike is disposed of, file by file (done)
- Story 2.3: One canonical order for everything the scheduler reports (done)
- Story 2.4: The four graph rules are invariants, not entry checks (done)
- Story 2.5: The forward pass — a slip moves the tasks that depend on it (done)
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

- **Planned dates are never typed; the scheduler derives them.** Scheduling inputs exist on leaves only. A summary WP rolls up from its descendants (earliest early start, latest early finish, summed effort), is computed once into outputs, and is never read back into a pass.
- **Dependencies are FS only and leaf-to-leaf only.** Lag is in working days and may be negative. The four graph rules (cycles, ancestor/descendant links, summary endpoints, cross-project links) hold on every mutation and before every pass, and every offence is reported.
- **The recalculation trigger set is closed:** duration; a dependency added, removed or re-lagged; a constraint; WP create, delete, move or re-parent; actual start or finish; Recorded % Complete; calendar version; Data Date, Project start or Project finish. **Nothing derived from Tracker evidence is ever a scheduling input.**
- **Forward pass (done in 2.5).** A leaf is *complete* (its actual dates stand), *in progress* (it resumes over its remaining duration from no earlier than the Data Date) or *remaining* (it starts at the latest of the Data Date, the Project start and each predecessor's finish plus lag). Remaining duration is `ceil(duration × (1 − recorded_pct))`, at least 1, never stored. A missing Recorded % counts as 0%. An actual date always wins, and a conflicting pair is flagged out-of-sequence. A leaf with no duration is excluded from both passes and from the critical path, its successors are driven as though it were absent, and it is listed as "not schedulable yet". A pass that leaves the calendar's loaded range halts rather than guessing.
- **Backward pass (2.6).**
  - It derives late start and late finish backwards through the same graph from **one anchor only**: the Project finish if the PM set one, otherwise the **computed finish** (the latest derived finish in the Plan). **A constraint is never the anchor.**
  - Only two names exist for these dates: *Project finish* (set by the PM) and *computed finish* (derived). Never introduce a third label.
  - With a PM-set finish, Float is absolute and may go negative. Without one, Float is relative and cannot go negative.
- **Float (2.6)** = late start − early start, as an integer number of working days. It is negative **only** because the plan cannot meet a PM-set Project finish. It is shown as it is, never clamped to 0 or left blank.
- **Critical path (2.6).**
  - It is the set of WPs whose Float equals the **minimum Float in the Plan against the anchor**: zero on a plan with slack, negative on a late plan. **It is never the zero-Float set.** A late plan has no zero-Float WPs, so that definition would drop the deciding chain exactly when it matters.
  - It is output as an ordered list: early start ascending, then `compareWp`.
  - The same WP can be critical against one anchor and not the other.
- **Driving predecessors (AR-56, 2.6).** Where several predecessors tie on the value that set an early start, outputs record **all** of them in `compareWp` order, and the UI names the first. Naming one and hiding the rest sends the PM after the wrong link.
- **Anchor always travels with Float.** Every place Float is shown also shows which anchor it was measured against, because the two anchors give different Float and the difference reaches the client on a published schedule.
- **Constraints (2.7, the boundary 2.6 must not cross).**
  - Constraints are soft: a bound where the graph allows it, a violation where it does not, and the graph always wins.
  - A violation reports the date asked for, the date derived, the working days late and the chain that forced it.
  - **A violation changes no WP's Float, its own or upstream, and never displaces the critical path.** This is deliberately unlike common CPM. Violations are a separate list, sorted by days late descending then `compareWp`.
  - A milestone is a zero-duration leaf whose target *is* its `must_finish_on`.
  - So 2.6 computes Float and the critical path purely from the graph and the anchor, and constraints play no part in it.
- **Cut order.** 2.5 is never cut. The first cut is 2.7, which also removes milestone targets. The second cut is 2.6, and it is taken only after 2.7. **Build order is the reverse: 2.6 is built before 2.7 and depends on nothing in it.**
- **Downstream readers of these outputs.** Epic 6's Schedule-red Health rule reads the same minimum Float, and the rule "cannot fire" when no Project finish is set. Baselines (FR-15) and Published Snapshots (FR-35) re-derive dates, Float, violations and the critical path exactly, comparing the path as an ordered set.
- **Project settings.** No Project start means "no project start yet", and the Project is not scheduled. The Data Date defaults to today, only the PM advances it, and it cannot be earlier than the latest actual finish. **Setting or clearing the Project finish moves no WP; it changes only the backward pass's anchor.**
- **Calendar.** JP and/or VN national holidays (Tết included) plus Project non-working days. Versions are append-only. The 2026–2028 national data ships as a versioned static dataset.
- **NFRs, on Epic 1's 5×500-WP fixture.**
  - Full recalculation under 300 ms p95.
  - Plan edits under 500 ms p75 and 1 s p95, recalculation included.
  - Grid load under 2 s p75 and 4 s p95.
  - Determinism is exact under shuffled input order.
  - Audit is written in the same transaction.
  - WCAG 2.1 AA, and nothing is conveyed by colour alone.

## Technical Decisions

- **Two layers, two names.** `domain/schedule.recalculate(inputs, prevInputs) → outputs` is pure and reads only its arguments. `app/schedule.recalculateProject(ctx, projectId, cause)` resolves the inputs and appends the run. Nothing else may be called `recalculate`. The backward pass extends `recalculate`; it is not a second function. `domain/schedule` must not import `domain/attribution`.
- **The outputs contract (AD-26).**
  - Per WP: `early_start`/`early_finish` (the UI's "derived" dates), `late_start`, `late_finish`, `float_days`, `is_critical`, `state`, `not_schedulable_reason`, the FR-28 `cause`, and the summary roll-ups.
  - Per Project: the violation rows (days late and chain), the out-of-sequence rows, the ordered critical path, the **anchor used** and the **computed finish**.
  - `schedule_run` also carries `anchor` and `computed_finish` as columns.
  - `is_critical` is defined only through the minimum-Float rule, so there are never two implementations.
- **Ordering.** `compareWp` (`domain/schedule/order`) is the only ordering site, and it is total (natural order by WBS segment, amended 2026-09-23; see AD-28). Everything the scheduler reports goes through it: driving predecessors, the critical path, violations, out-of-sequence rows, the not-schedulable block and rotated cycles. The passes are max/min reductions, so the dates themselves are order-independent. `compareWp` only fixes the order of what is reported. **A WBS code orders WPs but never identifies them:** cross-run matching uses `wp_id`.
- **Integer discipline.** Working days, lag, Float and days late are integers, and ratios use `{num, den}`. Working-day arithmetic lives only in `domain/calendar` and takes the resolved non-working-day set as an argument. Wall time comes only from the `Clock` port. Compare outputs in the AD-4 codec's canonical decoded form, never as `jsonb` text.
- **One fence (2.9).** `app/schedule.applyPlanChange(ctx, mutation)` does the input write and the synchronous recalculation in one transaction, under the per-Project lock. Only `app/schedule` may import `db/repositories/plan-input` and `db/repositories/schedule`, and dependency-cruiser enforces it. A rejected edit rolls back completely. If the latency budget is missed, the fix is lock granularity, never a background path.
- **Stored run.**
  - `schedule_run.inputs` is fully resolved. It includes the whole WP tree, the edges, the three settings and the resolved non-working-day set, and the watermarks are assertions.
  - `inputs.wps` is in `compareWp` order, and every other reference in `inputs` and `outputs` is an integer index into it. This includes the critical path and the driving chains.
  - Payload targets: ~385 kB raw, ~141 kB stored and ~152 kB WAL.
  - A calendar-range halt appends a run with `halted_reason` and no outputs, and marks `wp_schedule` stale.
  - `engine_version` is a registry key. Any change to the passes, the roll-up, the ordering or the cause logic registers a new version.
- **Schema.** It landed in 2.1 through `0000_scheduling_schema.sql`, and the expand/contract exemption is spent. Every later migration is expand/contract. Tables still to create are `pct_override_event` (2.10) and `calendar_day_event` (2.12), both `append_only`. Every append-only writer calls `lockWatermark` before its first INSERT. Register new tables in `table-classes.ts` in the same change.
- **CI gates owned here:** the input-writer fence, the trigger call-site test, `recalculateProject` reachability, shuffled-input determinism, re-derivation, and the **golden corpus (2.8)**.
  - The corpus is hand-computed and is the only correctness gate.
  - Its minimum coverage includes negative Float against a PM-set finish, and a `must_finish_on` missed by six weeks that does not displace the critical path.

## UX & Interaction Patterns

- **Plan layout, top to bottom:** schedule strip, toolbar, then the tree grid (an ARIA treegrid), with the exceptions rail on the right. The What-moved band appears under the toolbar after each recalculation. The Schedule preset (the default) shows derived start/finish, duration, predecessors, constraint, Float, Critical and Exception.
- **Float and Critical cells.**
  - Negative Float keeps its minus sign and uses the health-red colour.
  - Critical is the word "Critical" plus a bar glyph and a 3px left rule on the row, never colour alone.
  - The column header names the anchor in short form: "vs Project finish" or "vs computed finish".
  - Summary rows show an em dash with an accessible name.
  - Not-schedulable rows show "—" for dates, Float and Critical.
- **Schedule strip.**
  - It shows the Project start, the Project finish (or *not set*), the Data Date, the computed finish, the minimum Float, and the anchor as a sentence. Examples: "Float measured against the Project finish, 31 Mar 2027", or "…against the computed finish, 12 Mar 2027 — relative…".
  - Setting a Project finish for the first time is confirmed with what it actually does: it moves no WP and changes what Float is measured against.
- **Announcements.** Float is never announced without its anchor. A recalculation is announced politely, e.g. "Computed finish 26 March 2027. Minimum Float minus 3." The What-moved band shows "minimum Float +4 → −3".
- **Violation explainer (2.16).** It ends with "This violation stays on this work package. It has not changed any other work package's Float." The critical path visibly does not jump to a violated chain.

## Cross-Story Dependencies

- **Engine order.** 2.3 → 2.4 → 2.5 → **2.6** → 2.7 is pure, with no database. 2.8 locks in correctness. 2.9 wraps the engine in the fence and `schedule_run`, and it is the heaviest story. 2.10–2.12 write inputs through the fence. 2.13–2.16 build the surface, and 2.17 reuses it.
- **Date conventions pinned by founder decisions in 2.5.** 2.8 computes the corpus by hand against these, and 2.6's backward pass must mirror them.
  - Start and finish are inclusive.
  - FS lag L starts the successor (1+L) working days after the predecessor finishes.
  - A Data Date or Project start on a non-working day rolls forward.
  - A milestone's start equals its finish.
  - Across a no-duration WP X, P →(a) X →(b) S behaves as P →(a+b) S.
- **Open questions for 2.6, not settled by the planning docs.**
  - The reverse of the (1+L) rule, and a milestone's late date.
  - Whether complete and in-progress WPs get Float, and how they take part in the backward pass.
  - Backward bridging across no-duration WPs.
  - A PM-set finish on a non-working day.
  - A late date before the calendar's `range_start`.
  - Also carried from 2.5: whether `remainingDays` stays in the stored outputs.
- **Inherited from 2.5.** Driving predecessors are not recorded yet: the forward pass keeps only the latest driver, not the ties. 2.6 must record every tied driver in `compareWp` order, including drivers bridged across no-duration WPs. The inputs have no Project finish yet, so 2.6 adds one (nullable). The shuffle invariance and the 2,500-leaf timing must keep passing with the new fields.
- **Carried to 2.9.** The per-WP cause from `diff(prevInputs, inputs)`, recording the halted run, and the index-referenced encoding.
- **Carried to 2.12.** Resolving a calendar version into the domain calendar, with weekends listed explicitly.
- **Other epics.**
  - Epic 1 provides the table-class registry, RLS and `withTenant`, same-transaction audit, `lockWatermark`, `Clock`, the role gate, `compareNfkc` and the load fixture.
  - Recorded % has no real writer until Epic 3 (import) and Epic 6 (the audited override).
  - Epic 4 pins a `schedule_run` by reference.
  - Epic 6's Health rules read the minimum Float and the violation list.

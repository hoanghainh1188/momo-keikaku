---
title: 'Adversarial Review: the scheduling slice (AD-25 … AD-30) and its amendments'
created: 2026-09-20
reviewer: 'adversarial lens (headless), against ARCHITECTURE-SPINE.md 2026-09-20 and PRD 2026-09-19'
scope: 'AD-25, AD-26, AD-27, AD-28, AD-29, AD-30 in full; the amended AD-1, AD-4, AD-5, AD-9, AD-10, AD-11, AD-13, AD-15, AD-19, AD-20, AD-21; PRD FR-5, FR-6a, FR-6b, FR-7, FR-9, FR-14, FR-15, FR-16, FR-28, FR-30, FR-43, NFR-C1, NFR-P1; the four mermaid diagrams and the SQL fragments'
verdict: 'Not build-safe. The scheduling slice is the right shape and the wrong tightness. 24 pairs of conforming units diverge; 8 are blockers, and 3 of those break the re-derivation promise (FR-15/FR-35/NFR-C1) that the whole slice exists to make true.'
---

# Adversarial Review: the scheduling slice

## Verdict

**Not build-safe. Do not cut stories against AD-25 … AD-30 as written.**

The doctrine is right — derived dates have no column, every recalculation is an append-only row, the trigger set is closed at both ends, one ordering site. The slice fails on tightness, in the same way the previous adversarial review found the ledger slice failing: an AD names a mechanism and leaves the semantics that two independent developers must each guess.

I constructed 24 pairs of units — two stories, two modules, two developers — each of which obeys every AD to the letter and still builds incompatibly. Eight are blockers. Three of the eight attack the re-derivation promise directly: `recalculate(run.inputs)` **cannot** reproduce `run.outputs` as AD-26 defines `inputs`, for three independent reasons, each sufficient on its own.

Severity key:

- **CRITICAL** — R0 produces wrong dates, or a Baseline / Published Snapshot cannot be re-derived, or two units cannot be integrated without a schema or model change.
- **HIGH** — the two units diverge silently and only a migration or a rewrite reconciles them.
- **MEDIUM** — the divergence is visible at integration and fixable locally, but it will be paid for.
- **LOW** — a defect, a decorative error or a stated risk; cheap now, annoying later.

Each finding names the two units. "Unit A" and "Unit B" are always two stories that could sit in the same sprint, each written by a developer who has read the spine and obeyed it.

---

## Part 1 — The re-derivation promise (the highest-value attack)

I walked PRD FR-6b field by field against AD-26's input list. AD-26 says:

> Per leaf WP: `wp_id`, `wbs_code`, `parent_id`, `duration_days`, `constraint_type`, `constraint_date`, `is_milestone`, `actual_start`, `actual_finish`, `recorded_pct`. Per Project: the dependency edges with their lags and `seq`, the Project start, the Project finish, the Data Date, and `holiday_calendar_version_seq`.

And AD-26 also says, in the same bullet: *"`inputs` is the complete resolved set, and it is the only thing the passes read."* Those two sentences are not both true. Findings C-1, C-2 and C-3 are three independent proofs of that.

### CRITICAL C-1 — `holiday_calendar_version_seq` is a pointer, not a resolved set, so `recalculate(run.inputs)` cannot be a pure function and `recalculate` has two incompatible signatures

**The hole.** Every working-day count in FR-6b — the forward pass, remaining duration, lag, Float, "days late", and the range check that halts the pass — is counted on the resolved non-working-day set. `inputs` carries `holiday_calendar_version_seq`: an integer pointing into a tenant-owned `append_only` table. To resolve it, something must do I/O. AD-1 forbids `packages/domain` from doing I/O. So the function that "reads only `inputs`" is in `app`, not `domain` — but AD-25 already names an `app` function `recalculate(projectId)`, and AD-26's test calls `recalculate(run.inputs)`. AD-19 puts *"runs `recalculate(run.inputs)` against `run.outputs`"* in the CI gate list, and AD-25 defines the writer as *"`packages/app/schedule.recalculate(projectId)`"*. **Two functions, one name, two layers, two argument types, and a CI gate that calls whichever one the developer bound the name to.**

**Two units.**

- **Unit A — story "AD-26: schedule_run and the re-derivation gate."** Developer A reads "`inputs` is the complete resolved set" as the governing sentence and materialises the resolved non-working-day set into `inputs` alongside the seq. `domain/schedule.recalculate(inputs) → outputs` is pure, the gate is a domain unit test, no I/O. Cost: `inputs` grows by ~1,100 dates for a three-year Project (AD-26's 25 KB estimate is now wrong by an order of magnitude — see M-3), and FR-16's "diff of two runs' `inputs`" now surfaces every individual holiday as a changed field.
- **Unit B — story "AD-25: app/schedule and the write path."** Developer B reads AD-26's field list as normative and stores the seq alone. `recalculate` is `app/schedule.recalculate(projectId)` exactly as AD-25 names it; the re-derivation gate is an integration test that loads the run, resolves the calendar version by seq, and calls the passes with `(inputs, resolvedDays)`.

**The divergence.** A's `outputs` are produced by a one-argument pure function; B's by a two-argument function behind a repository. They are not the same function, they cannot share a golden corpus, and AD-26's central claim — *"the re-derivation test and the reproduction test are the same function"* — is false for either of them against the other. Worse, B's version is not re-derivable in the sense FR-14 demands: AD-5's compaction may not delete a `holiday_calendar_version` (it is not in AD-5's deletable list), but nothing in the spine says a `holiday_calendar_version` row is *permanent* the way AD-5 explicitly makes a referenced `schedule_run` permanent. B's re-derivation depends on a row the retention rules never promised to keep.

**Close it by.** Deciding one: either `inputs` carries the resolved set (and AD-26's field list and size estimate are corrected), or `inputs` carries the seq and the spine states the two-argument signature, names the pure function something other than `recalculate`, and extends AD-5's retention to `holiday_calendar_version`. Do not leave both readings open.

### CRITICAL C-2 — `inputs` is leaf-only, so the summary tree is not in it: FR-6a's validation and FR-5's roll-up cannot be re-derived

**The hole.** AD-26's per-WP list is explicitly *"Per leaf WP"*, with `parent_id` on each leaf. That is not the tree. It is a set of leaves each holding one upward pointer to a node that is **not in the input set**. Three things in FR-6b/FR-6a need the summary nodes:

1. **FR-5's roll-up.** *"A summary WP's dates are the earliest start and the latest finish among its descendants."* With only leaves and their immediate `parent_id`, you can reconstruct exactly one level of summary. A three-level WBS (`1` → `1.2` → `1.2.3`) cannot be rebuilt: `1.2`'s own `parent_id` is nowhere in `inputs`. A re-derived `outputs` therefore either omits the grandparent rows or invents them from `wbs_code` string prefixes — which AD-28 explicitly forbids (*"A WBS code orders; it never identifies"*).
2. **FR-6a's ancestor/descendant rule**, which the PRD says *"cannot be replaced by [the cycle check]"* and which AD-25 says `recalculate` runs *"before the passes"*. Deciding whether two leaves are in an ancestor/descendant relationship requires the full parent chain of both. It is not computable from `inputs`.
3. **FR-6a's summary-endpoint rule.** An edge whose endpoint is a summary WP must be rejected. But `inputs` contains only leaves, so at re-derivation time *every* endpoint looks like a leaf, and the rule is vacuously satisfied — including for a run whose live execution rejected it.

**Two units.**

- **Unit A — "FR-7: the plan tree grid over `wp_schedule`."** Developer A needs summary rows with dates to render the tree (FR-7 shows the hierarchy with derived dates). AD-25 forbids any module but `app/schedule` producing a derived date, so A requires `outputs` to carry the summary roll-ups and files a dependency on the scheduler story.
- **Unit B — "AD-26: schedule_run."** Developer B writes `outputs` with *"the per-WP result"* for the WPs that were scheduled, i.e. the leaves, because `inputs` is leaf-only and the passes are leaf-only (FR-6b: *"What is scheduled: leaf WPs only"*). B considers roll-up a presentation concern.

**The divergence.** A's grid rolls up in the UI — a second producer of a derived date, which AD-25's whole structural argument exists to make impossible, and which FR-6b's "one writer" sentence forbids by name. B's `outputs` cannot be diffed against `baseline_wp` for summary WPs, so FR-28's Divergence-by-WP and FR-7's Baseline-comparison columns are leaf-only in one unit and full-tree in the other. Meanwhile the re-derivation gate passes for both, because it compares each unit's `outputs` against its own.

**Close it by.** Stating that `inputs` carries the **whole** WP tree (every node, leaf or summary, with `is_leaf` and `parent_id`) and that `outputs` carries a row per node, with the roll-up an explicit, named pass. The size estimate moves again.

### CRITICAL C-3 — `engine_version` is a column, not a registry: the re-derivation gate dies at the first scheduler bug fix

**The hole.** AD-10 solved this for metrics: *"`formulaVersion` is a registry key. Changing any formula adds a new version, the old one stays executable, and a CI test recomputes golden Published Snapshots for every registered version."* AD-26 puts `engine_version` on `schedule_run` and then never mentions it again. It is not in `inputs`. The gate is stated as `recalculate(run.inputs) === run.outputs` with no dispatch on version. AD-19's gate list says the same: *"the re-derivation test that runs `recalculate(run.inputs)` against `run.outputs` for every golden Baseline and Published Snapshot."*

The first time anyone fixes a genuine bug in the passes — the out-of-sequence rule, the "clamped to at least 1" edge, a lag counted inclusively — every historical run's `outputs` stop matching. FR-15 promises the opposite: *"on any machine and at any later date."*

**Two units.**

- **Unit A — "Scheduler fix: lag counted inclusively at a week boundary."** Developer A fixes the pass, bumps `engine_version` to 2, and regenerates the golden corpus. Every AD is obeyed: AD-26 says `engine_version` is recorded on the run; nothing says the old engine stays executable.
- **Unit B — "AD-19 CI gate: re-derivation."** Developer B implements the gate exactly as AD-19 words it: load every golden Baseline's run, call `recalculate(run.inputs)`, compare to `run.outputs` through the codec.

**The divergence.** B's gate fails on every pre-fix golden run the moment A lands, and the only way to make it green is to rewrite the stored `outputs` of an `append_only` table — which AD-5's trigger forbids — or to delete the goldens, which is the FR-15 promise being quietly abandoned. A third developer will do the third thing: make the gate skip runs whose `engine_version` ≠ current. At that point FR-15's re-derivation test tests nothing about any Baseline taken before the last fix, which is precisely the failure the slice was written to close.

**Close it by.** Making `engine_version` a registry key with AD-10's exact semantics: old versions stay executable, the gate dispatches on the run's recorded version, and the version is part of `inputs` or of the gate's contract. This is the single highest-value line to add to AD-26.

### Field-by-field walk of FR-6b against AD-26's `inputs`

| FR-6b / FR-5 / FR-43 / FR-14 needs | In `inputs`? | Note |
| --- | --- | --- |
| duration (working days) | yes — `duration_days` | |
| dependency edges, `type`, lag | partly | `type` is **not** listed; AD-25 reserves `SS/FF/SF` on the column, so a run cannot record which type was in force. R0 accepts only `FS`, so a Post-Q1 reading of an R0 run is ambiguous rather than wrong. **MEDIUM (M-7)** |
| constraint type and date | yes | |
| WP created / deleted / moved / re-parented | **no** — see C-2; and soft-deleted WPs are unaddressed (**H-8**) |
| actual start / actual finish | yes | but two owners — see **C-4** |
| Recorded Percent Complete | `recorded_pct`, type unstated | AD-4 requires the `Ratio` form; **M-6** |
| Data Date, Project start, Project finish | yes | but mutable, unpinned elsewhere — **M-5** |
| Holiday Calendar version | pointer only | **C-1** |
| calendar `range_start` / `range_end` (the halt rule, FR-6b/FR-14) | only via the pointer | **C-1** |
| leaf vs summary (`is_leaf`) | **no** | **C-2**; and `is_leaf` has no owner at all — **H-1** |
| the whole WP tree (roll-up, ancestor/descendant) | **no** | **C-2** |
| planned effort (FR-15 pins it per leaf) | **no** | lives on `baseline_wp.baseline_mh` — two pinning mechanisms for one Baseline, see **M-8** |
| the tie-break / engine version | **no** | **C-3** |
| `project_id` (FR-6a cross-project rejection) | implied, not listed | LOW |

---

## Part 2 — Two owners of one entity

### CRITICAL C-4 — "actual finish" has two owners, two stores and two pinning mechanisms, and one of the two writers fires no recalculation

**The hole.** AD-25 drops `completed_at` and `milestone_done_at` from `work_package` with the reasoning *"PRD §3 settles that a WP has one finish date and that 'done' means it has an `actual_finish`"*, and makes `actual_finish` a mutable `work_package` column, class `mutable_audited`, read by `domain/schedule` only through `schedule_run.inputs`.

AD-10 and AD-21 were **not** amended to match. AD-10 still pins `wp_status_seq_max` and glosses it as *"WP marked complete and its actual finish, Milestone done date"*. AD-21 still lists `wp_status_event` among *"the event tables that make AD-10's closure rule true"*, glossed as *"WP marked complete (which lifts the 99% cap and sets the actual finish, FR-30/FR-5) and Milestone done date (the FR-31 Schedule amber rule)"*. The ER diagram still draws `WORK_PACKAGE ||--o{ WP_STATUS_EVENT : progresses`.

So the same fact — *this WP is finished, on this date* — lives in a mutable column that the scheduler reads through the run, and in an append-only event that EVM and Health read through `wp_status_seq_max`. Nothing in the spine says they are written together.

**Two units.**

- **Unit A — "FR-5: mark a WP complete."** Developer A implements it as the tree grid does it: set `work_package.actual_finish` (the PRD: *"Marking a WP complete asks for its actual finish and proposes today"*), audit it, and call `recalculate` — AD-27's trigger *"an actual start or actual finish"*. A never writes `wp_status_event`, because AD-25 told A that `actual_finish` is where "done" lives.
- **Unit B — "FR-30: Percent Complete caps and flags."** Developer B implements *"Percent Complete is capped at 99% until the WP has an actual finish"* by reading `wp_status_event` at `wp_status_seq_max`, because AD-10's closure rule says every value `domain/evm` reads must come from an append-only source `ComputationInputs` pins, and `work_package.actual_finish` is a mutable column that `ComputationInputs` does not pin.

**The divergence.** The PM marks WP 2.4 complete. A's scheduler moves its successors and the computed finish. B's EVM keeps the WP at 99% forever, and FR-31's milestone amber rule never fires. Both units pass every CI gate in AD-19: A's call-site test sees a legal trigger, B's closure test sees a pinned event source. The Published Snapshot is internally inconsistent — the schedule panel says done, the EVM panel says 99% — and it is *reproducibly* inconsistent, so FR-35's reproduction test is green.

**The second half of the hole.** Run it the other way. A third developer, writing "FR-31: Schedule Health Indicator," implements "mark complete" as an append to `wp_status_event` (it is the table AD-21 names for exactly this). That write changes a scheduling input — the WP becomes *complete* in FR-6b's three-state test — and **fires none of AD-27's triggers**, because AD-27's list names "an actual start or actual finish" and the developer wrote a status event. This is a real code path that changes a scheduling input with no trigger. AD-27's call-site test passes (nobody called `recalculate`), and its reachability test passes (the path is not rooted at `ingestSnapshot`, `evaluateRules`, a `mapping` use case or a pg-boss handler).

**Close it by.** Deleting `wp_status_event`'s actual-finish and milestone-done responsibilities outright and making AD-10/AD-21 read `actual_finish` through `schedule_run_seq` → `inputs`, or keeping `wp_status_event` as the single store and making `work_package.actual_finish` a projection of it. One or the other, written down in AD-10, AD-21 **and** AD-25 in the same edit.

### CRITICAL C-5 — Recorded Percent Complete has two pins, and `schedule_run_seq` is unclassified in AD-10's split Review pin

**The hole.** Two parts, compounding.

*Part one: two pins.* `ComputationInputs` pins `pct_override_seq_max`. `schedule_run.inputs` carries `recorded_pct` as a materialised value. Both are in the same `ComputationInputs`. Nothing anywhere says the pinned run must have been computed at the pinned `pct_override_seq_max`, and nothing could say it: the run is appended when the override is written, and `pct_override_seq_max` is re-captured later, independently.

*Part two: the Review's split pin has a gap.* AD-10 splits the Review's pin into tracker-side (frozen for the Review's life) and PM-authored (*"re-captured after each successful write by this PM in this Review"*), and lists the PM-authored ones explicitly: `mapping_seq_max`, `disposition_seq_max`, `pct_override_seq_max`, `setting_seq_max`, `wp_status_seq_max`, `wp_flag_seq_max`. **`schedule_run_seq` is in neither list.** It was added to `ComputationInputs` by AD-26 and AD-10's split-pin paragraph was not amended.

**Two units.**

- **Unit A — "FR-28: the Reconciliation Review shell and its pin."** Developer A implements the split exactly as AD-10 enumerates it, and treats anything not on the PM-authored list as frozen — the conservative reading, and the one that protects *"the numbers do not move under the PM"*. `schedule_run_seq` freezes when the Review opens.
- **Unit B — "FR-30: accept the Observed figure as a Recorded override, from inside the Review."** The PRD requires this: *"Accepting the Observed figure writes a Recorded override, which is a PM action."* Developer B writes the override, which under AD-27 appends a `schedule_run` inside the same transaction, and then re-captures `pct_override_seq_max` per AD-10's rule so the Review updates immediately, as UJ-3 requires.

**The divergence.** Inside one open Review, after one PM click: B's EVM panel derives Percent Complete at the new `pct_override_seq_max`; A's schedule panel still displays the frozen run, whose `inputs.recorded_pct` holds the old figure and whose dates were computed from the old remaining duration. FR-28's own text — *"a Recorded Percent Complete moved, so remaining duration moved"* — is the thing the Review cannot show, in the Review. Publish then *"captures fresh inputs and shows a diff if anything moved"*, and the diff is a schedule shift the PM already thought they had seen.

Reverse the two developers' guesses and you get the other failure: the Review's dates move while the PM reads them, which is what AD-10's split pin exists to prevent.

**Close it by.** Classifying `schedule_run_seq` explicitly as PM-authored in AD-10's split paragraph (it can only move by a PM action — AD-27 guarantees that), and adding an assertion to the closure test that `run.inputs.recorded_pct` for every WP equals the value at `pct_override_seq_max`, `actual_start`/`actual_finish` equal the values at their pins, and `holiday_calendar_version_seq` equals `calendar_seq_max`'s version. Right now two pinned facts about the same WP can disagree inside one Published Snapshot and nothing notices.

### CRITICAL C-6 — `schedule_run.cause` is project-level; FR-28's cause is per-WP; *moved by a predecessor* can never be a run cause

**The hole.** AD-26: *"`cause` is one of FR-28's seven, recorded when the run is written and never inferred afterwards"*, and *"FR-28's date movement is a diff of two runs' `outputs`, attributed from the `cause` of each run between them."*

FR-28's seven are per-WP: *edited* is defined as *"a duration, dependency or constraint **on this WP** changed"*, and *moved by a predecessor* as *"only upstream inputs changed"*. One recalculation caused by one duration edit produces cause *edited* for one WP and *moved by a predecessor* for the hundred downstream of it. There is no use case whose cause is *moved by a predecessor* — it is not an edit, it is a consequence. So the run-level enum can never contain that value, and the per-WP enum must. **They are the same seven names for two different things.**

Worse, several runs can sit between two Reviews, and one WP can be touched by several of them with different causes. FR-28 says each moved WP is *"marked with one of exactly seven causes"* — singular.

**Two units.**

- **Unit A — "AD-26: append the run."** Developer A defines `cause` as a closed enum of the seven, writes it from the calling use case, and finds that five of the seven are writable (`edited`, `calendar changed`, `data date advanced`, `actual dates recorded`, `progress changed`, `project dates changed` — six, in fact) and `moved by a predecessor` is written by nothing. A ships the column with a dead value.
- **Unit B — "FR-28: Divergence by WP with its cause."** Developer B needs a cause per WP and finds `run.cause` cannot give one. B therefore derives it: diff the two runs' `inputs` per WP; if this WP's own inputs changed → *edited*; else if any date moved → *moved by a predecessor*; and map the project-level input changes (calendar seq, data date, project dates) to their causes. B never reads `cause`.

**The divergence.** A's `cause` is authoritative-by-decree and unused; B's derivation is used and can disagree with it. Concretely: the PM advances the Data Date **and** edits WP 3.1's duration in one session — two runs. WP 3.1 moved. A's runs say `data_date_advanced` and `edited`; B's per-WP derivation says `edited` (3.1's own input changed). WP 7.2, downstream of nothing the PM touched but pushed by the Data Date, gets `moved by a predecessor` from B and `data_date_advanced` from A. FR-28 promises the PM *one* cause per WP; the two units produce different ones, and AD-26's sentence *"never inferred afterwards"* forbids B's mechanism while requiring B's result.

**Close it by.** Splitting the names. `schedule_run.cause` becomes a **trigger kind** (what caused the run — six values, none of them *moved by a predecessor*), plus the identity of what changed (the WP ids and input fields the causing edit touched, which the run must record because FR-28 needs `edited` to be attributable to a specific WP). FR-28's per-WP cause is then a derivation over the run's trigger kind and its changed-input set, defined once, in `domain/schedule`, as a named function — not a jsonb column and a diff in the review module.

---

## Part 3 — Conflicting state-mutation paths

### CRITICAL C-7 — AD-27 tests the *callers* of `recalculate` and never the *writers* of a scheduling input; a generic WP patch changes a duration with no trigger

**The hole.** AD-25's structural argument protects the **outputs**: *"A module that does not own the schedule has no column to write, so the single write path is structural rather than a convention."* There is no equivalent for the **inputs**. `work_package` is `mutable_audited`, which AD-21 defines as *"full DML through `app` use cases"* — every `app` module with the WP repository can write `duration_days`, `constraint_type`, `constraint_date`, `actual_start` and `actual_finish`. `wp_dependency` is `mutable_audited` too, and nothing restricts its repository to `app/plan` the way `db/repositories/schedule` is restricted to `app/schedule` by AD-1.

AD-27's two tests are both on the wrong side of the write. The *call-site* test enumerates callers of `recalculate` and fails on one outside the list — it cannot fail on a use case that **doesn't** call it. The *reachability* test walks from `ingestSnapshot`, `evaluateRules`, the `mapping` use cases and pg-boss handlers and fails if `recalculate` **is** reachable — also the wrong direction. Neither test can see a write to `work_package.duration_days` that is followed by no recalculation.

**Two units.**

- **Unit A — "FR-5/FR-8: edit a Work Package."** Developer A builds `plan.updateWp(wpId, patch)` over a zod-validated partial DTO: name, planned effort, assigned Resources, Custom Field values, the milestone flag. None of these is a scheduling input, so A does not call `recalculate`. A is correct today, and A's story passes the call-site test (no call) and the reachability test (not rooted there).
- **Unit B — "FR-7: the tree grid is the complete scheduling surface."** The PRD requires it: *"It shows, per WP: the derived start and finish, the actual start and actual finish, duration, Percent Complete, a predecessor column with lags, the constraint type and date … Dependencies and constraints are created, edited and deleted there."* Developer B wires the grid's inline edit to the one WP mutation the app exposes — `plan.updateWp` — and adds `durationDays`, `constraintType`, `constraintDate`, `actualStart`, `actualFinish` to the patch DTO. One line each. No AD forbids it.

**The divergence.** The PM changes a duration in the grid. The row's duration updates, `audit_log` records it, no `schedule_run` is appended, `wp_schedule` still holds the old dates, and the grid shows a schedule that is stale against its own inputs — the exact thing NFR-C1 and AD-27 promise is unreachable. Every CI gate in AD-19 is green. The A-3 grep test (AD-25 keeps it as *"a cheap second net"*) greps for writes to derived date columns, which no longer exist, so it finds nothing.

**Close it by.** A **write-site** test, symmetrical to the call-site test: enumerate every statement that writes any of the scheduling-input columns (`work_package.{duration_days, constraint_type, constraint_date, actual_start, actual_finish}`, any `wp_dependency` DML, `project.{project_start, project_finish, data_date}`, the `is_leaf`/parentage columns, and the Recorded Percent Complete store) and fail on any writer that is not in AD-27's closed set. Structurally better: move those columns onto their own table whose repository is exported only to `app/plan` and `app/import`, exactly as `db/repositories/schedule` is fenced — so the fence protects both ends of the pipe, not just the far one.

### CRITICAL C-8 — AD-29's national-table correction is an unowned, cross-tenant, N-project mutation that re-dates every plan in the product, and it is a *legal* AD-27 trigger

**The hole.** AD-29 says a correction or extension of the JP or VN national tables *"is an operator action that appends one new version per affected Project."* AD-14/FR-14 confirm: *"Creating a version triggers a recalculation (FR-6b)"*. Put those together with AD-27 (*"Execution is synchronous and inside the edit's own transaction, under the AD-20 per-Project exclusive lock"*) and you get: one operator action, N projects across M tenants, N appends to `holiday_calendar_version`, N synchronous full recalculations, each taking a per-Project exclusive advisory lock, each blocking that Project's snapshot ingest.

The spine does not say who runs this, in what role, with what transaction boundary, with what lock order, or whether the PM is told. AD-3's `system` path *"may read only tables of class `global` or `operational`"* and `holiday_calendar_version` is `append_only` and tenant-owned, so it must enter `withTenant` per Tenant — N transactions, not one. AD-5's maintenance carve-out is for compaction and `purgeTenant` only. There is **no third role and no owner for this**.

And it defeats AD-27's stated purpose. AD-27 exists to prevent *"the failure the founder named — a background job re-dating a plan while nobody is looking."* A holiday-table correction is a background job that re-dates every plan while nobody is looking, and it is the sixth item on AD-27's own trigger list, so the closed trigger set does not stop it. FR-14 wants exactly this behaviour (*"the Current Plan always uses the latest version"*), so the answer is not to forbid it — it is that the spine has not noticed it is a fan-out.

**Two units.**

- **Unit A — "FR-14: operator extends the calendar range to 2029."** Developer A writes a maintenance script: for each affected Project, `withTenant`, take the AD-20 lock, append the version, call `recalculate`, commit. Ordered by `project_id`, one transaction per Project, per AD-3.
- **Unit B — "AD-27: the halt path when a plan runs past the calendar range."** Developer B implements AD-27's *"exactly one path to 'last good schedule marked stale'"*: the version commits, the recalculation halts, `wp_schedule.stale = true`. B tests it with the operator appending a version whose range is *narrower*, and writes the script as a single transaction across the Tenant's Projects so the whole correction is atomic — a correction half-applied is a worse state than one not applied.

**The divergence, three ways.**
1. **Deadlock.** A takes per-Project locks one transaction at a time; B takes several per-Project advisory locks in one transaction, in `created_at` order. Run B's Tenant-wide correction while A's range extension runs for a Project in that Tenant, plus an ordinary PM edit holding its Project lock, and you have two lock orders over the same key space. `pg_advisory_xact_lock` does participate in deadlock detection, so this surfaces as a random `40P01` in an operator job — and B's atomicity requirement is exactly what makes it multi-lock.
2. **Ingest starvation.** Each recalculation runs inside the exclusive lock (AD-27) and AD-7's ingest wants the same lock. A fan-out of 500 recalculations holds a Project's lock for the duration; the ingest job retries (AD-7: `retryLimit: 3`, backoff sized to finish *"inside one snapshot interval"*), and three lock waits plus the fan-out burn the interval. The result is a visible failed-snapshot row (AD-7) caused by an unrelated operator action.
3. **The PM's view.** A's per-Project commits mean some Projects re-date and some do not, for minutes or hours. FR-28's Review then shows *calendar changed* on WPs in some Projects and not others, with no way to tell it apart from a genuine partial application.

**Close it by.** Naming this path in AD-29 as a job, not a script: one pg-boss job per (tenant, project), the AD-20 lock taken once per job, no multi-Project transaction, a single documented lock order (one Project per transaction, which makes the order trivially safe), a per-Project audit row, and a statement of what the PM sees while the fan-out is in flight. Also state the interaction with AD-27's halt path — a fan-out in which some Projects halt for range is the normal case for a *narrowing* correction, not an edge case.

---

## Part 4 — The declarative leaf-only foreign key (AD-25)

### HIGH H-1 — the FK is valid PostgreSQL, but `is_leaf` is itself a derived column with no owner, so the "no trigger" claim is circular

**Is it valid PostgreSQL?** Yes, mechanically. `work_package UNIQUE (tenant_id, project_id, id, is_leaf)` is a legal (redundant, index-costing) unique constraint; `wp_dependency` carrying `pred_is_leaf boolean NOT NULL DEFAULT true CHECK (pred_is_leaf)` plus `FOREIGN KEY (tenant_id, project_id, predecessor_wp_id, pred_is_leaf) REFERENCES work_package (tenant_id, project_id, id, is_leaf)` is the standard denormalise-and-constrain trick. `UPDATE work_package SET is_leaf = false` on a WP with edges fails the FK with `ON UPDATE NO ACTION`, which is what AD-25 wants. RI checks bypass row security even under `FORCE ROW LEVEL SECURITY`, so the composite tenant FK still works under AD-3. So far so good.

**The hole.** `is_leaf` is not a fact anyone states; it is a fact about the tree — *this WP has no children*. Keeping it true across `INSERT` of a child, `DELETE`/soft-delete of the last child, and a re-parent that moves the last child away requires maintenance on every parentage write. AD-25 offers the FK as the alternative to a trigger (*"no trigger, and no invariant that only runs when someone remembers to call it"*), but the FK's whole strength rests on a column that only a trigger, or an invariant someone remembers to call, can keep correct. The same applies to AD-25's other declarative claim, `CHECK (is_leaf OR (duration_days IS NULL AND …))`.

**Two units.**

- **Unit A — "FR-5: create a child WP."** Developer A maintains `is_leaf` in the `app/plan` use case: insert the child, `UPDATE parent SET is_leaf = false`. Correct, and it fails loudly when the parent has edges, which is the designed behaviour.
- **Unit B — "AD-13: `confirmImport` commits the whole diff."** Developer B writes a set-based re-parent: one `UPDATE work_package SET parent_id = …` over the diff, then a single `UPDATE work_package w SET is_leaf = NOT EXISTS (SELECT 1 FROM work_package c WHERE c.parent_id = w.id AND c.deleted_at IS NULL)` to reconcile the whole tree — the only sane shape for a 20,000-row import.

**The divergence.** B's reconciling `UPDATE` touches WPs whose `is_leaf` flips **true → false** while their `wp_dependency` rows are still present (B deletes the now-illegal edges later in the same transaction, or expects the diff to have listed them). The FKs are not `DEFERRABLE INITIALLY DEFERRED` — AD-25 does not say they are — so the statement fails immediately and the whole import rolls back with a raw `23503`, not FR-9's *"listed in the Import Preview with their rows and reasons"*. A's row-at-a-time path never hits it because A orders the operations. The two units cannot share an ordering discipline because B's is set-based by necessity.

The mirror case is worse: an import that restructures a tree in one transaction will legitimately want a WP to be a summary at the start of the transaction and a leaf at the end (a child moved away), with an edge drawn on it in between. Without `DEFERRABLE INITIALLY DEFERRED` that transaction is unexpressible.

**Close it by.** (a) Declaring all four leaf-discipline FKs `DEFERRABLE INITIALLY DEFERRED` and saying so in AD-25 and AD-30's migration; (b) naming the owner of `is_leaf` — a generated column is not possible (it depends on other rows), so it is a trigger on `work_package (parent_id, deleted_at)` and AD-25 should say so instead of claiming there is no trigger; (c) adding `is_leaf` to AD-26's `inputs` (C-2).

### HIGH H-8 — soft-deleted WPs, their edges and their place in `inputs` are undefined

**The hole.** AD-11: *"A deleted WP is soft-deleted (`deleted_at`) so history resolves."* FR-5: *"Deleting a leaf WP with dependencies: its incoming and outgoing edges are deleted with it."* `wp_dependency` is `mutable_audited`, so those edges are **hard**-deleted. The FK from `wp_dependency` to `work_package` therefore never fires on a delete (the row is still there), and nothing at the database level stops an edge pointing at a soft-deleted WP.

**Two units.** Unit A — "FR-5: delete a WP" — soft-deletes the WP, hard-deletes its edges, reassigns Mappings (AD-9's `deleteWp`), and calls `recalculate` (AD-27 trigger: *a WP deleted*). Unit B — "AD-26: build `inputs`" — selects the Project's leaves. B has no rule about `deleted_at`, so B either includes soft-deleted leaves (then a deleted WP keeps a derived date, keeps appearing in `outputs`, and keeps being diffed against `baseline_wp`) or excludes them (then an old run re-derived today would need the `deleted_at` **as of the run**, which `inputs` does not carry, and a WP deleted after the run silently drops out of the re-derived `outputs` — the re-derivation test fails for reasons unrelated to the schedule).

Note the second half: because `inputs` is a materialised snapshot, excluding by `deleted_at` at build time is correct and re-derivation is safe. But nothing says it, and B's colleague implementing the re-derivation gate may well re-query. **Close it by** stating that `inputs` is built from non-deleted WPs at append time and is never re-queried, and by adding a partial FK or a check that no `wp_dependency` row references a soft-deleted WP.

---

## Part 5 — `wp_schedule`, "the current schedule", and ordering

### HIGH H-2 — `wp_schedule` is not rebuildable from `schedule_run`, has no DELETE grant, and has two plausible read shapes

**Three defects in one table.**

1. **`stale` is not in `schedule_run.outputs`.** AD-21 classifies `wp_schedule` as `derived` — *"rebuildable index of append-only truth"* — and AD-25 calls it *"a projection of the latest `schedule_run`, rebuildable from it"*. But AD-27's halt path writes `stale = true` **without writing a run**. Rebuild `wp_schedule` from the latest run after a deploy, a restore (AD-19's documented PITR), or a bug, and the stale flag is silently lost: the PM is shown a schedule marked current that the scheduler refused to compute.
2. **No DELETE grant.** AD-25: *"the application role holds INSERT/UPDATE on those two tables through that path only."* A run that no longer contains a WP (deleted, or newly not-schedulable) leaves that WP's `wp_schedule` row behind forever, with an old `schedule_run_seq`.
3. **Two read shapes follow from (2).** Unit A — "AD-25: write the projection" — upserts by `wp_id` and treats `wp_schedule` as *the* current schedule. Unit B — "FR-7: the tree grid" — reads `wp_schedule WHERE schedule_run_seq = (the Project's latest)`, because B noticed the column and reasonably concluded it is the version marker. **Divergence:** a WP deleted three runs ago is in A's export (FR-39 exports the plan) and absent from B's grid; a WP that became not-schedulable is in A's grid with stale dates and absent from B's.

**Close it by.** Adding `stale` and `stale_reason` to `schedule_run.outputs` (or, better, to a separate one-row-per-project `schedule_state` the halt path owns), granting DELETE to `app/schedule` on `wp_schedule` and specifying the projection as delete-then-insert per run, and stating the canonical read (`= latest schedule_run_seq`, in one repository function).

### HIGH H-3 — the spine never says which of `wp_schedule`'s four dates is "the derived start and finish"

**The hole.** `wp_schedule` carries `early_start, early_finish, late_start, late_finish`. `baseline_wp` carries `start, finish`. FR-7 asks for *"the derived start and finish"*, FR-15 pins *"its planned dates"*, FR-28's Divergence compares Baseline dates against Current Plan dates, FR-34 publishes a schedule to the client. Nowhere does the spine say that the plan date is the **early** date. CPM convention says so; the spine does not.

**Two units.** Unit A — "FR-15: `setBaseline`" — copies `early_start`/`early_finish` into `baseline_wp.start/finish` (the convention). Unit B — "FR-30: PV spread" — reads *"the Baseline hours … spread linearly over each WP's baseline working days"* and needs a window; B takes `baseline_wp.start`→`finish` and gets A's early window. Consistent so far. Now Unit C — "FR-28: Divergence by WP" — diffs `baseline_wp.start` against `wp_schedule`. Which column? If C picks `late_start` (a defensible reading of "the date the plan says it must start"), every WP with float shows a Divergence the day the Baseline is taken. **Close it by** one line in AD-25 or the Consistency Conventions: *the plan date is the early date; the late dates exist only to produce Float and the critical path, and no stored or exported figure reads them.*

### HIGH H-5 — AD-28's `compareWp` is undefined for mixed and unequal WBS segments: two runs over identical inputs can differ

AD-28 says: *"It compares `wbs_code` segment by segment — each dot-separated segment as an integer where it parses as one, otherwise through `domain/text.compareNfkc` — and falls back to `wp_id` where the codes are equal or absent."* Three cases it does not define:

1. **One segment parses, the other does not.** `"3"` vs `"2a"`. Unit A — "AD-28: `compareWp`" — implements *if either side fails to parse, compare both as text*: `"2a" < "3"`. Unit B — the same AD, read as *numbers sort before text* (the natural reading of "as an integer **where it parses**"): `"3" < "2a"`. Real WBS codes from Japanese WBS workbooks carry `2a`, `2-1`, `2.1.1a` routinely (FR-9's acceptance corpus is exactly this). **Two runs over identical inputs produce different critical-path orderings, different violation-list orderings, and a different named driving predecessor** — precisely the defect OQ-13 was closed to remove.
2. **Unequal segment counts.** `"1.2"` vs `"1.2.1"`. Is the shorter a prefix that sorts first, or is the missing segment compared as absent/empty? Unspecified.
3. **Leading zeros / plus signs / full-width digits.** `"１.２"` (full-width) NFKC-normalises to `"1.2"` under `compareNfkc`, but the *integer* branch sees `"１"`. Does the segment get NFKC-normalised **before** the parse attempt? Unit A normalises first (full-width sorts numerically); Unit B parses the raw segment, fails, and falls to text. Japanese WBS workbooks contain full-width digits.

Also **`wp_id` as the fallback is unspecified in representation**: UUIDv7 as lowercase canonical text and as Postgres `uuid` byte order agree, but `domain` sorts strings and the DB may sort `uuid` — state that the comparison is on the canonical lowercase text form, in `domain` only.

**Close it by.** A three-line normative algorithm in AD-28: NFKC-normalise the whole code, split on `.`, compare segment-wise with *numeric segments before non-numeric*, shorter-is-prefix sorts first, then `wp_id` as lowercase canonical text. And extend the shuffled-input determinism test to a **shuffled-and-adversarial-codes** corpus containing `2a`, `1.10` vs `1.9`, `1.2` vs `1.2.1`, full-width digits and absent codes.

### MEDIUM M-1 — `anchor` and `computed_finish` exist twice, and `anchor`'s type is unstated

`schedule_run` carries `anchor` and `computed_finish` as columns, and `outputs` carries *"the computed finish"*. FR-43 requires the UI to say *which* finish Float was computed against, so `anchor` must be the **kind** (`project_finish | computed`) — but the name reads like a date, and one developer will store the date. Two units then disagree about whether a run anchored on a Project finish that happens to equal the computed finish is "absolute" or "relative" Float, which the PRD says *"reaches the client on a published schedule (FR-34)"*. **Close it by** typing `anchor` as the closed kind enum and removing `computed_finish` from the row (it is in `outputs`, and AD-26's own argument against `baseline_version` re-copying inputs — *"two copies of one pinned set is how two builders diverge"* — applies verbatim here).

---

## Part 6 — Ordering, concurrency and transactions

### HIGH H-4 — compaction deletes a `schedule_run` without the AD-20 lock while `setBaseline` or `publish` pins it in another transaction

**The hole.** AD-20 makes every **write** to a watermarked table take the per-Project exclusive lock, and every `ComputationInputs` capture take the shared lock. AD-5's compaction is neither: it runs under the `maintenance` role, deletes rows, and takes no stated lock. AD-5 and AD-26 give it a retention predicate — *"no `baseline_version`, `published_snapshot`, open Review or unexpired export references it and it is not among its Project's last two runs."*

Under `READ COMMITTED`, evaluating that predicate and acting on it is a classic read-then-write race. The spine never says there is a declared foreign key from `baseline_version.schedule_run_seq` to `schedule_run` — it says `baseline_version` *"stores `schedule_run_seq`"*, a number.

**Two units.** Unit A — "FR-19: compaction" — implements the predicate as `DELETE … WHERE NOT EXISTS (baseline) AND NOT EXISTS (published) AND … AND seq NOT IN (last two)`, under `app.maintenance`, no lock, because AD-20 governs appends and this is a delete. Unit B — "FR-15: `setBaseline`" — takes the AD-20 exclusive lock (AD-20 lists Baselines), reads the Project's current `schedule_run_seq`, writes `baseline_version` and `baseline_wp`, commits. **Divergence:** B reads run 41 (currently unreferenced and, after two newer runs, outside the last-two window); A's predicate evaluates before B commits and deletes 41; both commit. The Baseline now points at nothing. FR-15's re-derivation test for that Baseline can never run again, and AD-5's *"A retained run is never partially deleted: its `inputs` are what FR-15's re-derivation test and FR-35's reproduction test read"* is quietly false. The same race hits `publish` (AD-10 captures under the **shared** lock, which A does not take either) and an export.

**Close it by.** Declaring the composite foreign keys `baseline_version → schedule_run` and `published_snapshot → schedule_run` (the FK's row lock closes the race by itself), **and** making compaction take the AD-20 exclusive lock per Project — AD-20's rule should read *"every write"*, not *"every append"*.

### HIGH H-6 — AD-27 puts the recalculation inside the lock; AD-20 says the long work is done before it

**The hole.** AD-20: *"Long-running work is done **before** the lock is taken … so the lock is held for the write only."* AD-27: *"Execution is synchronous and inside the edit's own transaction, under the AD-20 per-Project exclusive lock."* The recalculation **is** the long-running work: FR-6a validation over the whole graph, two passes over 500 WPs, float and critical path, the ordering, the codec, and a `jsonb` write of `inputs` plus `outputs`. AD-27 budgets 300 ms p95 for it. AD-20's discipline, applied to the ingest, holds the lock for milliseconds; applied to a PM edit it now holds it for a third of a second, every keystroke-level edit in the tree grid.

**Two units.** Unit A — "AD-20: the lock helper" — builds `withProjectLock(tx, …)` with a `lock_timeout` (a reasonable reading of "held for the write only": a write that waits is a bug) and a comment that no long work goes inside. Unit B — "AD-27: recalculate in the edit transaction" — calls the helper and does 300 ms of work inside it. **Divergence:** A's `lock_timeout` fires on B's ingest (AD-7) during a burst of grid edits; the ingest records a failed attempt (AD-7 makes every failed attempt a PM-visible row), and the PM sees snapshot failures caused by their own typing. AD-27 anticipates the latency (*"a snapshot ingest for the same Project waits behind a PM edit"*) but not the timeout, the burst, or the interaction with AD-7's `retryLimit: 3` backoff *"sized so every attempt finishes inside one snapshot interval"*.

**Close it by.** Amending AD-20's sentence to carve out the recalculation explicitly, stating the lock-wait budget the ingest gets (and that a lock wait is **not** a failed attempt for AD-7's purposes), and saying whether `lock_timeout` is set at all.

### MEDIUM M-2 — the advisory lock key: `hashtext` is a 32-bit internal function and the Tenant-only and Tenant+Project key spaces share it

AD-20: `pg_advisory_xact_lock(hashtext(tenant_id || ':' || project_id))`. Three notes:

- `hashtext(text)` returns `integer`; the implicit `int4 → int8` cast resolves to the one-argument `pg_advisory_xact_lock(bigint)` overload. **Valid**, but it uses only 32 bits of a 64-bit space for no reason, and the two-argument `(int, int)` form with a fixed class id is the idiomatic shape.
- `hashtext` is an internal function with no stability guarantee across major versions. A pg upgrade that changes it is harmless (all sessions change together) — but it is worth writing that down rather than discovering it.
- AD-20 says tenant-scoped tables with no Project *"use the Tenant key"*. That key lives in the **same** 32-bit space. `hashtext(tenantA)` can collide with `hashtext(tenantB || ':' || projectX)`, and the result is a `tenant_setting_event` append blocking an unrelated Tenant's Project edit. Harmless for correctness, invisible and undiagnosable in production. **Close it by** the two-argument form with distinct class ids for the Tenant key space and the Project key space.

### MEDIUM M-4 — AD-27's single stale path contradicts FR-6a's stale path, and the diagram encodes the contradiction

AD-27: *"There is exactly one path to FR-6a's 'last good schedule marked stale': a new Holiday Calendar version whose range no longer covers the plan."* FR-6a says something else, twice: *"A Plan that violates one is never scheduled: the recalculation stops, names the offending edges, and shows the last good schedule marked stale."* AD-27 reinterprets this as a rollback (*"An edit that cannot be scheduled is not persisted"*), and the trigger-set diagram draws it: `V -->|offending edges| RB[transaction rolls back, edit rejected with its reason]`.

The reinterpretation is defensible for an interactive edit and **not** for `confirmImport`, which AD-13 commits as one diff and then recalculates once. FR-9 requires illegal links to be *"listed in the Import Preview with their rows and reasons"* — a preview, not a post-commit rollback. **Two units:** Unit A — "FR-5: edit" — rolls back, per AD-27. Unit B — "FR-9/FR-11: confirm the import" — cannot roll back the whole import for one illegal edge the preview already surfaced, so B applies the diff, drops the offending edges, and lists them; or B rolls back and the PM cannot import a plan with one bad predecessor cell out of 20,000. Neither is written down. **Close it by** stating the import's behaviour explicitly in AD-13 and AD-27, and by reconciling AD-27's "exactly one path" with FR-6a's sentence in prose rather than by omission.

### HIGH H-7 — `recordDisposition` reaches `recalculate` through `plan.createWp`, and AD-27's reachability test has ambiguous roots

AD-22: *"`recordDisposition` … calls `plan.createWp(...)` for *Plan* … calls `mapping.map(...)` with `source = 'disposition'` … and appends exactly one `disposition_event`"*, all in one transaction. AD-27's trigger list contains *"a WP created"*, so `plan.createWp` calls `recalculate`. So `recordDisposition` reaches `recalculate` — legitimately.

AD-27's reachability test *"walks the static call graph from `ingestSnapshot`, `evaluateRules`, every `mapping` use case and every pg-boss handler, and fails if `recalculate` is reachable from any of them."*

**Two units.** Unit A — "FR-29: Dispositions" — implements AD-22 verbatim. Unit B — "AD-19 CI gate: the reachability test" — must decide what "every `mapping` use case" means. The narrow reading is *the exported functions of `packages/app/mapping`*; the broad reading, which is the one that actually protects the invariant AD-27 states (*"the snapshot pipeline reaching the scheduler through an input it happens to change"*), is *every use case that appends a `mapping_event`* — and AD-9 says *"Only the `mapping` module in `packages/app` appends `mapping_event`"*, which makes `recordDisposition` a caller, not a root. B picks the broad reading, roots the walk at `recordDisposition`, and the gate goes red on A's correct code.

Same shape for `deleteWp`, which AD-9 puts in `app/plan` and which calls `mapping.reassign` **and** must call `recalculate` (AD-27: *a WP deleted*).

**Close it by.** Naming the roots as an explicit list of function symbols in AD-27, not a category — and stating the one rule the category was reaching for: *a use case may reach `recalculate` only if a PM action is its sole entry point.*

---

## Part 7 — Remaining findings

### MEDIUM M-5 — the three Project schedule settings are mutable, unpinned columns that FR-7, FR-31 and FR-32 will read directly

AD-25 makes `project.project_start`, `.project_finish`, `.data_date` plain mutable columns and argues they *"reach compute only through `schedule_run.inputs`"*. But FR-7 requires the Data Date drawn on the tree grid, FR-28 requires it shown in the Review with an offer to advance it, FR-31's Schedule Health reads schedule state, and FR-32's forecast is as-of a date. AD-10's closure test checks that every input type is **reachable from `ComputationInputs`**, and `schedule_run_seq → run → inputs → data_date` *is* reachable — so a `domain/health` function that takes `dataDate: PlanDate` passes the closure test while the `app` caller happily reads `project.data_date` from the mutable column. **Two units:** Unit A — "FR-31: Health" — takes the Data Date from `run.inputs`. Unit B — "FR-28: the Review shell" — reads `project.data_date` for the "advance it" affordance and passes the same value into the health call. A published snapshot then pins a Data Date that differs from the one its Health colour was computed against, and reproduces that difference faithfully. **Close it by** stating that the three settings are read from `run.inputs` everywhere except the settings form itself, and adding that assertion to the closure test (see C-5).

### MEDIUM M-6 — `recorded_pct`'s type is unstated, and AD-4 requires a `Ratio`

AD-4 says remaining duration is *"evaluated as integer arithmetic over the `Ratio` form of the Recorded Percent Complete so it cannot drift between two recomputations"*. AD-26 lists `recorded_pct` with no type. FR-9 imports *"a value outside 0–100"* as invalid, implying an integer percent; FR-30's override is a PM figure. **Two units:** Unit A stores `recorded_pct` as `{num, den}` via the codec; Unit B stores it as an integer 0–100. Both pass the codec's own round-trip. The runs are not comparable, the FR-16 input diff reports a spurious change on every WP the moment the two meet, and `ceil(duration × (1 − pct))` is computed two ways. **Close it by** typing it in AD-26 as `Ratio` and saying what the import and the override coerce to.

### MEDIUM M-7 — `wp_dependency.type` is in the table and not in `inputs`

AD-25 reserves `SS | FF | SF` on the column so it never has to change; AD-26's per-Project input list carries *"the dependency edges with their lags and `seq`"* and not their type. An R0 run is unambiguous (only `FS` is accepted), but a run appended the day after Post-Q1 enables `SS` is not re-derivable, and the failure will be silent because the re-derivation gate will simply assume `FS`. Cheap to close now: add `type` to `inputs`.

### MEDIUM M-8 — a Baseline pins its inputs by reference and its effort by copy

AD-26's argument for reference-not-copy is *"the pinned input set has one representation rather than two that can drift apart."* But FR-15 pins *"per leaf WP: its planned dates, its planned effort, **and** the inputs"* — and effort is not in `inputs`; it is copied into `baseline_wp.baseline_mh`. So the Baseline is half reference, half copy, and the seam is exactly where FR-16's *"compared as plans"* list stops (that list does not include effort) and FR-28's Divergence starts (AD-11: *"Divergence compares `baseline_wp` with the current `wp_schedule` for dates and with `work_package` for effort"*). **Two units:** Unit A — "FR-16: compare two Baselines" — diffs two runs' `inputs` per AD-26 and reports no effort change ever. Unit B — "FR-28: Divergence" — reads `baseline_wp.baseline_mh` against `work_package` and reports effort changes. A PM comparing Baseline 3 with Baseline 4 sees no effort movement; the same PM in the Review sees it. **Close it by** stating that effort is deliberately outside the schedule's input set (it does not affect dates — FR-6b excludes effort-driven scheduling) and that FR-16's plan comparison therefore reads `baseline_wp` for effort, in one named function shared with FR-28.

### MEDIUM M-3 — AD-26's size estimate is conditional on C-1 and C-2

*"About 25 KB per run for a 500-WP Project"* assumes leaf-only rows and a calendar pointer. Resolve C-1 toward the resolved set (~1,100 dates) and C-2 toward the full tree, and `inputs` grows several-fold; add `outputs` with summary roll-ups and it grows again. AD-26's stated lever — *"dropping `outputs` for unreferenced runs, never dropping `inputs`"* — survives, but the [ASSUMPTION] should be re-measured after C-1 and C-2 are decided, not before.

### LOW L-1 — SQL shapes

- `CHECK (is_leaf OR (duration_days IS NULL AND constraint_type = 'asap' AND constraint_date IS NULL AND actual_start IS NULL AND actual_finish IS NULL))` evaluates to `NULL` (and therefore **passes**) if `is_leaf` is `NULL`. Declare `is_leaf boolean NOT NULL`. The check also omits `is_milestone` and the Recorded Percent Complete, both of which are leaf-only facts.
- `wp_dependency` has `UNIQUE (tenant_id, project_id, predecessor_wp_id, successor_wp_id)` and no `CHECK (predecessor_wp_id <> successor_wp_id)`. A self-loop is a cycle that `validate` catches, but AD-25's case for declarative enforcement should take the free one.
- AD-3's composite tenant foreign keys are `MATCH SIMPLE` by default: if **any** column of the composite is NULL the constraint is not enforced at all. Every column in every composite tenant FK must be `NOT NULL`, and CI should assert that rather than assume it.
- `holiday_calendar_version.non_working_days` has no declared type. `date[]` and `jsonb` are both defensible; two developers will pick differently, and the codec (AD-4) only governs `jsonb`. Name it.
- `wp_dependency.type` and `wp_schedule.state` are unreserved keywords in PostgreSQL and legal as column names, but they will need quoting in generated SQL in places; prefer `dependency_type` / `schedule_state`.
- Referential-integrity checks bypass row security even under `FORCE ROW LEVEL SECURITY`. That is what makes AD-3's composite FKs work — and it also means a FK violation message can confirm the existence of a row in another Tenant. Map `23503` to a generic error at the boundary (AD-12's *"Anything outside the allowed set returns `not_found`"* should cover DB error text too).

### LOW L-2 — the mermaid diagrams

All four scheduling-relevant diagrams parse as far as I can read them by hand (no renderer available here; CI should render them). Substantive errors:

- **`WORK_PACKAGE ||--|| WP_SCHEDULE : derived_dates` is wrong.** `||--||` asserts exactly one on both sides. A WP created since the last run, a WP in the "not schedulable yet" block, and — if C-2 resolves toward leaf-only `outputs` — every summary WP has no `wp_schedule` row. It should be `||--o|`. It also contradicts the neighbouring `SCHEDULE_RUN ||--o{ WP_SCHEDULE`.
- The ER diagram omits `PCT_OVERRIDE_EVENT` and `PROJECT_SETTING_EVENT` while including `TENANT_SETTING_EVENT` — and `PCT_OVERRIDE_EVENT` is the store behind the Recorded Percent Complete, which is C-5's subject.
- `WORK_PACKAGE ||--o{ WP_DEPENDENCY` twice is fine, but AD-25 says `wp_dependency` carries `project_id` with composite FKs; the diagram shows no `PROJECT` edge, so a reader takes the cross-project rule from prose only.
- The trigger-set flowchart omits `confirmImport` (AD-13's once-after-the-diff call) and `recordDisposition → plan.createWp` (H-7) — the two paths most likely to be got wrong.
- `D{domain/calendar: due?}` in the worker flowchart: a rhombus label containing `/`, `:` and `?`. It parses in current mermaid; it is the one label in the set I would put in quotes as insurance, and CI rendering the diagrams would settle it.

---

## Summary table

| # | Sev | Finding | AD |
| --- | --- | --- | --- |
| C-1 | CRITICAL | `holiday_calendar_version_seq` is a pointer; `recalculate` has two incompatible signatures across the purity boundary | AD-26, AD-25, AD-1, AD-19 |
| C-2 | CRITICAL | `inputs` is leaf-only; the summary tree is missing, so FR-6a validation and FR-5 roll-up are not re-derivable | AD-26, AD-25 |
| C-3 | CRITICAL | `engine_version` is a column, not a registry; the re-derivation gate dies at the first scheduler fix | AD-26, AD-10, AD-19 |
| C-4 | CRITICAL | "actual finish" has two owners (`work_package` vs `wp_status_event`); one writer fires no trigger | AD-25, AD-10, AD-21, AD-27 |
| C-5 | CRITICAL | Recorded Percent Complete has two pins; `schedule_run_seq` unclassified in AD-10's split Review pin | AD-10, AD-26, AD-27 |
| C-6 | CRITICAL | `schedule_run.cause` is project-level; FR-28's cause is per-WP; *moved by a predecessor* is unwritable | AD-26 |
| C-7 | CRITICAL | No write-site test: a generic WP patch changes a duration with no trigger | AD-27, AD-25, AD-21 |
| C-8 | CRITICAL | AD-29's national-table correction is an unowned cross-tenant fan-out with no lock order | AD-29, AD-27, AD-20, AD-3 |
| H-1 | HIGH | `is_leaf` is derived and unowned; FKs are not deferrable, so a one-transaction tree restructure fails | AD-25, AD-13, AD-30 |
| H-2 | HIGH | `wp_schedule`: `stale` not in `outputs`, no DELETE grant, two read shapes | AD-25, AD-27, AD-21 |
| H-3 | HIGH | Early vs late: "the derived start and finish" is never defined | AD-25, AD-26, AD-11 |
| H-4 | HIGH | Compaction deletes a `schedule_run` with no lock and no FK while a Baseline pins it | AD-5, AD-20, AD-26 |
| H-5 | HIGH | `compareWp` undefined for mixed / unequal / full-width WBS segments | AD-28 |
| H-6 | HIGH | AD-27 runs 300 ms inside the lock AD-20 says holds only the write | AD-20, AD-27, AD-7 |
| H-7 | HIGH | `recordDisposition → plan.createWp → recalculate` vs the reachability test's ambiguous roots | AD-27, AD-22, AD-9 |
| H-8 | HIGH | Soft-deleted WPs and their edges: no rule for `inputs`, no FK protection | AD-11, AD-26, AD-25 |
| M-1 | MEDIUM | `anchor` / `computed_finish` stored twice; `anchor` type unstated | AD-26 |
| M-2 | MEDIUM | `hashtext` 32-bit key; Tenant and Tenant+Project key spaces collide | AD-20 |
| M-3 | MEDIUM | The 25 KB/run estimate is conditional on C-1 and C-2 | AD-26 |
| M-4 | MEDIUM | AD-27's single stale path contradicts FR-6a; the import case is unwritten | AD-27, AD-13 |
| M-5 | MEDIUM | The three Project settings are mutable columns that FR-7/FR-28/FR-31 will read directly | AD-25, AD-10 |
| M-6 | MEDIUM | `recorded_pct` type unstated; AD-4 requires `Ratio` | AD-26, AD-4 |
| M-7 | MEDIUM | `wp_dependency.type` is not in `inputs` | AD-26, AD-25 |
| M-8 | MEDIUM | A Baseline pins inputs by reference and effort by copy; FR-16 and FR-28 read different stores | AD-26, AD-11 |
| L-1 | LOW | SQL shapes: NULL-passing CHECK, no self-loop check, MATCH SIMPLE, untyped `non_working_days`, keyword column names, RI-bypasses-RLS error leak | AD-25, AD-3, AD-29 |
| L-2 | LOW | Diagrams: `||--||` cardinality error, missing entities, missing trigger paths | AD-25, AD-26, AD-27 |

## The shortest path to build-safe

Six edits close eight blockers:

1. **AD-26's `inputs`**: the whole WP tree with `is_leaf`, the resolved non-working-day set (or an explicit two-argument signature), `type` on each edge, `recorded_pct` as a `Ratio`, and the engine version. (C-1, C-2, M-6, M-7)
2. **AD-26's engine version becomes a registry** with AD-10's `formulaVersion` semantics. (C-3)
3. **One owner for "done"**: delete `wp_status_event`'s actual-finish and milestone-done roles, or make `work_package.actual_finish` its projection. Amend AD-10, AD-21 and AD-25 together. (C-4)
4. **AD-10's split pin classifies `schedule_run_seq`**, and the closure test gains a cross-pin consistency assertion. (C-5, M-5)
5. **A write-site test** over the scheduling-input columns, plus the same repository fence AD-25 gives the outputs. (C-7)
6. **AD-29 names the fan-out** as a per-(tenant, project) job with one lock per transaction; AD-20's "every write" covers compaction; the run references become declared foreign keys. (C-8, H-4)

`cause` (C-6) is a seventh, and it is a model change rather than a wording change: the run records a trigger kind plus what changed; FR-28's per-WP cause is a derivation. It should be settled before the FR-28 story is cut, not during it.

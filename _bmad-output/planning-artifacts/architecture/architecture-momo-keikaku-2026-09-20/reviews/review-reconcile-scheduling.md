---
title: 'Reconcile review — scheduling update: load-bearing inputs vs ARCHITECTURE-SPINE.md'
created: 2026-09-20
reviewer: 'bmad reconcile lens (scheduling), run against the spine as of 2026-09-20 (scheduling update)'
scope: >
  ARCHITECTURE-SPINE.md (744 lines, read in full) reconciled against:
  sprint-change-proposal-2026-09-20.md A-1…A-6 and §5 Success criteria;
  prd.md FR-5, FR-6a, FR-6b, FR-7, FR-9, FR-10, FR-11, FR-14, FR-15, FR-16, FR-28, FR-30,
  FR-35, FR-39, FR-43, NFR-A1, NFR-C1, NFR-P1, §3 Glossary, §7.3, §8.3, §13 Decision Log, OQ-13;
  addendum.md A.1 and A.5; review-readiness.md Part 4 (`bmad-architecture` conditions).
  Checked against the CURRENT PRD text, not review-readiness's older snapshot: R-1 is resolved
  (FR-6b reads the Recorded figure only) and R-2 is closed (FR-28 has seven causes).
verdict: >
  Needs amendment before stories are cut. The spine lands the STRUCTURAL half of the change
  (A-1…A-5, OQ-13, the one-writer rule enforced against the schema, the migration) at a standard
  above what was asked. It drops most of the SEMANTIC half of FR-6b: the critical path is never
  defined, Float's sign rule and the "a violation stays on its own WP" never is stated, summary
  roll-up is absent, the Data Date's three guards are absent, and two ADs give the actual finish
  two different homes. Two CRITICAL, ten HIGH, nine MEDIUM, four LOW.
---

# Reconcile review — the scheduling update against its inputs

## Verdict

**Needs amendment. The mechanism landed; the meaning did not.**

The 2026-09-20 update (AD-25 … AD-30) is strong where the sprint change proposal asked for structure. A-3's
"one date write path" is delivered structurally rather than by convention (the columns are dropped, so there
is nothing to write); A-4's pinning is delivered by reference to an append-only `schedule_run`, which is
better than the copy the proposal asked for and the spine says why; OQ-13 is answered with a named function,
an enumerated set of call sites and a test. The header line required by PRD §7.3 is present and correct.

What did not land is the part of FR-6b that is prose rather than schema. The PRD spent two adversarial
reviews fixing the *semantics* of the engine — what the critical path is, when Float may be negative, where a
violation's cost is allowed to land, how a summary row gets its dates, what may and may not move the Data
Date — and §8.3 says in terms that "the expensive parts of a scheduler are semantics rather than features".
Almost none of that reached the spine. Two builders obeying every AD to the letter will produce two different
critical paths, and FR-15's and FR-35's ordered-set comparisons will then compare two different sets — which
is the exact failure AD-28 was written to prevent, surviving one level up from the tie-break.

Severity key:
- **CRITICAL** — the spine contradicts itself or a headline PRD promise; a builder cannot proceed without guessing.
- **HIGH** — a stated, testable PRD consequence has no home in the spine, or two builders will diverge silently.
- **MEDIUM** — likely rework, or a claim the spine makes that another of its own rules defeats.
- **LOW** — a sentence would close it.

---

## CRITICAL

### C-1. The actual finish has two homes, and the spine picks neither

**Input — PRD §3 (Milestone):** "an **actual finish** recorded when the work is done — there is no separate
'done date', and 'done' means the WP has an actual finish (FR-5)".
**Input — FR-30:** "Percent Complete is capped at 99% until the WP has an actual finish (FR-5), which is what
'complete' means."
**Input — FR-31:** "Schedule is at least amber when any Milestone is past its Baseline date and has no actual
finish — which is what 'not done' means (§3, FR-5)".

**Spine, AD-25 (line 445):** "`actual_start date NULL`, `actual_finish date NULL`. `completed_at` and
`milestone_done_at` are **dropped**: PRD §3 settles that a WP has one finish date and that 'done' means it has
an `actual_finish`." — i.e. the actual finish is a **mutable column on `work_package`**, class
`mutable_audited`, reaching compute only through `schedule_run.inputs`.

**Spine, AD-21 (line 393), unamended:** "`wp_status_event` — WP marked complete (**which lifts the 99% cap and
sets the actual finish**, FR-30/FR-5) and Milestone done date (the FR-31 Schedule amber rule)".
**Spine, AD-10 (line 215):** `ComputationInputs` still pins "`wp_status_seq_max` (WP marked complete and its
actual finish, Milestone done date)".

**Why it is CRITICAL.** These cannot both be true. If the column is the truth, then `domain/evm` reads a
`work_package` column for the 99% cap and `domain/health` reads one for the milestone rule — which breaks the
spine's own AD-21 rule ("A `work_package` column may be mutable only if no domain compute function reads it")
and fails AD-10's closure test, the test the spine calls "what makes FR-35 mechanical rather than
aspirational". If the event is the truth, then the scheduler (reading `actual_finish` from
`schedule_run.inputs`) and the EVM/Health layer (reading `wp_status_event` at `wp_status_seq_max`) hold two
actual finishes that can disagree, and AD-25's "a WP has one finish date" is false. AD-25 amended AD-21's
*conclusion* (dropping `completed_at`) without amending AD-21's *text*, and nothing in AD-26 or AD-30 resolves
it. AD-30's migration list does not mention `wp_status_event` at all.

**What a decision has to say:** which store holds the actual finish; if it is the column, how FR-30's cap and
FR-31's milestone rules satisfy the closure rule (e.g. they read it only from `schedule_run.inputs` via
`schedule_run_seq`); and what remains in `wp_status_event` afterwards.

### C-2. The critical path is never defined — only ordered

**Input — PRD §3 (Critical Path):** "the WPs whose Float equals the **minimum Float measured against that
finish** — zero on a plan with slack, negative on a plan that cannot meet a Project finish the PM set. **It is
deliberately not defined as zero Float**, because a late plan has no zero-Float WPs and the most critical work
would drop off the path exactly when the plan is in trouble. It is equally deliberately not defined against
Constraints".
**Input — FR-6b:** "The **critical path** is the set of WPs whose Float equals the minimum Float measured
against the anchor above … **It is never the zero-Float set, and it is never displaced by a constraint
violation.**"
**Input — §13 (second adversarial review):** "**the critical path is the minimum-Float chain, not the
zero-Float chain**".

**Spine:** `wp_schedule(… float_days, is_critical, …)` (AD-25). AD-28: "**The critical path**, emitted as a
list ordered by early start ascending, then `compareWp` — which is what FR-15's and FR-35's ordered-set
comparisons actually read." AD-26 lists "the critical path as an ordered list" in `outputs`. The words
*minimum Float*, *zero Float* and *negative* appear nowhere in any scheduling AD; "Float" appears three times,
all about units and ordering.

**Why it is CRITICAL.** The spine fixes the *order* of the critical path to the character and leaves its
*membership* to whoever writes `is_critical`. The textbook implementation — `float_days == 0` — is the one
reading the PRD explicitly forbids, and it is the one a builder with no other instruction will write. The
consequence is precisely what AD-28's own "Prevents" clause claims to stop: FR-15's re-derivation test and
FR-35's reproduction test compare the critical path as an ordered set, and two builders would be comparing two
different sets, deterministically and reproducibly wrong. This is the single most load-bearing sentence of the
whole amendment (it is the reason §13 records the constraint-type reversal as acceptable) and it did not land.

**Also missing with it:** Float's sign rule — "**may be negative** — but only ever because the plan cannot meet
a **Project finish** the PM set" (FR-6b, §3 *Float*). The spine says Float is "whole working days as
integers" and nothing about its sign.

---

## HIGH

### H-1. "A violation stays on the WP that owns it" — the invariant the constraint-type reversal was bought with

**Input — FR-6b:** "**A violation stays on the WP that owns it.** An unmet *must finish on* does **not** push
negative Float onto that WP or onto anything upstream of it, and does not change any other WP's Float. This is
a deliberate choice against the more common CPM behaviour…"
**Input — addendum A.5:** "An unmet *must finish on* is recorded as a violation row against its own WP, with
the days late and the driving chain, and **must not be modelled as negative Float on that WP or upstream of
it**."
**Input — §3 (Constraint):** "it changes no other WP's Float".

**Spine:** AD-26 stores "the constraint-violation rows with their days late and driving chain"; AD-28 orders
them "working days late descending, then `compareWp`". Nothing states the prohibition. The word "upstream"
does not occur in the document.

Storing the violation as its own row does not by itself stop an implementer from also lowering the WP's late
finish to the constraint date — which is the default CPM behaviour and would make Float negative on that chain
and hand FR-31's Negative-Float rule a false red. The PRD and the addendum both state it as a "must not"; the
spine records the artefact and drops the rule.

### H-2. Summary Work Packages have no dates

**Input — FR-5:** "**Roll-up:** a summary WP's dates are the earliest start and the latest finish among its
descendants, and its effort is their sum. Summary dates are an output of the recalculation and are never read
back into it (FR-6b)."
**Input — §3 (Work Package):** "A summary WP … its dates and effort are a pure roll-up of its children, an
output of the passes and never an input to them."
**Input — FR-7:** the tree grid "shows, per WP: the derived start and finish…".

**Spine:** AD-26's `inputs` are "**Per leaf WP**: …"; `outputs` carries "the per-WP result" without saying
which WPs. AD-25's `wp_schedule` has one row shape and no mention of leaf versus summary; the ER diagram draws
`WORK_PACKAGE ||--|| WP_SCHEDULE`. The words "roll-up"/"rolled up" appear once in the whole spine, about
FR-33 Department roll-ups (Post-Q1).

Roll-up is a third thing the passes produce, it is the only thing most rows of FR-7's tree grid display, and
Divergence (AD-11) compares "`baseline_wp` with the current `wp_schedule`" — `baseline_wp` is described as
"per leaf WP" too, so a summary-level Baseline comparison column has no source on either side. Silently
absent.

### H-3. The Data Date's three guards are absent — and they are the whole point of FR-43

**Input — FR-43:** "**A Project is created with none.** … it **defaults to today**, never to a date read out of
the plan's contents. … **It is never advanced automatically**, because advancing it re-dates every remaining
WP." / "**A Data Date is never set earlier than the latest actual finish in the Plan.** An attempt is rejected
with the WPs that block it".
**Input — §3 (Data Date):** "**It is the only thing that advances the plan through time**."
**Input — FR-10:** the preview "proposes … **today** as the Data Date. The Data Date is never proposed from the
file's contents".

**Spine:** AD-25 line 449 — `data_date date NULL`, audited, triggers a recalculation. AD-27 lists it as a
trigger. That is the entire treatment.

Three testable consequences with no home: the never-automatic rule (with no rule, a future "advance the Data
Date at the Period boundary" job is not forbidden by anything — and AD-15 already runs an hourly worker tick
that the spine is otherwise careful to keep away from the plan); the default-to-today rule (which also needs a
`Clock` read, and AD-1 bans clock reads outside `adapters/clock`, so the path needs naming); and the
not-before-the-latest-actual-finish rejection, which is a cross-row validation the spine places nowhere.
FR-43 exists because the Data Date is the only lever that moves the plan through time; the spine models it as
an ordinary nullable column.

### H-4. Bootstrap: a Project that cannot yet be scheduled collides with "an edit that cannot be scheduled is not persisted"

**Input — FR-43:** "**Project start** is mandatory before a Project can be scheduled. A Project with none shows
a 'no project start yet' state in place of dates, **and FR-6b does not run**."
**Input — FR-10:** "if the Project has no Project start or Data Date, the preview asks for both before it will
commit."

**Spine — AD-27:** "**Execution is synchronous and inside the edit's own transaction** … **An edit that cannot
be scheduled is not persisted.** Validation (AD-25) and the passes run in the same transaction as the edit, so
a rejected cycle, an ancestor/descendant link or a summary endpoint rolls the edit back with its reason."

A Project is created with no Project start and no Data Date (FR-43). Under AD-27 as written, the first WP the
PM creates triggers `recalculate`, which cannot run, and the edit is rolled back — the PM cannot build a plan
at all. The intended reading is obviously that "FR-6b does not run" is a third outcome, neither success nor
rollback, but the spine never names it: there is no "unscheduled" run state, `wp_schedule` has `state` and
`not_schedulable_reason` per WP but no Project-level equivalent, and AD-13's `confirmImport` preconditions do
not include FR-10's Project-start/Data-Date gate. Two builders will pick two different behaviours here on day
one.

### H-5. Deleting a leaf WP with dependencies

**Input — FR-5:** "**Deleting a leaf WP with dependencies:** its incoming and outgoing edges are deleted with it
and are listed in the confirmation, with the WPs at the other end. **They are never re-linked
predecessor-to-successor**, because an edge the PM never drew is an edge nobody can explain later".

**Spine:** AD-9 — "`deleteWp` is a `plan` use case that calls `mapping.reassign(...)` and
`mapping.disableRulesTargeting(wp)` in one transaction". AD-11 — "A deleted WP is soft-deleted (`deleted_at`)
so history resolves." AD-25 defines `wp_dependency` with composite foreign keys into `work_package`.

Edges are not mentioned in either place. A soft delete does not remove them, so a deleted WP keeps live
predecessor and successor rows that `schedule_run.inputs` will carry into the next run — and the "never
re-linked" rule, which the PRD calls out by name in §13's "named and counted rather than approximated" list,
has no statement anywhere. This is both a missing requirement and a latent defect in the delete path.

### H-6. Actual dates have no enforced writer set, and "first observed activity" is absent from the spine

**Input — addendum A.1:** "**Actual dates are inputs with exactly two writers: the PM and the confirmed Excel
import** (PRD FR-5, FR-9). Ledger activity is surfaced as *first observed activity* — a display-only proposal —
and is never persisted as an actual date. This is what keeps the hourly snapshot pipeline out of the schedule
entirely."
**Input — §3 (First observed activity):** "It is **display-only evidence** … It is never itself an actual date
and never reaches the scheduler."
**Input — PRD §4.2:** "Actual dates are inputs, not derived dates, and they have exactly two writers."

**Spine:** the structural guarantee AD-25 is so careful about — *delete the column so no other module has one
to write* — applies to derived dates only. `actual_start` and `actual_finish` are ordinary `mutable_audited`
columns on `work_package`, writable by any `app` use case. The only protection is one clause in AD-9 ("never
call `recalculate` and never write an actual date"), and AD-27's two tests police `recalculate` call sites and
reachability, not actual-date writes. The phrase "first observed activity" does not appear in the spine at
all, so the one place the ledger touches the plan — as a proposal the PM accepts — is unmodelled.

FR-6b's single-writer promise has two halves; the spine mechanised one and left the other as prose, in a
document whose whole thesis (AD-25's own "Prevents") is that prose is not a mechanism.

### H-7. The closed trigger set is tested in two directions; the third direction decides whether the plan is ever stale

**Input — NFR-C1:** "a displayed schedule is never stale against the inputs it was derived from."
**Input — FR-6b:** "The schedule is recalculated automatically whenever a scheduling input changes… **No user
action is required**."

**Spine — AD-27:** "A *call-site* test enumerates the callers of `recalculate` and fails on any caller outside
that list. A *reachability* test walks the static call graph … and fails if `recalculate` is reachable from any
of them."

Both tests catch a recalculation that should not happen. Neither catches a scheduling-input write that does
not recalculate — a new `app/plan` use case that sets `duration_days`, or a maintenance backfill of
`constraint_date`, leaves `wp_schedule` silently stale and no CI gate fires. The symmetric mechanism exists
and is cheap (bind write access to the five `work_package` input columns, `wp_dependency` and the three
`project` columns to the use cases in AD-27's list, the way `db/repositories/schedule` is already bound to
`app/schedule`). The spine gave the derived side a structural guarantee and the input side a list.

### H-8. AD-5's retention deletes the rows AD-26 attributes FR-28 and FR-16 from

**Input — FR-28:** "Every WP whose Current Plan dates have moved since the previous Review is marked with one
of exactly seven causes".
**Input — FR-16:** "**Every date change is attributable.** For any WP whose dates differ between two Baseline
versions, the comparison names at least one input change from the list above that accounts for it. A plan that
moved for no recorded reason is the failure this requirement exists to prevent."

**Spine — AD-26:** "**FR-28's date movement** is a diff of two runs' `outputs`, **attributed from the `cause` of
each run between them**."
**Spine — AD-26 / AD-5:** "Compaction may delete a `schedule_run` only when no `baseline_version`,
`published_snapshot`, open Review or unexpired export references it **and it is not among its Project's last
two runs**."

The runs "between them" are by definition the ones nothing references — an ordinary week of PM edits — and
after the second one they are not among the last two either. So the retention rule permits deleting exactly
the rows the attribution reads. A Review opened after compaction, or a comparison of two Baselines a month
apart, loses its causes and FR-28's "the list is complete" becomes untrue in a way no test would catch.
Either the `cause` of every run must survive its `outputs` (a narrow retained projection), or retention must
keep every run between two referenced runs.

### H-9. The spine's "NEEDS FOUNDER DECISION" block re-opens three decisions the PRD already records

**Input — PRD FR-31:** "**Default thresholds** (Tenant defaults, **which a Project can override**; an override
is recorded and shown next to the indicator — **founder decision, 2026-09-20**)". PRD §13: "Health thresholds
are Tenant defaults with per-Project overrides (FR-31)."
**Spine, Open Questions:** "**NEEDS FOUNDER DECISION — Health threshold scope.** PRD FR-31 says thresholds are
configurable *per Tenant*, so the spine stores them in `tenant_setting_event` only. The rubric review
recommends Tenant defaults *plus* optional Project overrides. **Adding Project overrides is new PRD scope**".

That is a straight contradiction with the current PRD, and it propagates into the model: AD-10 pins Health
thresholds via `tenant_setting_seq_max` only, and AD-21's event list has no per-Project threshold store, so
FR-31 as written today cannot be pinned or reproduced (FR-35).

The same staleness affects two more:
- **FR-12.** The spine asks the founder to confirm an interpretation of a sentence — "FR-12 says 'adjusting
  entries are appended to the costing'" — that the current FR-12 does not contain. FR-12 now reads: "the
  Actuals Ledger is left untouched and money is recomputed against the pinned Rate history … **(founder
  decision, 2026-09-20)**", which is exactly what AD-10 does. The open question should be closed, not asked.
- **NFR-D1.** PRD §13: "The Tenant deletion path ships in R0 (NFR-D1)" and NFR-D1 says so in the body. The
  spine's Deferred keeps `purgeTenant` in R1 and its Open Questions asks the founder to "confirm R0 can ship
  without it".

Three of the spine's five founder-decision items are answered in the PRD's decision log. Left as they are,
they will be re-litigated at sprint planning as if they were open.

### H-10. FR-31's Schedule Indicator now reads the scheduler, and the spine still wires it to the old rule

**Input — FR-31:** four Schedule rules, three of them new: "**Milestone slip, forecast:** Schedule is at least
amber when a Milestone's **derived** date (FR-6b) is later than its Baseline date"; "**Negative Float:**
Schedule is red when the Project's minimum Float is negative … **Where no Project finish is set, Float is
relative, this rule cannot fire, and the indicator says so**"; "**Constraint violation:** … at least amber when
any *must finish on* constraint is unmet, and **red** when the unmet constraint belongs to a Milestone."

**Spine:** the only FR-31 schedule hook is AD-21's "`wp_status_event` — … Milestone done date (**the** FR-31
Schedule amber rule)" — the single rule FR-31 had before the amendment. Nothing says `domain/health` reads
`schedule_run.outputs`; AD-10's closure rule would permit it (the run is pinned by `schedule_run_seq`) but the
spine never states the dependency, and the minimum-Float quantity C-2 leaves undefined is an input to a red.

---

## MEDIUM

### M-1. No CI gate tests that the engine is right, only that it is self-consistent

AD-19's four scheduler gates are: the trigger call-site test, the `recalculate` reachability test, the
shuffled-input determinism test, and `recalculate(run.inputs) === run.outputs`. Every one of them passes for
an engine that computes the wrong dates, provided it computes them consistently. There is no golden
scheduling corpus (the "Tests" convention seeds golden cases for EVM only, "from the PRD UJ-3 numbers"), and
OQ-11 explicitly says the engine's "correctness is expressible as table-driven tests". FR-6b's forward/backward
pass rules, the three progress states, lag in working days, out-of-sequence handling and the violation
arithmetic all need fixtures naming expected dates. This is what makes success criterion 1 uncheckable (§5
below).

### M-2. AD-26 shrinks `baseline_wp` below what AD-11 and §3's BAC need

**AD-11:** `setBaseline` copies "per leaf WP the derived dates, the effort, **the assigned Resources**, the
milestone flag, the Catch-all flag **and the Rate-derived cost**".
**AD-26:** "`baseline_wp` keeps **only** the cost projection PV, BAC and Divergence read — `start`, `finish`,
`baseline_mh`, `is_milestone`, `is_catch_all`", and AD-30's migration "**rewrites** … `baseline_wp` down to
AD-26's cost projection".
**§3 (BAC):** "Its money form sums each leaf WP's Baseline hours × the Rate in effect at the Baseline date. **The
hours are split equally across the WP's assigned Resources**, and unassigned WPs use the Project default Rate."

The assigned Resources and the Rate-derived cost are in AD-11's list and out of AD-26's, and AD-26's is the
one the migration implements. BAC in money is then not computable from the pinned copy.

### M-3. The *Plan* Disposition's date behaviour is specified in FR-29 and unstated in AD-22

**FR-29:** "**Its dates come from the work already done, once the PM says so.** … the action proposes an actual
start from their **first observed activity** (FR-5) and a duration of the working days from there to the Data
Date. The PM accepts or changes both in the same dialog." and "**It does not move the plan** … the
recalculation it triggers touches nothing but the WP itself."

**Spine:** AD-22 describes `recordDisposition` as `plan.createWp` + `mapping.map` + one `disposition_event`,
with no mention of the proposal, of the duration, or of the recalculation that AD-27's "a WP created" trigger
implies fires inside the Review transaction. Read beside AD-9's flat "Mapping, unmapping, rule evaluation …
never call `recalculate` and never write an actual date", AD-22 reads as forbidding what FR-29 requires. The
carve-out is real and defensible — the write is a PM action routed through `plan` — but it has to be written
down, including that the recalculation happens under the same AD-20 lock inside the Review.

### M-4. FR-39 must export the history of three columns the spine made mutable

**FR-39:** "the Project start, Project finish and Data Date, **with their history** (FR-43)".
**Spine, AD-25:** the three are "plain columns on `project` … deliberately *not* events … Every change is
audited with its previous value (NFR-A1, AD-14)".

So the history exists only in `audit_log`, and no AD says `app/export` reads it or what the audit payload
shape is. NFR-A1 also requires, for actual dates, "the previous value **and the source** — typed, imported
(FR-9), or accepted from a first-observed-activity proposal" — a payload requirement AD-14 does not carry
(its rule is "`audit.record(ctx, action, target, payload)`" with `action` a closed enum and `payload`
unspecified). FR-16's plan-level diff is fine (it reads two runs' `inputs`); the export is not.

### M-5. FR-10's schedule preview has no named path

**FR-10:** "the preview shows … **once the Project start and Data Date are confirmed — the dates the scheduler
will produce**" and, per row, "the remaining duration that follows".

AD-26 makes `recalculate(inputs) → outputs` a pure function, so a dry run over draft inputs is possible — but
AD-25 and AD-27 describe `recalculate(projectId)` only as a use case that writes a run inside the committing
transaction. The preview needs the pure form exposed (no `schedule_run` written, no lock taken) and the spine
should say so, or a builder will either commit-then-show or skip the preview dates.

### M-6. `recorded_pct` has no named source, and two pinned event tables are missing from AD-21's list

AD-26's `inputs` carry `recorded_pct` per leaf WP and AD-27 leans on it hard ("a field the Observed figure has
no writer for"), but no AD says which table holds the Recorded Percent Complete. By elimination it is
`pct_override_event` (AD-5 lists it insert-only; AD-10 pins `pct_override_seq_max`) — yet AD-21's enumeration
of "**The event tables that make AD-10's closure rule true**" omits both `pct_override_event` and
`disposition_event`. The list is the registry the closure rule is checked against, so an omission there is not
cosmetic.

### M-7. The spine ships three constraint types without recording that it is departing from the approved proposal

Sprint change proposal §3: "Constraint types beyond ASAP | must-start-on / must-finish-on are Post-Q1", and
§5's last success criterion is "Nothing in the excluded list of §3 has been built."

The spine builds `asap | must_start_on | must_finish_on` (AD-25) and its Deferred says only "constraint types
beyond **the three in FR-5**". That is correct against the current PRD — §8.3 and §13 record it as a
"**second deliberate reversal**", founder-confirmed — but the spine never cites the reversal, so anyone
checking the spine against the approved proposal reads a violated exclusion. One sentence in AD-25 or Deferred
("PRD §13's second reversal, 2026-09-20, supersedes the proposal's §3 row") closes it. Related: the spine's
Deferred bullet on taking §8.3's first cut is good and should stay.

### M-8. A-6 did not land in the file it names

A-6 (assigned to the Architect in §5's handoff table): "Add to **the brief's** 'Commitments that cannot be
retrofitted': *plan dates are derived from pinned scheduling inputs and owned by the scheduler; no other module
writes them.*"

`brief.md` line 73's commitment list still has four bullets (multi-tenant model, Resources across Projects,
cost on both axes, separate ledgers) and no scheduling commitment; lines 58 and 65 are unchanged (C-1, C-2 —
which §5's table assigns to nobody). The commitment *is* recorded in `addendum.md` A.1, in exactly the right
words, and AD-25 implements it. So the substance landed and the named artefact did not. `brief.md` is not in
§4.F's do-not-modify list.

### M-9. Write amplification is the one sizing question A.5 asked for by name, and it is unanswered

**A.5:** "The write amplification of **restamping up to 500 date rows per edit** is an architecture concern to
size, not a requirement to renegotiate."

AD-26 sizes the `schedule_run` jsonb ("about 25 KB per run … [ASSUMPTION: measured in the first scheduler
story]"). Nothing sizes the `wp_schedule` upserts — up to 500 rows per edit, inside the per-Project exclusive
lock, inside NFR-P1's 500 ms p75 / 1 s p95 edit budget, with an ingest for the same Project queued behind it
(AD-27 accepts that consequence explicitly). The estimate that is given covers the cheaper of the two writes.

---

## LOW

### L-1. The anchor is stored on the run and not projected where Float is shown
FR-6b: "**Which of the two was used is shown wherever Float is shown**". `schedule_run` carries `anchor` and
`computed_finish` (AD-26) — good, and it is exactly what A.5 asked for — but `wp_schedule`, the projection
FR-7's grid reads, carries `float_days` without it. A note that the grid reads the anchor from the run it
projects would close it.

### L-2. The "not schedulable yet" block is half-specified
FR-6b: a leaf WP with no duration "is excluded from both passes and from the critical path, **its successors
are driven from its predecessors as though it were absent**, and it blocks a Baseline". The spine has the
block in `outputs` (AD-26), the `not_schedulable_reason` column (AD-25) and the Baseline block (AD-11); the
pass-through rule for its successors — the only part that changes other WPs' dates — is absent.

### L-3. FR-32's two finish dates
`computed_finish` is stored on the run ✓ and the spine uses the PRD's exact wording (*computed finish* vs
*Project finish*) throughout, which is the distinction §3 insists on and it held. The **trend finish** —
"Baseline start + (Baseline duration ÷ SPI)", evaluated "in whole working days and rounded up" per FR-32 —
has no home: `domain/forecast` is listed in the closure rule but the quantity, its integer discipline and its
"never earlier than the next working day after the as-of date" bound are not mentioned.

### L-4. §3's *Duration* / *effort* distinction is in A-2 and the PRD and not restated in the spine
AD-25 adds `duration_days` beside the existing effort field without restating that they are independent (A-2:
"40 man-hours may be 5 days for one person or 2 days for two and a half"), and §8.3 excludes effort-driven
scheduling. The Deferred list covers it; one line in the Scheduling-units convention would make it
unmissable.

---

## A-1 … A-6 of the sprint change proposal

| Item | Outcome | Detail |
|---|---|---|
| **A-1** Dependency edge table | **Landed, strengthened** | AD-25 defines `wp_dependency` with the proposed columns plus composite FKs that keep both endpoints in one Project ("which is how FR-6a's cross-project rejection is enforced rather than remembered") and `pred_is_leaf`/`succ_is_leaf` FK columns that make the leaf-endpoint rule declarative. `type` reserves `SS|FF|SF` as R0-rejected values, per §8.3. |
| **A-2** Scheduling inputs on `work_package` | **Landed, extended by the PRD** | AD-25 adds `duration_days`, `constraint_type`, `constraint_date` as proposed, plus `actual_start`/`actual_finish` (FR-5/FR-9, post-proposal), plus a leaf-only `CHECK`. Extension is PRD-sourced, not spine-invented. |
| **A-3** One date write path | **Landed differently — better, and defensibly** | The proposal asked for a convention plus a grep. AD-25 removes the columns entirely and puts derived dates in `wp_schedule`, owned by `app/schedule`, with the repository fenced by `dependency-cruiser` and the grep demoted to "a cheap second net, not the mechanism". This also satisfies review-readiness's "enforced against the schema, not only the code". |
| **A-4** Baselines pin inputs | **Landed differently — defensible, with one regression** | Instead of copying inputs onto `baseline_wp`, AD-26 has `baseline_version` reference an append-only `schedule_run` and AD-5 makes that reference permanent, "so the pinned input set has one representation rather than two that can drift apart". That is a stronger answer to FR-15 than the proposal's, and the spine argues it explicitly. The regression is M-2: the shrunk `baseline_wp` drops the assigned Resources and Rate-derived cost. |
| **A-5** Determinism, explicit tie-break | **Landed** | AD-28: `compareWp` (WBS code by segment, NFKC text fallback, then `wp_id`), one ordering site, every reported artefact enumerated, plus the shuffled-input byte-identity test. AD-4 extends the integer discipline to durations, lags, Float and remaining duration. A.5's "the origin used must be recorded with the result" is met by `schedule_run.anchor`. |
| **A-6** Record the commitment in the brief | **Not landed where it was assigned** | See M-8: the substance is in `addendum.md` A.1 and AD-25; `brief.md`'s commitment list is untouched. |

---

## The three `bmad-architecture` conditions (review-readiness Part 4)

### 1. "Do not design the recalculation trigger set until R-1 is decided … A.5's 'closed set' and its enforcing test are unimplementable as written" — **genuinely discharged, with one direction missing**

R-1 is resolved in the PRD (FR-6b reads the Recorded figure only), and AD-27 designs against that resolution
rather than the old snapshot: the trigger list matches FR-6b item for item; the Observed figure is excluded
structurally (`schedule_run.inputs` carries `recorded_pct` alone, and `domain/schedule` may not import
`domain/attribution`, enforced by `dependency-cruiser`); and the spine diagnoses A.5's test correctly —
"Addendum A.5 proposed only the second; on its own it cannot close the set, because the snapshot path never
calls the function — it changes an input the function reads." The second half of the condition is answered
too: there is no background path, and AD-27 states the consequence ("NFR-P1's budget is written for
interactive edits only", so no second budget). This is the best-discharged item in the update. What is missing
is the third direction (H-7) and the bootstrap case (H-4).

### 2. "OQ-13's tie-break rule, which FR-15's and FR-35's tests both assert against" — **genuinely discharged**

AD-28 names the rule, names the single site, enumerates every reported artefact that passes through it
(driving predecessor — and it records *all* tied drivers, not one — critical path, violation list,
out-of-sequence list, not-schedulable block, rejected cycle rotation), explains why the passes' dates are
order-independent anyway, and adds the determinism gate to AD-19's CI list. It also closes the adjacent trap
the PRD did not raise: "**A WBS code orders; it never identifies**", with `wp_id` as the match key across runs.
The frontmatter's `resolves: [OQ-13]` is earned. The one caveat is C-2: the tie-break is settled, and the set
it orders is not defined, so the ordered-set comparison OQ-13 exists to protect is still not well-defined
end-to-end.

### 3. "The migration — every scheduling column is missing from `schema.ts`, and the one-write-path rule must be enforced against the schema" — **genuinely discharged**

AD-30 lists adds, drops and rewrites explicitly; registers every new table in `table-classes.ts` in the same
change so AD-21's CI gate catches a silent arrival; deletes rather than migrates a pre-amendment Baseline, for
the right reason ("migrating it would fabricate the inputs it never had"); spends the expand/contract
exemption once and says so; and is honest about the rest of the gap between the 17-table repo schema and the
spine's model rather than implying the migration closes it. Schema-level enforcement of the write path is the
dropped `start`/`finish` columns plus the role grants in AD-25. Gap: AD-30's column list does not mention
`wp_status_event`, which C-1 leaves undecided.

---

## Success criteria (§5 of the proposal): is each mechanically checkable from the spine?

| Criterion | Checkable? | Why |
|---|---|---|
| Editing one task's dates moves its dependents automatically, respecting JP and VN working days | **No** | The capability is modelled (AD-25 … AD-29) but no gate asserts it. AD-19's four scheduler gates all test self-consistency; there is no golden scheduling corpus (M-1). The criterion's own wording is also pre-amendment — the PM no longer edits dates; the equivalent is editing a duration or an actual date. |
| Float and the critical path are computed and visible | **Partly** | Computed: `float_days`, `is_critical` (AD-25), ordered by AD-28, surfaced in FR-7's grid via the Capability map. But C-2 leaves *which WPs are on the path* undefined and Float's sign rule unstated, so "computed" cannot be checked against a definition. |
| Cyclic dependencies are rejected at entry | **Yes** | `domain/schedule/validate` (AD-25) with two call sites, plus AD-27's "an edit that cannot be scheduled is not persisted" and AD-28's canonical cycle rotation. FR-6a's other three rules are covered the same way, two of them declaratively in the schema. |
| A grep finds no assignment to `wp.start` / `wp.finish` outside `domain/schedule` | **Yes — vacuously, and deliberately** | The columns no longer exist (AD-25, AD-30); the grep is retained as a second net. This is the criterion the spine over-delivered on. |
| A baseline captured after this change is re-derivable from its pinned inputs alone | **Yes** | `recalculate(run.inputs) === run.outputs` through the AD-4 codec, over every golden Baseline and Published Snapshot, on AD-19's blocking CI list, with AD-5 retention keeping the referenced run permanently and AD-29 pinning a resolved calendar set. This is the strongest thing in the update. |
| Epics and Stories exist; `bmad-sprint-planning` has returned a verdict and a re-derived R0 date | **Out of the spine's hands** | E-1/E-2, OQ-12. The spine does not claim it; worth noting that `status: final` on the spine is fine, but no story may start before step 6 (§5 of the proposal). |
| Nothing in the excluded list of §3 has been built | **Reads as failed on its face; is actually fine** | Three constraint types ship, per PRD §8.3 and §13's second reversal. The spine never cites the reversal (M-7). Everything else in §3's exclusion table is correctly in Deferred, with the "two shapes reserve room and no more" note. |

---

## Contradictions, collected

1. **AD-21 vs AD-25** — the actual finish lives in `wp_status_event` and in `work_package.actual_finish`
   (C-1). Also drags in AD-10's `wp_status_seq_max` and AD-21's own mutable-column rule.
2. **AD-27 vs FR-43** — "an edit that cannot be scheduled is not persisted" vs "a Project with no Project
   start … FR-6b does not run" (H-4).
3. **AD-26 vs AD-5/AD-26 retention** — FR-28's causes are read from runs that compaction may delete (H-8).
4. **Spine Open Questions vs PRD §13** — Health thresholds, FR-12 Rate corrections, NFR-D1 Tenant deletion:
   three decisions recorded in the PRD on 2026-09-20 are re-opened as founder questions, and one of them
   (FR-12) quotes PRD text that no longer exists (H-9).
5. **AD-11 vs AD-26** — two different `baseline_wp` contents; AD-30 implements the shorter one (M-2).
6. **AD-9 vs FR-29** — "Mapping … never writes an actual date" vs the *Plan* Disposition's PM-accepted actual
   start and its local recalculation (M-3).
7. **Spine Deferred vs proposal §3** — three constraint types vs the proposal's ASAP-only exclusion;
   superseded by the PRD, uncited (M-7).

## What is consistent with the current PRD, and worth recording

- FR-28's cause list is **seven** in AD-26 ("`cause` is one of FR-28's seven"), matching the current FR-28 and
  §3 *Divergence*. The spine is on the current text, not §13's older "closed at six" line. R-2 is not an issue
  here.
- FR-6b reads the **Recorded** Percent Complete only, and AD-27 says so in the PRD's own words, including the
  forward-looking clause "a future figure cannot become a scheduling input without a new import edge that CI
  rejects" — which is the mechanism behind FR-6b's "a new evidence-derived figure added later is not a new
  trigger; it inherits this rule". R-1's resolution landed.
- The *computed finish* / *Project finish* wording distinction (§3, FR-32) is preserved exactly; no third
  label appears anywhere in the spine.
- PRD §7.3's required opening line is present and correctly classifies the output as resolving OQ-13 and
  decomposing FR-6a, FR-6b and FR-43, adding no FR, NFR or target.
- Milestones as zero-duration leaves whose target is a `must_finish_on` constraint (AD-25) match §3 and FR-9's
  narrow import exception (AD-13).
- FR-14's calendar versioning, including the national tables, is landed at full strength in AD-29, and AD-29
  withdraws AD-11's now-redundant copy rather than leaving two pinned sets.

---

## Recommended order of amendment

1. **C-1 and C-2 first** — they are one-paragraph decisions that several other findings depend on (H-1, H-10,
   and the meaning of FR-15's and FR-35's ordered-set comparison).
2. **The FR-6b semantics block** — H-1, H-2, H-3, L-2 belong together as an amendment to AD-26's `outputs`
   contract and AD-25's Project-settings rule: define `is_critical`, Float's sign, the violation's
   containment, summary roll-up, the no-duration pass-through, and the Data Date's three guards.
3. **The write-path gaps** — H-5, H-6, H-7: bind the scheduling-input columns the way `wp_schedule` is bound,
   and give actual dates the two-writer rule a test.
4. **H-8 retention**, then **H-4 bootstrap** and **M-3** as transaction-boundary clarifications.
5. **H-9** — close three open questions against PRD §13 rather than carrying them into sprint planning.
6. The MEDIUM/LOW remainder, of which M-1 (a golden scheduling corpus) is the one that changes what CI can
   promise.

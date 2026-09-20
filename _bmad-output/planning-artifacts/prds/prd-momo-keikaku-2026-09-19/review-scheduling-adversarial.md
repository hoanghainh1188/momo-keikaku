---
title: Adversarial review — the 2026-09-20 scheduling amendment (FR-6a / FR-6b / FR-5 / NFR-C1 / §8.3)
created: 2026-09-20
reviewer: adversarial lens, hostile to the change
scope: prd.md as amended 2026-09-20, against sprint-change-proposal-2026-09-20.md and packages/db/src/schema.ts
verdict: the engine is specified; the system around it was not re-amended
---

# Adversarial review — scheduling in R0

The amendment writes a competent CPM specification into FR-6a/FR-6b and pins inputs in the
Glossary and NFR-C1. That part is real work and mostly holds. The failure is at the seams: the
PRD changed *who produces dates* without re-amending the eleven other places that still treat a
WP date as a stored fact a human typed. Six of those are in R0 scope. Two of them break the
scheduler on the first real project, because every one of the founder's five target projects is
mid-flight.

Findings are ordered by severity, not by the question that produced them.

---

## A. Derived dates vs. the rest of the PRD

### A-1. CRITICAL — §4.2 still says the opposite of FR-6b, in the section header that introduces it

§4.2, Description (immediately above FR-5 and FR-6b):

> "The PM builds a Plan either by importing it (4.3) or by creating it in the tool. The PM keeps
> it current by editing it or re-importing it. **v1 has no automatic rescheduling.** Realises UJ-1."

FR-6b, six lines later:

> "The schedule is recalculated automatically whenever a duration, dependency, constraint or
> calendar changes."

This is not a stale cross-reference in a far corner — it is the descriptive text of the section
that contains the requirement. The sprint proposal B-1 replaced FR-6 and B-4 amended §1, but no
one swept §4.2's own prose. Anyone reading the PRD top-down hits the denial before the
requirement. Fix: delete the sentence, replace with the scheduler-owned statement from §1.

### A-2. CRITICAL — the scheduler has no concept of work already done, so it will re-date the past

FR-6b:

> "**Forward pass:** each WP's earliest start is the later of the Project start and every
> predecessor's finish plus lag..."

FR-5:

> "**Actual dates:** a WP's actual start is the time of its first ledger entry. Its actual finish
> is set when the PM marks it complete."

Nothing connects these. The forward pass is defined purely over the graph and the calendar; actual
start, actual finish, "PM marks it complete" and Percent Complete (FR-30) are not inputs to it.
Consequences on a mid-flight project — which is the *only* kind the PRD describes (UJ-2: "the
project is mid-flight"; UJ-1: the client's existing Excel WBS; §8.1: five real founder projects):

- A WP that started three weeks ago and is 60% done is placed by the forward pass at the earliest
  ASAP date its predecessors allow. If its predecessors are also unscheduled-but-done, the whole
  in-flight portion of the plan is scheduled in the future, or in the past, with no relation to
  what happened.
- The critical path computed over that graph is therefore not the critical path of the remaining
  work. It is the critical path of a plan that would be executed from scratch starting at an
  undefined origin (see A-3).
- The PM cannot correct it without a constraint per in-flight WP — which means typing dates again,
  by another name, on every task in flight. That is the exact failure the change was meant to
  remove ("a plan the PM has to re-date by hand is a plan the PM will keep maintaining somewhere
  else", §1).

Every real scheduler solves this with a status/progress date: a data date (as-of), actual start
and actual finish pinning completed and in-progress tasks, and the forward pass running only over
remaining duration from the data date. The PRD has an as-of date for EVM (FR-30) but never
connects it to FR-6b. §8.3 does not exclude progress-aware scheduling — it is not mentioned
anywhere. This is a genuine gap in the engine's definition, not a seam.

Minimum fix: define a data date per Project; state that a WP with an actual start is pinned at it
and scheduled on remaining duration; state that a WP with an actual finish is fixed and does not
move. Alternatively, exclude progress-aware scheduling in §8.3 and state explicitly that in R0 the
schedule is a plan-from-origin projection, not a status-aware forecast — and then accept that the
critical path shown on a mid-flight project is decorative.

### A-3. CRITICAL — the forward pass has no origin and the backward pass has no target

FR-6b names two quantities that appear nowhere else in the PRD:

> "the later of the **Project start** and every predecessor's finish plus lag"
> "latest start and finish are derived from the **Project finish** backwards"

- §3 Glossary, *Project*: "one client engagement. It has one owning Department, one or more
  assigned PMs, one Plan, a Baseline history, zero or more Connectors, and one Visibility Policy."
  No start. No finish.
- FR-1 (create Projects) lists no dates.
- `packages/db/src/schema.ts`, `project` table: `tzOffsetMinutes`, `teireiWeekday`,
  `defaultRateJpy`, `eacMethod`, `calendarJp`, `calendarVn`, `demoAnchor` — no start, no finish.

So a WP with no dependencies and no constraint has no anchor at all, and the forward pass has no
origin. This is not a detail: it is the base case of the algorithm, and NFR-C1 ("the same pinned
inputs always yield the same output") is unsatisfiable without it — an undefined origin is an
unpinned input.

The backward pass is worse, because "Project finish" is genuinely ambiguous between two different
products:
- the *computed* finish (max of the forward-pass finishes), which makes float relative and
  guarantees at least one zero-float path — the conventional CPM reading; or
- a *contractual* finish the PM sets, which makes float absolute, allows negative float, and turns
  the critical path definition in the Glossary into a bug (see C-2).

The PRD picks neither. Two implementers reading FR-6b will build different products, and the
difference is visible to the client in the Gantt.

### A-4. CRITICAL — FR-9 / FR-10 / FR-11 still import, preview and overwrite dates

FR-9:

> "map each column to a field: WBS code or indentation level, name, **start, finish**, effort,
> assignee, milestone, or a Custom Field."

FR-10:

> "The PM can correct values, levels and column mappings."

FR-11:

> "**Conflicts:** for imported fields, the re-imported value wins."

Against FR-6b: "**no other part of the system writes WP dates**", and FR-5: "**Start and finish
dates are not typed.**" The import path is a part of the system, it writes dates, it is in R0, and
FR-11's conflict rule says the imported date *wins* over whatever else is there — i.e. over the
scheduler's output. Three mutually incompatible requirements, all R0.

Worse, the inverse is also broken. FR-6a says:

> "All three are imported from Excel where the source file carries them (FR-9)"

but FR-9's field list has no duration column, no dependency/predecessor column and no constraint
column. FR-6a's third consequence — "Importing a plan whose dependency columns reference unknown
WPs reports them in the Import Preview" — refers to columns FR-9 cannot map. FR-9 and FR-6a were
amended in opposite directions and never reconciled.

This matters more than a wording slip because it is the day-one path (UJ-1) and because client
Excel WBS files overwhelmingly carry dates and rarely carry predecessor columns. The PRD must
decide what happens to an imported start/finish pair: discarded, converted to a duration
(finish − start in working days), converted to a must-start-on constraint, or kept as a
non-scheduling reference column. All four are defensible; none is written down. UJ-1 still shows
the old world ("suggests a mapping ... WBS code, name, start, finish, effort and assignee";
"She fixes one date column's format"; climax "Summary dates and effort roll up") with no mention
of duration, dependencies or a derived schedule — the flagship journey for R0 was not amended.

### A-5. CRITICAL — FR-35 Published Snapshots do not pin the schedule they display

FR-34 publishes the schedule:

> "**Shown by default:** ... milestones; the schedule, as a Gantt to WBS level 2."

FR-35 lists exactly what a Published Snapshot stores:

> "the computed values it displays; the Tracker Snapshot, Baseline version, attribution and
> Visibility Policy it was computed from; any Percent Complete overrides in force; the Health
> thresholds, the EAC Method, the Reporting Period boundaries and time zone, and the formula
> version."

Neither the Current Plan's derived dates nor the scheduling inputs behind them are in that list —
and they are now the most volatile thing on the page, since any duration edit anywhere in the
graph moves them. FR-35's own acceptance test then fails:

> "**Reproduction test:** recomputing a Published Snapshot from its stored inputs and the Actuals
> Ledger reproduces every displayed figure exactly."

A snapshot published Thursday and recomputed Friday, after one unrelated duration edit, will
reproduce a different Gantt. The amendment applied the pin-the-inputs doctrine (NFR-C1) to the
Baseline and forgot the Published Snapshot, which is the artifact the doctrine exists to protect.
R1, but it must be specified now because it constrains the R0 data model.

### A-6. HIGH — the cut order now contradicts the uncuttable requirement

§8.3, cut order:

> "1. Gantt → a tree with date columns."
> "6. Float and critical-path display (FR-6b) → keep the forward pass and automatic recalculation,
>    drop the backward pass and its display."

and:

> "**FR-6b's forward pass is never cut either.**"

Cut 1 fires first and removes the surface where dependency arrows, the critical path and "what the
user sees when dates move" live (sprint proposal D-2). Cut 1 therefore silently executes cut 6 and
most of FR-6a's editing UI, while the text declares the capability uncuttable. Either the Gantt is
no longer cuttable (and the cut order has lost its cheapest item — a material estimate change), or
the PRD must say what dependency editing and critical-path display look like in the tree fallback.

### A-7. MEDIUM — FR-32's forecast finish is now a second, competing project finish

> "Forecast finish = Baseline start + (Baseline duration in working days ÷ SPI)."

Before the amendment this was the only forward-looking date in the product, and labelling it "a
simple trend heuristic, not a PMI formula" was enough. Now FR-6b produces a derived project finish
from the actual dependency graph, and the two will disagree, visibly, on the same screen. The PRD
never says which one the PM or the client is looking at, whether the Schedule Health Indicator
(FR-31) uses SPI-trend or scheduler-derived slip, or what "Baseline start" means at project level
(same undefined quantity as A-3). Separately, `÷ SPI` is a non-integer division inside a product
whose NFR-C1 says "Money and effort are held and computed in integers, never floating point" —
the rounding rule for the forecast date is unstated.

### A-8. MEDIUM — Milestones carry three date concepts and the PRD reconciles none

§3: "**Milestone** — a WP with zero duration, flagged as a milestone, with a **target date** and a
done date." FR-6b: "**Milestones** are zero-duration WPs and participate in the passes normally."
FR-31: "Schedule is at least amber when any Milestone is past its **Baseline date** and not done."

A milestone now has a derived date (from the passes), a target date (typed — by whom, and how does
it differ from a must-finish-on constraint?), and a baseline date. FR-5 says dates are not typed;
the Glossary says milestones have a typed target date. Either the target date *is* a
must-finish-on constraint and should be described as one, or it is a fourth scheduling input that
FR-6a does not capture and the Baseline does not pin.

### A-9. MEDIUM — FR-39's no-lock-in claim no longer holds

FR-39 exports "the Plan", "Baseline versions", and claims:

> "For a given as-of date, the export contains enough data to recompute every EVM Metric outside
> the tool (no lock-in)."

Dependencies, durations, constraints and the effective calendar are not named in the export list,
although FR-6a promises they are "exported with the plan". EVM may survive on baseline dates
alone, but the *plan* can no longer be reconstructed elsewhere — which is a bigger lock-in claim
than EVM, and the one an Excel-refugee buyer will test. Name the scheduling inputs and the
calendar in FR-39, and extend the claim to schedule re-derivation or narrow it explicitly.

### A-10. LOW — Divergence will churn

§3: "**Divergence** — the differences between the Baseline, the Current Plan and actuals, per WP."
With derived dates, a single duration edit shifts the Current Plan dates of every downstream WP,
so Divergence lights up for WPs nobody touched. That is arguably correct behaviour, but the
Reconciliation Review (FR-28) has no notion of "moved because a predecessor moved" vs. "changed by
the PM", and the PM has to triage the difference weekly. Worth a line; not a blocker.

**Where the PRD is fine:** FR-30's PV ("spread linearly over each WP's **baseline** working days")
correctly reads the Baseline, not the moving Current Plan, so EVM's planned value is unaffected by
recalculation. FR-7's Gantt already renders baseline bars against current-plan bars, which is the
right shape for a derived schedule. Both hold.

---

## B. Summary WP roll-up vs. the scheduler

### B-1. HIGH — nothing says which one wins, and both are stated unconditionally

FR-5: "**Roll-up:** summary WP dates and effort roll up from the children."
§3 Glossary: "A leaf WP carries planned effort, a Duration and any Constraint; its dates are
derived by the scheduler, not typed. A summary WP rolls up its children."
FR-6b: "**each WP's** earliest start is the later of the Project start and every predecessor's
finish plus lag" — *each WP*, not *each leaf WP*.

The Glossary implies leaves-only scheduling with summary roll-up, which is the sane reading. FR-6b
does not restrict itself to leaves, and FR-5's own input list is written for *every* WP:

> "For each WP the PM sets: name; **duration in working days**; planned effort in hours; **an
> optional scheduling constraint**..."

So FR-5 permits a duration and a constraint on a summary WP whose dates the same FR says roll up
from children. Three open questions the PRD does not answer:

1. May a dependency attach to a summary WP? FR-6a says only "between WPs" and rejects only
   cross-project links and cycles. If yes, the summary's dates are simultaneously a roll-up and a
   graph node — a well-known source of hidden cycles (a summary depending on a task that is a
   descendant of it) that FR-6a's cycle check, defined over the dependency graph alone, will not
   catch.
2. May a constraint sit on a summary WP, and does it push its children or merely report a
   violation against a roll-up it cannot influence?
3. Does a summary WP's duration mean anything, or is it ignored? If ignored, FR-5 should say so.

Recommendation: restrict duration, constraints and dependencies to leaf WPs in R0, state that
summary dates are pure roll-up and are never an input to the passes, and extend the cycle check to
reject a dependency whose endpoints are in an ancestor/descendant relationship. That is a
one-sentence amendment and removes an entire class of R0 bugs.

---

## C. Scope honesty — §8.3

### C-1. CRITICAL (scope) — R0 ships two constraint types the founder approved as excluded

The approved sprint change proposal, §3, "Explicitly out of R0":

> | Constraint types beyond ASAP | **must-start-on / must-finish-on are Post-Q1** |

The amended PRD, §8.3:

> | Constraint types beyond ASAP, **must-start-on and must-finish-on** | Each additional type
>   multiplies the conflict cases the UI must explain |

and §3 Glossary:

> "**Constraint** — a PM instruction that pins a WP against the scheduler: *as soon as possible*
> (the default), ***must start on***, or ***must finish on***."

The exclusion boundary moved. What the founder approved as ASAP-only is now three constraint
types, in R0, in the sentence whose job is to record the boundary. The PRD's own justification
("each additional type multiplies the conflict cases the UI must explain") is an argument against
the scope it just took on. This is the clearest case of the amendment smuggling work past the
exclusions, and it is the reason C-2 and C-3 below exist at all — ASAP-only has no infeasible
constraints and no negative float.

Either restore ASAP-only for R0, or record the expansion as a deliberate second reversal with the
founder's assent, with C-2 and C-3 specified.

### C-2. HIGH — "reported as a violation" is a much larger requirement than one clause

> "**Constraints are honoured**, and a constraint that cannot be satisfied is reported as a
> violation on the WP rather than silently overridden."

"Honoured" and "reported as a violation rather than overridden" cannot both be unconditionally
true, and the PRD does not say what the scheduler *shows* in the violating case. Unpacked, this
clause requires:

- A decision on hard vs. soft constraint semantics. If must-start-on is hard, a predecessor
  finishing later than the pinned start produces a plan where a successor starts before its
  predecessor finishes — the dependency, not the constraint, is what gets violated, and the Gantt
  shows an impossible plan. If soft, the constraint is silently overridden, which the clause
  forbids. There is no third option that is also simple.
- **Negative float**, which appears the first time a must-finish-on is earlier than the forward
  pass allows. The PRD's definitions then break: "**Float** — a WP's latest start minus its
  earliest start" goes negative, and "**Critical Path** — the WPs whose Float is **zero**" selects
  nothing, so the most critical tasks in the plan drop off the critical path exactly when the plan
  is in trouble. The standard fix (critical path = minimum float, not zero float) is a one-line
  change the PRD has not made, and negative float is not mentioned anywhere.
- Violation propagation and explanation UI: which WP is blamed when the conflict is between a
  constraint here and a dependency chain five nodes back, and what the PM does about it.

None of the three is in the exclusion list, because the exclusion list was written for ASAP-only.

### C-3. HIGH — the exclusion list omits the expensive things FR-6b actually implies

§8.3 excludes resource levelling, SS/FF/SF, effort-driven scheduling, further constraint types and
the what-if sandbox. Those are the right five. But FR-6b as written also requires, none of them
excluded and none of them specified:

- progress-aware scheduling / a data date (A-2) — the single largest omission;
- the Project start and Project finish semantics (A-3);
- constraint-conflict semantics and negative float (C-2);
- calendar versioning, because the baseline pins "calendar" while FR-14 lets the PM freely add
  project-specific non-working days with no versioning and no append-only rule — the first added
  holiday silently changes what a past baseline would re-derive to (see D-3);
- recalculation *scope*: whole-project vs. affected-subgraph. NFR-P1 requires "a full schedule
  recalculation of a 500-WP Project ... under 300 ms (p95)" which implies whole-project, but says
  nothing about concurrent edits or about the write amplification of restamping up to 500 date
  rows per keystroke-level edit.

The exclusion list is honest about the things it names. It is not sufficient to keep FR-6b small,
because the costs are in the semantics it does not name, not in the features it excludes.

---

## D. Baselines

### D-1. CRITICAL — FR-15 and FR-16 were not amended at all

The doctrine was written into §3 Glossary and NFR-C1:

> "**Baseline** — an immutable, versioned record ... of every WP's planned dates and effort, **the
> scheduling inputs those dates were derived from (Duration, Dependencies, Constraints,
> calendar)**, plus the cost derived from Rates."

But the two requirements that actually govern baselines are untouched. FR-15 in full:

> "A PM can set a Baseline from the Current Plan. — A Baseline cannot be edited after it is
> recorded. — Before the first Baseline, the Project shows a 'no baseline yet' state instead of
> EVM Metrics."

FR-16 in full:

> "A PM can Re-baseline. A reason is mandatory ... Every Baseline version is kept, with its author,
> time and reason. Any two versions can be compared WP by WP. Every Published Snapshot records the
> Baseline version it used."

Neither mentions duration, dependencies, constraints or the calendar. The sprint proposal called
A-4 "**the only item that cannot be recovered if deferred**" — and in the PRD it exists only in a
glossary entry and an NFR bullet, not in the requirement a story will be written from. Downstream,
`bmad-create-epics-and-stories` reads FRs. The schema confirms the risk is live:
`baseline_wp` in `packages/db/src/schema.ts` still has only `start`, `finish`, `baselineMh`,
`isMilestone` — outputs, no inputs, exactly the condition the proposal called a doctrine breach.
Move the pinning into FR-15's consequences, verbatim, with a testable re-derivation assertion.

### D-2. HIGH — "compared WP by WP" cannot express a dependency change

FR-16: "Any two versions can be compared WP by WP."

A dependency is an *edge*, not a WP attribute. Remove a link between WP 2.3 and WP 2.4 and
re-baseline: a WP-by-WP comparison shows changed dates on 2.4 and everything downstream, with no
row anywhere that says the link was removed. The PM sees a plan that moved for no recorded reason
— which is precisely the "cannot answer *why* it predicted those dates" failure the amendment was
raised to fix, reappearing one level up in the diff. FR-16 needs an explicit graph diff: edges
added, edges removed, lags changed, constraints added/changed/removed, durations changed, calendar
changed.

### D-3. HIGH — pinning "the calendar" is not pinning the calendar's contents

FR-14: "The PM can add Project-specific non-working days, such as the client company's own
holidays." There is no versioning, no effective-dating and no append-only rule on the Holiday
Calendar — contrast FR-12, where Rates get a dated history precisely so past money re-derives
("money is recomputed against the pinned Rate history ... earlier Published Snapshots reproduce
exactly"). The Glossary pins "calendar" by name only. Add one client holiday in November and every
baseline taken in October re-derives to different dates, silently, while NFR-C1 claims "any
historical plan can be re-derived and explained". The calendar needs the same dated-history
treatment as Rates, or the Baseline must copy the effective non-working-day set.

### D-4. LOW — comparability across the change is a non-issue, and the PRD should say so once

Baselines taken before the amendment are not comparable to ones taken after: the old ones pin
dates only and cannot be re-derived. In practice this costs nothing — the sprint proposal records
"Migrations are pre-production, so there is no data migration cost", the build is paused, and no
real baseline exists. The PRD nowhere says this, so a later reader will assume a migration problem
exists. One sentence in §13 closes it.

---

## E. Actuals, Unplanned Work and the reconciliation half

### E-1. HIGH — the *Plan* Disposition creates a WP the scheduler cannot place

FR-29: "***Plan*** creates a WP in the Current Plan and maps the Tickets to it."

That WP arrives with no duration, no dependencies and no constraint, and with ledger entries that
are already in the past. Under FR-6b it is scheduled at the Project start (undefined — A-3) or
wherever ASAP puts it, i.e. in the future, for work already done. Three unanswered questions, all
R0, all inside the product's wedge:

1. Does creating it trigger a recalculation that moves the rest of the plan during a
   Reconciliation Review, minutes before publishing?
2. What duration does it get, and does the PM have to stop reconciling to do scheduling?
3. Does its derived start contradict its actual start (FR-5: "actual start is the time of its
   first ledger entry")?

The sprint proposal's D-4 asserts "**No change to the Reconciliation Review, Dispositions or
Client View**". That assertion is wrong for the *Plan* disposition specifically, and the PRD
inherited the assumption without testing it.

### E-2. MEDIUM — Schedule Health has two possible sources and the PRD names only the old one

FR-31: "**Schedule**, from SPI and Milestones ... **Milestone slip:** Schedule is at least amber
when any Milestone is past its **Baseline** date and not done."

The scheduler now knows something better and earlier: that a milestone's *derived* date has moved
past its baseline date — a forecast slip visible before the date passes, which is most of the
value of having a critical path at all. FR-31 does not use it. Not a contradiction; a missed
connection that will look like an obvious gap the first time the founder runs a real week. Decide
explicitly whether R0's Schedule indicator is actuals-driven only.

**Where the PRD is fine:** the ledger itself is untouched and should be. FR-25 (deltas from
snapshot windows), FR-42 (Opening Balances, lifecycle) and FR-30's "baselined status is
historical" rule all key off ledger timestamps and the *active Baseline version at the time of the
entry* — none of which moves when planned dates move. Unplanned Work's definition is a function of
mapping and baseline membership, never of dates, so recalculation cannot destabilise it. AC and
Percent Complete are likewise date-free. The reconciliation half genuinely survives the change.

---

## F. Estimate sanity

### F-1. HIGH — removing the date removed the only mechanism that forces a cut

§8.1: "**The 2026-12-15 target is no longer defended.** ... until then this section carries no
date."

§6, *Scope versus one founder*: "*Mitigation:* the R0/R1 split (§8). **The brief requires scope to
be cut again if a gate date slips.**"

The mitigation for the project's own largest risk is triggered by a date slipping. R0 now has no
date. The trigger can never fire. The amendment grew scope and disarmed the scope-control
mechanism in the same edit — and §6 was not updated to notice. Whatever date sprint planning
derives, it must be a real commitment with the cut rule attached, or the cut rule must be
re-anchored to something else (elapsed weeks, or the R1 Q1-2027 date working backwards).

### F-2. HIGH — the engine is affordable; the UI is not, and the PRD costs only the engine

The sprint proposal's economics argument is sound for the *engine*: "a forward pass is a
topological traversal ... **the backward pass is the same traversal reversed**". Agreed. A CPM
core with working-day arithmetic, cycle detection and deterministic tie-breaks is a well-bounded,
highly testable piece of work — the kind AI assistance genuinely accelerates, because correctness
is expressible as table-driven tests.

That argument does not transfer to the surface. R0 now also owes:

- dependency creation, editing and deletion on the plan surface, with cycle errors that "name the
  cycle" (FR-6a);
- a Gantt with dependency arrows and critical-path emphasis (FR-7 + sprint proposal D-2);
- an explanation of what the user sees when dates move after an edit (D-2) — the hardest UX
  question in the change, and currently unwritten in DESIGN.md and EXPERIENCE.md, which the
  proposal notes "contain **no mention of dependencies at all**";
- constraint display and violated-constraint feedback (C-2), now for three constraint types (C-1);
- all of it under **NFR-U1: "WCAG 2.1 AA for contrast and keyboard access"**. A dependency-editing
  Gantt with full keyboard access is a genuinely hard accessibility problem, and most off-the-shelf
  Gantt libraries fail it — so the usual escape hatch (buy a Gantt) is partly closed, and the PRD
  never mentions build-vs-buy;
- and NFR-P1's "Plan edits save in under 500 ms (p75) ... **including the FR-6b recalculation they
  trigger**", which ties the interaction model to the engine's write path.

### F-3. MEDIUM — the plausibility question cannot be answered from this PRD, which is itself the finding

R0 as listed in §8.1 is roughly thirty FRs: Excel import with a ten-file acceptance corpus at
"5 or fewer manual corrections", a Backlog connector with snapshot scheduling and lifecycle
handling, an append-only ledger, EVM with PMI formulas, health indicators, a forecast, two export
formats, tree + Gantt, custom fields, resources, rates, calendars, baselines — *plus* a scheduler
and its UI. At 20+ hours a week, solo. There are still no Epics or Stories (sprint proposal:
"**Not assessable — the artifacts do not exist**"), so no per-item estimate exists for any of it.

The honest verdict is not "implausible" — it is that the PRD is now promising a scope nobody has
sized, having just removed the date that would have exposed the mismatch. The correct outputs of
`bmad-sprint-planning` are therefore (a) a date, (b) an explicit re-affirmation or reduction of
the R0 list against it, and (c) a decision on C-1, because ASAP-only removes roughly the whole of
C-2's UI surface for free. If sprint planning returns CONCERNS or FAIL, the first candidate cut is
not item 6 of the cut order — it is the two extra constraint types.

---

## Summary table

| # | Severity | Finding |
|---|---|---|
| A-1 | CRITICAL | §4.2 still states "v1 has no automatic rescheduling", six lines above FR-6b |
| A-2 | CRITICAL | No data date / progress awareness: the scheduler re-dates work already done, on every mid-flight project — which is all of them |
| A-3 | CRITICAL | "Project start" and "Project finish" are undefined in the Glossary, FR-1 and the schema; the forward pass has no origin and the backward pass no target |
| A-4 | CRITICAL | FR-9/FR-10/FR-11 still import, preview and overwrite dates ("the re-imported value wins"), while FR-9 cannot map the duration/dependency/constraint columns FR-6a says it imports |
| A-5 | CRITICAL | FR-35 does not pin the derived schedule or its inputs, so the published Gantt fails FR-35's own reproduction test |
| C-1 | CRITICAL | §8.3 ships must-start-on and must-finish-on in R0; the approved proposal excluded both |
| D-1 | CRITICAL | FR-15 and FR-16 were never amended; input pinning lives only in the Glossary and NFR-C1, and `baseline_wp` still stores outputs only |
| A-6 | HIGH | Cut order item 1 (drop the Gantt) silently executes item 6 and guts FR-6a's UI, while FR-6b is declared uncuttable |
| B-1 | HIGH | Summary roll-up vs. graph scheduling: no rule for which wins, and no bar on dependencies/constraints/durations attached to summary WPs |
| C-2 | HIGH | "Reported as a violation" implies hard/soft constraint semantics, negative float, and conflict-explanation UI; negative float also breaks the zero-float critical-path definition |
| C-3 | HIGH | The exclusion list omits the expensive semantics (data date, project start/finish, constraint conflicts, calendar versioning, recalculation scope) |
| D-2 | HIGH | "Compared WP by WP" cannot express a dependency, lag or constraint change; a plan that moved has no recorded cause |
| D-3 | HIGH | The Holiday Calendar has no dated history, so pinning "calendar" does not pin its contents; one added holiday breaks re-derivation |
| E-1 | HIGH | The *Plan* Disposition creates an unschedulable WP mid-review; the proposal's "no change to Dispositions" is wrong |
| F-1 | HIGH | Withdrawing the R0 date disarmed §6's only scope-control trigger, in the same edit that grew scope |
| F-2 | HIGH | The engine is cheap; the dependency-editing Gantt under NFR-U1 keyboard accessibility is not, and is uncosted and undesigned |
| A-7 | MEDIUM | FR-32's SPI-trend finish now competes with a scheduler-derived finish; `÷ SPI` also sits outside NFR-C1's integer discipline |
| A-8 | MEDIUM | Milestones carry a derived date, a typed target date and a baseline date, reconciled nowhere |
| A-9 | MEDIUM | FR-39 omits scheduling inputs; the no-lock-in claim no longer covers the plan |
| E-2 | MEDIUM | FR-31 Schedule health still uses baseline milestone slip only, ignoring derived-date slip |
| F-3 | MEDIUM | R0 is ~30 FRs plus a scheduler, unsized, with no Epics or Stories in existence |
| A-10 | LOW | Divergence churns for WPs nobody edited; no "moved by predecessor" distinction |
| D-4 | LOW | Pre-change baselines are not comparable, but none exist; say so once |

## What holds

- FR-6a/FR-6b read as a competent, mostly implementable CPM specification, and the cycle-rejection
  and determinism clauses are correctly placed at entry and in NFR-C1.
- The ledger half is genuinely untouched: FR-25, FR-42, FR-30's historical-baselined rule and the
  definition of Unplanned Work are all date-free and survive recalculation.
- FR-30's PV reads baseline working days, so EVM's planned value does not move with the schedule.
- NFR-P1 was amended correctly and specifically, and the 300 ms figure is realistic for 500 WPs.
- §8.3's five named exclusions are the right five, and the rationale for each is honest.

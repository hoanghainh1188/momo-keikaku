---
title: Adversarial review 2 — do the 2026-09-20 scheduling fixes hold?
created: 2026-09-20
reviewer: adversarial lens, hostile to the fixes
scope: prd.md and addendum.md as amended 2026-09-20, against review-scheduling-adversarial.md,
       sprint-change-proposal-2026-09-20.md and packages/db/src/schema.ts
verdict: the seams named in review 1 are sewn; the fixes opened three new ones in the same place
---

# Adversarial review 2 — the fixes

The first review said the engine was specified and the system around it was not. That is no longer
true: eleven of the twelve CRITICAL/HIGH seams are genuinely closed, in the FRs a story would be
written from, not only in the Glossary. The work is real.

What the fixes did not do is close the loop they opened. The progress-aware scheduler now depends
on two quantities — a WP's actual start and actual finish — that **no part of the PRD can produce
for a project that started before momo-keikaku saw it**, and that a second part of the PRD (Mapping)
rewrites silently and hourly. The result is that A-2 and E-1, the two findings the fixes worked
hardest on, come back in a different shape on the same day-one path, and the PRD's new flagship
claim — "no other part of the system writes a WP date" — is false as written.

Findings below: the closure walk first, then what the fixes introduced.

---

## Part 1 — Closure walk of review 1

Scoring rule applied: a fix that lands only in §3, an NFR or a §13 decision log entry, and not in
the FR a story is written from, is PARTIAL.

### CRITICALs

**A-1 — §4.2 denied FR-6b. CLOSED.**
§4.2 now reads:
> "**The plan is scheduler-owned:** the PM supplies duration, dependencies and constraints, and the
> scheduler derives every date and recalculates the moment one of those changes (FR-6b). No other
> part of the system writes a WP date — not the importer, not a Disposition, not the PM."

The denial is gone. The replacement sentence is itself wrong — see **N-2**.

**A-2 — no data date, the scheduler re-dates the past. PARTIAL.**
The engine half is closed, and well. FR-6b:
> "**complete** — it has an actual finish. Its dates *are* its actual dates... **in progress** — it
> has an actual start and no actual finish... **remaining** — it has neither."

FR-43 defines the Data Date, forbids setting it before the latest actual finish, and pins it into
FR-15 and FR-35. That is the right machinery.

It is PARTIAL because the machinery has no fuel on day one. The only two producers of an actual
date in the entire PRD are FR-5:
> "**Actual dates:** a WP's actual start is the time of its first ledger entry. Its actual finish is
> set when the PM marks it complete."

Neither can express a date in the past (see **N-1**). UJ-1 — import, set Data Date, Baseline —
happens *before* UJ-2 adds the Connector, so at the moment the first Baseline of a mid-flight
project is taken, no WP has an actual start, every leaf is `remaining`, and FR-6b schedules the
entire in-flight plan forward from the Data Date. That is the A-2 failure, verbatim, on the flagship
journey.

**A-3 — no origin, no target. CLOSED.**
FR-43 makes Project start mandatory and blocks scheduling without it; §3 separates the PM-set
*Project finish* from the *computed finish* and FR-6b names which origin the backward pass used. The
ambiguity review 1 found is resolved. §3 then breaks its own rule two entries later — **N-7**.

**A-4 — import still wrote dates. CLOSED.**
FR-9 now maps "**duration, predecessors, lag, constraint type, constraint date**", converts an
imported start/finish pair into a duration plus reference Custom Fields, and states
> "**Imported dates are never turned into constraints automatically.**"

FR-10 adds "**The PM never corrects a date**, because no date is imported"; FR-11 adds "**Dates are
not an imported field**" and the untouched-graph rule for an unmapped predecessor column. UJ-1 was
rewritten to match. This is the most complete fix in the set. Two defects rode in with it — **N-3**
and **N-8**.

**A-5 — Published Snapshots did not pin the schedule. CLOSED.**
FR-35 now stores "**every derived date, Float and critical-path marking**" and "**the scheduling
inputs that schedule was derived from**", and the reproduction test says
> "A duration edit made on Friday does not change the Gantt published on Thursday."

**C-1 — two constraint types smuggled past the approved exclusions. CLOSED (as honesty, not as scope).**
§8.3 now says so out loud:
> "This is a deliberate expansion beyond the approved sprint change proposal, which placed the
> latter two in Post-Q1."

§13 records it as a second reversal with the founder's assent, and OQ-12 names it the first cut if
sprint planning returns CONCERNS or FAIL. The boundary is recorded honestly. The scope is still
bigger, and it is still the right first cut.

**D-1 — FR-15/FR-16 never amended. CLOSED in the PRD.**
FR-15 now carries the full pinned set per leaf WP and per Project, plus
> "**Re-derivation test:** re-running FR-6b over a Baseline version's pinned inputs alone... This is
> an automated test, not a claim in prose."

and "**No partial pinning.**" FR-16 gained the graph diff. This is exactly where review 1 asked for it.

*Note, not a finding against the PRD:* `packages/db/src/schema.ts` is unchanged — `baseline_wp`
still holds `start, finish, baselineMh, isMilestone` only, `project` has no start/finish/data date,
`work_package` has no duration, constraint or actual-start column and carries nullable `start`/
`finish` that any module can write. §13 records migrations as pre-production, so this is
architecture's bill, not a PRD defect. It is listed here so nobody assumes the model already moved.

### HIGHs

**A-6 — cut 1 silently executed cut 6. CLOSED.**
FR-7 makes the tree grid a complete scheduling surface; cut 1 now says "it does **not** execute cut
6"; §8.3 closes with "Cuts 1 and 6 are independent by construction". The contradiction is gone. The
price is **N-11**, and cut 6 still contradicts FR-6b's own argument — **N-12**.

**B-1 — summary roll-up vs graph scheduling. CLOSED.**
§3: a summary WP "carries no Duration, Constraint or Dependency"; FR-5: "**Scheduling inputs are
leaf-only**"; FR-6a rejects summary endpoints *and* ancestor/descendant pairs, with the correct
reason that the cycle check cannot cover the second. All three questions review 1 asked are
answered. A move/re-parent hole remains — **N-13**.

**C-2 — "reported as a violation" unpacked. CLOSED.**
§3 and FR-6b now commit: constraints are **soft**, "**the graph wins**", Float "**may be negative**",
the critical path is the minimum-Float set, and the violation names "the date asked for, the date
derived, the difference in working days, and the predecessor chain that forced it". Every sub-item
review 1 listed has a home. The minimum-Float definition has a hole of its own — **N-6**.

**C-3 — the exclusion list omitted the expensive semantics. CLOSED.**
§8.3 added the "**The semantics FR-6b implies are specified, not excluded**" table, which maps all
five named items to a requirement. The table is accurate.

**D-2 — a WP-by-WP diff cannot show a removed edge. CLOSED.**
FR-16 now lists the graph diff explicitly and adds "**Every date change is attributable.**"

**D-3 — pinning "the calendar" is not pinning its contents. CLOSED, with a gap.**
FR-14 gained a "**Dated, append-only history**" and "Adding a client holiday in November therefore
cannot change what an October Baseline re-derives to." The gap is which changes create a version —
**N-9**.

**E-1 — the *Plan* Disposition creates an unschedulable WP. PARTIAL.**
FR-29 answers all three of review 1's questions for *Plan*: "**It does not move the plan**", "**Its
dates come from the work already done**", "**Linking it into the graph is a later, deliberate act**".
Good work. But the fix reasons from the WP's actual start — and actual start is a function of
Mapping, so the *Map* Disposition, and every Mapping Rule re-evaluation on every hourly snapshot,
moves WP dates while FR-29 claims only *Plan* was at risk. See **N-2**. The sprint proposal's "no
change to Dispositions" is still wrong, now for a different Disposition.

**F-1 — withdrawing the date disarmed §6's cut trigger. PARTIAL.**
§6 now carries a re-anchor paragraph. But the anchors it names are not triggers either: "**R1 must
start by Q1 2027**, working backwards through the §8.1 gate's four consecutive weekly reports on
three projects" is an arithmetic instruction nobody performs and no artifact records, and §7.3 stops
growth rather than forcing a cut. Nothing in the PRD can *fire*. Worse, §8.2's header reads "**R1 —
client-facing (Q1 2027, after the §8.1 gate)**" — R1 *delivering* in Q1 2027 — while §6 anchors on
R1 *starting* by Q1 2027. Those are two different deadlines about two months apart, and the cut
trigger is anchored to the looser one. See also **N-18**.

**F-2 — the engine is cheap, the surface is not, and only the engine is costed. PARTIAL.**
OQ-11 is an honest, specific record of the problem, and addendum B repeats it for `bmad-ux`. But
recording a cost is not mitigating it, and FR-7's A-6 fix *raised* it (**N-11**) while §7.3 forbids
the session that is supposed to solve it from adding scope (**N-10**). The PRD is now more honest
about F-2 and more exposed to it.

### MEDIUM and LOW from review 1

| # | Status | Evidence |
|---|---|---|
| A-7 | CLOSED | FR-32 shows both the scheduled finish and the trend finish, labelled, with the gap; rounding is "evaluated in whole working days and rounded up" |
| A-8 | PARTIAL | §3 makes a milestone's target date a *must finish on* Constraint — correct. But "done date" is never defined against FR-5's actual finish (**N-14**), and import cannot carry a milestone target at all (**N-8**) |
| A-9 | CLOSED | FR-39 lists every scheduling input and adds "**The plan leaves too, not just the numbers.**" |
| E-2 | CLOSED | FR-31 "**Milestone slip, forecast**" plus the negative-Float rule |
| F-3 | CLOSED as a record | OQ-12, with required outputs and a named first cut |
| A-10 | CLOSED, list incomplete | FR-28's four causes; the list is missing one (**N-15**) |
| D-4 | CLOSED | §13's final bullet |

**Tally.** Review 1 raised 7 CRITICAL, 9 HIGH, 5 MEDIUM, 2 LOW = 23.
- CRITICAL/HIGH: **12 CLOSED, 4 PARTIAL (A-2, E-1, F-1, F-2), 0 OPEN.**
- All severities: **18 CLOSED, 5 PARTIAL, 0 OPEN.**

---

## Part 2 — What the fixes introduced

### N-1. CRITICAL — nothing in the PRD can record a date in the past, so progress awareness cannot fire on a mid-flight import

FR-6b's three-state rule is driven entirely by actual start and actual finish. FR-5 gives exactly
two producers:

> "**Actual dates:** a WP's actual start is the time of its first ledger entry. Its actual finish is
> set when the PM marks it complete." *(FR-5)*

Follow both on the only project type the PRD describes:

1. **Actual start.** A ledger entry exists only once a Connector exists (FR-25: entries come from
   snapshot deltas). UJ-1 imports, sets the Data Date and takes the **Baseline** before UJ-2 adds
   the Connector. So the first Baseline of a mid-flight project pins `actual start = null` for every
   leaf WP, and FR-6b schedules the entire in-flight plan forward from the Data Date — the failure
   A-2 was raised to remove, on the flagship journey, at the one moment (FR-15) the PRD says is
   irreversible.
2. **Actual start, after the Connector lands.** FR-42: an Opening Balance is "dated at the
   snapshot". Every Ticket carrying pre-existing hours therefore produces its first ledger entry on
   the *connection day*. So every mapped WP — work started in June, July and August alike — receives
   the same actual start: the day Linh added the Connector. FR-6b then pins all of them there and
   computes remaining duration from an elapsed time of zero.
3. **Actual finish.** "set when the PM marks it complete" is the time of the click, not the date the
   work finished. A WP that finished in July gets an actual finish of today. FR-43 then compounds
   it: "**A Data Date is never set earlier than the latest actual finish in the Plan**", so marking
   historical work complete drags the Data Date to today and pushes all remaining work after it.

FR-5 says "**Start and finish dates are not typed**" and FR-9 says "**Imported dates never become WP
dates.**" Both are right about *planned* dates. Applied to *actual* dates they remove the only way to
tell the scheduler what already happened. The PRD needs one of: an actual-start/actual-finish pair
the PM can set per WP (typed, and not a planned date, so FR-5's prohibition is untouched); or an
imported actual-start/actual-finish column pair in FR-9; or a rule that derives actual start from
the *earliest observed ticket activity* rather than the first ledger entry. Until one exists, FR-43
and FR-6b's progress rules are unreachable code on every project the founder owns.

### N-2. CRITICAL — Mapping writes WP dates, hourly, with no trigger, no audit entry and no cause

§4.2 and FR-6b both state the new doctrine absolutely:

> "No other part of the system writes a WP date — not the importer, not a Disposition, not the PM."
> *(§4.2)*
> "no other part of the system writes WP dates." *(FR-6b)*

Now compose three requirements that were not re-read against each other:

- FR-5: "a WP's actual start is the time of its first ledger entry";
- FR-21: "**Attribution follows the current Mapping:** all of a Ticket's ledger entries are
  attributed to the WP it is mapped to now. **Remapping moves them**";
- FR-6b: a WP with an actual start "is scheduled forward over its *remaining* duration... from no
  earlier than the Data Date", and a WP with an actual finish has dates that "*are* its actual dates".

Therefore mapping a Ticket to a WP **creates or moves that WP's actual start**, which is a
first-class scheduling input, which changes its derived dates and every dependent WP's dates.
Unmapping removes it. The *Map* Disposition does it. A drag-and-drop in UJ-2 does it. And FR-22 does
it unattended:

> "**Rules are live:** on every Tracker Snapshot, each Ticket without a manual Mapping is
> re-evaluated against the rules in priority order."

with FR-19 taking snapshots "hourly during JP and VN business hours". So the plan can be re-dated
every hour by a background job.

Four consequences, all R0:

1. **The doctrine claim is false.** §4.2's list of non-writers omits the two modules that actually
   write dates: the Mapping layer and the PM's "mark complete" action. Restate it as "no other part
   writes a *planned* date, and actual dates are written only by X and Y".
2. **FR-6b's trigger list omits them.** "recalculated automatically whenever a duration, dependency,
   constraint, calendar version, Data Date, Project start or Project finish changes." Actual dates
   are not in that list, so either the schedule silently goes stale after every mapping change — and
   NFR-C1's "the same pinned inputs always yield the same output" is violated by a displayed plan
   that no longer matches its inputs — or recalculation fires hourly and NFR-P1's 300 ms budget now
   describes a background job nobody costed.
3. **FR-29's *Plan* argument collapses onto *Map*.** FR-29 spends four bullets proving "**The PM
   never has to stop reconciling, minutes before publishing, to do scheduling.**" *Map* — the
   Disposition the PM uses most, in the same review, on the same screen — moves the plan.
4. **Nothing records it.** NFR-A1 logs "scheduling input changes: dependencies added, removed or
   re-lagged; durations; constraints" and Mapping changes, but does not connect the two. FR-28's
   cause list (**N-15**) has no cause for it. So the PM sees a hundred dates move in the
   Reconciliation Review with the cause column blank — the precise failure D-2 and A-10's fixes
   exist to prevent.

### N-3. CRITICAL — FR-10 proposes the project's last planned date as the Data Date

FR-10:
> "**Project settings:** if the Project has no Project start or Data Date, the preview asks for both
> before it will commit, proposing the earliest and the latest imported date respectively (FR-43)."

"respectively" makes the proposed **Data Date the latest imported date** — for a client WBS, the
planned end of the project, often a year out. Under FR-6b's "**never earlier than the Data Date**",
accepting the proposal schedules every remaining WP after the plan's own finish. It also contradicts:

- §3: "**Data Date** — the as-of boundary between what has happened and what is still planned";
- FR-43: "**It defaults to the Project start** when the Project is created";
- UJ-1 step 5, which says only "sets the Project start and the Data Date" with no proposal.

Three different defaults for one field, one of which is actively harmful and is the one the import
path uses. The defensible proposal is *today*, or the latest date with observed activity. This is a
one-line fix and it must be made before FR-10 becomes a story.

### N-4. HIGH — out-of-sequence progress breaks FR-6b's own "the graph wins" invariant

FR-6b and §3 make one unconditional promise:
> "the scheduler never draws a plan in which a successor starts before its predecessor finishes"

and simultaneously pin in-progress and complete WPs to their actual dates: "Its start is its actual
start", "Its dates *are* its actual dates."

On a real mid-flight project these collide constantly: WP 2.4 was started while WP 2.3 was still
open, because that is what teams do. The scheduler is then asked to honour an actual start that
precedes its predecessor's finish. Every real CPM engine has an explicit answer (retained logic vs
progress override); the PRD has none, and §8.3's exclusion table does not name it — so it is in R0,
unspecified, and it is guaranteed to fire on the first import. Cheapest resolution: state that an
actual date always wins over the invariant, that the invariant binds only remaining work, and that
the out-of-sequence pair is flagged like a constraint violation.

### N-5. HIGH — remaining duration is measured in elapsed calendar time, not in progress

FR-6b:
> "It is scheduled forward over its *remaining* duration — its duration less the working days
> already elapsed, and never fewer than one working day"

Three problems in one clause. **(a)** "already elapsed" names no endpoints — from actual start to
the Data Date, or to today? The two differ by exactly the interval a PM leaves between advancing the
Data Date. **(b)** Elapsed time is not progress. This product computes progress honestly (FR-30's
Percent Complete "is never derived from burned effort", with an estimate basis, a count basis, a 99%
cap and a "low evidence" flag) and then does not use it in the one place a forecast is produced. A
WP 90% elapsed and 10% done forecasts one day remaining. **(c)** Combined with N-1's Opening-Balance
actual start, elapsed is zero for every WP on a freshly connected project, so remaining duration
equals full duration and nothing in flight is shortened at all.

Remaining duration should be `duration × (1 − Percent Complete)`, rounded, clamped to ≥ 1 — which
also reuses machinery R0 already owes.

### N-6. HIGH — a project-wide minimum-Float critical path hides the chain that drives the finish

§3:
> "**Critical Path** — the WPs whose Float equals the **minimum Float in the Project**"

and FR-6b: a *must finish on* the plan cannot meet "produces negative Float on that WP and on every
WP upstream of it".

Set one must-finish-on that misses by six weeks. That chain now has Float −30. Every other WP,
including the entire longest path that actually determines the computed finish, has Float ≥ 0 and is
**not** on the critical path. The Gantt's critical-path emphasis (FR-7) then highlights one
constraint's chain and greys out the work that decides when the project ends. §3's own rationale
fires against it: "the most critical work would drop off the path exactly when the plan is in
trouble."

The standard answer is that criticality is computed per *end-point chain* (per constraint and per
finish), not as one project-wide minimum, or that the critical path is the chain to the computed
finish and constraint chains are shown separately as negative-Float chains. The PRD picks neither
and its definition is worse on a late plan than the zero-Float definition it replaced, because at
least zero-Float still tracked the driving chain when no constraint was violated.

### N-7. HIGH — §3 conflates *Project finish* two entries after forbidding the conflation

§3, *Project finish*:
> "The two are never conflated: **wherever this PRD says *Project finish* it means the date the PM
> set**, and the computed one is always named as such (FR-43, FR-6b)."

§3, *Float*, one entry later:
> "how far it can slip before **the Project finish** moves"

§3, *Critical Path*, two entries later:
> "Any slip on a critical-path WP **moves the Project finish**."

A PM-set contractual date cannot move because a task slipped; only the computed finish can. Both
sentences must say *computed finish*, and as written they are the load-bearing definitions of the
two quantities the whole amendment turns on. FR-32 then introduces a third name for the same thing —
"the **scheduled finish** — the Project's derived finish from FR-6b" — while FR-31's negative-Float
rule and FR-43 use "Project finish" correctly. A reader cannot hold three names for two dates across
four sections without error, and an implementer will not.

### N-8. HIGH — an imported milestone loses its target date, and gains a duration

§3 makes the milestone target date a constraint — the right call, and it closes A-8's main half:
> "A milestone's **target date is a *must finish on* Constraint**, not a fourth date field"

Now import a client WBS, which is where every milestone in the founder's world comes from. FR-9:
- start/finish become a **duration**: "each WP's duration is derived as the working-day count from
  the imported start to the imported finish inclusive";
- "**Imported dates are never turned into constraints automatically.**"

So the milestone's date becomes a duration (of 1, since the count is inclusive and a milestone row
carries one date twice or a single date) and a reference Custom Field. The target is gone, and §3's
"zero duration" is violated by the derivation. Downstream, FR-31's **both** milestone rules
("past its Baseline date", "derived date... later than its Baseline date") and FR-34's default
client-facing "milestones" have nothing to fire on until the PM retypes every target by hand as a
constraint — the manual re-dating FR-5 exists to remove, aimed at exactly the rows the client cares
about most. FR-9 needs a rule: a row flagged as a milestone takes duration 0 and its imported date
becomes a *must finish on* constraint. That is a deliberate, narrow exception to the no-auto-
constraint rule and it should be written as one.

### N-9. HIGH — FR-14's version history does not version the calendar's main content

FR-14 lists what makes a version:
> "Every change — **adding or removing a Project-specific non-working day, or changing which
> national calendars are in use** — creates a new calendar **version**"

The JP and VN national holiday *tables themselves* are neither. They are system data ("The calendar
data covers 2026–2028"), they will be corrected and extended (Japan legislates holidays year by
year; substitute holidays move), and an update to them silently changes what every past Baseline
re-derives to — D-3's exact failure, surviving in the 95% of the calendar that is national holidays.
FR-15's re-derivation test, run after such an update, fails with no code change. Either the national
tables are versioned and a Baseline pins the table version, or FR-14 must state that a Baseline
copies the effective non-working-day *set* rather than referencing a version. Separately, a plan
whose computed finish lands in 2029 has no calendar at all, and FR-6b says nothing about that.

### N-10. HIGH — the freeze in §7.3 contradicts OQ-11, and has no mechanism behind it

§7.3:
> "Nothing is added to R0 inside a PRD edit, a UX session, an architecture session or a build
> session."

OQ-11, in the same document:
> "R0 now owes: dependency creation, editing and deletion on the plan surface... and an answer to
> what the PM sees when one edit moves a hundred dates... *Owner:* `bmad-ux` for the design"

Designing "what the PM sees when one edit moves a hundred dates" is not decoration; it will produce
requirements that carry real cost — the thing §7.3 defines as an addition. The PRD hands UX a
scope-bearing question and forbids UX from answering it in R0. One of the two has to yield, and the
PRD should say which: the cleanest form is a standing exception — "UX may specify the surface FR-6a,
FR-6b and FR-7 already require; anything beyond that is an addition."

Two other doors are still open. §8.3 carries a live invitation to grow R0:
> "Layered calendars. `[NOTE FOR PM]` The warning when Tết falls during a JP deadline is cheap and
> very visible for exactly this user. **It could be pulled forward.**"

And FR-8 sets no bound at all: "The product sets no limit on the number of Custom Fields."

On enforceability: §7.3 is a norm, not a mechanism. No checklist, artifact, template field or gate
anywhere in the pipeline asks "did this pass correct-course?", and the reviewer of the next session
is the same person who wants the feature. It asks nicely. It asks nicely in strong language, which
is better than nothing and materially less than the date it replaced — and it is asymmetric by
design ("It does not restrict *cutting*"), which is the right asymmetry.

### N-11. HIGH — the A-6 fix requires R0 to build the scheduling UI twice

FR-7:
> "Dependencies and constraints can be created, edited and deleted from **either** surface, so the
> tree grid is a complete scheduling surface on its own — which is what makes cut 1 in §8.3
> survivable rather than a silent removal of FR-6a."

Read as an estimate: R0 must ship **two** complete dependency- and constraint-editing surfaces —
a Gantt with arrows, critical-path emphasis and a Data Date line, and a tree grid with a predecessor
column, a Float column, a critical-path marker and full link editing — each carrying constraint
violation display for three constraint types and negative Float, each under NFR-U1's WCAG 2.1 AA
keyboard bar, on which OQ-11 concedes most off-the-shelf Gantt components fail. The purpose of the
second surface is to keep the *cheapest item in the cut order* available.

This is backwards. A cut is only worth preserving if preserving it costs less than the cut saves.
The honest options are: build the tree grid only and make the Gantt an R1 item (the cut, taken now,
at full value); or accept that the Gantt is the scheduling surface, let item 1 leave the cut order —
which §8.3 already contemplates ("If a later change makes the Gantt the only scheduling surface,
item 1 leaves the cut order") — and admit the cut order has lost its cheapest item. What R0 cannot
afford is paying for both to keep an option it will exercise at most once.

### N-12. MEDIUM — cut 6 leaves exactly the badge FR-6b argues is worthless

FR-6b:
> "A *must finish on* the plan cannot meet also produces negative Float on that WP and on every WP
> upstream of it, **which is how a violation reaches the critical path instead of sitting in a badge
> nobody reads**."

§8.3, cut 6:
> "drop the backward pass, the Float column and the critical-path marker. **Constraint violations are
> still reported, without the Float figure behind them**"

Cut 6 therefore produces the badge nobody reads, by the requirement's own argument, while the two
extra constraint types that create violations stay in scope. If cut 6 is ever taken, the two extra
constraint types should be cut with it — which is also OQ-12's stated first cut, so the cut order
and OQ-12 should be reconciled into one order.

### N-13. MEDIUM — re-parenting and deletion can produce graph states FR-6a only checks at entry

FR-5 allows the PM to "create, edit, **move** and delete WPs", and handles one case:
> "Giving a leaf WP a child is therefore an edit the PM must resolve in the same action"

FR-6a's guards all fire "**at entry**" — on link creation. Moving WP 3.2 under WP 1.4 can turn a
previously legal link into an ancestor/descendant link, or turn a leaf endpoint into a summary
endpoint, with no link having been touched. The PRD needs the guards restated as *invariants* the
recalculation validates, not as entry checks. Separately, FR-5's delete consequence covers Mappings
and says nothing about the dependency edges attached to a deleted leaf WP — dropped silently, or
re-linked predecessor-to-successor? Microsoft Project re-links; the PRD is silent.

### N-14. MEDIUM — "done date" is a fourth date nobody defined

§3: "**Milestone** — a leaf WP with zero duration, flagged as a milestone, **with a done date**."
FR-5: "Its actual finish is set when the PM marks it complete."
FR-31: "any Milestone is past its Baseline date and **not done**".

Is "done date" the actual finish, or a separate field? `packages/db/src/schema.ts` has both
`completed_at` and `milestone_done_at` on `work_package`, so the build already assumed two. A-8's
fix removed the typed *target* date and left the *done* date undefined. One sentence in §3 closes it.

### N-15. MEDIUM — FR-28's cause list is incomplete against its own promise

§3 and FR-28 promise totality:
> "Every date difference carries its cause — *edited*, *moved by a predecessor*, *calendar changed*
> or *data date advanced*"

Missing: a date that moved because a Mapping change moved the WP's actual start (**N-2**), and a
date that moved because the PM marked a WP complete. Both are common, both are weekly, and both land
in the blank column the PM has to triage by hand.

### N-16. MEDIUM — the tie-break NFR-C1 requires is written nowhere

NFR-C1: "the tie-break is explicit and **documented** rather than left to iteration order."
FR-6b: "Ordering is explicit and ties are broken deterministically."

Neither says what the tie-break *is*, and no other document does. FR-15's re-derivation test and
FR-35's reproduction test both assert byte-equality of the critical path, which is exactly where
tie-breaks are visible. This is architecture's to write, but the PRD should name it as an
architecture deliverable rather than asserting it as a property.

### N-17. LOW — §8.1's frozen list is 35 FRs, not "roughly thirty"

"FRs: 1, 2 (partial), 3 (partial), 4 (English), 5, 6a, 6b, 7–17, 19–32..., 38..., 39, 42, 43"
counts 35. OQ-12 says "roughly thirty FRs". The number is the input to the only sizing decision left.

### N-18. LOW — SM-1 still carries the withdrawn R0 date

SM-1: "logged for four weeks before adoption (**during the R0 build, October–November 2026**) and
four weeks after (Q1 2027)." §8.1: "until then this section carries no date." SM-1 implies R0 is in
use by December 2026 — the withdrawn target, surviving in the metric that validates it.

### N-19. LOW — a WP with no duration has no defined scheduling behaviour

FR-9 explicitly imports them ("a row carrying only one of the pair... is imported with no
duration"). FR-15 blocks a Baseline while any leaf lacks one. FR-6b never says what the passes do
with one in the meantime.

### N-20. LOW — FR-43's Data Date default references a value that does not exist yet

"It defaults to the Project start when the Project is created" — but FR-1's Project creation lists no
dates and FR-43 says a PM sets the Project start afterwards.

---

## Part 3 — Feasibility

**Plainly: yes, the PRD now promises more than 20 hours a week can deliver, and it promises it with
less ability to detect the overrun than it had yesterday.**

R0 is 35 FRs. It includes a progress-aware CPM engine with three constraint types, soft-constraint
violation reporting with chain attribution, negative Float, a minimum-Float critical path, working-
day arithmetic over a versioned two-country calendar, whole-project serialised recalculation inside
300 ms — *and* two complete WCAG-AA dependency-editing surfaces (**N-11**) whose design does not
exist (OQ-11) — *and* an Excel importer that must map nine field types and hit "5 or fewer manual
corrections" on ten real files — *and* a polling Backlog connector with lifecycle, Opening Balances
and scope-completeness invariants — *and* an append-only ledger — *and* PMI EVM with two CPIs, TCPI,
health thresholds and a two-date forecast — *and* baselines with an automated re-derivation test —
*and* two export formats. Solo. Unsized. With no epics and no stories, and with the date that would
have exposed the mismatch withdrawn (§8.1) and its replacement trigger unfireable (**F-1 PARTIAL**).

The engine is not the problem; review 1 was right that a topological traversal with table-driven
tests is well suited to AI-assisted solo work. The problem is that every fix in this round added
surface: the Data Date added a settings screen, a preview step, a review action and a re-derivation
path; calendar versioning added a version history UI; the graph diff added a compare view; FR-7's
A-6 fix added a second full scheduling surface. None of it was sized.

**What I would cut, in order:**

1. **The two extra constraint types** (*must start on*, *must finish on*) — already named as the
   first cut by §8.3 and OQ-12. This deletes negative Float, the minimum-Float critical path and its
   hole (**N-6**), soft-constraint semantics, violation display for three types, and most of OQ-11's
   hard UI. It also deletes **N-4**'s urgency and makes cut 6 coherent. Biggest saving per line cut,
   by a wide margin. Milestone targets then need a home — the cheapest is a milestone-only deadline
   flag that reports slip without participating in the passes.
2. **The second scheduling surface** (**N-11**). Take cut 1 now rather than preserving it: ship the
   tree grid with derived date columns, predecessor column and Float column; move the Gantt to R1
   where a client actually needs to look at it (FR-34 is R1 anyway). This also removes the
   build-versus-buy decision from R0's critical path.
3. **FR-11 re-import diff** → replace the Plan with a confirmation (cut order item 2). It is
   "beyond the brief" by §8.1's own admission and it is the most complex matching logic in the
   importer.
4. **FR-39 raw data export** down to the ledger and Mapping history (cut order item 5). The
   no-lock-in claim is an R1 selling point, not an R0 dogfooding need.
5. **FR-32's trend finish.** FR-6b now produces a real scheduled finish; a second, admittedly
   heuristic date that "will disagree" costs a UI explanation, a rounding rule and a support burden
   for a number the founder can compute in Excel.
6. **FR-8's Custom Field editor** → keep only import-created fields (cut order item 3).

Cuts 1 and 2 alone remove most of the work the 2026-09-20 amendment added, and leave intact the one
capability §8.3 correctly calls uncuttable: automatic forward-pass recalculation, so a slipped task
moves its dependents.

---

## Part 4 — Readiness for the downstream skills

**`bmad-create-epics-and-stories` — NOT READY for the plan/scheduling slice; READY for the rest.**

Roughly two dozen FRs (FR-1–FR-4, FR-12, FR-13, FR-17, FR-19–FR-28, FR-30–FR-32, FR-38) are
written at story granularity with testable consequences and can be decomposed today. The scheduling
slice cannot, because three defects change the requirements a story would be written from:

- **N-1** — actual dates have no producer for historical work. Fixing it adds fields to FR-5 and a
  column pair to FR-9. Any story written against FR-6b today is written against an engine that
  cannot run on a real project.
- **N-2** — Mapping is an unacknowledged writer of scheduling inputs. Fixing it changes FR-5,
  FR-6b's trigger list, FR-21, FR-28's cause list and NFR-A1. This touches the reconciliation FRs
  too, so it is not confinable to the plan epic.
- **N-3** — FR-10's Data Date proposal is wrong and is a one-line fix. Do it before it becomes an
  acceptance criterion.

**N-4, N-5, N-6, N-8** should be settled in the same pass; each is a rule a story needs and none is
a design question. Blocked FRs: FR-5, FR-6a, FR-6b, FR-7, FR-9, FR-10, FR-11, FR-29, FR-43.

**`bmad-architecture` — READY WITH CONDITIONS.**

The data model is now fully specified: FR-43's three Project settings, FR-15's pinned set, FR-35's
snapshot contents, FR-14's calendar versions, FR-16's graph diff, and addendum A.5's single write
path. That is enough to design against. Three things must be answered *in* architecture rather than
assumed:

- the recalculation trigger set, once **N-2** is resolved — whether actual-date changes trigger a
  recalculation, and if so what that does to NFR-P1 under hourly snapshots and to the write
  amplification A.5 already flags;
- **N-16**'s tie-break rule, which FR-15's and FR-35's automated tests depend on;
- the migration. `packages/db/src/schema.ts` has no duration, dependency, constraint, actual-start,
  Project start/finish or Data Date column; `baseline_wp` stores outputs only; `work_package.start`
  and `.finish` are nullable and writable by anything, which the A.5 "one write path" rule must be
  enforced against. §13 confirms this is pre-production, so it is cost, not risk.

**`bmad-ux` — BLOCKED, on a governance conflict rather than a content gap.**

OQ-11 and addendum B hand UX a well-framed brief: two editing surfaces, cycle and
ancestor/descendant rejection feedback, constraint-violation explanation for three types including
negative Float, and what the PM sees when one edit moves a hundred dates. The content is there.
What blocks it:

- **N-10** — §7.3 forbids a UX session from adding R0 scope, and OQ-11 asks a UX session a question
  it cannot answer without doing so. Write the standing exception before UX starts, or UX's output
  is unadoptable by the PRD's own rule.
- **N-11** — UX is being asked to design two complete surfaces, with the build-versus-buy decision
  for the Gantt still open and owned by `bmad-sprint-planning`. Designing both before the cut
  decision is made is the most expensive possible ordering. Decide cut 2 above first, then design
  one surface.
- The milestone question (**N-8**) and the minimum-Float display question (**N-6**) are both
  requirement decisions masquerading as design questions. Settle them in the PRD, or UX will invent
  answers that §7.3 then forbids the PRD from accepting.

**Recommended order:** fix N-1, N-2, N-3 (and N-4, N-5, N-6, N-7, N-8) in the PRD; decide cut 1 and
cut 2 from Part 3; then run `bmad-create-epics-and-stories` and `bmad-architecture` in parallel;
then `bmad-sprint-planning` for OQ-12; then `bmad-ux` against a single, decided surface.

---

## Summary table

| # | Severity | Finding |
|---|---|---|
| N-1 | CRITICAL | No producer of a historical actual date: at first Baseline no WP has an actual start, and after connection every mapped WP shares one (FR-5, FR-42, UJ-1/UJ-2) — A-2 returns on the flagship path |
| N-2 | CRITICAL | Mapping writes actual dates and therefore WP dates, hourly and unattended (FR-5 + FR-21 + FR-22), against §4.2's "no other part of the system writes a WP date"; not in FR-6b's trigger list, NFR-A1 or FR-28's causes |
| N-3 | CRITICAL | FR-10 proposes the *latest* imported date as the Data Date, contradicting §3 and FR-43 and scheduling all remaining work past the plan's own end |
| N-4 | HIGH | Out-of-sequence progress: pinned actual starts vs "the scheduler never draws a successor starting before its predecessor finishes" — unspecified and unexcluded |
| N-5 | HIGH | Remaining duration is elapsed working days, not progress; Percent Complete (FR-30) is not an input, and endpoints of "elapsed" are undefined |
| N-6 | HIGH | A project-wide minimum-Float critical path lets one violated *must finish on* hide the chain that drives the finish — §3's own stated failure mode |
| N-7 | HIGH | §3 conflates *Project finish* with the computed finish in *Float* and *Critical Path*, two entries after forbidding it; FR-32 adds a third name |
| N-8 | HIGH | Imported milestones lose their target date and gain a duration of 1 (FR-9 vs §3), disabling both FR-31 milestone rules on every imported plan |
| N-9 | HIGH | FR-14 versions project-specific days but not the JP/VN national holiday tables themselves — D-3's failure survives in most of the calendar |
| N-10 | HIGH | §7.3's freeze contradicts OQ-11's brief to `bmad-ux`, carries a "could be pulled forward" invitation in §8.3, and has no enforcing mechanism |
| N-11 | HIGH | FR-7 requires two complete WCAG-AA scheduling surfaces in R0 so that the cut order's cheapest item stays available |
| N-12 | MEDIUM | Cut 6 leaves precisely "a badge nobody reads", which FR-6b argues is worthless |
| N-13 | MEDIUM | FR-6a's guards are entry checks, not invariants: re-parenting can create illegal links; deleted leaf WPs' edges are unspecified |
| N-14 | MEDIUM | "done date" (§3) is never reconciled with actual finish (FR-5); the schema already has both |
| N-15 | MEDIUM | FR-28's four causes omit mapping-driven actual-date changes and "marked complete" |
| N-16 | MEDIUM | NFR-C1 asserts a documented tie-break that no document contains |
| N-17 | LOW | §8.1's frozen list is 35 FRs; OQ-12 says "roughly thirty" |
| N-18 | LOW | SM-1 still dates the R0 build "October–November 2026" |
| N-19 | LOW | A WP with no duration (FR-9 creates them) has no defined behaviour in FR-6b |
| N-20 | LOW | FR-43's Data Date default references a Project start that does not exist at creation |

## What holds

- The Data Date machinery in FR-43 and FR-6b's three-state rule is the correct design; it simply has
  no fuel (**N-1**). Fix the producer and the engine is right.
- FR-15's pinned set and its automated re-derivation test, and FR-35's schedule-inclusive
  reproduction test, are exactly what review 1 asked for, in the requirements, not the Glossary.
- FR-9/FR-10/FR-11's import rewrite is thorough and internally consistent apart from N-3 and N-8;
  the "links made in the tool survive an ambiguous re-import" rule is better than the fix required.
- FR-16's graph diff with "Every date change is attributable" is a stronger closure of D-2 than the
  review asked for.
- Leaf-only scheduling (§3, FR-5, FR-6a) is clean, and the ancestor/descendant check is correctly
  argued as separate from cycle detection.
- FR-32's two labelled finish dates, with the gap shown rather than hidden, is the honest answer to
  A-7 and is consistent with §7.1.
- §8.3's "the semantics FR-6b implies are specified, not excluded" table is the right instrument and
  it is accurate.
- The ledger half remains untouched and remains correct under recalculation, exactly as review 1
  found — with the single exception that Mapping now reaches back into the schedule (**N-2**).

---
title: Readiness verification — is the PRD handoff-ready after the third fix pass?
created: 2026-09-20
reviewer: readiness check (focused), against review-scheduling-adversarial-2.md
scope: prd.md and addendum.md as amended 2026-09-20 (third pass), packages/db/src/schema.ts
verdict: all six named blockers are closed in the FRs; one new CRITICAL was introduced by the N-5 fix
---

# Readiness verification

The second review's six blockers are genuinely closed, in the requirements a story is written
from — not in the Glossary, not only in §13. The fix pass is the strongest of the three.

It also introduced one defect of the same family as N-2, in the same place, by the same mechanism:
the N-5 fix made **Percent Complete** a scheduling input, and Percent Complete is computed from
Tracker Snapshot data. The pipeline the PRD spent two rounds pushing out of the schedule walks back
in through the progress door. Details in Part 2.

---

## Part 1 — Closure walk of the six blockers

### N-1 — no producer of a historical actual date. **CLOSED.**

FR-5 makes actual dates a typed PM field:

> "For each **leaf** WP the PM sets: … an optional **actual start** and **actual finish**"
> "**Actual dates are PM-owned inputs, not observations.** A leaf WP's actual start and actual
> finish are dates the PM sets, imports with the plan (FR-9), or accepts from a proposal. Marking a
> WP complete asks for its actual finish and proposes today, which the PM can change to the date the
> work really finished."

FR-9 adds the import producer:

> "**actual start** and **actual finish** are imported as the WP's actual dates (FR-5). They are the
> one kind of date the importer does write … Without them a four-month-old project would arrive with
> every leaf marked *remaining* and the scheduler would re-date finished work forward from the Data
> Date."

FR-9 also imports percent complete; FR-10's *Progress preview* shows "how many rows arrive complete,
in progress and remaining", and UJ-1's file now carries 進捗率 and a 実績開始/実績終了 pair. The
flagship journey has fuel before any Connector exists. FR-42's Opening Balance no longer touches a
date. Both the first-Baseline path and the shared-actual-start path in N-1 are gone.

### N-2 — Mapping writes WP dates hourly. **CLOSED** (for actual dates; see R-1 for progress).

The old rule "a WP's actual start is the time of its first ledger entry" is deleted. §3:

> "**First observed activity** — the date of a WP's earliest ledger entry across its Mapped Tickets.
> It is **display-only evidence**, offered as a proposed actual start that the PM accepts or ignores.
> It is never itself an actual date and never reaches the scheduler (FR-5, FR-21)."

FR-21:

> "**Mapping never moves the plan.** … They do not write a WP's actual start or actual finish and
> they do not trigger a recalculation (FR-5, FR-6b)."

FR-22 states the same for unattended rule re-evaluation; FR-6b carries an explicit non-trigger list;
NFR-A1 logs actual-date changes "with the previous value and the source — typed, imported (FR-9), or
accepted from a first-observed-activity proposal". Every consequence N-2 listed has a home.

### N-3 — FR-10 proposed the latest imported date as the Data Date. **CLOSED.**

FR-10:

> "It proposes the **earliest imported start** as the Project start, and **today** as the Data Date.
> The Data Date is never proposed from the file's contents: the latest imported date is the plan's
> intended *end*, often a year out, and accepting it would schedule every remaining WP after the
> plan's own finish (FR-43, §3)."

FR-43 agrees ("it **defaults to today**, never to a date read out of the plan's contents"), which also
closes N-20 — the old default referenced a Project start that did not exist at creation. UJ-1 step 5
now reads "accepts today as the Data Date". Three defaults reduced to one.

### N-10 — §7.3's freeze contradicted OQ-11's brief to UX. **CLOSED.**

§7.3 gained the resolve-versus-add table, whose `bmad-ux` row is explicit:

> "Designing the surface FR-6a, FR-6b and FR-7 already require — including the answer to what the PM
> sees when one edit moves a hundred dates, and how a violation, an out-of-sequence link or negative
> Float is explained. Deciding *how* is the job; the cost of *what* is already in R0."

OQ-11 carries the matching line ("*Not a scope addition:* designing what FR-6a, FR-6b and FR-7
already require is `bmad-ux`'s job and needs no correct-course pass"). The two other open doors are
shut: §8.3's layered-calendar invitation is withdrawn in the text itself, and FR-8's "no limit" is
replaced by "**The tested bound is the bound.**" The enforcement gap N-10 named is answered as far as
a document can answer it — "every downstream artifact produced against this PRD opens with one line
naming which column of the table above its output sits in" — and the PRD says plainly that this makes
skipping the brake a visible omission rather than an automatic block. That is honest, and sufficient.

### N-11 — R0 required two complete WCAG-AA scheduling surfaces. **CLOSED.**

FR-7:

> "**R0 ships exactly one scheduling surface: the tree grid.** … A Gantt arrives in R1, alongside the
> client-facing schedule it exists to serve (FR-34)."
> "*Why one.* Two complete dependency- and constraint-editing surfaces is two builds, each under
> NFR-U1's WCAG 2.1 AA keyboard bar, which most off-the-shelf Gantt components fail (OQ-11)."

§8.1's FR line reads "7 (tree grid only — the Gantt is R1)", §8.2 lists "The Gantt (FR-7)", §8.3
removes the Gantt cut ("**There is no 'drop the Gantt' cut, because R0 has no Gantt**") and addendum B
matches ("**R0 has one surface: the tree grid** … so UX designs one surface rather than two"). The
build-versus-buy decision moved to R1 with the Gantt. Clean, and consistent in all five places.

### N-16 — the tie-break NFR-C1 required was written nowhere. **CLOSED** (as a named deliverable).

NFR-C1 now says what it can say and no more:

> "**The rule itself is an architecture deliverable, not a property this PRD can assert** (OQ-13)"

FR-6b matches: "ties are broken by the rule recorded in the architecture document (NFR-C1, OQ-13) —
not left to iteration order, and not asserted here as though it already existed." OQ-13 exists, is
owned by `bmad-architecture`, and is due "before the first scheduler story is estimated". FR-15's
re-derivation test and FR-35's reproduction test both point at it. This is exactly the closure the
review asked for.

---

## Part 2 — Does the single-writer claim hold?

**The §4.2 claim as now worded is literally true. A second claim standing beside it is not.**

§4.2 was rewritten into two separate statements, which is what made it defensible:

> "**One writer of derived dates.** `FR-6b` is the only producer of a WP's planned start and finish.
> Not the importer (FR-9), not a re-import (FR-11), not a Disposition (FR-29), not the Mapping layer
> (FR-21, FR-22), not a Tracker Snapshot (FR-19), not the PM."
> "**Actual dates are inputs, not derived dates, and they have exactly two writers.** … written by the
> PM … and by the Excel import the PM confirms (FR-9, FR-10)."

### The writer trace

| Writer | Planned start/finish | Actual start/finish | Verdict |
|---|---|---|---|
| Importer (FR-9) | "**Imported planned dates never become WP dates.** The importer writes no derived start or finish" — pair becomes a duration plus reference Custom Fields | writes them, declared: "They are the one kind of date the importer does write" | consistent |
| Re-importer (FR-11) | "it never writes a planned WP date. Planned dates change only because FR-6b recomputed them" | overwrites actual dates and Percent Complete, each listed in the diff | consistent, but see C-2 below |
| Dispositions (FR-29) | "**It does not move the plan, and neither does any other Disposition.**" *Plan* creates a WP with no links and an ASAP constraint | proposes an actual start from first observed activity; "**nothing writes an actual date behind the PM's back**" | consistent |
| Mapping layer (FR-21, FR-22) | "**Mapping never moves the plan.**" / "**Live rules never move the plan.**" | "They do not write a WP's actual start or actual finish" | consistent on dates |
| Tracker Snapshots (FR-19, FR-25, FR-42) | not a trigger (FR-6b); FR-42's Opening Balance is "dated at the snapshot" in the *ledger* only | none | consistent |
| PM (FR-5) | "**Planned start and finish dates are not typed.**" | writes both | consistent |
| Baselines (FR-15, FR-16), Published Snapshots (FR-35) | pin and read only | pin and read only | consistent |

Every path holds. The rewrite from the old absolute ("no other part of the system writes a WP date")
into two scoped statements is what fixed it, and the scoped statements survive the trace.

### What does not hold: "the Data Date is the only thing that advances the plan through time"

§3 and FR-43 both assert:

> "**It is the only thing that advances the plan through time**: no Tracker Snapshot, Mapping change
> or ledger entry moves it or any derived date (FR-21, FR-22)." *(§3, Data Date)*

This is false, through Percent Complete. See **R-1**.

---

## Part 3 — Findings

### R-1. CRITICAL — evidence-derived Percent Complete puts the hourly pipeline back into the schedule

The N-5 fix made remaining duration a function of Percent Complete. FR-6b:

> "**Remaining duration is derived from progress, not from elapsed time.** It is
> `duration × (1 − Percent Complete)` … Percent Complete is FR-30's figure — **from Ticket
> completion**, from an import, or from an audited PM override"

and puts it in the trigger set:

> "The complete trigger list is: … a **Percent Complete** that FR-6b reads as progress"

FR-30 then says where that figure comes from, and says the coupling out loud:

> "*count basis*, used when any Mapped Ticket has no estimate: **resolved Tickets ÷ Mapped Tickets**"
> "**Estimates:** Ticket estimates are read from the **latest Tracker Snapshot**."
> "**Percent Complete is also a scheduling input.** FR-6b derives a WP's remaining duration from it,
> so **every rule in this section — the bases**, the cap, the flags and the override audit — governs
> the plan's dates as well as its EVM."

Compose those. An offshore developer closing a Backlog ticket at 22:00 changes `resolved Tickets ÷
Mapped Tickets` on the next hourly snapshot (FR-19), which changes that WP's Percent Complete, which
changes its remaining duration, which changes its derived finish, which moves every successor. No PM
touched anything. Mapping a Ticket changes the denominator and does the same thing.

That directly contradicts five statements written in the same pass:

1. **FR-6b's own non-trigger paragraph** — "A Tracker Snapshot, a ledger entry, a Mapping or
   remapping, and a Mapping Rule firing in the background change attribution, Unplanned Work and
   EVM — and no WP date. The plan does not move while nobody is looking at it."
2. **FR-21**, in one sentence — "Mapping, remapping and unmapping change attribution, Unplanned Work,
   **Percent Complete's evidence** and every EVM figure — **and no WP date**." The clause naming the
   cause and the clause denying the effect are eleven words apart.
3. **FR-22** — "**Live rules never move the plan.** … A PM who opens the tool on Monday sees the
   dates they left on Friday."
4. **§3 / FR-43** — the Data Date is "the only thing that advances the plan through time".
5. **FR-28** — "**There is no cause for a mapping change, because a mapping change cannot move a
   date** (FR-21, FR-22) — the blank cause column that would otherwise appear is designed out rather
   than explained away." It is not designed out; it is re-labelled *progress changed*, which is at
   least a non-blank cause, but the sentence asserting the impossibility is wrong.

Addendum A.5 states the intended rule and shows the inconsistency most sharply:

> "**Recalculation triggers are a closed set** (PRD FR-6b). Actual-date and Percent-Complete changes
> are in it; Tracker Snapshots, ledger writes, Mappings and background rule evaluation are
> deliberately not. … Enforce this … a test that no snapshot or mapping code path reaches
> `schedule.recalculate`."

A closed set that contains Percent-Complete changes and excludes the only thing that produces them
automatically cannot be enforced by that test, because the snapshot path does not call
`recalculate` — it changes an input `recalculate` reads, and the schedule is then either stale
(violating NFR-C1's "a displayed schedule is never stale against the inputs it was derived from") or
recomputed by a background job (violating NFR-P1's "300 ms budget covers PM edits and never a
background job").

**Two clean resolutions, both one paragraph:**

- **(a) Narrow the input.** FR-6b reads only an *explicit* Percent Complete — imported (FR-9) or a PM
  override (FR-30) — as a scheduling input. Evidence-derived Percent Complete drives EVM only, and is
  shown beside the schedule figure as evidence, exactly as first observed activity is shown beside
  actual start. This is the same move that fixed N-2, applied to the same problem, and it preserves
  every sentence quoted above.
- **(b) Accept the coupling.** Delete the four denials, state that the plan does move on evidence,
  give NFR-P1 a background-recalculation budget, and let FR-28's *progress changed* cause carry it.

(a) is consistent with everything else the PRD now says. Either way this must be decided **in the
PRD**, not in architecture: it changes FR-6b's trigger list, FR-21, FR-22, FR-28, FR-30, FR-43 and §3.

### R-2. HIGH — FR-28's cause list is closed at six and misses a Project start change

FR-28:

> "Every WP whose Current Plan dates have moved since the previous Review is marked with one of
> **exactly six causes**: *edited* (a duration, dependency or constraint on this WP changed), *moved
> by a predecessor* (only upstream inputs changed), *calendar changed*, *data date advanced*, *actual
> dates recorded*, or *progress changed*."

FR-43 makes a seventh thing move dates:

> "**Every change to any of the three triggers a full recalculation** (FR-6b)"

A changed **Project start** re-dates every remaining WP that the forward pass anchors on it, and
matches none of the six: it is not an input on the WP (*edited*), not upstream (*moved by a
predecessor*), and not the Data Date. FR-6b's trigger list also carries "a WP created, deleted, moved
or re-parented", whose effect on a *re-parented* WP's own roll-up is likewise uncovered. Since FR-28's
list is explicitly closed and NFR-A1 already logs Project start changes, the fix is to add a seventh
cause — *project settings changed* — or to widen *edited*. Left as is, the exact failure FR-28 exists
to prevent (a hundred dates with a blank cause column) reappears on the one action most likely to
move a hundred dates at once.

### R-3. MEDIUM — §4.2 names FR-9/FR-10 as the second writer of actual dates; FR-11 also writes them

§4.2: "written by the PM … and by the Excel import the PM confirms (**FR-9, FR-10**)". FR-11:

> "A re-import can overwrite durations, dependencies, constraints, **actual dates** and percent
> complete … A re-import clears an actual date or a Percent Complete override only where the
> corresponding column is mapped and the cell is empty"

A re-import is plainly "the Excel import" in spirit, and FR-11's own behaviour is well specified — but
§4.2 is the statement the architecture will be tested against, and it cites FR-11 in the *derived*-date
bullet while omitting it from the *actual*-date bullet. Add FR-11 to the citation. Addendum A.1 has the
same omission ("PRD FR-5, FR-9").

### R-4. LOW — §8.1 says "the critical path to the Project finish"; Project finish is optional

§8.1: "Float and the critical path **to the Project finish** (FR-6a, FR-6b)". FR-6b anchors on "the
**Project finish** where the PM has set one, and otherwise the **computed finish**". One-word fix; it
matters only because §8.1 is the frozen list stories are decomposed from.

### What was checked and is clean

- **Reference integrity.** Every FR, NFR and OQ cited in prd.md resolves to a defined entry: FR-1
  through FR-43 including FR-6a/FR-6b, NFR-S1–S8/D1/A1/C1/R1/R2/P1/I1/U1/O1, OQ-1–OQ-13. No dangling
  or misdescribed cross-reference found.
- **The 36 count.** §8.1's list — 1, 2, 3, 4, 5, 6a, 6b, 7, 8–17, 19–32, 38, 39, 42, 43 — is exactly
  36 entries. N-17 closed.
- **Two names for two dates.** §3's *Float* and *Critical Path* entries now both say *computed
  finish*; FR-32 dropped "scheduled finish" and says so explicitly ("a third label for either of them
  would be a third date to a reader"). N-7 closed, and no third sense survives anywhere.
- **"done date"** is gone from §3, replaced by "there is no separate 'done date', and 'done' means the
  WP has an actual finish (FR-5)"; FR-31's milestone rule matches ("past its Baseline date and **has
  no actual finish** — which is what 'not done' means"). N-14 closed. *Note for architecture:*
  `schema.ts` still carries both `completed_at` and `milestone_done_at` on `work_package`; the PRD now
  says there is one.
- **SM-1** carries no month, and states why. N-18 closed.
- **§6's cut trigger** is now a procedure with a date, an artifact and a firing rule ("the first 'not
  yet' recorded on or after 2026-12-01 fires the §8.3 cut order at item 1"), and §8.2/§6 state one
  deadline between them. F-1 closed.
- **One cut order**, with item 2 never taken before item 1, which closes N-12's badge problem.
- **Schema** (`packages/db/src/schema.ts`) is unchanged and still has no duration, dependency,
  constraint, actual-date, Percent-Complete, Project start/finish or Data Date column; `baseline_wp`
  stores outputs only; `work_package.start`/`.finish` are nullable and writable by anything. §13
  records migrations as pre-production, so this is architecture's cost, not a PRD defect — listed so
  nobody assumes the model moved.

---

## Part 4 — Readiness

### `bmad-create-epics-and-stories` — **BLOCKED for the plan/progress slice; READY for the rest.**

Roughly thirty of the 36 entries — FR-1–FR-4, FR-7–FR-17, FR-19, FR-20, FR-23–FR-27, FR-29, FR-31,
FR-32, FR-38, FR-39, FR-42 — are at story granularity with testable consequences and can be decomposed
today. N-1, N-2 and N-3 are closed, so the reasons review 2 gave are gone.

**R-1** blocks a different, smaller set: **FR-6b, FR-21, FR-22, FR-28, FR-30 and FR-43**. Whichever
resolution the founder picks changes FR-6b's trigger list, FR-21's and FR-22's headline promises,
FR-28's cause list, FR-30's scheduling-input paragraph and §3's Data Date entry. Any acceptance
criterion written against them today asserts behaviour the PRD contradicts elsewhere. **R-2** adds a
seventh cause to FR-28 and should be fixed in the same edit. Both are paragraph-sized.

### `bmad-architecture` — **READY WITH CONDITIONS.**

The data model is fully specified: FR-43's three Project settings, FR-15's pinned set (inputs, actual
dates, Percent Complete, calendar version, Data Date), FR-35's snapshot contents, FR-14's versioned
calendar, FR-16's graph diff, FR-39's export, addendum A.5's single write path. Design can start.

Conditions:
- **Do not design the recalculation trigger set until R-1 is decided in the PRD.** A.5's "closed set"
  and its enforcing test are unimplementable as written; the answer determines whether there is a
  background recalculation path at all, and therefore whether NFR-P1 needs a second budget.
- **OQ-13's tie-break rule**, which FR-15's re-derivation test and FR-35's reproduction test both
  assert against. Already owned and correctly scoped.
- **The migration.** Every scheduling column is missing from `schema.ts`, and the one-write-path rule
  must be enforced against the schema, not only the code.

### `bmad-ux` — **READY.**

Both blocks are gone. §7.3's table gives UX explicit permission to design what FR-6a, FR-6b and FR-7
require, and OQ-11 repeats it; FR-7 reduced the brief to one surface with the Gantt's build-versus-buy
question moved to R1. The two requirement decisions masquerading as design questions are settled in
the PRD: imported milestones keep their target as a *must finish on* (FR-9), and a violation stays on
its own WP rather than displacing the critical path (FR-6b, §3). Addendum B's brief matches the PRD
line for line.

One note, not a block: the answer to "what the PM sees when one edit moves a hundred dates" should be
designed after R-1 is decided, because (b) would add an unattended overnight movement to explain that
(a) would not. The surface itself is stable either way.

**Recommended order:** decide R-1 and fix R-2 and R-3 in the PRD (one editing pass); then run
`bmad-create-epics-and-stories` and `bmad-architecture` in parallel; then `bmad-sprint-planning` for
OQ-12; `bmad-ux` can start now on the tree grid.

---

## Part 5 — Scale

**Yes, this PRD still promises more than one person at 20+ hours a week can deliver in time for R1 to
be client-facing in Q1 2027** — 36 FR entries including a progress-aware CPM engine with three
constraint types, soft-constraint violation reporting with chain attribution, out-of-sequence
handling, a versioned two-country working-day calendar, an importer that must carry plan *and*
progress against a ten-file acceptance corpus, a polling connector, an append-only ledger, PMI EVM
with two CPIs and TCPI, baselines with an automated re-derivation test and two export formats, none of
it sized (OQ-12) and none of it decomposed — and §6's new trigger says so in the PRD's own terms: R0
must be in founder use by 2026-11-30, roughly ten weeks away, for the gate to clear in time.

The cut order is the right instrument and item 1 (the two extra constraint types) is the right first
cut; **ahead of it I would take one cut that is not yet in the order — FR-32's trend finish**, which
costs a second forecast date, a rounding rule, a disagreement to explain in the UI and a support
burden, for a number FR-6b's computed finish now supersedes and the founder can compute in Excel.

---

## Summary table

| # | Severity | Finding |
|---|---|---|
| R-1 | CRITICAL | Evidence-derived Percent Complete (FR-30) is a scheduling input (FR-6b), so an hourly Tracker Snapshot or a Mapping change moves derived dates — contradicting FR-6b's non-trigger list, FR-21, FR-22, FR-28 and §3/FR-43's "the Data Date is the only thing that advances the plan through time", and addendum A.5's closed trigger set |
| R-2 | HIGH | FR-28's cause list is closed at six and has no cause for a Project start change, which FR-43 makes a full-recalculation trigger |
| R-3 | MEDIUM | §4.2 (and addendum A.1) name FR-9/FR-10 as the second writer of actual dates; FR-11's re-import also writes and clears them |
| R-4 | LOW | §8.1 says "the critical path to the Project finish"; FR-6b anchors on the computed finish where no Project finish is set |

| Blocker | Status |
|---|---|
| N-1 actual-date producer | CLOSED — FR-5 typed fields, FR-9 imported columns, FR-10 progress preview |
| N-2 Mapping writes dates | CLOSED — first observed activity is display-only (§3, FR-5, FR-21, FR-22) |
| N-3 Data Date proposal | CLOSED — FR-10 and FR-43 both propose today |
| N-10 §7.3 vs OQ-11 | CLOSED — §7.3's resolve/add table, §8.3's invitation withdrawn, FR-8 bounded |
| N-11 two scheduling surfaces | CLOSED — FR-7 ships the tree grid only; the Gantt is R1 |
| N-16 tie-break | CLOSED — NFR-C1 and FR-6b name it an architecture deliverable (OQ-13) |

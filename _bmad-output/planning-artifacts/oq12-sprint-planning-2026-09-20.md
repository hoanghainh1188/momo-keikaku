---
skill: bmad-sprint-planning
date: 2026-09-20
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/prds/prd-momo-keikaku-2026-09-19/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-momo-keikaku-2026-09-20/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-momo-keikaku-2026-09-20/EXPERIENCE.md
  - _bmad-output/decisions-pending-2026-09-20.md
outputs:
  - _bmad-output/implementation-artifacts/sprint-status.yaml
closes: [OQ-11 cost half, OQ-12]
reopensAndCloses: [OQ-10]
founderDecision:
  date: 2026-09-20
  scope: re-affirm the frozen 36-FR list in full — nothing cut
  capacity: 40 h/week (was "20+ h/week")
  r0Date: 2027-04-14
  r0Range: 2027-02-12 .. 2027-07-06
  estimate: 1180 h across 70 stories (826 .. 1652)
  unresolved: R1's Q1 2027 date does not survive and needs a new one
---

# Sprint planning for R0 — readiness gate, tracking, and OQ-12

This report delivers PRD OQ-12's four required outputs: **(a)** a date for §8.1,
**(b)** the re-affirmation-or-reduction decision on the frozen 36-FR list,
**(c)** a verdict, **(d)** a separate figure for the plan surface (OQ-11's cost half).

Estimates are this report's own judgment. `epics.md` deliberately carries no numbers,
so nothing here was inherited — and nothing here changes scope. **Output (b) is the
founder's decision**, presented below with its consequences, not taken here.

## Part 1 — Readiness gate: PASS on the plan, CONCERNS on the commitment

The plan is implementable as recorded. The evidence, all measured rather than read by eye:
36/36 FRs land in at least one story's acceptance criteria; 70/70 stories carry the
As-a/I-want/So-that shape with balanced Given/When/Then and a minimum of 3 criteria; no
forward dependencies; all 23 missing tables trace to exactly one creating story; and
candidate scope additions are quarantined in CA-1 … CA-9 instead of being smuggled into
acceptance criteria.

### C1 — A stale local checkout, not a missing merge. No action needed.

This gate first measured the working tree and found `epics.md` absent, the spine's
AD-26 … AD-30 at **zero occurrences**, and `EXPERIENCE.md` with no Float, predecessor,
critical path, What-moved or Build Tiers — the whole foundation Epic 2 rests on. That
measurement was accurate about the checkout and **wrong about the repository**: PR #4
("R0 epics and stories", `eb30a3b`) had merged all of it to `origin/main` at
**2026-09-20 16:44 +0700**, minutes before this session read the refs, and the local
`main` had not fetched.

State now, verified: `main` equals `origin/main`, the trees are identical, and
`87d9915` (PR #2, the spine's scheduler) and `70e02e6` (PR #3, the UX plan surface) are
both ancestors of `main`. On disk: AD-26 × 19, AD-30 × 3, Float × 24, Build Tiers × 3.
`epics.md`'s "State at the time of writing" is true as written.

**The lesson worth keeping is procedural, not architectural**: this gate's inventory
must fetch before it measures, or it will report a planning gap that is really a stale
ref. Nothing is missing and no founder decision is needed here.

### C2 — Open, and it is Part 2 of this report

PRD OQ-12 assigns four outputs to this skill. `sprint-status.yaml` carries none of them:
it is story bookkeeping and holds no estimate. The two jobs are separate, and Part 2 is
the second one.

### Findings that do not block implementation

- **`packages/domain`'s golden tests are mostly absent.** `epics.md` justifies keeping the
  spike's domain layer as "`attribution`, `calendar`, `evm`, `forecast`, `health`, `ledger`,
  `mapping`, `present`, `review`, `units` **and their golden tests**". Measured: 10 modules,
  **2 test files** (`attribution.test.ts`, `evm.test.ts`). Eight modules have no test. The
  modules are still worth keeping, but Epics 5 and 6 inherit the cost of writing coverage
  to this project's 80% standard rather than inheriting proven code. This is priced in below.
- **AD-1 is violated in 8 source files** plus `next.config.ts`, as `epics.md` states. Confirmed.
- **AR-1 … AR-62 are `epics.md`'s own labels**, defined in its *Additional Requirements*
  table with a Source column back to AD-1 … AD-30. They are not dangling references.
- **Stale passages** in PRD OQ-11, PRD addendum B, and `sprint-change-proposal-2026-09-20.md`
  §2 still say the UX spines are silent on dependencies. False since PR #3's content landed.
  `bmad-prd`'s to fix, with finding R-4 (FR-6b's anchor wording).
- **Open questions that genuinely do not block**: OQ-2 (both measurement modes are built),
  OQ-3, OQ-8, B1/B2/B3, D2. OQ-13's tie-break rule is closed by AD-28, now on `main`.

## Part 2 — OQ-12

### Method

Bottom-up, per story, in hours, for one solo AI-assisted developer, **including tests to
this project's own standard** — TDD, 80% coverage, and for UI stories the WCAG 2.1 AA
keyboard path NFR-U1 requires plus visual regression at 320/768/1024/1440. The strongest
available signal is acceptance-criterion count (min 3, max 13, mean 6.9), adjusted for
whether a story is greenfield or extends measured existing code, and for whether it is
plumbing, a pure function, or a surface.

A single central figure would be false precision. The range is **0.7× optimistic to
1.4× pessimistic**. The hard parts here — RLS correctness, a scheduler with a
hand-computed golden corpus, a WCAG-AA keyboard grid, paginated completeness against a
live API, bitemporal rates — are design-and-verify work, where AI assistance helps
proportionally less than it does on boilerplate.

### The numbers

| Epic | Stories | Hours | What it is |
|---|---|---|---|
| 1 | 9 | **156** | Tenant, people, isolation — the substrate |
| 2 | 16 | **308** | A plan that re-dates itself |
| 3 | 8 | **130** | Excel WBS → live plan |
| 4 | 5 | **66** | A Baseline that explains itself |
| 5 | 15 | **240** | Actuals arrive from Backlog |
| 6 | 9 | **160** | Thursday's teirei report |
| 7 | 3 | **46** | The numbers and the plan leave the tool |
| 8 | 5 | **74** | Runs in Tokyo, backed up |
| **R0** | **70** | **1,180** | range **826 – 1,652** |

`epics.md` warned that "Epic 1 is the largest epic in this plan, not the smallest" and that
anyone sizing it from the phrase "stand up the workspace" will under-size R0 at its first
epic. At 156 h it is the second largest, behind Epic 2's greenfield scheduler. The warning
was right about the trap and slightly wrong about the ranking.

### (d) OQ-11's cost half — the two numbers it demands

OQ-11 requires the plan surface sized as its own line item, "because the engine being
cheap is the reason the surface keeps being costed as though it were."

| Line item | Stories | Hours |
|---|---|---|
| FR-6b engine, pure — passes, Float, critical path, constraints, corpus, ordering | 2.3 – 2.8 | **92** |
| Write path and plumbing — the AD-25 fence, `schedule_run`, settings, calendar | 2.9 – 2.12 | 78 |
| **Plan surface** — grid, Schedule preset, dependency editing, strip, What-moved, exceptions rail | **2.13 – 2.16** | **98** |
| Plan surface including baseline-compare columns | + 4.5 | 110 |

**The surface is 1.07× the pure engine, not a rounding error on it.** OQ-11's premise is
confirmed. Its Comfort rows — 3 in story 2.13, 2 each in 2.14, 2.15 (*Undo this edit*),
2.16 — are worth roughly **18 h** and, as `EXPERIENCE.md` intends, cutting them removes no
FR behaviour and needs no correct-course pass. That places them **above** §8.3 item 1 in
any sensible cut order, exactly as `epics.md` argued.

### (c) Verdict: **FAIL** against every date the PRD implied on 2026-09-20

The verdict is against the PRD's own dates as they stood when this report was written.
It is **resolved by the founder's capacity decision in (b), not by anything in the plan**:
the frozen list stands and the new date is 2027-04-14. The two facts the FAIL rests on
remain true and are why the decision was needed — the PRD's implied 2026-11-30 buys 17 %
of R0, and the entire §8.3 cut order is worth 9 %.

**The implied deadline is 2026-11-30.** PRD §6 derives it: R1 is client-facing in Q1 2027,
the §8.1 gate needs four consecutive weekly reports on three projects before R1 starts, so
R0 must be in founder use by 2026-11-30. From 2026-09-20 that is **10.1 weeks ≈ 203 h** at
20 h/week — **17 % of R0 as frozen**.

Concretely: **2026-11-30 buys Epic 1 and 47 hours.** A Tenant, sign-in, the org hierarchy,
Resources and Rates, the audit log, externalised strings, a load fixture — and no plan, no
actuals, no Reconciliation Review. **Nothing the §8.1 gate measures, and nothing of the
wedge.** The gate cannot even begin, because it requires four weeks of Reviews finding
Unplanned Work.

**The §8.3 cut order does not close the gap.** Taking all six items, with each saving traced
to the stories it actually touches:

| Cut item | Saves | Rescue cost | Net |
|---|---|---|---|
| 1 — two extra constraint types → *asap* only | 46 | **+10** (CA-1 milestone flag) | **36** |
| 2 — Float and critical-path display | 29 | — | 29 |
| 3 — re-import diff → replace the Plan | 13 | — | 13 |
| 4 — Custom Fields editor | 6 | — | 6 |
| 5 — Google sign-in | 5 | — | 5 |
| 6 — raw data export reduced | 18 | — | 18 |
| **All six** | | | **107 h = 9.1 % of R0** |

**The entire cut order is worth nine percent.** It was built for a date slipping by weeks,
and the gap is a factor of roughly five. Taking every cut in the order still lands R0 at
**2027-10-01** at 20 h/week. The cut trigger in PRD §6 — the first "not yet" on or after
2026-12-01 firing item 1 — will therefore fire on schedule and change almost nothing, which
is worth knowing before it fires rather than after.

Item 1 also carries the asymmetry `epics.md` flagged: taken literally it deletes every
milestone target date, because PRD §3 defines a milestone's target *as* a `must_finish_on`
constraint. FR-31's two milestone rules, FR-9's milestone import, FR-7's milestone column
and the Review's Milestones table all lose their input. The cheapest rescue is CA-1, a
milestone-only deadline flag — **a capability no FR states, so building it needs
`bmad-correct-course`.** The cheapest cut is not free of governance.

### (a) Dates

| Scenario | Hours | @ 20 h/wk | @ 25 h/wk | @ 40 h/wk |
|---|---|---|---|---|
| R0 as frozen, central | 1,180 | 2027-11-07 | 2027-08-16 | **2027-04-14** |
| R0 as frozen, optimistic 0.7× | 826 | 2027-07-06 | 2027-05-09 | 2027-02-12 |
| R0 as frozen, pessimistic 1.4× | 1,652 | 2028-04-20 | 2027-12-27 | 2027-07-06 |
| R0 after all six §8.3 cuts | 1,073 | 2027-10-01 | 2027-07-17 | 2027-03-24 |
| Minimum-wedge reduction | 744 | 2027-06-07 | 2027-04-16 | 2027-01-18 |

**The date for §8.1 — founder decision of 2026-09-20: `2027-04-14`.** The frozen 36-FR
list is re-affirmed and capacity is raised to 40 h/week (see (b)). Planning range
**2027-02-12 … 2027-07-06**.

**Every scenario in this table lands after R1's Q1 2027 window**, and capacity does not
recover it. The §8.1 gate requires four consecutive weekly Reviews *after* R0 is in
founder use: 2027-04-14 + 4 weeks means the gate passes **2027-05-12 at the earliest**,
which is Q2, and that is before R1's own build begins. **R1's Q1 2027 date misses by at
least 42 days and does not survive.** It needs its own date, which is `bmad-prd`'s to set.

### (b) Re-affirm or reduce — decided 2026-09-20: **RE-AFFIRM, at 40 h/week**

**The founder re-affirms the frozen 36-FR list in full and raises capacity from 20+ to
40 h/week.** Nothing is cut, no correct-course pass is needed, and OQ-12 closes with the
date in (a): **2027-04-14**.

This report had recommended REDUCE. The founder chose the third option instead, which is
the one lever that changes the arithmetic more than any cut does — the full §8.3 cut order
is worth 9 % and doubling capacity is worth 50 %. The reasoning below is kept as the record
of what was weighed, and the risks the choice carries are stated after it.

**What this choice does not fix.** R1's Q1 2027 date is gone either way — see (a). The
§8.3 cut order stays available and unexercised, so it remains the response if the new date
slips rather than something already spent.

**The three risks this choice concentrates, in order:**

1. **40 h/week is sustained for 29.5 weeks — 6.8 months — on top of running five
   projects.** The founder is the PM on those projects; the weekly teirei report this
   product exists to replace is still owed every Thursday during the entire build. This is
   the single point of failure, and no artifact in the plan mitigates it.
2. **The estimate range is not symmetric under doubled load.** The 1,180 h figure assumes
   focused hours. Sustained 40 h/week solo, with no fresh-eye review and less recovery,
   makes the **pessimistic 1,652 h / 2027-07-06** outcome more likely than the optimistic
   one, not less. The date should be read as *2027-04-14 with a tail to July*, not as a
   commitment.
3. **There is no slack in it.** 29.5 weeks at 40 h/week allows no holiday, no illness and
   no client emergency. The re-anchored trigger in step 2 of *Recommended next steps* is
   what converts a slip into a decision instead of a silent overrun.

The mitigation available and not yet taken: **Epic 1 is 156 h and is in every scenario.**
Building it first at the new capacity produces a real velocity measurement inside four
weeks, against which this whole estimate can be re-derived before much is committed.

---

*The analysis that produced the recommendation, retained as the record:*

Re-affirming the 36-FR list means accepting R0 in late 2027 and moving R1 with it. That is
defensible: §8.1 is founder-only, has no external commitment, and the PRD says plainly that
the date moving "costs dogfooding time, not market position". The cost is the *thin moat*
risk in §6, which already weakened on 2026-09-20 — Swarmia is one "planned FTE" field away
from the wedge, and a 2027-Q4 R0 means the wedge is unproven for another year.

Reducing needs no governance gate: §7.3 states that anything reducing scope stays available
without a correct-course pass. Only a *replacement* capability such as CA-1 needs one.

**A minimum-wedge R0, sized.** The §8.1 gate measures one thing: four consecutive weekly
Reconciliation Reviews on three projects, each finding Unplanned Work and giving it
Dispositions. That needs actuals, a plan to compare them against, and the Review. It does
**not** need a plan that re-dates itself.

| Keep | Hours | Why |
|---|---|---|
| Epic 1, whole | 156 | Substrate. Unavoidable, and the isolation proof *is* FR-1 |
| Epic 5, whole | 240 | The actuals. This is the wedge; §8.3 never cuts FR-19 – FR-32 |
| Epic 6, whole | 160 | The Review. This is the gate |
| Epic 2, reduced to a visible plan — migration, spike disposal, WP editing, grid, **no scheduler** | 74 | A plan to compare against, without the 234 h engine and surface |
| Epic 3, reduced — import with typed dates, no derivation, no re-import diff | 72 | How a real plan gets in |
| Epic 4, reduced — set and re-baseline only | 22 | FR-20's baselined bucket and FR-24's LoE branch need a Baseline to exist |
| Epic 8, reduced — one box in Tokyo, backups, no full ECS topology | 20 | Founder-only needs hosting, not the production topology |
| **Total** | **744** | **2027-04-16 at 25 h/week** |

Deferred to R1 or later: FR-6a, FR-6b and FR-43 with the plan surface (Epic 2's 234 h), the
re-import diff, Baseline comparison depth, both exports (Epic 7), and Epic 8's full topology.

**The honest cost of this option**: deferring FR-6b defers the capability the
2026-09-20 sprint change proposal was written to restore, and PRD §8.3 says the forward pass
"is never cut" because it "is the reason the plan can live in this tool rather than in
Excel". Choosing this option reverses that judgment. It is a real reversal and should be
recorded in §13 as one, not slipped in as a cut.

**Third option, if neither fits: raise capacity.** At 40 h/week the frozen list lands
2027-04-14. Nothing else in this report changes the arithmetic as much as that does.
**This is the option the founder took.**

## Recommended next steps

Output (b) is decided. What remains is recording it and starting.

1. **`bmad-prd` applies the decision to the PRD.** Five edits, all consequences of (b) and
   none of them a scope change:
   - **§8.1** — replace "carries no date" with **`2027-04-14`**, range 2027-02-12 … 2027-07-06,
     and re-affirm the 36-entry list explicitly against it.
   - **§6** — replace the interim cut trigger. §6 itself says to do this "when
     `bmad-sprint-planning` returns a date". The new rule should carry the fact that the
     §8.3 cut order is worth **9 %**, so that firing it is understood as a signal rather
     than a remedy.
   - **§8.2 / §6** — **R1's Q1 2027 date does not survive** (see (a)); it needs its own date.
   - **OQ-10** — reopen and reclose at **40 h/week**; it was closed at "20+ h/week".
   - **OQ-12** — close, citing this report.
2. **`bmad-build` starts at story 1.1.** Epic 1 is 156 h and is in every scenario, so it was
   never blocked on this decision.
3. **Re-derive this estimate after Epic 1**, at roughly the four-week mark. Epic 1 is 13 % of
   R0 and the first real velocity measurement at the new capacity; it is the cheapest
   opportunity to find out whether 1,180 h was right before much is committed.
4. **`bmad-prd`** also fixes the three stale passages and finding R-4 (unrelated to (b)).
5. **`bmad-correct-course`** is needed only if CA-1 is later wanted — for example if the
   date slips, the cut order fires, and milestone target dates need rescuing.

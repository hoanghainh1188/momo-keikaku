---
review: adversarial, scoped to the OQ-12 sprint-planning amendment only
date: 2026-09-20
target: prd.md (§1, §6, §8.1, §8.2, §10, §12, §13), addendum.md §B
source: planning-artifacts/oq12-sprint-planning-2026-09-20.md
verdict: the amendment records the decision faithfully but leaves the PRD self-contradicting on the two things it changed — whether a FAIL verdict obliges a cut, and whether the scope freeze is still on
---

# Adversarial review — the OQ-12 amendment

Scope: only what the 2026-09-20 sprint-planning amendment changed, and what it should
have changed and did not. The rest of the PRD is out of scope and is not reviewed.

Method: `git diff` on the three touched files; independent re-computation of every figure
from 2026-09-20; a read of the source report against the PRD's account of it; and a sweep
of the PRD and the other `_bmad-output/` artifacts for passages that depend on R0's date,
R1's date or capacity.

---

## 1. Internal contradiction

### C-1 (CRITICAL). The PRD's own "FAIL ⇒ cut item 1" rule survives unstruck, while the amendment records FAIL and cuts nothing.

- `prd.md:1275` — OQ-12 *Required outputs*, retained and unstruck: "If the verdict is
  CONCERNS or FAIL, the first cut is **item 1 of the §8.3 cut order**".
- `prd.md:1324` — §13, unstruck: "If sprint planning returns CONCERNS or FAIL, these two
  types are the first cut considered (OQ-12)."
- `prd.md:1277` — the amendment's own closure: "**(c) FAIL**".
- `prd.md:1086` — the amendment's own consequence: "Nothing was removed … **the §8.3 cut
  order remains available and entirely unexercised.**"

The document now states a pre-committed rule, states that the rule's trigger condition was
met, and states that the rule was not applied — in three places, none of which acknowledge
the other two. The closure offers a defence ("resolved by the capacity decision, not by
anything in the plan"), but it is attached to the verdict, not to the rule, and neither
`:1275` nor `:1324` is amended or marked superseded. A pre-commitment that is silently
skipped the first time it fires is worse than no pre-commitment, because the record now
reads as though nobody noticed.

### C-2 (CRITICAL). §7.3's freeze is worded to expire on exactly the event that just happened.

`prd.md:1050`: "The correct-course gate is the brake, and it stays on **until**
`bmad-sprint-planning` has returned a date and a verdict against the frozen list (OQ-12)."

OQ-12 returned both on 2026-09-20. Read literally, the brake is now off — at the moment
the plan is at its most exposed, with a 29.5-week solo build about to start. §7.3 was not
touched by the amendment. Either the "until" clause was never meant literally and must be
reworded, or the freeze has lapsed and §7.3's whole table is now advisory.

### C-3 (HIGH). OQ-12's retained body still asserts, in the present tense, that R0 is unsized.

`prd.md:1273`: "R0 is **36 FR entries** … At 20+ hours a week, solo. **No Epics or Stories
exist**, so no per-item estimate exists for any of it, and the date that would have exposed
a mismatch was withdrawn…"

Only the heading is struck. Unlike OQ-11 at `:1266`, which explicitly says "*The original
question is retained below for the record*", OQ-12 carries no such marker, so the body reads
as live text. It asserts the superseded 20+ h/week, the absence of epics and stories (70
exist), and a withdrawn date that has since been replaced.

### C-4 (HIGH). §6's *thin moat* mitigation still rests on dates the amendment withdrew.

- `prd.md:1017`: "Speed is now defended at R1 and at the 2027-01-01 repricing, not at an R0
  date that faces no customer."
- `prd.md:55` (§1.1): "The dates that face the market are R1 and the 2027-01-01 Backlog
  repricing."

R1's date was withdrawn (`:1098`) and the earliest event on R1's path is now 2027-05-12,
five months *after* the repricing. Speed is therefore defended at nothing. §8.2 itself says
so — "§6's *thin moat* risk is the one that bites" (`:1102`) — and then leaves §6 and §1.1
asserting the opposite. The amendment edited the section that diagnoses the problem and not
the two sections that carry the false claim.

### C-5 (HIGH). Two cut orders now exist, in a document that says there is only one.

- `prd.md:1168` (§8.3): "**This is the only cut order**" — items 1 to 6, unchanged.
- `prd.md:1266` (OQ-11, new): the plan surface's Comfort rows "are worth ~18 h and cutting
  them removes no FR behaviour, which places them **above** §8.3 item 1 in any sensible cut
  order."
- `prd.md:1013` (§6, new): the rule fires "the **§8.3 cut order … at item 1**".

The amendment identified a cheaper first cut and did not put it in the order, so the rule it
wrote fires at the second-cheapest cut. §8.3's own preamble explains why this is bad: "two
orders in one document is no order at all".

### C-6 (MEDIUM). Smaller surviving assertions.

- `prd.md:1082` — "the input to the only sizing decision left (OQ-12)", present tense, after
  OQ-12 closed.
- `prd.md:1092` — "Build capacity is **settled** at 40 h/week", against `:1062` and `:1010`
  calling that same figure the plan's single point of failure and the assumption most likely
  to break. "Settled" is the wrong word for an input the amendment elsewhere says nothing
  mitigates.
- `prd.md:1302` — §13's release-split bullet is annotated for 2026-12-15 but still reads
  "R1 (client-facing, **Q1 2027**)" with no qualification.
- `prd.md:1331` — "§6's cut trigger is re-anchored **until a date exists**", unstruck; a
  date now exists.
- `prd.md:1195` — "OQ-12's sizing put R0 itself in Q2" ignores the range's own lower bound,
  2027-02-12, which is Q1.

---

## 2. Arithmetic

Recomputed independently from 2026-09-20 as day zero, calendar weeks, no working-day
adjustment (which is what the source table does).

| Claim | Where | Recomputed | Verdict |
|---|---|---|---|
| 1,180 h ÷ 40 h/wk = 29.5 weeks | `:1010`, `:1359` | 29.5 weeks exactly | **reproduces** |
| 29.5 weeks from 2026-09-20 → 2027-04-14 | `:1060` | +206.5 d = 2027-04-14/15 | **reproduces** |
| 826 h → 2027-02-12 | `:1060` | 20.65 wk = +144.6 d = 2027-02-12 | **reproduces** |
| 1,652 h → 2027-07-06 | `:1060` | 41.3 wk = +289.1 d = 2027-07-06 | **reproduces** |
| R0 + 4 weeks = 2027-05-12 | `:1094`, `:1098` | 2027-04-14 + 28 d = 2027-05-12 | **reproduces** |
| cut order 107 h = 9 % of 1,180 | `:1013`, `:1356` | 107/1180 = 9.07 % | **reproduces** |
| 2026-11-30 = 17 % of R0 | `:1277`, `:1357` | 71 d = 10.14 wk × 20 h = 203 h = 17.2 % | reproduces **only at 20 h/week** — see A-2 |
| Epic 1 = 13 % of R0 | `:1011` | 156/1180 = 13.2 % | **reproduces** |
| Epic-1 checkpoint ≈ 2026-10-18 | `:1011` | 156/40 = 3.9 wk = +27.3 d = 2026-10-17/18 | **reproduces** |
| four largest epics = 73 % | `:1355` | (308+240+160+156)/1180 = 73.2 % | **reproduces** |
| engine 92 h : surface 98 h = 1.07 | `:1266` | 98/92 = 1.065 | **reproduces** |

### A-1 (CRITICAL). "Misses by at least 42 days under every scenario … including the optimistic one" is false.

`prd.md:1098`. The 42 days is 2027-03-31 → 2027-05-12, which is the **central** scenario
only. In the optimistic scenario the amendment itself names — 826 h at 40 h/week, R0 on
2027-02-12 — the gate passes **2027-03-12**, nineteen days *inside* Q1. The optimistic branch
therefore does not miss Q1 at the gate at all, and "already Q2" does not hold for it.

The source report contains the same error in weaker form ("Every scenario in this table lands
after R1's Q1 2027 window", `oq12-sprint-planning-2026-09-20.md:191`), which is also false for
the 826 h @ 40 h/wk cell in its own table. The PRD did not inherit it passively: it added
"including the optimistic one", strengthening a claim that was already wrong. This matters
because it is the stated justification for withdrawing R1's date. The conclusion may well
survive on other grounds (R1 is unsized; R1's own build must follow the gate), but the
argument as written does not.

### A-2 (HIGH). The 17 % figure is computed at the capacity the amendment supersedes.

`prd.md:1277` and `:1357` present "the implied 2026-11-30 buys **17 %** of R0 — Epic 1 and
47 hours" as a live fact justifying the 2026-09-20 decision. It is computed at 20 h/week
(`oq12-sprint-planning-2026-09-20.md:149-150`). At the 40 h/week the founder actually chose,
2026-11-30 buys ~405 h ≈ **34 %** — still not the wedge, but not the figure quoted, and the
PRD states it beside the 40 h/week decision with no capacity caveat.

### A-3 (MEDIUM). "29.5 months-worth of weeks".

`prd.md:1062`. The source says "29.5 weeks — 6.8 months". The PRD's phrasing reads as
29.5 months to anyone skimming, overstating the build by roughly 4×, inside the one paragraph
whose job is to make the duration land.

### A-4 (MEDIUM). "Doubling capacity" treats a floor as a point value.

`prd.md:1265`. OQ-10's first closure was "**20+** hours per week" — a floor. The "doubling …
is worth 50 %" comparison and the 17 % figure both silently read it as exactly 20.

### A-5 (MEDIUM). The 107 h / 9 % figure cites §8.3, which contains no numbers.

`prd.md:1013` and `:1086` both attribute the figure to "(§8.3)". §8.3 (`:1168-1181`) carries
six cut items and no hours at all; the per-item savings exist only in the source report's
table (`oq12-sprint-planning-2026-09-20.md:161-169`). A reader following the cross-reference
finds nothing, and §6's escalation ladder ("each further such pair takes the next item") cannot
be evaluated for effect from the PRD alone.

### A-6 (CRITICAL). "The per-story breakdown lives in `sprint-status.yaml`" is false.

`prd.md:1092` and `:1277`. `implementation-artifacts/sprint-status.yaml` contains 70 story
keys and **zero hour figures** — it is a status file, not an estimate file. The source report
publishes per-**epic** totals only (8 rows) plus four OQ-11 line items; its "bottom-up, per
story" method (`:86`) is asserted, not recorded. So `prd.md:1092`'s "Every entry above is now
sized" is not verifiable against any artifact, and the citation points at the wrong file. The
1,180 h rests on acceptance-criterion counts (source `:92`) that no downstream reader can
re-derive or challenge.

---

## 3. The §6 date-slip rule — is it operable?

### O-1 (CRITICAL). The trigger's predicate has no defined computation.

`prd.md:1012`: "If two consecutive months **imply** a date beyond 2027-07-06". The founder
logs two quantities — hours worked and stories closed — and the rule never says how to turn
them into a date. Remaining hours ÷ measured hours-per-month? Stories remaining ÷ stories per
month? A blend? The two can disagree badly (a month of 160 h on Epic 2's scheduler may close
one story). The Epic-1 checkpoint has the same hole: "re-derive the estimate from **measured**
velocity" (`:1011`) names no method either.

The rule is self-administered by the person whose capacity it polices, with an undefined
predicate and no artifact recording the computation. It cannot fire deterministically, and it
cannot be shown after the fact to have failed to fire — which is precisely the failure mode
the *previous* trigger was written to avoid ("an anchor is only a trigger if some named
artifact records whether it was met", removed by this amendment).

*Can it ever fire?* With a formula supplied, yes: earliest firing is 2026-12-01 (the Oct and
Nov lines), which is a reasonable lead time. Without one, no.

### O-2 (HIGH). The Epic-1 checkpoint has no consequence.

`prd.md:1011` instructs a comparison against 2027-07-06 and then stops. Nothing fires, nothing
is recorded, no artifact is named. It is presented as "the first checkpoint" of a rule whose
firing mechanism (`:1012`) does not begin until 2026-11-01 and does not reference it. As
written, a checkpoint that comes back "2028" on 2026-10-18 obliges nothing.

*Date consistency:* 156 h ÷ 40 h/wk from 2026-09-20 = 2026-10-17/18. The ~2026-10-18 date is
right, and it assumes zero ramp and that build starts today — which matches the source's step 2
("`bmad-build` starts at story 1.1").

### O-3 (MEDIUM). What the founder writes each month is under-specified.

`prd.md:1012`: "On the first working day of each month from 2026-11-01, the founder appends one
line to §13: hours actually worked **that month**, and stories closed." On the first working day
of a month, that month has no hours yet; the intended reading must be the month just ended, but
it is not written. Consequences: the 2026-11-01 line covers October, so the 2026-09-20 → 09-30
ramp is never recorded at all, and the first full data point lands a month later than the
Epic-1 checkpoint it is supposed to follow. (Also: 2026-11-01 is a Sunday, so "the first working
day of each month from 2026-11-01" is loose on its own face.)

### O-4 (MEDIUM). The escalation ladder outlives the date it defends.

`prd.md:1012`: "each further such pair takes the next item." Six items at two months per item is
twelve consecutive bad months — to roughly 2027-11 — five months past the 2027-07-06 upper bound
the rule exists to protect. It is also undefined whether pairs overlap (months 2–3 counting as a
new pair) or tile (3–4 only), which changes the ladder's speed by a factor of two.

### O-5 (HIGH). The rule fires a cut the source says drags in a correct-course pass.

The source states that item 1 "taken literally … deletes every milestone target date", because
§3 defines a milestone target *as* a `must_finish_on` constraint, and that the cheapest rescue
is CA-1, "**a capability no FR states, so building it needs `bmad-correct-course`** … The
cheapest cut is not free of governance" (`oq12-sprint-planning-2026-09-20.md:176-183`). The
amendment carries none of this. §6's closing line instead says the fallback "is the one declined
on 2026-09-20: reduce the §8.1 list materially, **which §7.3 permits without a correct-course
pass**" (`prd.md:1014`) — true of a plain reduction, but not of the cut the rule actually fires.
Note also that the 107 h net figure already **includes** the +10 h CA-1 rescue cost, so the 9 %
headline assumes the correct-course-requiring capability gets built.

### O-6 (LOW). Cross-reference to §13 is correct.

`prd.md:1012` says the monthly line goes to §13; `:1359` says "monthly hours-and-stories lines
appended here". These agree, and the superseded trigger at `:1346` is struck and annotated.
This part of the amendment is clean.

---

## 4. Governance (§7.3)

**Did the amendment add a capability, requirement, screen or behaviour?** On the product
surface, no. Checked:

- `prd.md:1071` — the R-4 anchor fix ("to the Project finish where one is set — otherwise to
  the computed finish") restates what FR-6b (`:372`), §3 *Project finish* (`:179`) and §3
  *Critical Path* (`:190`) already say. It is a correction of §8.1's summary, not an addition.
  The claim "FR-6b already did" checks out.
- §6's date-slip rule and the Epic-1 checkpoint are **founder process obligations**, not R0
  capabilities. They add no screen, field, state or behaviour, so §7.3's table does not reach
  them; a monthly-line obligation also already existed in the trigger being replaced. The
  Epic-1 checkpoint is new, but it is a measurement, not scope.
- SM-1 (`:1198`) changed **when**, not what: same quantity, same target, window re-anchored
  from a quarter to adoption.

**Two governance defects found.**

### G-1 (MEDIUM). SM-8's edit changed what it measures, not only when.

`prd.md:1215`. Old: "at least 2 **by the end of Q1 2027**" — a cumulative count with a deadline.
New: "at least 2 **within a quarter of R1 shipping**" — a count inside a rolling 90-day window.
The second is a strictly harder test (two meetings in any 90 days, versus two ever before a
date). That is a target change, and it was made under a heading that presents the whole edit as
a re-anchoring.

### G-2 (MEDIUM). The amendment does not carry §7.3's own required self-declaration.

`prd.md:1054` requires that "**every downstream artifact produced against this PRD opens with
one line naming which column of the table above its output sits in**". The amendment is an edit
to the PRD itself rather than a new artifact, so the letter of the rule may not bind it — but
the amendment closes two open questions, withdraws a release date and rewrites a risk trigger
without anywhere stating which side of the resolving/adding line each of those sits on. The
source report comes closer ("nothing here changes scope", `:31`) than the PRD does. Given
C-2 above, this is the wrong document to be loose in.

See also C-1 and O-5, both of which are governance failures as much as contradictions.

---

## 5. Honesty

### H-1 (HIGH). The PRD attributes acceptance of three risks to the founder; the source records only that they were stated.

`prd.md:1361`: "**What the founder accepted with this choice**, recorded because it was stated
and not glossed: …" — then the three risks.

The source's wording is "the risks the choice carries **are stated after it**"
(`oq12-sprint-planning-2026-09-20.md:212`) and the section is headed "**The three risks this
choice concentrates**" — the report's own analysis, presented *to* the founder. Nothing in the
source records the founder responding to them. The founder decision captured in the frontmatter
(`:14-21`) covers scope, capacity, date and range, and nothing else. The PRD converts the
report's warning into the founder's informed consent. That is the one move a PRD must not make,
and it is made in the block that exists precisely to record what was decided.

### H-2 (HIGH). The amendment does not record that sprint planning recommended REDUCE and was overridden.

`oq12-sprint-planning-2026-09-20.md:210`: "**This report had recommended REDUCE.** The founder
chose the third option instead". The PRD's three accounts of the decision — `:1086`, `:1265`,
`:1356` — all frame the capacity choice as arithmetically forced ("the arithmetic left no
alternative", "the only lever large enough") and none mentions that the owning skill's formal
recommendation was the opposite and was declined. A reader of the PRD alone cannot tell that a
recommendation existed. This also removes the context that makes §6's fallback line ("the
decision available then is the one declined on 2026-09-20") legible.

### H-3 (MEDIUM). The "factor of roughly five" is dropped.

`oq12-sprint-planning-2026-09-20.md:172-174`: "the gap is a factor of roughly five. Taking every
cut in the order still lands R0 at 2027-10-01 at 20 h/week." The PRD keeps the 9 % and adds "It
cannot absorb a capacity shortfall of any size" (`:1013`), which is bluntly put — but the
concrete 5× figure and the "every cut still lands 2027-10-01" datum, which is what makes the
9 % vivid, are gone.

### H-4 — checked and clean.

The single point of failure (`:1062`, `:1010`), the pessimistic branch being likelier
(`:1062`), the absence of slack (`:1062`), the five projects and the weekly teirei report
(`:1010`), and R1's Q1 2027 date being unrecoverable (`:1098`) are all carried faithfully and
without softening. The FAIL verdict is stated plainly (`:1277`). On these the amendment is
honest.

---

## 6. What the amendment missed

Passages that depend on R0's date, R1's date or capacity and were not updated.

| Where | Line | Problem | Severity |
|---|---|---|---|
| §1.1 market dates | `prd.md:55` | "The dates that face the market are R1 and the 2027-01-01 Backlog repricing" — R1 has no date; its earliest event is 2027-05-12, after the repricing | HIGH |
| §6 thin moat | `prd.md:1017` | mitigation "speed is defended at R1 and at the 2027-01-01 repricing" now defends nothing (see C-4) | HIGH |
| §6 demand inferred | `prd.md:1003` | "SM-8 tracks whether clients act on Unplanned Work" — SM-8 now has no date and cannot precede an undated R1 | MEDIUM |
| §7.3 | `prd.md:1050` | freeze's "until OQ-12 returns" clause has now expired (C-2) | CRITICAL |
| §8.1 gate earliest | `prd.md:1094` | "the earliest possible gate pass is 2027-05-12" contradicts §8.1's own 2027-02-12 lower bound, which yields 2027-03-12 | HIGH |
| §8.3 cut order | `prd.md:1168-1181` | not annotated with the per-item hours the amendment now cites "(§8.3)" for; Comfort rows not inserted (C-5, A-5) | HIGH |
| §10 SM-3 | `prd.md:1206` | follows R1, so now has no date at all; with SM-8 undated too, no dated success criterion for the wedge survives anywhere | MEDIUM |
| §10 SM-2 | `prd.md:1203` | header says SM-2 is measured against R0 adoption, but its body adds "From R1, a Published Snapshot…", which is undated | LOW |
| §10 SM-1 | `prd.md:1198` | "one measurement serves both" conflates SM-1 (founder's reconciliation hours) with the §8.1 gate (4 Reviews × 3 projects, each finding Unplanned Work) — different measurements over the same four weeks | MEDIUM |
| §11 R2 | `prd.md:1228` | "Backlog beachhead, **timed to the repricing**" — R0 lands 2027-04-14 and R1 later, both after 2027-01-01 | HIGH |
| §5 NFR-S5 | `prd.md:946` | "before the first Client Viewer is invited (R1)" — now undated | LOW |
| §5 NFR-R2 | `prd.md:990` | "A restore is tested before R1" — now undated | LOW |
| §12 OQ-2 | `prd.md:1240` | "Run hours detection (FR-17) again after 2027-01-01" — FR-17 ships inside Epic 5, ~2027-02/03 at the new capacity | LOW |
| §12 OQ-8 | `prd.md:1255` | "Re-check the 'nobody does this' claim. Resolve by: 2026-12-01" — the absence-claim re-check now precedes any usable product by 4+ months | LOW |
| §13 | `prd.md:1302`, `:1331` | stale release-split and "until a date exists" bullets (C-6) | MEDIUM |

### Other `_bmad-output/` artifacts that now contradict the PRD

Listed, not edited.

- `planning-artifacts/sprint-change-proposal-2026-09-20.md:52, 78, 108, 153, 159, 189` — the
  **approved** proposal still says 20+ h/week, "no customer is waiting on 2026-12-15", "the
  market date is R1 in Q1 2027", "mark the 2026-12-15 target as pending re-derivation", and
  "re-derive the R0 date here against 20+ hours per week". This is the most load-bearing
  contradiction outside the PRD, because it is an approved governance artifact.
- `decisions-pending-2026-09-20.md:38, 61` — OQ-10 row still reads "Unanswered … R0 is scoped
  at 2026-12-15", and the earlier decision line still reads "more than 20 h/week". The file's
  later block (`:74-102`) records the new decision, so the file contradicts itself.
- `planning-artifacts/ux-designs/ux-momo-keikaku-2026-09-20/EXPERIENCE.md:320, 387` — "if OQ-12
  returns CONCERNS or FAIL" (it did, and nothing was cut) and "**The cost half stays open**" for
  OQ-11 (now closed).
- `implementation-artifacts/sprint-status.yaml` — carries 70 stories and no estimates, while
  `prd.md:1092` and `:1277` cite it as holding the per-story breakdown (A-6).
- `planning-artifacts/epics.md:24, 3071` — "OQ-12 is `bmad-sprint-planning`'s, after this step",
  "No estimate appears anywhere in this document". Historical and self-dating; low concern.
- `prds/…/resolution-check.md:6, 39`, `review-adversarial.md:3, 69-72`,
  `review-scheduling-adversarial-2.md:144`, `reconcile-brief.md:95`, `reconcile-research.md:31`
  — all carry Q1 2027 / 2026-12-15 framing. These are dated review records and are arguably
  correct as history; flagged only for completeness.

---

## 7. Summary of findings

**CRITICAL**
1. C-1 `prd.md:1275`, `:1324` — "FAIL ⇒ cut item 1" survives unstruck beside a recorded FAIL and an unexercised cut order.
2. C-2 `prd.md:1050` — §7.3's freeze is worded to expire once OQ-12 returns; it has returned.
3. A-1 `prd.md:1098` — "misses by at least 42 days under every scenario … including the optimistic one" is false for the optimistic branch (gate 2027-03-12, inside Q1).
4. A-6 `prd.md:1092`, `:1277` — the cited per-story breakdown does not exist; `sprint-status.yaml` has no hours.
5. O-1 `prd.md:1012`, `:1011` — the trigger's predicate ("imply a date") has no defined computation.

**HIGH**
6. C-3 `prd.md:1273` — OQ-12's body still asserts R0 is unsized, at 20+ h/week, with no epics or stories.
7. C-4 `prd.md:1017`, `:55` — thin-moat and market-date mitigations still rest on withdrawn dates.
8. C-5 `prd.md:1266` vs `:1168` — a second cut order is created in a document that says there is only one.
9. O-2 `prd.md:1011` — the Epic-1 checkpoint defines a comparison and no consequence.
10. O-5 `prd.md:1014` — the rule fires the one cut the source says needs a correct-course pass; that finding is dropped.
11. A-2 `prd.md:1277`, `:1357` — the 17 % figure is computed at the superseded 20 h/week.
12. H-1 `prd.md:1361` — risks the report *stated* are recorded as risks the founder *accepted*.
13. H-2 `prd.md:1086`, `:1265`, `:1356` — the REDUCE recommendation and its override are not recorded.
14. §11 `prd.md:1228` — "timed to the repricing" is now false.
15. §8.1 `prd.md:1094` — "earliest possible gate pass" contradicts the range's own lower bound.

**MEDIUM**
16. A-3 `prd.md:1062` — "29.5 months-worth of weeks".
17. A-5 `prd.md:1013`, `:1086` — the 107 h / 9 % figure cites a §8.3 that contains no numbers.
18. O-3 `prd.md:1012` — which month's hours the monthly line reports is undefined; September is never captured.
19. O-4 `prd.md:1012` — the six-item ladder needs twelve bad months, past the bound it defends; pair tiling undefined.
20. G-1 `prd.md:1215` — SM-8's target changed from cumulative-by-a-date to two-in-90-days.
21. G-2 `prd.md:1054` — the amendment carries no resolving-vs-adding self-declaration.
22. C-6 `prd.md:1082`, `:1092`, `:1302`, `:1331`, `:1195` — stale present-tense and "settled" assertions.
23. A-4 `prd.md:1265` — "doubling" reads the "20+" floor as exactly 20.
24. §6 `prd.md:1003` — SM-8 mitigation now undated.
25. §10 `prd.md:1198` — SM-1 and the §8.1 gate are not the same measurement.
26. H-3 — the "factor of roughly five" is dropped.

**LOW**
27. `prd.md:1012` — 2026-11-01 is a Sunday.
28. `prd.md:1206`, `:1215` — no dated success criterion for the wedge now survives.
29. `prd.md:946`, `:990` — NFR-S5 and NFR-R2 anchored on an undated R1.
30. `prd.md:1240`, `:1255` — OQ-2 and OQ-8 resolve-by dates now precede any usable product.
31. `prd.md:1203` — SM-2's body is partly R1-dependent under an R0-anchored header.

**Clean.** The date arithmetic itself (29.5 weeks, 2027-04-14, the 2027-02-12 / 2027-07-06
range, 2027-05-12, 9 %, 13 %, 73 %, 1.07, the ~2026-10-18 checkpoint) all reproduces. The
R-4 anchor fix is a correction, not an addition. SM-1's re-anchoring changed only *when*.
The §6 → §13 cross-reference is correct and the superseded trigger is properly struck. The
hardest facts — single point of failure, asymmetric range, no slack, FAIL, R1 unrecoverable
— are carried without softening.


---

# Round 2 — verification of the fixes, and defects the fixes introduced

Re-read against the working tree at 17:25, **after** §6 was rewritten a second time (the
`h/h` formulation was replaced by the `E` formulation mid-review; this section assesses the
`E` version, which is what the file now holds). Line numbers are current.

## Verdict on each numbered fix

### Fix 1 — "FAIL ⇒ cut item 1" struck in OQ-12 (`prd.md:1284`) — **PARTIAL**

The strike and its replacement are good, and the replacement is **honest, not a
rationalisation**. It concedes the clause "did not survive contact with the answer", states
that item 1 *was* considered, and gives the measured reason it was rejected: 36 net hours
against a ~5× shortfall, under a week of date movement, at the cost of every milestone target
date. All three figures check out against the source (46 saved − 10 CA-1 rescue = 36 net;
36 h ÷ 40 h/wk = 0.9 weeks; "the gap is a factor of roughly five",
`oq12-sprint-planning-2026-09-20.md:172`). This also closes round 1's H-3: the 5× gap is now
in the PRD.

But the parallel line in §13 is not reconciled. `prd.md:1333` still reads "If sprint planning
returns CONCERNS or FAIL, these two types are the first cut considered (OQ-12)", unstruck, and
still points at the clause that was just struck. `prd.md:1356` ("One cut order, **reconciled
with OQ-12**") cites the same vanished reconciliation. Round 1's C-1 is half-fixed: the
contradiction moved from §12 to §13.

### Fix 2 — §8.2's Q1 concession (`prd.md:1102-1104`) — **FIXED**

Every figure reproduces: central gate pass 2027-05-12, 42 days past 2027-03-31; optimistic
R0 2027-02-12 → gate 2027-03-12, inside Q1; 826 ÷ 1,180 = 0.70, so "30 % under" is right;
pessimistic R0 2027-07-06 → gate 2027-08-03, 125 days ≈ "four months". The argument is sound
rather than face-saving: it concedes the branch outright, then disqualifies it on three
independent conditions — a 0.7× estimate **and** no bad week **and** zero R1 build time, the
last impossible because R1 has never been sized. "Survives only as a best case that no part
of the plan is steering for" is the correct characterisation of that branch.

One knock-on: `prd.md:1204` (§10) still says "OQ-12's sizing put R0 itself in Q2" — see N-3.

### Fix 3 — the per-story appendix (`oq12-sprint-planning-2026-09-20.md:304+`) — **FIXED**

Verified computationally, and it is the strongest of the fixes:

- 70 story rows, no duplicate IDs, summing to **exactly 1,180 h**.
- All eight per-epic subtotals match the epic table in Part 2 exactly (156 / 308 / 130 / 66 /
  240 / 160 / 46 / 74), and so do the per-epic story counts (9 / 16 / 8 / 5 / 15 / 9 / 3 / 5).
- The story IDs are a **perfect bijection** with `sprint-status.yaml`'s 70 stories: nothing in
  the appendix is absent from the yaml, nothing in the yaml is absent from the appendix.
- OQ-11's line items also reconcile against it, which round 1 could not check:
  2.3–2.8 = 92 h (engine), 2.9–2.12 = 78 h (write path), 2.13–2.16 = 98 h (plan surface),
  2.1 + 2.2 = 40 h, total 308 h = Epic 2.

`prd.md:1096` and `:1286` now cite the appendix and correctly state that
`sprint-status.yaml` carries build status and no hours. Round 1's A-6 is fully closed, and
the amendment's central claim — "every entry above is now sized" — is now checkable.

### Fix 4 — the trigger predicate (`prd.md:1011-1012`) — **FIXED** (in the 17:25 rewrite)

The `h/h` version I was sent had two false thresholds. Independent computation from
2026-09-20 gave: h/h = 1.35 at 40 h/week → 39.83 weeks → **2027-06-25**, eleven days short of
the bound; sustained 30 h/week at h/h = 1.0 → 39.33 weeks → **2027-06-22**, fourteen days
short. The correct figures were h/h ≥ 1.40 (which is just the 1.4× pessimistic multiplier,
since 1,652 ÷ 1,180 = 1.4 and 2027-07-06 *is* its date) and ≤ 28.6 h/week.

The current text has already been replaced with the `E` formulation and it is **correct**:

- `E = (sum of the estimates of the stories closed) ÷ (weeks in the period)`, in
  estimated-hours per week — dimensionally sound, two logged facts and one division.
- "The plan needs `E` = 40": 1,180 ÷ 29.5 = 40.0 ✓.
- "2027-07-06 is 41.3 weeks out, so it needs `E` ≥ 1,180 ÷ 41.3 = 28.6": 289 days = 41.286
  weeks; 1,180 ÷ 41.286 = 28.58 ✓. E = 28.6 implies 2027-07-05 ✓.
- The equivalences all hold: 40 ÷ 1.40 = 28.6 ("40 % light at a true 40 h/week"),
  30 ÷ 1.05 = 28.6 ("5 % light at 30 h/week"), and 25 < 28.6 ("already gone at perfect
  estimates") ✓.
- The parenthetical naming the earlier draft's figures as wrong and giving 1.40 and
  h/h > 1.05 matches my derivation exactly.

Collapsing a table of cases into one measured quantity against one number is the right repair,
and it makes the predicate verifiable by the person it binds, which was the substance of round
1's O-1. One residual and one new problem: see N-4 and N-5.

### Fix 5 — the Epic-1 consequence (`prd.md:1013`) — **FIXED**

Actionable: compute `E` over the epic, and if `E` < 28.6, re-derive the date and return it to
§8.1 **before Epic 2's migration story is written**. Verified that this is a real and
well-chosen boundary — Epic 2's migration is story **2.1**, the *first* story of Epic 2
(`sprint-status.yaml`: `2-1-the-scheduling-schema-lands-in-one-migration`; appendix: 2.1 =
20 h), so the gate sits on the Epic 1 / Epic 2 seam with nothing committed past it, and the
"expand/contract exemption spent once" framing matches that story.

The date reconciles and was tightened in the rewrite: 156 ÷ 40 = 3.9 weeks → **2026-10-17**,
which is what `:1013` now says (it said ~2026-10-18 before).

Residual, pre-existing and unstated: the checkpoint is triggered by Epic 1 *closing*, and
Epic 1 closes late exactly when `E` is bad — at `E` = 29.6 it closes 2026-10-26, at `E` = 20
it closes 2026-11-24. The earliest warning delays itself in proportion to the problem it
detects, and nothing says who signs off the re-derived date or within what timebox while the
build is stopped. MEDIUM, and it is the one place where a stated backstop date would help.

### Fix 6 — milestone / CA-1 consequence (`prd.md:1015`) — **FIXED**

Carries everything round 1's O-5 said was missing: that item 1 deletes every milestone target
date, the §3 reason why, the three FRs that lose their input, that the rescue is a capability
no FR states, that it therefore needs `bmad-correct-course`, and the conclusion that "the
cheapest cut is the one that reopens the governance gate". Faithful to
`oq12-sprint-planning-2026-09-20.md:176-183` and no softer.

### Fix 7 — item 0 in §8.3 (`prd.md:1176-1178`) — **PARTIAL**

The item is well-formed and conflicts with none of §8.3's later text: it touches stories
2.13–2.16, so "the wedge is never cut: FR-19–FR-32…" is untouched; the "no drop-the-Gantt
cut" paragraph is unaffected; and "item 2 is taken only after item 1" still holds, since item
0 sits above both.

**Not a §7.3 scope change.** §7.3's table grants `bmad-sprint-planning` "Sizing, and
**cutting** (§8.3)", and §7.3's closing line states that the guardrail "does not restrict
*cutting* R0 … and so does anything that reduces scope". Adding a cut *option* removes
nothing and permits nothing new to be built. Correct call.

§6 was repointed at item 0 in the 17:25 rewrite (`:1014`: "fires at **item 0**, then item
1"), which resolves most of what I was about to file. What remains is the item count and the
stale §13 mirror — N-1 and N-2.

### Fix 8 — REDUCE override recorded (`prd.md:1090`, `:1370`) — **FIXED**

Both sites now state that the report recommended REDUCE, to a 744 h minimum-wedge R0 (matching
the source's own table), and that the founder overrode it. `:1090` adds that the recommendation
"is not thereby wrong, and it remains the option §6's trigger points back to", which is the
right framing. Round 1's H-2 closed.

### Fix 9 — "accepted" → "put in front of" (`prd.md:1371`) — **FIXED**

"**What the report put in front of the founder before the choice**, recorded as stated rather
than as accepted … The founder chose with these in view; the PRD does not claim more than
that." That is precisely what the source supports and nothing beyond it. Round 1's H-1 closed.

### Fix 10 — 17 % / 34 % (`prd.md:1286`, `:1367`) — **FIXED**

Both sites now name the capacity behind each figure. 34 % verified: 71 days = 10.14 weeks ×
40 h = 406 h ÷ 1,180 = 34.4 %. "Could not have begun either way" is the right conclusion —
Epic 1 plus part of Epic 2 still contains none of the wedge.

### Fix 11 — thin moat and §11 R2 (`prd.md:1019`, `:1237`) — **PARTIAL**

Both repaired sites are correct and unusually candid: §6 now states that the repricing "now
falls while R0 is still being built, with nothing client-facing to meet it" and that "speed is
no longer defended at any dated event"; §11 R2 records "Timing lapsed 2026-09-20".

**`prd.md:55` was not touched** and still reads "The dates that face the market are R1 and the
2027-01-01 Backlog repricing." §1.1 is where a reader meets the moat argument first, and it now
contradicts the repaired §6 and §11 R2 head-on. Round 1 cited this line by number.

### Fix 12 — units and the 9 % citation — **FIXED**

`prd.md:1064` reads "29.5 weeks — about 6.8 months" (29.5 ÷ 4.345 = 6.79 ✓). `prd.md:1015`
cites "OQ-12's report; §8.3 lists the items, not their cost", which is accurate, and
`prd.md:1086` dropped the bad "(§8.3)". Round 1's A-3 and A-5 closed.

---

## On the rejected finding — the rejection is **incorrect**; the text is there

Quoted in full, **`prd.md:1052`** — it was `:1050` when round 1 ran, and §6's two successive
rewrites have pushed it down two lines, which is the likely reason the grep missed it:

> *Why this is a guardrail and not a note.* On 2026-09-20 R0 grew three times in one
> morning: … Growth with the brake removed is how a solo v1 becomes an eighteen-month v1.
> **The correct-course gate is the brake, and it stays on until `bmad-sprint-planning` has
> returned a date and a verdict against the frozen list (OQ-12).**

It is the final sentence of §7.3's *Why this is a guardrail and not a note* paragraph.
`grep -n "stays on until" prd.md` returns exactly this one line.

The coordinator is right that §7.3 *also* says the guardrail "binds this PRD and every session
downstream of it" (`prd.md:1054`). But that is a different sentence in a different paragraph,
and a general statement of binding does not cancel an explicit "stays on **until** X" where X
has now occurred. As it stands the PRD says both that the freeze is unconditional and that it
lapses on an event of 2026-09-20 — and OQ-12 returning a date and a verdict is now the most
prominent fact in the document. Round 1's **C-2 stands, unfixed, CRITICAL**, at `:1052`.

---

## New defects introduced by the fixes

### N-1 (HIGH). The cut order has seven items and three places still call it six.

- `prd.md:1176` — "**The six items below** are worth 107 net hours" — seven items (0–6) are
  below it. 107 h covers items 1–6 only, so the sentence miscounts and leaves it ambiguous
  whether item 0's ~18 h is inside the figure. It is not: the seven-item total is ~125 h.
- `prd.md:1015` (§6) — "The **entire six-item** cut order is worth 107 net hours".
- `prd.md:1356` (§13) — "**One cut order**, reconciled with OQ-12 (§8.3). The two extra
  constraint types are item 1 …" — never mentions item 0, in the one bullet whose purpose is
  that the order is enumerated in a single place.

### N-2 (HIGH). §13's date-slip bullet is now stale in three ways at once.

`prd.md:1368` still reads: "First checkpoint is Epic 1 (**~2026-10-18**), then monthly
hours-and-stories lines appended here; **two consecutive months implying a date past
2027-07-06** fire the cut order **at item 1**."

Against the current §6 that is wrong three times: the date is now 2026-10-17 (`:1013`), the
predicate is now `E` < 28.6 on both months of a fixed pair (`:1012`, `:1014`), and the trigger
now fires at item 0 (`:1014`). §13 is the log the monthly lines are appended *to*, so it is the
one place a founder will read the rule from at the moment of using it.

Related, same bullet family: `prd.md:1015` still advises "Before firing item 1, cut OQ-11's
Comfort rows first", which the rewritten `:1014` now does automatically. Harmless duplication,
but it reads as though item 0 were still outside the order.

### N-3 (MEDIUM). §8.3's preamble and §13 both cite the clause fix 1 struck.

`prd.md:1174` — "**This is the only cut order**, and **OQ-12 points at item 1** rather than
naming a separate first cut, because two orders in one document is no order at all." Fix 1
struck exactly that pointer (`:1284`). The sentence's stated justification no longer exists,
and it sits immediately above the sentence that adds item 0 *above* item 1 — so it now argues
against the change it introduces. `prd.md:1356`'s "reconciled with OQ-12" has the same problem.

### N-4 (MEDIUM). Fixed pair tiling can miss two consecutive bad months entirely.

`prd.md:1014` now specifies "Nov+Dec, then Jan+Feb, and so on, **never a sliding window**".
That removes round 1's O-4 ambiguity, but it buys determinism at the cost of sensitivity: a
bad **December and January** straddles two pairs, so neither pair has both months bad and the
trigger never fires, despite two consecutive months below the bound — the exact pattern the
rule says it is looking for. Worse, December–January is the likeliest such pair in this plan,
being the Japanese year-end and Tết run-up that §8.3's excluded layered-calendar note
specifically calls out.

It also pushes the earliest possible firing to **2027-01-01** (the first complete pair is
Nov+Dec), against `:1010`'s own complaint that "a trigger that only fires in April 2027 would
give seven months of silence". A sliding two-month window, or a three-month rolling `E`, keeps
the determinism without the blind spot.

### N-5 (MEDIUM). `E` is blind to work in progress, which is where a solo build hides.

`E` counts only the estimates of stories **closed**. A founder who spends four weeks at 40 h/week
half-finishing story 2.9 (32 h, itself "flagged split candidate" in the appendix) closes nothing
and scores `E` = 0; a founder who closes three small stories scores well while the epic's hard
story sits untouched. Over Epic 1's nine stories the noise mostly averages out, but the monthly
check runs over Epic 2, whose sixteen stories include four at 32, 36, 22 and 22 h. The rule needs
either a partial-credit convention or an explicit statement that a month with a large story open
is reported as such — otherwise its first genuine signal will be a false one, and a false alarm
is how a self-administered trigger gets ignored.

### N-6 (LOW). Item 0's content is defined outside the PRD.

`prd.md:1178` defines item 0 by reference to "`EXPERIENCE.md` › *Build Tiers*". §8.3 is the one
place the PRD promises to enumerate what may be dropped without a gate, and its first item is now
enumerable only by opening a downstream UX document — one that (see below) still describes its own
tier list as "a recommendation to `bmad-sprint-planning`, not a decision taken here". A later
re-tiering there silently changes what §8.3 item 0 means. The row counts (3 + 2 + 2 + 2 = 9,
~18 h) mitigate it.

### N-7 (LOW). The escalation ladder still outlives the bound it defends.

`prd.md:1014` — one item per qualifying pair, now starting at item 0, so exhausting items 0–6
takes **fourteen** months of fixed pairs, running to late 2027, well past 2027-07-06. Round 1's
O-4 second half is untouched and marginally worse.

---

## Round 1 findings still open (confirmed, current line numbers)

- **CRITICAL — C-2**, `prd.md:1052`: the freeze's "stays on until OQ-12 returns" clause.
  Rejection incorrect; quoted above.
- **HIGH — §1.1**, `prd.md:55`: market-dates sentence, now contradicting the repaired §6 and
  §11 R2.
- **MEDIUM — C-6**, `prd.md:1084` ("the only sizing decision left (OQ-12)"), `:1096`
  ("capacity is **settled**", against §6 and §8.1 calling it the single point of failure),
  `:1311` ("R1 (client-facing, Q1 2027)" unqualified), `:1340` ("re-anchored **until a date
  exists**"), `:1369` (Comfort rows "sit above §8.3 item 1" — they *are* item 0 now).
- **MEDIUM — G-1**, `prd.md:1224`: SM-8's target silently moved from cumulative-by-a-date to
  two-in-any-90-days.
- **MEDIUM — G-2**, `prd.md:1056`: no resolving-vs-adding self-declaration for the amendment.
- **MEDIUM — §10 SM-1**, `prd.md:1207`: "one measurement serves both" still conflates SM-1's
  reconciliation-hours log with the §8.1 gate's four Reviews on three projects.
- **MEDIUM — §6 demand**, `prd.md:1003`: "SM-8 tracks whether clients act on Unplanned Work" —
  SM-8 is now undated and gated behind an undated R1.

On the items the coordinator asks about specifically, none is worse than assessed:

- **NFR-S5 (`:946`) and NFR-R2 (`:990`)** — still LOW. Both are *ordering* constraints
  ("before the first Client Viewer is invited", "tested before R1"), and an ordering constraint
  binds without a date. They are undated, not broken.
- **SM-3 (`:1215`) and SM-8 (`:1224`)** — jointly leave the PRD with **no dated success
  criterion for the wedge at all**. Confirmed, and the most consequential of the low items, but
  it is an honest consequence of withdrawing R1's date rather than a defect in the amendment.
  One sentence in §10 saying so out loud would close it.
- **OQ-2 (`:1249`) and OQ-8 (`:1264`)** — still LOW. Both are research re-checks that need a
  browser, not the product. The one real snag is OQ-2's "Run hours detection (FR-17) again after
  2027-01-01": FR-17 lands inside Epic 5, ~2027-02/03 at plan velocity, so that clause slips a
  month or two. Cosmetic.
- **Other artifacts** — unchanged and still contradicting:
  `planning-artifacts/sprint-change-proposal-2026-09-20.md:52, 78, 108, 153, 159, 189` (approved
  artifact; 20+ h/week, "the market date is R1 in Q1 2027");
  `decisions-pending-2026-09-20.md:38, 61` (file now contradicts itself);
  `planning-artifacts/ux-designs/ux-momo-keikaku-2026-09-20/EXPERIENCE.md:320, 387` ("if OQ-12
  returns CONCERNS or FAIL", "the cost half stays open"). The EXPERIENCE.md one is now
  **load-bearing rather than cosmetic**, because §8.3 item 0 points into that file (N-6) while
  that file still calls its tier list a recommendation to a skill that has already reported.

---

## Round 2 bottom line

Ten of twelve fixes land, and two of them — the per-story appendix and the `E` predicate — are
model repairs: both reproduce under independent computation, and the `E` rewrite records its own
predecessor's arithmetic error rather than quietly replacing it. §8.2's Q1 concession, the CA-1
governance consequence, the REDUCE override and the "put in front of" rewording all close their
round 1 findings outright.

The two that remain are both bookkeeping rather than analysis, which is what makes them likely to
survive another pass: fix 1 and fix 7 each changed one site and left its mirror standing, so §13
(`:1333`, `:1356`, `:1368`) and §8.3's preamble (`:1174`, `:1176`) now describe a rule and an
order that no longer exist. §13 is the worst place for that, since it is the log the monthly
lines get appended to. Two genuinely new analytical defects came in with the `E` rewrite: fixed
pair tiling has a December–January blind spot (N-4), and `E` cannot see work in progress (N-5).
And the rejected finding is not rejectable — `prd.md:1052` says what round 1 said it says.

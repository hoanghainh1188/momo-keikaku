---
title: Sprint Change Proposal — restore scheduling to the plan model
created: 2026-09-20
revised: 2026-09-20 (v2 — founder chose automation; recommendation changed from seam-only to a scoped engine)
status: approved by founder, awaiting execution
scope: Major (PM / Architect / UX)
trigger: founder confirmation that the destination is a real project management tool, with automatic schedule recalculation
---

# Sprint Change Proposal — 2026-09-20 (v2)

## 1. Issue Summary

**Problem statement.** The product cannot compute a schedule. Neither the PRD nor the architecture models task dependencies, duration or constraints, and the schema stores Work Package dates as PM-typed scalars. The founder has confirmed that the destination is a real project management tool in which **a slipped task moves the tasks that depend on it automatically**. Nothing in the current design delivers that, and nothing reserves room for it.

**Issue type:** requirement lost in translation between artifacts, compounded by a missing governance step.

### Evidence A — the capability is absent

`ARCHITECTURE-SPINE.md` (595 lines): `predecessor`, `successor`, `critical path`, `slack`, `constraint` all score **0**. The 13 hits for "dependency" are module dependencies (`dependency-cruiser`); the 13 for "schedule" are job scheduling (`pg-boss`); the 2 for "float" are floating-point arithmetic.

`prd.md`: `critical path`, `CPM`, `PERT`, `three-point`, `float`, `EMV`, `portfolio` all score **0**.

`packages/db/src/schema.ts` (17 tables): `work_package` has `start` and `finish` as nullable PM-authored dates and `planned_mh`, but **no `duration`**, no `constraint_type`, and there is **no dependency table**. `baseline_wp` pins `start`/`finish` NOT NULL — outputs, with no inputs behind them.

### Evidence B — the brief and the PRD disagree, and the brief was right

`brief.md` line 58 places in **v1**:

> "basic dependencies and date rollup **(needed once the tool is the WBS source of truth)**"

`prd.md` demoted this to Post-Q1, and the demoted version explicitly refuses the behaviour the founder wants:

> `FR-6: Finish-to-start dependencies — Post-Q1` … "A violated dependency is flagged. **The schedule is not recalculated automatically.**"

`reconcile-brief.md` — the artifact whose job is to catch divergence between brief and PRD — did not flag it. Its only dependency reference concerns holiday calendars affecting lag.

**The drift happened at the PRD step.** The founder did not change their mind; the documents moved away from them. Automatic recalculation is not covered by FR-6 in any existing form and needs a new requirement.

### The architectural finding: the plan model breaks the project's own doctrine

Architecture decision A2 establishes that **everything is derived from pinned inputs** — the reason rate corrections recompute against a pinned `rate_seq_max`, and what makes a Published Snapshot reproducible years later.

The plan model pins *outputs* (dates) with no inputs behind them: no duration, no dependency graph, no constraint, no calendar reference. A stored baseline cannot answer *why* it predicted those dates and cannot be re-derived. Every baseline captured before this is fixed is permanently unexplainable — and the founder intends to run real projects on R0 from December, so those will be real baselines carrying real history.

### Contributing cause

No Epics, Stories or Sprint Planning artifacts exist. The overnight run of 2026-09-20 went from architecture straight to build, recording that "gates were NOT stopped at". With no story-level traceability between PRD and code, there was no structure in which the omission could surface.

### OQ-10 — now answered

**The founder has 20+ hours per week.** This unblocks sprint planning, which is where the R0 date must be re-derived.

## 2. Impact Analysis

### Epic and Story impact

**Not assessable — the artifacts do not exist.** Addressed in §4.E.

### Artifact conflicts

**PRD** — conflicts with core goals and with the brief. FR-6 must be replaced. §8.1, §8.3, §1 and OQ-10 all need amendment. The R0 MVP remains coherent; its scope grows.

**Brief** — line 58 is correct and needs sharpening to name automatic recalculation; line 65 ("Scheduling engine that recalculates…" under *Not in v1*) must be split.

**Architecture** — data model and domain layer. Affected: `work_package`, `baseline_wp`, the date write path, and a new domain module. **Not affected:** connectors, ledgers, mapping, dispositions, EVM, tenancy, the job runner. The reconciliation half is sound and is not in question.

**UX** — materially affected, and currently silent: `DESIGN.md` and `EXPERIENCE.md` contain **no mention of dependencies at all**. Needed: dependency editing on the Plan surface, a duration field, dependency arrows and critical-path emphasis on the Gantt, and what the user sees when dates move.

### Technical impact

`fixtures/`, `packages/domain` and the demo golden test must accommodate the new columns. Migrations are pre-production, so there is no data migration cost. 43 TypeScript files exist; the build session is stopped and everything is merged to `main`.

## 3. Recommended Approach

### Revision from v1 of this proposal

v1 recommended adding only a seam and deferring the engine, arguing that the competitive window closing 2026-12-01 made expansion too risky. **That argument was weak and is withdrawn.** R0 is founder-only; no customer is waiting on 2026-12-15. The market date is R1 in Q1 2027. Expanding R0 costs dogfooding time, not market position.

### Selected path: a deliberately minimal scheduling engine in R0

Ship the one behaviour the founder asked for, and stop well short of Microsoft Project.

**The economics that make this affordable:** a forward pass is a topological traversal of the dependency graph. **The backward pass is the same traversal reversed**, so once the forward pass exists it is nearly free — and float is then a subtraction (`LS − ES`), with the critical path being the tasks whose float is zero. The graph traversal is paid for once and four capabilities come back. The working-day calendar this needs (`calendar_day_event`, JP and VN) **already exists**.

**In R0:**

| Capability | Note |
|---|---|
| Finish-to-Start dependencies with lag | ~90% of real cases |
| Forward pass — earliest dates | the traversal |
| Backward pass — latest dates | nearly free once forward exists |
| Float and critical path | a subtraction over the two passes |
| Working-day arithmetic, JP + VN | calendar already built |
| Cycle detection | rejects invalid graphs |
| Automatic recalculation on edit | **the behaviour the founder asked for** |

**Explicitly out of R0** — this is where Microsoft's thirty years actually sit:

| Excluded | Why |
|---|---|
| Resource levelling | NP-hard; heuristics and endless edge cases |
| SS / FF / SF dependency types | real added complexity, rarely used |
| Effort-driven scheduling | duration derived from effort ÷ assignment |
| Constraint types beyond ASAP | must-start-on / must-finish-on are Post-Q1 |
| What-if sandbox, load heatmap | Post-Q1 |

**MVP impact.** R0 grows by one capability. **The 2026-12-15 target is now at risk and must be re-derived during sprint planning**, against the founder's 20+ hours per week. This proposal does not defend that date.

## 4. Detailed Change Proposals

### A. Architecture

**A-1. Dependency edge table.**
```
wp_dependency(tenant_id, project_id, predecessor_wp_id, successor_wp_id,
              type,          -- 'FS' in R0; SS/FF/SF reserved
              lag_days, seq)
```

**A-2. Scheduling inputs on `work_package`.**
```
duration_days      integer, nullable
constraint_type    text, default 'asap'
constraint_date    date, nullable
```
Note `planned_mh` already exists. Duration and effort are distinct: 40 man-hours may be 5 days for one person or 2 days for two and a half. R0 schedules on duration; effort-driven scheduling is out.

**A-3. One date write path.** `domain/schedule.recalculate(project)` owns every write to `wp.start` / `wp.finish`. No other module may assign them. In R0 this is the real scheduler, not an identity function.

**A-4. Baselines pin inputs.** `baseline_wp` additionally captures `duration_days`, `constraint_type`, `constraint_date` and the calendar identity, and the baseline references the `wp_dependency` state it was taken against. **Restores compliance with A2. This is the only item that cannot be recovered if deferred.**

**A-5. Determinism.** Recalculation must be deterministic and reproducible under pinned inputs, consistent with the project's existing integer-arithmetic discipline. Tie-breaking must be explicit and ordered.

**A-6. Record the commitment.** Add to the brief's "Commitments that cannot be retrofitted": *plan dates are derived from pinned scheduling inputs and owned by the scheduler; no other module writes them.*

### B. PRD

**B-1.** Replace FR-6. The existing text — "The schedule is not recalculated automatically" — states the opposite of the requirement.

```
OLD:  FR-6: Finish-to-start dependencies — Post-Q1
      "A violated dependency is flagged. The schedule is
       not recalculated automatically."

NEW:  FR-6a: Dependency, duration and constraint capture — R0
      FR-6b: Schedule recalculation — R0
             FS dependencies with lag, forward and backward pass,
             float and critical path, JP/VN working-day arithmetic,
             cycle rejection, automatic recalculation on edit.
```

**B-2. §8.1** — add FR-6a and FR-6b to R0 scope; mark the 2026-12-15 target as pending re-derivation.

**B-3. §8.3** — remove dependencies; add the exclusion table from §3 so the boundary is explicit and durable.

**B-4. §1 Vision** — state that the plan is scheduler-owned, so the vision's step 3 is reachable.

**B-5. OQ-10** — close it: 20+ hours per week.

**B-6.** Consider an NFR for recalculation latency on a realistic plan size.

**B-7. `addendum.md` line 56** — scheduling leaves the next-wave list; what remains there is effort-driven recalculation and hard-deadline constraints.

### C. Brief

**C-1. Line 58** — sharpen to name automatic recalculation; the line was already right in substance.

**C-2. Line 65** — split: minimal recalculation moves into v1; levelling, what-if sandbox and the load heatmap stay out.

**C-3.** Add the A-6 commitment.

**C-4. `addendum.md` line 41** — same split.

### D. UX — currently silent, needs the most new material

**D-1.** Plan surface: dependency editing, duration field, constraint display.

**D-2.** Gantt: dependency arrows, critical-path emphasis, and what the user sees when dates shift after an edit.

**D-3.** Cycle rejection and violated-dependency feedback.

**D-4.** No change to the Reconciliation Review, Scope Ledger Bar, Dispositions or Client View.

### E. Governance

**E-1.** `bmad-create-epics-and-stories` against the amended PRD.

**E-2.** `bmad-sprint-planning` — honour its PASS / CONCERNS / FAIL verdict. Re-derive the R0 date here against 20+ hours per week.

**E-3.** Reconcile the 43 existing files against the resulting stories; anything with no story is given one or removed.

**E-4.** Run these skills **with the founder present**. The overnight unattended run is what produced this correction; repeating it would reproduce the failure.

### F. Do not modify

These are point-in-time records. Editing them to match a later decision destroys the audit trail: `research/**` (evidence with its own 2026-12-01 re-check), `prds/review-*.md`, `prds/reconcile-*.md` (**including the one that missed this** — it is evidence about the process), `prds/resolution-check.md`, `architecture/reviews/**`, `brainstorming/**`, and every `*.memlog.md`.

## 5. Implementation Handoff

**Scope classification: Major.** A requirement is replaced, the data model changes, UX gains new surfaces, and a governance gate is reinstated.

| Step | Owner | Deliverable |
|---|---|---|
| 1 | Founder | ✅ approved 2026-09-20 |
| 2 | PM (`bmad-prd`) | B-1 … B-7 |
| 3 | Architect (`bmad-architecture`) | A-1 … A-6 |
| 4 | UX (`bmad-ux`) | D-1 … D-4 |
| 5 | PM | `bmad-create-epics-and-stories` |
| 6 | PM | `bmad-sprint-planning` — **re-derive the R0 date here** |
| 7 | Developer | Migration, scheduler, E-3 reconciliation |

Steps 2, 3 and 4 may run in parallel, each in its own session. Step 7 must not start before step 6 returns a verdict.

### Success criteria

- Editing one task's dates moves its dependents automatically, respecting JP and VN working days.
- Float and the critical path are computed and visible.
- Cyclic dependencies are rejected at entry.
- A grep finds no assignment to `wp.start` / `wp.finish` outside `domain/schedule`.
- A baseline captured after this change is re-derivable from its pinned inputs alone.
- Epics and Stories exist; `bmad-sprint-planning` has returned a verdict and a re-derived R0 date.
- Nothing in the excluded list of §3 has been built.

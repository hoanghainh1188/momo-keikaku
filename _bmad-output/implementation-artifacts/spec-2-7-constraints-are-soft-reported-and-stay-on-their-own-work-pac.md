---
title: 'Story 2.7 — constraints are soft, reported, and stay on their own Work Package'
type: 'feature'
created: '2026-09-24'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '74f99503968006d8dd95234d8556fcf82a32f540'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `recalculate` (2.5–2.6) ignores leaf constraints. A PM who pins *must start on* or *must finish on* gets neither the bound where the graph allows it nor a ranked violation when the graph defeats it — and a milestone target is that same `must_finish_on` (FR-6b, AR-49, §3).

**Approach:** Extend the pure `recalculate` (AD-25) so `ScheduleWp` carries `constraintType` and `constraintDate` (mirroring `work_package`), the forward pass applies soft bounds where the graph allows, and `ScheduleOutputs` gains a Project-level violation list (asked date, derived date, working days late, predecessor chain) sorted by days late descending then `compareWp`. Constraints never enter `backward.ts` and are never an anchor: a violation changes no Float and never displaces the critical path.

**Decisions (founder, 2026-09-24):**
- **Q1 → A.** *Must start on* is hold-back only: early start = max(graph start, rolled constraint date). It never pulls a WP earlier than the graph allows.
- **Q2 → A.** *Must finish on* is a report-only upper bound: if derived finish > rolled constraint date → violation and no date change; if derived finish ≤ date → no date change and no violation. MFO never delays a WP that could finish earlier.
- **Q3 → A.** A *satisfied* constraint that delays a WP (MSO hold-back) may move early dates and hence other WPs' Float and the critical path. Only a *violation* is barred from changing Float or displacing the path.
- **Q4 → B.** A constraint date on a non-working day rolls: MSO via `ceilPosition` (forward), MFO via `floorPosition` (back). Halt `calendar_range` naming the WP only when the date is outside the range, or the rolled position is still out of range.
- **Q5 → A.** A constraint on a complete or in-progress WP is ignored for dates and for the violation list. Remaining leaves only. Misses after actuals are left to Health (FR-31), not this pass.
- **Q6 → A.** Days late are non-negative working days between the asked (rolled) date and the derived date. Only misses appear on the list, so every row has days late > 0.
- **Q7 → A.** The reported chain is the whole first-driver walk: at each step take `drivingPredecessors[0]`, until a WP with no driver (with a cycle guard).
- **Keep the full spec** (~2,600 tokens), with no split.

## Boundaries & Constraints

**Always:**
- `recalculate` stays the one entry point: no second exported pass function, nothing else named `recalculate`. `backward.ts` stays internal and is not changed for constraint logic.
- Soft: MSO holds a remaining WP back where the graph allows; MFO only reports a miss. Where the graph defeats MSO, the graph wins — no successor ever starts before its predecessor's drive.
- A violation reports asked date, derived date, working days late (> 0) and the full first-driver predecessor chain. Sort: days late descending, then `compareWp`.
- A violation changes no WP's Float — its own, upstream, anywhere — and never displaces the critical path. Constraints never enter the backward pass and are never an anchor.
- A milestone is a zero-duration leaf whose target **is** its `must_finish_on`; a missed target on a *remaining* milestone is a violation on that milestone.
- Leaf-only in the product/DB CHECK; the domain reads what it is given (summaries keep `asap` / null). Outputs stay identical under shuffles (`expectShuffleInvariant`, N ≥ 50) with constraints in the plan. The 2,500-leaf plan stays under 300 ms with constraints present.

**Never:**
- No migration, table, port, use case or UI. No change to Float / critical-path / late-date rules from 2.6. No second `recalculate*` export. No recovery behaviour beyond reporting (PRD FR-6b deliberate exclusion). No judging complete/in-progress constraints in this pass.

## I/O & Edge-Case Matrix

Positions are working days. Lag 0 unless stated. Rows marked ⟨Qn⟩ are pinned by the decision of the same number.

| Scenario | Input | Expected |
|---|---|---|
| asap default | Leaf with `asap`, `constraintDate` null | Early dates unchanged vs 2.6; no violation |
| Soft MSO holds back ⟨Q1⟩ | Remaining W, graph start Mon, `must_start_on` Wed | Early start Wed; no violation; successors driven from the delayed finish |
| Soft MSO defeated ⟨Q1⟩ | Remaining W, predecessors force start Fri, `must_start_on` Wed | Early start Fri (graph wins); one violation on W |
| MFO early OK ⟨Q2⟩ | Remaining W finishes Mon; `must_finish_on` Wed (later) | Early dates unchanged; no violation |
| MFO miss ⟨Q2⟩ | Remaining W finishes Fri; `must_finish_on` Wed (earlier) | Early dates unchanged; violation on W |
| MFO miss, Float untouched | Chain that decides the finish has Float 0; another WP's `must_finish_on` is six weeks early | Violation on that WP; every Float and `criticalPath` identical to the same plan with `asap` |
| Satisfied MSO moves Float ⟨Q3⟩ | Satisfied MSO delays W; dependent Z had Float > 0 off the path | W's early dates move; Z's Float (and possibly criticality) may change; not a violation |
| Milestone target | M duration 0 remaining, `must_finish_on` D, predecessors force a later date | Violation on M; M still participates in both passes as a zero-duration leaf |
| Constraint on Saturday ⟨Q4⟩ | MSO on Saturday → next working day; MFO on Saturday → previous working day | Bound/compare uses the rolled working day; `asked` in the violation is the date the PM set |
| Constraint out of range ⟨Q4⟩ | Constraint date before `rangeStart` or after `rangeEnd` | `halted`, `calendar_range`, naming the WP and the side |
| Complete / in-progress ⟨Q5⟩ | Complete or in-progress leaf with `must_*` | Constraint ignored; no violation from it; dates as 2.5/2.6 |
| Days late ⟨Q6⟩ | Derived after / on / before the rolled asked date | Miss → days late > 0 on the list; on-time or early → no row |
| Chain depth ⟨Q7⟩ | Violated W driven by P1, P1 driven by P0 | `chain` = [P1, P0] (first driver each step, then stop) |
| Violation sort | Two violations, days late 5 and 3; two tied at 5 | Order: days late desc, then `compareWp` among ties |
| No constraint → no chain walk | `asap` leaf | Not on the violation list |

</frozen-after-approval>

## Code Map

- `packages/domain/src/schedule/recalculate.ts` (~760 lines, near the 800-line cap) — entry point, types, `assertInputs`, `forwardPass` / `scheduleLeaf` (remaining start = max of anchors and drives, L568–576), `assemble`. Add `constraintType` / `constraintDate` on `ScheduleWp`, a `ConstraintViolation` type and `violations` on `ScheduleOutputs`, apply MSO hold-back inside the remaining leaf path, collect MSO/MFO violations after early dates exist, sort in `assemble`. Prefer extracting constraint helpers to a new internal module rather than growing this file past the cap. Drop the header's "Out of scope: constraints (2.7)".
- `packages/domain/src/schedule/backward.ts` (~171) — **do not change for constraints.** Float, late dates, critical path and anchor stay graph-and-anchor only. Keep unexported from `index.ts`.
- `packages/domain/src/schedule/plan.ts` (~141) — reuse; no constraint fields on the plan structure beyond what WPs already carry.
- `packages/domain/src/calendar.ts` — reuse `ceilPosition` (MSO roll) / `floorPosition` (MFO roll) / `workingDayAt` for Q4. Add nothing unless a shared helper is clearly needed.
- `packages/domain/src/schedule/order.ts` — `compareWp` / canonical index only; violation sort is days late then that index.
- `tests/support/schedule-fixtures.ts` — extend `WpSpec` / `wp()` with `constraintType` (default `'asap'`) and `constraintDate` (default `null`).
- `packages/domain/src/schedule/recalculate.test.ts` / `recalculate.backward.test.ts` — keep green; shuffle and 2,500-leaf fixtures must carry constraints (mix of asap and pinned) so NFR and AD-28 still hold with the new fields.
- New `packages/domain/src/schedule/recalculate.constraints.test.ts` — every matrix row with hand-computed dates, the six-week MFO that must not displace the critical path, milestone miss, sort order, shuffle (N ≥ 50) and timing with constraints.
- `packages/db/drizzle/0000_scheduling_schema.sql` — read only: `constraint_type` / `constraint_date` and the leaf-only CHECK already exist; violations live in `outputs` jsonb (2.9), not columns.
- `_bmad-output/implementation-artifacts/deferred-work.md` — append: (1) 2.9 index-encoding of violation chains if not already covered; (2) FR-31 / Health may compare constraint dates to actuals for complete/in-progress (Q5 → A left that out of `recalculate`).

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/schedule/recalculate.ts` (and a new internal helper module if needed to stay under the line cap) — inputs, MSO hold-back in the forward path, MFO/MSO violation collection and sort; header updated.
- [x] `tests/support/schedule-fixtures.ts` — `constraintType` / `constraintDate` on builders.
- [x] `packages/domain/src/schedule/recalculate.constraints.test.ts` — matrix rows, Float/path invariance under an unmet MFO, milestone, sort, shuffle N ≥ 50, 2,500-leaf timing with constraints.
- [x] Existing `recalculate*.test.ts` — fixtures/defaults compile; shuffle and timing plans include constraints.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` — Q5 → A carry-over for Health vs actuals; 2.9 index-encoding of violation chains if needed.

**Acceptance Criteria:**
- Given a leaf with *must start on* or *must finish on*, when the pass runs, then MSO is applied as a hold-back where the graph allows it, MFO only reports misses, and where the graph defeats MSO the graph wins.
- Given a constraint the graph defeats, when the violation is reported, then it names the asked date, the derived date, the working days late and the full first-driver chain, sorted worst-first then `compareWp`.
- Given an unmet *must finish on*, when Float is computed, then every WP's Float and the critical path match the same plan with that constraint cleared to `asap`.
- Given a remaining milestone whose target is missed, when it is scheduled, then the miss is a constraint violation on that milestone.
- Given the repository, when `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test` run, then all pass.

## Implementation Notes

- Soft constraints live in `packages/domain/src/schedule/constraints.ts` (internal; not exported from `index.ts`) so `recalculate.ts` stays under the 800-line cap. MSO hold-back is applied in the remaining-leaf path of `scheduleLeaf`; MFO is range-checked there and judged in `collectViolations` after early dates exist. `backward.ts` is untouched.
- `ScheduleWp` gains `constraintType` / `constraintDate` (defaults via fixtures: `asap` / `null`). `assertInputs` throws on a mismatched pair. `ScheduleOutputs.violations` carries asked (unrolled), derived, days late and the first-driver chain, sorted days-late desc then canonical index.
- Existing shuffle (N ≥ 50) and 2,500-leaf timing plans in `recalculate.test.ts` / `recalculate.backward.test.ts` now mix asap and pinned constraints; the new `recalculate.constraints.test.ts` covers every matrix row.
- Review pass 1 patches: remaining `no_duration` leaves range-check constraints before exiting (Q4 halt); two Q4 halt tests added (no_duration OOR, MFO on a weekend-opening calendar); JSDoc restored onto `ScheduleWp`.

## Spec Change Log

## Review Triage Log

Review pass 1 (2026-09-24), by the Blind Hunter (BH), the Edge Case Hunter (EC) and the Verification Gap reviewer (VG).

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | EC, BH | Remaining `no_duration` leaf with out-of-range `must_*` never hits `resolveRemainingConstraint`, so `calendar_range` does not fire | medium | Reproduced: `durationDays: null` + `must_start_on` `2026-09-15` on an Oct calendar returns `scheduled` with `notSchedulable`, not halted. Q4 requires a halt when the constraint date is outside the range | patch |
| 2 | VG | MFO whose `floorPosition` is −1 (calendar opens on a non-working day) is untested; breaking `rolledConstraint`'s `>= 0` check still leaves the suite green and can emit a bogus violation | medium | Pre-verified (VG). Code at `constraints.ts:54-56` is correct today (`mfo-leading-weekend` probe halted); the Q4 outside-range test only uses dates before/after the range | patch |
| 3 | BH | JSDoc "One WP as the scheduler reads it…" sits above `ConstraintType` instead of `ScheduleWp` | low | Confirmed at `recalculate.ts:90-97`. Wrong attachment, no runtime effect | patch |
| 4 | BH | Spec frontmatter still `in-progress` while tasks are `[x]` | false | Workflow: status was `in-progress` during implement and is now `in-review` for this pass | reject |
| 5 | BH | Spec Change Log and Review Triage Log empty in the landing diff | false | Expected on the first review pass; this table is the trail | reject |
| 6 | BH | Compressing the file header drops still-binding 2.5/2.6 conventions | false | Lines 36–41 still state inclusive dates, (1+L), reverse lag, bridge, Project-finish roll-back and soft rolls. Detail moved to `constraints.ts` / prior specs, not deleted from behaviour | reject |
| 7 | BH | Code Map still cites pre-change line numbers / ~760 lines | false | Finding's fix is to edit this build's spec; rejected per triage rules | reject |
| 8 | BH | Q7 cycle guard has a `seen` set but no cyclic-driver test | low | `validate` rejects cycles before the passes; a self-drive cannot appear in `drivers` on a scheduled plan. Unlikely in everyday use; adding a synthetic cycle would fight the graph gate | reject |
| 9 | BH | No bridged no-duration driver in the chain suite | low | Bridging is pinned in 2.5/2.6; the chain walks the same `drivers` array. Unlikely everyday gap | reject |
| 10 | BH | Q3 test only asserts Float inequality, not hand-computed values | low | Matrix expects that Float *may* change; inequality is enough. Exact Float belongs to 2.8's corpus | reject |
| 11 | BH | Six-week MFO case never asserts an exact `daysLate` | low | AC and matrix require Float/path identity and a violation; exact days late is corpus work | reject |
| 12 | BH | Calendar-range halt coverage is one-sided (MSO before / MFO after only) | low | Grouped with #2 for the roll-off-the-end path; raw opposite sides are the same `ceilPosition`/`floorPosition` failure already covered by the outside-range test | reject |
| 13 | BH | Q4 vs Q5: out-of-range `must_*` on complete/in-progress should be ignored (no halt) and is untested | false | Q5 → A ignores those constraints entirely; not resolving them is the intended behaviour. No defect | reject |
| 14 | BH | Remaining `no_duration` with in-range `must_*` is silently skipped with no matrix row | false | Same root as #1 for OOR; in-range not-schedulable leaves have no derived dates to bound or report, which matches "remaining *dated* leaves" in `collectViolations`. Not a separate defect | reject |
| 15 | BH | `ConstraintViolation.chain` docs are MSO-centric | low | Cosmetic JSDoc; chain is still the first-driver walk that forced the early dates. No product harm | reject |
| 16 | BH | Forward-path halt uses `'ok' in resolved` instead of a tagged union | low | Works; a tagged union is a redesign, not a direct correction | reject |

## Design Notes

**Soft ≠ second CPM.** Common CPM turns a missed MFO into negative Float on that chain and can steal the critical path. Here the graph and the Project/computed finish alone set Float; the violation list sits beside the path. Worked sketch for the corpus: a long ASAP chain A→B→C decides the finish (Float 0); leaf Z off the chain has `must_finish_on` six weeks before its derived finish — Z is violated and ranked first, C stays critical.

**MSO vs MFO.** Only MSO can change early dates (hold-back). MFO never delays; finishing early against an MFO is success, not a pull-to-date. A satisfied MSO that delays W is allowed to move dependents' Float (Q3 → A).

**Input shape (implementer).** Default `asap` + `null` date. Treat `must_*` with a null date, or `asap` with a non-null date, as a caller defect (`assertInputs` throw), matching other input checks — the DB CHECK does not encode the pairing, but the product columns do.

**Driving chain for a violation.** Built after early dates exist, from the violated WP's `drivingPredecessors[0]` repeatedly until empty (Q7 → A). Bridged drivers already appear in that list from 2.6. `askedDate` in the row is the date the PM set (unrolled), matching how `anchor.date` reports a Project finish; comparison uses the rolled working day (Q4 → B).

## Verification

**Commands:**
- `pnpm exec vitest run packages/domain` -- expected: all pass
- `pnpm lint && pnpm typecheck && pnpm depcruise && pnpm test` -- expected: exit 0

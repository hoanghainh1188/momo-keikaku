---
title: 'Story 2.6 — the backward pass, Float, and the critical path'
type: 'feature'
created: '2026-09-24'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a8443196919812455f29c419c5e13a3c0564f41c'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `recalculate` (2.5) derives early dates only. A PM cannot see how far a task can slip, or which chain decides the finish, so a slip's real cost to the end date is invisible (FR-6b, AR-49, AR-56).

**Approach:** Extend the pure `recalculate` (AD-25) with a backward pass over the same graph from one anchor: the PM-set Project finish, otherwise the computed finish (the latest early finish). Per WP it adds `lateStart`, `lateFinish`, `floatDays`, `isCritical` and the tied driving predecessors. Per Project it adds the anchor, the computed finish and the ordered critical path, which is the minimum-Float set.

**Decisions (founder, 2026-09-24):**
- **Q1 → A.** The reverse of (1 + L) mirrors 2.5. A work predecessor's late finish = min over its successors of (successor late start − L − 1), and a milestone's = min of (late start − L). A milestone's late start = its late finish. A WP with no dated successor finishes at the anchor.
- **Q2 → A.** A complete WP has no late dates or Float and is never critical. An in-progress WP gets late dates for its remaining work, and its Float is measured from where it resumes. An edge into a complete or in-progress WP is ignored on the way back, as the forward pass ignores it on the way in. So Float is never negative against the computed finish.
- **Q3 → A.** P →(a) X →(b) S holds P back as P →(a+b) S, transitively, taking the tightest bound. A no-duration X gets no late dates or Float and is never critical.
- **Q4 → A.** A Project finish on a non-working day rolls back to the last working day on or before it. The output reports the date the PM set.
- **Q5 → A.** A late date before `rangeStart`, or a Project finish outside the range, halts with `calendar_range`. `CalendarAnchor` gains `project_finish`.
- **Q6 → A (during implementation).** No late finish is later than the anchor: late finish = min(anchor, the bound from successors). Otherwise a lag of −2 or less (−1 or less out of a milestone) leaves a plan with no zero-Float WP, against AC 1.
- **Q7 → A (during implementation).** The computed finish is the latest early finish of a remaining or in-progress WP. A Plan whose leaves are all complete has no computed finish and no critical path.
- **Keep the full spec** (about 2,300 tokens), with no split.

## Boundaries & Constraints

**Always:**
- `recalculate` stays the one entry point: no second exported pass function, nothing else named `recalculate`. It stays pure, and it returns `scheduled` or `halted`, never partial outputs.
- `ScheduleInputs` gains `projectFinish: IsoDate | null`. Setting or clearing it moves no early date.
- One anchor. A constraint is never an anchor (constraints are 2.7).
- Float = late start − early start, as an integer number of working days. It is negative only against a PM-set finish, and never clamped.
- `isCritical` ⟺ Float equals the minimum Float over the WPs that have Float. It is never defined as "Float = 0", and it is computed in one place only.
- The critical path is ordered by early start ascending, then `compareWp`. Driving predecessors are listed in `compareWp` order, bridged sources included.
- Outputs stay identical under shuffles (`expectShuffleInvariant`, N ≥ 50, over a plan with a PM-set finish and negative Float). The 2,500-leaf plan stays under 300 ms.

**Never:**
- No migration, table, port, use case or UI. No constraint handling. No change to the forward pass's dates.

## I/O & Edge-Case Matrix

Positions are working days. The week is Mon–Fri, and every row has lag 0 unless it says otherwise. Rows marked ⟨Qn⟩ are pinned by the decision of the same number.

| Scenario | Input | Expected |
|---|---|---|
| Relative anchor | No Project finish. Chain A(3) → B(2), and C(1) off the chain | Anchor `computed_finish` = B's early finish. A and B have Float 0, are critical, and are on the path in order A, B. C has Float > 0 |
| Absolute anchor, late | Project finish 3 working days before the computed finish | Anchor `project_finish`. The chain has Float −3, is critical, and the path is not empty |
| Absolute anchor, slack | Project finish 4 working days after the computed finish | Minimum Float is 4, and the WPs at 4 are critical |
| Reverse lag ⟨Q1⟩ | S has late start Thu. P → S with lag 0 / −1 / 2 | P's late finish is Wed / Thu / Mon |
| Milestone late date ⟨Q1⟩ | P(work) → M(0) → S, and S has late start Mon | M's late start = late finish = Mon. P's late finish is Fri |
| Complete WP ⟨Q2⟩ | Actual start and finish | Late dates and Float are null, not critical. Edges into it impose nothing on its predecessors |
| In progress ⟨Q2⟩ | Resumes at the Data Date, 4 days remaining | Late finish comes from its successors or the anchor; late start = late finish − 3. Float = late start − resume position. Its predecessors are not held back by it |
| Bridge ⟨Q3⟩ | P →(1) X(no duration) →(2) S | P is held back as P →(3) S. X has no late dates and no Float |
| Finish on a non-working day ⟨Q4⟩ | Project finish is a Saturday | The pass anchors on Friday. `anchor.date` reports the Saturday as set |
| Out of range ⟨Q5⟩ | A late date falls before `rangeStart`, or the Project finish is outside the range | `halted`, `calendar_range`, naming the WPs (or the anchor `project_finish`) and the side |
| Tied drivers | S starts at the drive of both P1 and P2, and bridged P3 also ties | `drivingPredecessors` = [P1, P2, P3] in `compareWp` order. Empty when the Data Date or the Project start alone set the start |
| Nothing dated | Every leaf has no duration | `computedFinish` null, and the anchor is the Project finish or null. Critical path empty |
| Summary | Parent of leaves | Late dates and Float null, not critical |

</frozen-after-approval>

## Code Map

- `packages/domain/src/schedule/recalculate.ts` (713 lines) -- the entry point, types, input checks, forward pass and assembly. Add `projectFinish` to `ScheduleInputs`, the new output fields, `'project_finish'` to `CalendarAnchor`, and the call into the backward pass between `forwardPass` and `assemble`. `Drives` (l.~400) keeps the latest drive per source. The driving set is every source whose drive equals the chosen start when the maximum drive is ≥ `anchors.earliestStart`. `scheduleLeaf` must return it. `passOn` (EF + 1 for work, ES for a milestone) is exactly what the reverse rule inverts.
- New `packages/domain/src/schedule/plan.ts` -- move `Plan`, `buildPlan`, `topologicalOrder` and `MinHeap` here (internal). This keeps `recalculate.ts` under the 800-line cap.
- New `packages/domain/src/schedule/backward.ts` -- internal helpers: the reverse-topological pass, the anchor resolution and the critical-path selection. This module is not exported from `index.ts` and has no public "pass" function.
- `packages/domain/src/calendar.ts` -- reuse `floorPosition` (Q4's roll-back), `workingDayAt` and `InRange`. Add nothing.
- `packages/domain/src/schedule/order.ts` -- the canonical index is the `compareWp` order. Sort the critical path by (early-start position, index).
- `packages/domain/src/schedule/recalculate.test.ts` (739 lines) -- the existing tests. Add `projectFinish: null` to the `inputs()` default, and extend the shuffle test's plan with a Project finish.
- `tests/support/` -- move the fixture builders (`calendar`, `wp`, `edge`, `inputs`, `scheduled`) here, so both test files share them.
- `packages/db/drizzle/0000_scheduling_schema.sql` -- read only: `wp_schedule.late_start/late_finish/float_days/is_critical` and `schedule_run.anchor/computed_finish` already exist and are mirrored in names only.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/schedule/plan.ts` -- extract the plan structure and the topological order from `recalculate.ts`, with no change in behaviour.
- [x] `packages/domain/src/schedule/backward.ts` -- the backward pass, the anchor and the minimum-Float critical path, per the matrix.
- [x] `packages/domain/src/schedule/recalculate.ts` -- the new inputs and outputs, driving predecessors from `scheduleLeaf`, and wiring plus halts. Update the header (drop "out of scope: 2.6", add the conventions).
- [x] `tests/support/schedule-fixtures.ts` -- the shared builders.
- [x] `packages/domain/src/schedule/recalculate.backward.test.ts` -- every matrix row with hand-computed dates, the tie cases, a slip on a critical WP that moves the computed finish, negative Float only with a Project finish set, shuffle invariance (N ≥ 50) and the 2,500-leaf timing with a Project finish.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- add any entry the decisions create, such as 2.9 encoding the driving lists and the critical path as indices.

**Acceptance Criteria:**
- Given a plan with no Project finish, when it recalculates, then every Float is ≥ 0 and the minimum Float is 0.
- Given a remaining WP on the critical path, when its duration grows by N, then the computed finish moves by N working days.
- Given the same inputs with and without a Project finish, when both recalculate, then every early date is identical.
- Given the repository, when `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test` run, then all pass.

## Implementation Notes

Two choices the frozen decisions did not state outright. The founder confirmed both on 2026-09-24 (Q6 → A, Q7 → A).

- **No late finish is later than the anchor.** Q1 says a predecessor's late finish is the least of its successors' bounds. With a lag of −2 or less (−1 or less out of a milestone), that bound falls after the anchor. Example: W (5 d) →(−3) S (1 d) with no Project finish gives both WPs Float 2, so no WP has Float 0. That contradicts AC 1 and the Design Notes ("the minimum Float is 0"). The pass therefore takes `min(anchor, bound from successors)`. For lag ≥ −1 the bound is never past the anchor, so every matrix row is unchanged. A side effect is that a late finish can no longer fall after the range. Only a late date before `rangeStart` or a Project finish outside the range halts, which is all Q5 asks for.
- **The computed finish counts only derived dates.** It is the latest early finish of a *remaining or in-progress* WP. A complete WP's actual finish is not derived, and the app layer keeps it on or before the Data Date. So a Plan whose leaves are all complete has `computedFinish: null`. Its anchor is then the Project finish or null, and it has no critical path.

Also:
- `plan.ts` gained `outgoing` (successor, lag) lists, which the backward pass needs. Otherwise the plan code moved over unchanged. `recalculate.ts` is 759 lines.
- `drivingPredecessors` is `[]` on every WP that is not remaining (complete, in progress, no duration, summary), because none of them is driven.
- The story 2.5 test that compared an independent WP's whole row before and after a slip now compares only its early dates. Its Float grows when the computed finish moves.

## Spec Change Log

## Review Triage Log

Review pass 1 (2026-09-24), by the Blind Hunter (BH), the Edge Case Hunter (EC) and the Verification Gap reviewer (VG).

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | EC | With no anchor, every leaf's `isCritical` is `undefined`, not `false` | medium | `late = []` when `anchorPosition` is null, so `criticalPath` maps an empty array and `critical.isCritical[i]!` is `undefined`. It was reproduced. The "nothing dated" test passes only because it tests `!w.isCritical`. 2.9's `is_critical NOT NULL` would break | patch |
| 2 | BH, EC | The 2.9 deferred entry says the `project_finish` anchor also covers a late date before `rangeStart` | low | That halt goes through `rangeHalt` with `anchors: []` and names the WPs (the Q5 test pins it). Correcting the sentence is a direct fix | patch |
| 3 | BH, EC | A late-date halt does not say it came from the backward pass, or name `project_finish` | low | Real but rare: only a PM-set finish can pull a late date before the range, and the matrix asks only for the WPs and the side. Adding a field is more than a direct correction | reject |
| 4 | EC | `projectFinish: undefined` passes `!== null` and throws in `assertIsoDate` | false | The type is `IsoDate \| null`. `undefined` only comes from an untyped caller, and a throw on a caller defect is correct behaviour | reject |
| 5 | BH | `projectFinish` is not checked against the Project start or the Data Date | false | A Project finish before the Data Date is legitimate. It gives negative Float, which FR-6b requires to be shown as it is | reject |
| 6 | BH, EC | "Dated" means remaining-or-in-progress in `backward.ts` but includes complete WPs in the drivers' doc | low | Listing a complete predecessor that set the start is correct under AR-56. Only the wording diverges. Rewording the comment is a direct fix | patch |
| 7 | BH, VG | The slip test now checks only Z's early dates, and its Float claim is not asserted | low | Pre-verified (VG): a regression in Z's `remainingDays` or drivers would pass. It is a direct test fix | patch |
| 8 | VG | No test covers the `projectFinish` input check | low | Pre-verified: deleting `assertIsoDate(projectFinish)` keeps the suite green, and `'garbage'` would then halt as `after` instead of throwing | patch |
| 9 | VG | No test lets an in-progress WP set the computed finish | medium | Pre-verified: narrowing `computedFinishPosition` to remaining WPs keeps the suite green. That wrong anchor would feed every Float value | patch |
| 10 | BH | Nothing shows that a non-critical WP absorbs growth up to its Float | low | This is the other side of AC 2, and adding it to the existing plan is one test | patch |
| 11 | BH | The in-progress test asserts no driving predecessors | low | A direct assertion pins that an in-progress WP drives its successor and lists no driver itself | patch |
| 12 | BH, VG | `criticalPath`'s `isOwn` parameter never changes the result | low | Foreign WPs have no forward leaf, so they are `role: 'none'` and never get late dates. Deleting the parameter is a direct fix | patch |
| 13 | BH | The Q4 roll-back is only tested for a weekend, not a mid-week holiday | low | `floorPosition` reads the exhaustive non-working-day set, and the calendar tests (2.5) cover holidays. A second case would add no new path | reject |
| 14 | BH | The 300 ms wall-clock test may flake, and it has no bridges or actuals at scale | low | Carried from 2.5 review row 12 (a 12× margin). The shuffle and acceptance plans cover those states | reject |
| 15 | BH | Two acceptance tests use a single seed | low | Each test pins a structural property on a plan that exercises every state. More seeds add runtime, not new paths | reject |
| 16 | BH | `criticalPath` is a flat, date-sorted set, not a chain | false | The spec defines it as the minimum-Float set ordered by early start, then `compareWp` (AR-49, AD-26). Chains are read through `drivingPredecessors` | reject |
| 17 | BH | The spec, epic context and sprint status are missing from the diff | false | They were left out of the review diff on purpose. They are workflow artifacts, and the spec is given to the edge-case layer alone | reject |

## Design Notes

**The pass is the mirror of the forward pass (Q1–Q3).** Only edges the forward pass used for dates constrain the backward pass. Those are edges into remaining WPs, reached directly or bridged. With the computed finish as the anchor, that gives late ≥ early everywhere, so the minimum Float is 0. Worked example: B has late start Thu, A → B lag 0, A is work of 2 days. A's late finish is Wed and its late start Tue. If A's early start is Tue, its Float is 0.

**Choices made here, which you would not see in the product:** summaries get null late dates and Float, and the grid shows an em dash. A drive that ties with the Data Date or the Project start still counts as a driver. `anchor` is `{ kind: 'project_finish' | 'computed_finish', date } | null`. No `minFloat` field is added, because it can be derived from any WP on the critical path.

## Verification

**Commands:**
- `pnpm exec vitest run packages/domain` -- expected: all pass
- `pnpm lint && pnpm typecheck && pnpm depcruise && pnpm test` -- expected: exit 0

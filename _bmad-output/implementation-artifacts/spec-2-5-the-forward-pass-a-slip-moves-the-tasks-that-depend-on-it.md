---
title: 'Story 2.5 — the forward pass: a slip moves the tasks that depend on it'
type: 'feature'
created: '2026-09-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd5955227a6a9cb6fca95c1c5ce229171ad78f98c'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** No code derives a planned date. The domain has `validate` (2.4) and `compareWp` (2.3), but no scheduler. A slipped task therefore moves nothing downstream, and the plan cannot leave Excel (FR-6b, §8.3: never cut).

**Approach:** Add the pure `recalculate(inputs, prevInputs)` in `packages/domain/src/schedule/recalculate.ts` (AD-25). It checks the four graph rules first and halts on any offence. It then runs the forward pass over the leaves in the three states, derives remaining duration, lists "not schedulable yet" WPs and rolls summaries up. Working-day arithmetic runs on a **bounded** calendar value that carries its own range, and a pass that leaves the range halts. Float, the critical path (2.6), constraints (2.7) and the stored run (2.9) are out of scope.

**Decisions (founder, 2026-09-24):**
- **Q1 → A.** 2.5 adds a pure `CalendarVersion { nonWorkingDays, rangeStart, rangeEnd }` to `domain/calendar`, with the shape of `holiday_calendar_version`, and bounded shift arithmetic. Tests use hand-built fixtures. 2.12 keeps the table, the 2026–2028 JP/VN dataset and `publishCalendarVersion`.
- **Q2 → as proposed.**
  - Start and finish are inclusive working days.
  - FS lag L starts the successor (1 + L) working days after the predecessor's finish: lag 0 is the next working day, −1 the finish day, −2 the day before.
  - A Data Date or Project start on a non-working day rolls forward to the next working day.
  - An in-progress WP resumes at the later of its actual start and the (rolled) Data Date, and runs its remaining duration from there. Unfinished predecessors do not drive it.
  - A remaining WP that has a pct but no actual start runs its full duration.
- **Q3 → A.** A zero-duration WP's date (start = finish) is its earliest start, and a lag-L successor starts L working days after that date. So a milestone after a Friday finish reads Monday, and a lag-0 successor starts Monday.
- **Q4 → A.** Bridging across a no-duration WP X: P →(a) X →(b) S drives S as P →(a+b) S. This applies transitively through chains of X and takes the latest drive.
- **Q5 → A.** `prevInputs` stays in the signature (AD-25), but no cause is computed. A `deferred-work.md` entry assigns the per-WP cause to 2.9.
- **Keep the full spec** (about 2,100 tokens), with no split.

## Boundaries & Constraints

**Always:**
- `recalculate` is pure. It reads only its arguments: no clock, no I/O, and no import from `domain/attribution`.
- It returns either `scheduled` with outputs or `halted` with a reason. It never returns partial outputs.
- Graph offences halt with the four `validate` lists. A calendar-range halt names the WPs and the side of the range they left.
- Outputs are identical in codec-canonical form under any shuffle of WPs and edges: `expectShuffleInvariant`, N ≥ 50.
- Working-day arithmetic lives only in `domain/calendar`. Days, durations and lags are integers, and the percentage is a `Ratio`.
- Remaining duration is `ceil(duration × (1 − pct))`, with a minimum of 1 and through `ceilDiv`. A missing pct is 0. It is never stored in inputs.
- An actual date always wins, and a pair whose actual start precedes the predecessor's drive is flagged out-of-sequence.

**Never:**
- No migration, table, use case, port, repository or UI. Nothing else is named `recalculate`.
- No late dates, Float, critical path or constraint handling.
- No change to the behaviour of the existing unbounded `HolidayCalendar` helpers, which `evm.ts` and `forecast.ts` use.

## I/O & Edge-Case Matrix

| Scenario | Input | Expected |
|---|---|---|
| Graph offence | Any `validate` offence | `halted`, reason `graph_invalid`, carrying the four lists. No outputs |
| Complete | Actual start and finish | State `complete`. Dates are the actuals, and successors are driven from the actual finish |
| In progress | Actual start, duration 10, pct 25/100 | Remaining is 8 = ceil(10 × 75/100). Start is the actual start, and the finish comes from the remaining work run from no earlier than the Data Date |
| pct = 1, not finished | Duration 5, pct 1/1 | Remaining is 1 (the minimum) |
| Missing pct | In progress, `recordedPct` null | Treated as 0%, so remaining equals duration |
| Remaining | No actuals | Start is the latest of the Data Date, the Project start and each predecessor drive |
| Actual beats graph | Successor's actual start < predecessor drive | Actual kept, the successor's successors are driven from it, and the pair is flagged out-of-sequence |
| No duration | Leaf with `durationDays` null | No dates. Listed as not schedulable, reason `no_duration`. Its successors are bridged from its predecessors |
| Summary | Parent of leaves | Earliest descendant early start, latest early finish, summed `plannedMh`. Dates are null when no descendant is schedulable |
| Past range | A shift would land after `rangeEnd` (or before `rangeStart`) | `halted`, reason `calendar_range`, with the WP ids in `compareWp` order and the side of the range |
| Lag 0 / −1 / −2 | Predecessor finishes Wed (Thu and Fri are working days) | The successor starts Thu / Wed / Tue |
| Weekend | Predecessor finishes Fri, lag 0, duration 2 | The successor runs Mon–Tue |
| Milestone | Duration 0 after a Fri finish, lag 0 both sides | The milestone is Mon–Mon, and its successor starts Mon |
| Anchor on a holiday | The Data Date is a non-working Sat | Remaining work starts no earlier than Mon |
| Bridge | P (finish Mon) →(1) X (no duration) →(2) S | S starts 4 working days after Mon (lag 3 → Fri) |
| Bad input | pct < 0 or > 1, a duration < 0, an edge to an unknown WP, a Data Date outside the range | Throws (caller defect), or `calendar_range` for the Data Date |

</frozen-after-approval>

## Code Map

- `packages/domain/src/calendar.ts` -- add the bounded value and a working-day index (sorted working days in range and date → index) so a shift is O(1). A shift out of range is a typed failure, not a guess. `HolidayCalendar`, `addWorkingDays` and the other existing functions stay as they are (`evm.ts:1`, `forecast.ts:1`).
- `packages/domain/src/schedule/validate.ts` -- reuse `validate`, `hasOffences` and `GraphOffences`. `PlanGraphWp` needs `projectId` and `parentId`.
- `packages/domain/src/schedule/order.ts` -- `compareWp` and `canonicalWps` (a duplicate id throws). Break ties in the topological order by canonical index so the result is deterministic.
- `packages/domain/src/units.ts` -- `Ratio` and `ceilDiv`. Remaining = `ceilDiv(d × (den − num), den)`, then max 1.
- `packages/domain/src/index.ts:16` -- export `schedule/recalculate`.
- `tests/support/shuffle-invariant.ts` -- `expectShuffleInvariant(fn, input, n)` shuffles one array. Wrap it so both the WP list and the edge list are shuffled, for example by shuffling a tagged union list and splitting it.
- DB columns to mirror in the types (no DB work): `work_package.duration_days`, `wp_status_event.actual_start/finish`, `wp_schedule.state` ∈ `complete|in_progress|remaining`, `not_schedulable_reason`, and `holiday_calendar_version.non_working_days/range_start/range_end`.
- `_bmad-output/implementation-artifacts/deferred-work.md` l.1071–1080 -- the two 2.5 entries. Append a `closed:` line to each, and do not rewrite them.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/calendar.ts` + `calendar.test.ts` -- the bounded calendar value and its shift and roll-forward functions, with out-of-range failures.
- [x] `packages/domain/src/schedule/recalculate.ts` -- the input and output types, `recalculate`, the three states, remaining duration, bridging, out-of-sequence, summary roll-up and both halts. Cite AD-25/26, AR-7/49/56/58 and FR-5/6a/6b in the header.
- [x] `packages/domain/src/schedule/recalculate.test.ts` -- every matrix row, the pinned conventions with hand-computed dates, a slip propagating down a chain, shuffle invariance (N ≥ 50) over a plan that exercises every state, and a 2,500-leaf plan timed well under 300 ms.
- [x] `packages/domain/src/index.ts` -- the export.
- [x] `deferred-work.md` -- close the two 2.5 entries, and add any entry the decisions create.

**Acceptance Criteria:**
- Given a legal plan, when a predecessor's duration grows by N working days, then every transitive remaining successor moves by N working days, and complete WPs do not move.
- Given the repository, when `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test` run, then all pass.

## Implementation Notes

- **Types.** `ScheduleWp` extends `PlanGraphWp` with `durationDays`, `plannedMh`, `actualStart`, `actualFinish` and `recordedPct`. `ScheduleEdge` adds `lagDays`. The result is `{ kind: 'scheduled', outputs }` or a `halted` value with reason `graph_invalid` (carrying `offences`) or `calendar_range` (carrying `anchors: [{ anchor, side }]` and `wps: [{ wpId, side }]`). WPs downstream of one that left the range are not evaluated, so they are not named.
- **Calendar.** `CalendarVersion` is indexed once by `workingDayIndex`: the working days in order, plus a floor position for every date in range. The pass works on integer positions within that index, and only the calendar decides which days are working. An actual finish on a non-working day drives from its floor. An in-progress resume uses the ceiling of the actual start.
- **Milestones.** A milestone's remaining duration stays 0. The "minimum of 1" applies to work, and clamping a milestone would give it a day and move its drive, against Q3. A complete milestone drives from the ceiling of its actual finish.
- **Actuals.** A complete WP keeps its actuals even when its duration is null, so it is not listed as not schedulable. An actual finish with no actual start, or one before its start, throws as a caller defect. The import flags such rows before a plan is built.
- **Out-of-sequence across a bridge.** A pair reached across a no-duration WP names the dated predecessor, so the reported pair may not be a direct edge.
- **Scope of the outputs.** Foreign WPs (outside `projectId`) are left out of the outputs. The Project start is compared only when it is later than the Data Date.
- **`deferred-work.md`.** The two old entries were closed with the ledger's own `resolved:` field, not `closed:`. A line without `resolved:` counts as open. Two new entries were added: one for 2.9 (the cause and recording both halts), one for 2.12 (listing weekends in the non-working days).

## Spec Change Log

## Review Triage Log

Review pass 1 (2026-09-24), by the Blind Hunter (BH), the Edge Case Hunter (EC) and the Verification Gap reviewer (VG).

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | BH, EC, VG | An in-progress WP whose actual start is before `rangeStart` halts the run, and so does the out-of-sequence floor of such a start | medium | `ceilPosition(actualStart)` fails `before`, although the resume point max(actualStart, Data Date) is the in-range Data Date. With 2.12's 2026–2028 calendar, a task started in 2025 would block every run. The matrix halts only when a shift lands out of range | patch |
| 2 | EC, VG | An in-progress WP with no duration outputs `earlyStart: null` despite its actual start | low | The `durationDays === null` branch drops `wp.actualStart`, contradicting "an actual date always wins". The fix is a single field | patch |
| 3 | EC | A foreign WP with no edges is scheduled and can halt, naming a WP that is never reported | low | `forwardPass` skips only summaries, while `assemble` skips `!isOwn`. Adding the matching skip is a direct correction | patch |
| 4 | BH, EC | The exported `remainingDuration` does not validate its arguments | low | `remainingDuration(5, 2/1)` returns 1, and `(-3, null)` returns -3, because only `assertInputs` validates. Reusing that check is a direct correction | patch |
| 5 | BH | `pass.leftRange.sort` sorts in place | low | This breaks the immutability rule, and it is the only non-readonly field on `Pass`. Sorting a copy is a direct correction | patch |
| 6 | BH | `resolveAnchors` has a redundant `!dataDate.ok` | false | It is redundant at runtime, but it is what narrows `dataDate` for the `.value` read that follows, and `tsc` fails without it. It stays, with a comment | reject |
| 7 | BH | The traceability header omits AD-27, AD-28 and AR-46 | low | Each is cited in the header or the code. A direct correction | patch |
| 8 | EC | `floorPosition` and `ceilPosition` return `ok` with an `undefined` value for a malformed in-range string | low | `'2026-10-1'` passes `outside()` by string comparison, and then `floorOf.get` misses. The exports are public. A direct correction | patch |
| 9 | VG, BH | No test covers: a complete milestone's successors; actuals on a Saturday (finish, resume, out-of-sequence); a Data Date with no working day after it; duplicate edges with different lags; an in-progress milestone; a complete WP with a null duration | medium | Pre-verified (VG): every actual date in the fixtures is a working day, and no fixture has a complete zero-duration WP. Swapping floor for ceiling, or dropping the milestone ternary, leaves the suite green | patch |
| 10 | BH, EC | Position arithmetic (`drive + lag`, `start + days − 1`) sits in `recalculate`, not in `domain/calendar`, and `shiftWorkingDays`/`rollForward` are unused | low | Only the calendar decides which days are working. Positions are plain indices into it, so no working-day rule is duplicated. Routing the arithmetic through the calendar is a refactor, more than a direct correction | reject |
| 11 | BH | Nothing checks that actual dates are on or before the Data Date | low | The app layer owns that rule (the Data Date is never before the latest actual finish, and a later actual offers to advance the Data Date, per the PRD). A domain guard would add a branch for a state the fence prevents | reject |
| 12 | BH | The single-sample 300 ms timing test may flake | low | It measured about 24 ms, a 12× margin. Sampling a percentile would be a harness change, more than a direct correction | reject |
| 13 | BH, EC | `remainingDuration(0, …)` returns 0, against "minimum of 1" | false | The minimum applies to work. Clamping a milestone to 1 would give it a day of work and change its drive, against Q3 (start = finish, a successor at +L). The choice is recorded in Implementation Notes | reject |
| 14 | BH | The spec's status disagrees with sprint-status, and the Code Map says `closed:` where the file uses `resolved:` | false | The workflow syncs sprint-status at step 5. `resolved:` is the ledger's own field, and a `closed:` line would have left the entries counted as open | reject |
| 15 | BH | The calendar fixture builder is duplicated across two test files | low | Merging them is a refactor into `tests/support`, and no defect follows from the duplication | reject |
| 16 | EC | A summary that carries ignored inputs (an actual finish without a start) throws | low | The DB CHECK keeps scheduling inputs off summaries, and actuals are leaf-only per the PRD. Skipping summaries in `assertInputs` would need leafness computed first, more than a direct correction | reject |
| 17 | EC | A very wide calendar range allocates a large index | low | Only 2.12 builds versions, over three years. A guard would protect a state never shown to be reachable | reject |
| 18 | EC | The AC "moves by N" holds only on single-driver chains | false | The fix would edit this spec's AC. The test pins the single-driver chain the AC describes | reject |
| 19 | BH | A Data Date before the range halts even when a later Project start is in range | false | The Data Date is where in-progress work resumes, so it must be in range whatever the Project start is. The halt is correct | reject |

## Design Notes

**Outputs are keyed by `wpId`.** `inputs` refer to WPs by id and may come in any order. Outputs list the WPs in `compareWp` order, and out-of-sequence pairs in (predecessor, successor) `compareWp` order. The stored, index-referenced encoding from AD-26 belongs to 2.9, which decodes it before calling. The Project start is a non-null input, because the "no project start yet" gate belongs to the app layer (S:522).

**The calendar set is exhaustive.** `nonWorkingDays` lists every non-working day in the range, weekends included, and the domain applies no weekend rule of its own. The version alone then decides, and it stays re-derivable.

## Verification

**Commands:**
- `pnpm exec vitest run packages/domain` -- expected: all pass
- `pnpm lint && pnpm typecheck && pnpm depcruise && pnpm test` -- expected: exit 0

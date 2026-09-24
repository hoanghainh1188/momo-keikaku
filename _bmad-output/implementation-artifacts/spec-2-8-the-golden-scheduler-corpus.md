---
title: 'Story 2.8 — the golden scheduler corpus'
type: 'feature'
created: '2026-09-24'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '55d85c2e93d7ed2e41a9c8768e98ebdabfd50b3b'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The five other scheduler CI gates only prove self-consistency. Nothing yet proves `recalculate` produces the *correct* dates — a wrong engine can stay green (AR-35, AD-27).

**Approach:** Add a golden scheduler corpus of **hand-computed** expected `ScheduleOutputs` (never captured from the implementation). Each case runs through `recalculate` and compares via the AD-4 codec's canonical form. Register `engine_version` like `formulaVersion`: every registered version stays executable, and CI re-derives each golden under its own recorded version (AR-51). This story is correctness only; fence / trigger / reachability / shuffle / re-derivation stay separate.

**Decisions (founder, 2026-09-24):**
- **Q1 → A.** Register `schedule-2026-09-24` (or equivalent) now with a real multi-version registry API and a CI loop that re-derives every golden under its recorded version — even while the map has one entry.
- **Q2 → B.** Keep corpus cases off the unratified 2.5 implementer edges (actual finish on a non-working day; complete+null duration; actual finish without start; milestone remaining = 0). Defer locking them until the founder ratifies.
- **Q3 → A.** Two synthetic `CalendarVersion`s labelled JP and VN that list weekends explicitly and differ by at least one mid-week holiday. No national dataset; no wait on 2.12.
- **Q4 → A.** TypeScript modules with hand-written expected objects (demo-golden style) plus a short prose note of the hand computation.
- **Q5 → A.** The implementer hand-computes into the corpus in this PR; review / founder checks the arithmetic.
- **Keep the full spec** (~2,000 tokens), with no split.

## Boundaries & Constraints

**Always:**
- Expectations are hand-computed and recorded in TypeScript. Updating them is a deliberate act when the product conventions change — never to silence a failing suite.
- Compare `outputs` through `stringify(encode(...))` (AD-4 / AR-8). Never diff raw `jsonb` text.
- Minimum coverage (AR-35): JP+VN weekend slip; mid-flight complete / in-progress / remaining vs Data Date; negative Float vs PM-set finish; out-of-sequence actual start; `must_finish_on` missed by six weeks that does **not** displace the critical path; zero-duration milestone; leaf with no duration. Also pin deferred 2.6 Q6 (no late finish past the anchor under strongly negative lag) and Q7 (computed finish ignores all-complete plans).
- Hand-compute against the product conventions now pinned: 2.5 dates (ratified only), 2.6 backward (incl. Q6/Q7), 2.7 soft constraints (Q1–Q7). Do not depend on the unratified 2.5 implementer edges.
- `engine_version` is a registry key with a multi-version API from day one. A change to the passes, the roll-up, the ordering or the cause derivation registers a new version; old versions stay executable; CI re-derives each golden under its own key.

**Never:**
- No capture-from-implementation to invent expectations. No migration (column already exists). No fence / UI / app layer. No folding this gate into another story's AC. Do not re-matrix the unit suites — those stay the behavioural pin; the corpus is the correctness gate. No corpus case that turns on an unratified 2.5 edge (Q2 → B).

## I/O & Edge-Case Matrix

Each row is one golden case (or a named pair). Exact dates live in the TypeScript corpus modules; this matrix pins *what* must be asserted.

| Case | Input sketch | Must assert |
|---|---|---|
| JP weekend slip ⟨Q3⟩ | Chain across a JP Saturday/Sunday (and the JP mid-week holiday the fixture lists) | Successor early dates move by the working-day slip; codec match |
| VN weekend slip ⟨Q3⟩ | Same topology on the VN calendar (differs on ≥1 non-working day) | Dates differ from the JP case where the calendars differ; codec match |
| Mid-flight | Complete + in-progress + remaining leaves vs a Data Date | States, early/late/Float, drivers as hand-computed |
| Negative Float | PM-set Project finish before the computed finish | Float negative on the deciding chain; critical path = min-Float set |
| Out-of-sequence | Actual start before a predecessor's drive | Actuals kept; `outOfSequence` names the pair; successors driven from actuals |
| MFO −6 weeks | Off-path leaf with `must_finish_on` six weeks early; ASAP chain decides the finish | Violation on that leaf; Float and `criticalPath` identical to asap twin |
| Milestone | Zero-duration remaining leaf with `must_finish_on` | Participates in both passes; miss → violation on the milestone |
| No duration | Leaf with `durationDays: null` | In `notSchedulable`; successors bridged; no dates on that leaf |
| Anchor cap ⟨2.6 Q6⟩ | Strongly negative lag that would push late finish past the anchor | No late finish after the anchor; min Float 0 without a Project finish |
| All-complete ⟨2.6 Q7⟩ | Every leaf complete; optional Project finish | `computedFinish` null; critical path empty unless a Project finish anchors |

</frozen-after-approval>

## Code Map

- `packages/domain/src/schedule/recalculate.ts` — the pure entry under test. Do not change pass behaviour in this story except if a corpus case exposes a real bug (then fix is in scope as a patch, with a new `engine_version` if the fix changes dates).
- `packages/domain/src/schedule/constraints.ts` / `backward.ts` / `plan.ts` — read-only for corpus construction.
- `packages/domain/src/present/codec.ts` — `encode` / `stringify` for canonical compare (see `tests/support/shuffle-invariant.ts`).
- `packages/domain/src/evm.ts` — `FORMULA_VERSION` is the naming precedent; this story adds a **registry map**, not a lone constant (Q1 → A).
- `packages/db/drizzle/0000_scheduling_schema.sql` / `schema.ts` — `schedule_run.engine_version` column already exists; no migration. Domain registry is what this story adds; 2.9 writes the column.
- `tests/support/schedule-fixtures.ts` — reuse `calendar` / `wp` / `edge` / `inputs`; add JP/VN synthetic calendar helpers if useful.
- `packages/db/src/demo-golden.test.ts` — style reference for hand-pinned TypeScript expectations.
- New `packages/domain/src/schedule/corpus/` (or sibling) — registry, case modules (inputs + hand-computed expected outputs + short computation note), and the vitest runner that codec-compares and re-derives under each case's `engine_version`.
- Existing `recalculate*.test.ts` — leave as the behavioural / NFR pin; do not duplicate their matrices into the corpus.
- `_bmad-output/implementation-artifacts/deferred-work.md` — mark the 2.6 Q6/Q7 corpus pin satisfied when done; append the Q2 → B deferral of the unratified 2.5 edges.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/schedule/engine-version.ts` (or under `corpus/`) — multi-version registry; current key `schedule-2026-09-24`; CI can invoke every registered version.
- [x] `packages/domain/src/schedule/corpus/*.ts` — hand-computed cases for every matrix row; synthetic JP/VN calendars; short prose notes of the arithmetic.
- [x] Corpus vitest runner — for each case: `recalculate` → `stringify(encode(outputs))` equals expected; re-derive under the case's recorded `engine_version`.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` — close/annotate the 2.6 Q6/Q7 corpus entry; append Q2 → B (unratified 2.5 edges stay out of the corpus).

**Acceptance Criteria:**
- Given the corpus, when CI runs, then every case's `outputs` match the hand-computed expectation through the AD-4 codec, and each case re-derives under its own `engine_version`.
- Given a `must_finish_on` missed by six weeks on an off-path leaf, when the corpus case runs, then that leaf is violated and the critical path / Float match the asap twin.
- Given the minimum coverage list (AR-35) plus 2.6 Q6 and Q7, when the corpus is inventoried, then each item has a named case.
- Given the repository, when `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test` run, then all pass.

## Implementation Notes

- Registry: `packages/domain/src/schedule/engine-version.ts` — `ENGINE_VERSION = schedule-2026-09-24`, `registeredEngineVersions`, `engineAt`, `recalculateAt`. Exported from `@momo/domain`.
- Corpus: ten cases under `packages/domain/src/schedule/corpus/` covering every I/O-matrix row; builders and JP/VN calendars (`CAL_JP` / `CAL_VN`, Wed 7 Oct vs Tue 13 Oct) in `corpus/fixtures.ts` (also mirrored on `tests/support/schedule-fixtures.ts`).
- Runner: `corpus/corpus.test.ts` codec-compares via `stringify(encode(…))` and re-derives under each case's `engine_version`; also pins MFO−6w Float/path vs asap twin and JP≠VN dates.
- deferred-work: 2.6 Q6/Q7 corpus entry resolved; Q2 → B (unratified 2.5 edges) appended.

## Spec Change Log

## Review Triage Log

## Design Notes

**Correctness ≠ consistency.** Shuffle, fence and re-derivation can all pass while every date is wrong. The corpus is the only place that fails when the arithmetic is wrong.

**Worked sketch (MFO −6 weeks).** ASAP chain A→B→C decides the finish (Float 0). Leaf Z off the chain has `must_finish_on` six weeks before its derived finish. Z is violated and ranks first; C stays critical; every Float equals the asap twin. Exact dates are hand-computed in the TypeScript case module.

**Engine version.** Registry from day one (Q1 → A): a bug fix that changes dates registers a new key; historical goldens keep their key and still execute. The stored `schedule_run.engine_version` column is written later by 2.9; this story owns the domain registry and the CI re-derive loop.

**Out of corpus until ratified (Q2 → B).** Actual finish on a non-working day; complete WP with null duration; actual finish with no actual start; milestone remaining-duration edge cases from the 2.5 Implementation Notes.

## Verification

**Commands:**
- `pnpm exec vitest run packages/domain/src/schedule/corpus` -- expected: all pass
- `pnpm lint && pnpm typecheck && pnpm depcruise && pnpm test` -- expected: exit 0

---
title: 'Story 4.2 — The re-derivation test'
type: 'feature'
created: '2026-10-03'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '4a48880905b01098527c7d8ec5d7b1b468d39c33'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-set-a-baseline-that-points-at-the-run-behind-it.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A Baseline pins a `schedule_run` by FK, but nothing proves that pin still re-derives — NFR-C1 is a sentence until CI blocks merge when dates, Float, constraint violations, or the ordered critical path drift from `recalculate(run.inputs, prevRun.inputs)`.

**Approach:** Add a pure re-derivation gate over a Baseline's pinned run (codec-canonical compare under that run's own `engine_version`) and a DB fence that sets a Baseline then proves the gate reads only the pin — never the Current Plan — so AR-35's re-derivation gate is executable.

**Decisions (founder frozen, 2026-10-03 — Harry):**
- Compare through AD-4 codec canonical **decoded** form, not stored jsonb / column text.
- Read the pinned `schedule_run` — never the Current Plan.
- Re-derive under that run's own recorded `engine_version` (historical runs stay green after scheduler fixes).
- Critical path compared as an **ordered** set (`compareWp` / AR-55).
- Gate must block merge in CI (AR-35 / NFR-C1).
- Exact equality: `recalculate(run.inputs, prevRun.inputs) ≡ run.outputs` for dates, Float, constraint violations, and critical path.
- Build on 4.1 only; do **not** start 4.3–4.5.

## Boundaries & Constraints

**Always:**
- Subject = a Baseline version's pinned run (`baseline_version.schedule_run_seq` → `schedule_run`); load that row (and its `prev_run_seq` row for `prevRun.inputs`, or null).
- Decode via AD-26 (`parseStoredInputs` / `parseStoredOutputs` → `decodeScheduleInputs` / `decodeScheduleOutputs`), then `recalculateAt(run.engineVersion, inputs, prevInputs)`; compare `stringify(encode(…))` of decoded outputs (with `stripRemainingDays` on the re-derived side) — never raw jsonb text or column dumps.
- Critical path equality is ordered-array equality inside that codec form (AR-55).
- Dispatch by the **stored** `engine_version` key, not today's `ENGINE_VERSION` constant (AR-51).
- CI runs the gate (`pnpm test` / vitest already in `.github/workflows/ci.yml`); a failing re-derive fails the job (AR-35).
- Fence proves "never Current Plan": after pin, mutate the live plan / append a newer run; re-derive of the pin still matches the pin's stored outputs.

**Never:**
- No Re-baseline, history compare-as-plans, CR link, or Baseline Plan columns (4.3–4.5).
- No schema migration; no copying run inputs onto Baseline; no re-implement of `setBaseline` / refuse / retention (4.1 owns those).
- No compare of stored jsonb bytes / column text; no reading live `work_package` / `wp_schedule` / Current Plan for the gate inputs.
- Do not mark `epic-4` done.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy pin | Baseline pins successful run R with outputs; optional prev via `R.prev_run_seq` | `recalculateAt(R.engineVersion, decode(R.inputs), decode(prev?.inputs))` scheduled outputs ≡ decode(R.outputs) via codec | Fail test on mismatch |
| Never Current Plan | After pin, Current Plan changes (new successful run) | Gate still loads R by pin FK; compare still green against R.outputs | Fail if gate reads latest/live plan |
| Ordered critical path | Pin whose outputs have multi-WP critical path | Codec compare fails if path order shuffled even when set membership matches | Fail on order drift |
| Own engine_version | Stored `engine_version` = registered key | Gate calls `recalculateAt(storedKey, …)` not hardcoded current constant | Fail / RangeError if wrong key |
| Unknown engine_version | Fixture stamps unregistered key | `recalculateAt` throws `RangeError` naming the key (same as corpus) | Expected throw |
| No prev run | First successful run (`prev_run_seq` null) | `prevInputs = null`; still exact match | N/A |
| Halted / missing outputs | Pin target halted or outputs null | Gate refuses / test setup never pins these (4.1); assert helper rejects incomplete pin | Explicit fail naming pin |

</frozen-after-approval>

## Code Map

- `packages/domain/src/schedule/engine-version.ts` — **reuse** `recalculateAt` / `ENGINE_VERSION` / registry; do not replace corpus registration.
- `packages/domain/src/schedule/stored-run.ts` — **reuse** `parseStoredInputs`, `parseStoredOutputs`, `decodeScheduleInputs`, `decodeScheduleOutputs`, `stripRemainingDays`, `encode`/`stringify` via present codec.
- `packages/domain/src/present/codec.ts` — AD-4 `encode` / `stringify` (canonical sorted-key JSON).
- `packages/domain/src/schedule/recalculate.ts` — `ScheduleOutputs.criticalPath` is already ordered; no engine math change.
- `packages/domain/src/schedule/corpus/corpus.test.ts` — **pattern only** (codec compare + `recalculateAt`); corpus keeps `prevInputs=null`. 4.2 must use stored `prevRun.inputs`.
- `packages/domain/src/schedule/` — **new** pure helper (e.g. `re-derive.ts`): accept stored inputs/outputs/engineVersion + optional prev stored inputs → decode → `recalculateAt` → codec-equal (or structured result). Export from domain barrel. Unit-test matrix rows that need no DB.
- `packages/db/src/repositories/schedule/index.ts` — add `runBySeq(projectId, seq)` returning row with `inputs`, `outputs`, `engineVersion`, **`prevRunSeq`** (extend select; today `LatestRunRow` omits `prevRunSeq`). Optionally `runBySeq` + load prev by that FK — do not use `latestRun` / live plan for the gate.
- `packages/db/src/repositories/baseline/index.ts` — add reader for active/latest Baseline's `scheduleRunSeq` (or reuse `pinnedScheduleRunSeqs` / `latestVersionSeq` + select pin). Gate path: Baseline pin seq → `runBySeq` → optional prev seq → domain helper. Only `packages/app/src/baseline` (or a tiny fence-facing loader next to it) may import baseline/schedule repos — mirror 4.1 depcruise fence; if a new app module is added, register it.
- `packages/app/src/baseline/` — optional thin `reDerivePinnedBaseline` (or keep load in fence + call domain helper). Must not call `resolveScheduleInputs` / Current Plan builders.
- `tests/schedule/fence-4-1-set-baseline.test.ts` — **reuse harness** (`prepareSchedulableLeaf`, `setBaseline`, probe tenant); do not widen 4.1 ownership — new file `tests/schedule/fence-4-2-re-derivation.test.ts` (or similar).
- `tests/schedule/fence-harness.ts` — reuse; extend only if a second successful run / prev pin is needed for matrix.
- `.github/workflows/ci.yml` + root `pnpm test` — already runs vitest with `REQUIRE_DB=1`; ensure new tests are included by existing globs (no workflow rewrite unless a file is excluded).
- Continuity from 4.1: pin by FK, refuse incomplete, retention already proven — 4.2 only asserts re-derive of that pin.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain` — pure re-derive helper + unit tests (codec compare, ordered critical path, own `engine_version`, unknown key, null prev).
- [x] `packages/db` schedule (+ baseline) — `runBySeq` with `prevRunSeq`; Baseline pin → run load path for the fence.
- [x] `packages/app` (if needed) — thin pin loader that never touches Current Plan; keep depcruise / role fences green (no new write use-case).
- [x] `tests/schedule/fence-4-2-*.test.ts` — setBaseline → re-derive pin; mutate Current Plan after pin and assert pin still green; cover no-prev and with-prev when harness allows.
- [x] `sprint-status.yaml` — move `4-2-the-re-derivation-test` through `ready-for-dev` / `in-progress` / `review`; leave `4-1-…` as-is unless already reconciled; do not mark `epic-4` done.

**Acceptance Criteria:**
- Given a Baseline version's pinned run, when the gate runs, then it evaluates `recalculate(run.inputs, prevRun.inputs)` under `run.engineVersion` and matches `run.outputs` for dates, Float, constraint violations, and critical path exactly via AD-4 codec form (FR-15, AR-51, AR-8).
- Given the gate, when it reads inputs, then it reads the pinned run (and its `prev_run_seq` inputs) and never the Current Plan (AR-22, FR-15).
- Given the critical path, when compared, then order matters — membership-only equality is insufficient (AR-55).
- Given a golden / pinned run recorded under an earlier registered `engine_version`, when the gate runs after a scheduler change registers a new current key, then that pin still re-derives under its own recorded version (AR-51).
- Given CI, when the gate fails, then merge is blocked (`pnpm test` non-zero) (AR-35, NFR-C1).
- Given `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test`, when they run, then all exit 0.

## Implementation Notes

- **Domain helper:** `packages/domain/src/schedule/re-derive.ts` — `reDeriveStoredRun` parses stored jsonb → decode → `recalculateAt(engineVersion, …)` → align via `encodeScheduleOutputs`/`decodeScheduleOutputs` → `stringify(encode(…))` compare with `stripRemainingDays` on the re-derived side. Rejects null outputs / halted pins; unknown `engine_version` throws `RangeError`.
- **DB:** `schedule.runBySeq` returns `prevRunSeq`; `LatestRunRow` select extended. Baseline `latestPinnedScheduleRunSeq` feeds the gate path (pin → runBySeq → optional prev).
- **App:** `reDerivePinnedBaseline` in `packages/app/src/baseline/re-derive-pinned.ts` — read-only, never `resolveScheduleInputs` / `latestRun` for gate inputs. Exported from the app barrel; no new write / audit action.
- **Fence:** `tests/schedule/fence-4-2-re-derivation.test.ts` — null-prev first pin; with-prev (two schedules then Set); Current Plan mutation after pin still green against the pin FK.
- **Review patches (iteration 0):** domain units now negatively assert Float/date/violation drift and `engine_halted`; AR-51 spies `recalculateAt` with a non-current stored key; `reDerivePinnedBaseline` maps every gate failure (`incomplete_pin` / `mismatch` / `engine_halted`) to outer `fail('invalid_input', …)`.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---------|---------|------------------|
| Spec `in-review` vs sprint `review` disagree | false | BMAD frontmatter uses `in-review`; sprint-status legend uses `review`. Both trackers are consistent with their own schemas — not a product defect. |
| Spec Change Log / Triage Log empty at review entry | false | Empty until this first review pass fills the triage table — expected workflow state, not a defect. |
| AR-51 “earlier engine_version after new current key” not covered (only one registry key; own-version test equals `ENGINE_VERSION`) | medium | Real verification gap: code passes `pin.engineVersion` into `recalculateAt`, but no test proves dispatch under a non-current registered key. Route: **patch** — spy/`vi.mock` that `recalculateAt` is called with the pin’s stored key (or register a second alias key in the test harness if available). |
| `reDerivePinnedBaseline` returns outer `ok` when `gate` is `mismatch` / `engine_halted` | medium | Confirmed at `re-derive-pinned.ts:82-94` — only `incomplete_pin` becomes `Result` fail. Fence checks nested `gate.ok`, but any caller that only reads top-level `Result.ok` misses NFR-C1 failures. Route: **patch** — map `mismatch` and `engine_halted` to `fail('invalid_input', …)` (or equivalent). |
| Fence has no red path for stored-output mismatch | low | Domain unit already fails on critical-path shuffle; fence’s job is pin→FK green + never-Current-Plan. Reject — unlikely everyday miss; red-path coverage belongs in domain (see codec dimensions patch). |
| `engine_halted` branch untested | medium | Confirmed: `re-derive.ts:75-81` has no test asserting `reason === 'engine_halted'`. Route: **patch** — domain unit with complete-looking pin whose inputs halt `recalculateAt`. |
| Codec mismatch tests only shuffle critical path; dates/Float/violations never negatively asserted | medium | Pre-verified (verification-gap): narrowing compare to criticalPath alone would leave current suite green. Code compares full codec form today. Route: **patch** — mutate `floatDays`/`earlyStart`/`violations` with path unchanged; expect `mismatch`. |
| App refuse paths (missing pin row / missing prev / halted pin) not in fence | low | 4.1 refuses incomplete pins; missing FK rows are integrity edge cases. Domain covers incomplete_pin. Reject — not everyday. |
| `latestPinnedScheduleRunSeq` duplicates `latestVersionSeq` query shape | low | DRY smell only; both order by max seq. Reject — no everyday harm. |
| depcruise comment still mentions only setBaseline’s latest-successful read | low | Comment drift; fence rules still allow `app/baseline` → schedule repos. Reject — documentation only. |
| empty-string `haltedReason` skips incomplete_pin (`re-derive.ts:54`) | false | Writers store `null` or a non-empty halt reason; `!== ''` treats empty as “not halted”, matching the successful-run shape. No writer emits `''`. |
| absent project returns `no_baseline` not `not_found` | false | `authorize(PROJECT_REACH)` fails first without project reach; `latestPinnedScheduleRunSeq` returning null for empty Baseline history is correct for a Project with no Baseline. |
| Full codec compare for dates/Float/violations only success-tested (VG) | medium | Same root as codec-dimensions row above — carried into that **patch** group. |
| `engine_halted` failure path has no executing test (VG) | medium | Same root as engine_halted row above — carried into that **patch** group. |

## Design Notes

**Corpus proves the engine; this story proves the pin.** Story 2.8 already codec-compares hand goldens with `prevInputs=null`. 4.2 closes the product seam: Baseline → FK → stored run (+ prev) → same dispatch, so a drifted pin fails CI even when the corpus stays green.

**Prev is the recorded FK, not "latest before".** Use `schedule_run.prev_run_seq` so re-derive matches what `recalculateProject` wrote at that seq, including cause overlay inputs.

## Verification

**Commands:**
- `pnpm lint` — expected: exit 0
- `pnpm typecheck` — expected: exit 0
- `pnpm depcruise` — expected: exit 0
- `pnpm test` — expected: exit 0 (domain unit + DB fence when `REQUIRE_DB` / local Postgres available)

**Manual checks (if no CLI):**
- None required beyond CI — this story is a gate, not a UI surface.

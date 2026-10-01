---
title: 'Epic 2 retro F6 — extract the shared fence test harness'
type: 'refactor'
created: '2026-09-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '46224b76da1872a932e4643498f0e3cd468b73c8'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-retro-2026-09-27.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every `tests/schedule/fence*.test.ts` (9 files) copies the same `reachableAs` / `REQUIRE_DB` gate / seed-suite lock / `afterAll` teardown block; `prepareSchedulable` is duplicated at least between 2-13 and 2-15. Epic 3 will add more fence suites on top of this drift (Epic 2 retro F6).

**Approach:** Extract a shared fence harness module used by all nine suites for connect + teardown + default PM `ctx` + the common “schedulable leaf” prepare. Keep probe slug/seq bands and suite-specific prepares local. Close sprint action item `epic-2-retro-item-17-extract-the-shared-fence-test-harness-re`.

## Boundaries & Constraints

**Always:**
- New module under `tests/` (suggested `tests/schedule/fence-harness.ts` or `tests/support/fence-harness.ts`) — not cruised; test-only.
- Shared surface covers: dual-role reachability + `REQUIRE_DB` fail, `acquireSeedSuiteLock('shared')` when reachable, `afterAll` remove-probe + release lock + `closeAllPools`, default PM request context builder, and the common prepare that creates the probe tenant, sets project dates `2026-09-01` / `2026-10-05`, and leaf `durationDays: 3` ASAP.
- Each suite keeps its own `PROBE` (`buildProbeTenant` slug + seq band) and any specialized prepare (`prepareBareProject`, `prepareTwoLeaves`, NFR-P1 seed, etc.).
- Behavior of existing fence tests unchanged — green when DB reachable; skip when not (unless `REQUIRE_DB=1`).

**Never:**
- Do not force fence suites onto `tests/write-harness.ts` (different composition root / write deps).
- No production (`packages/*` / `apps/*`) changes. No fence business-logic changes in `applyPlanChange`.
- Do not merge F23 / F2–F5 / Story 3.1 into this PR. Do not renumber probe seq bands.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| DB reachable | Both URLs up | Suites run; lock acquired; afterAll cleans probe | N/A |
| DB unreachable | URLs missing/down, `REQUIRE_DB` unset | Suites `skipIf`; no lock; afterAll still safe | N/A |
| REQUIRE_DB fail | Unreachable + `REQUIRE_DB=1` | Harness throws at load (same message shape as today) | Fail suite |
| Shared prepare | Owner db + probe with a leaf | Probe created; dates + duration 3 ASAP on leaf | Throw if no leaf |
| Specialized prepare stays local | 2-11 bare / 2-14 two leaves / nfr-p1 500 WP | Still local helpers; may call shared connect only | N/A |

</frozen-after-approval>

## Code Map

- `tests/schedule/fence.test.ts`, `fence-2-10` … `fence-2-15`, `fence-f21-milestone-duration.test.ts`, `fence-nfr-p1.test.ts` — nine consumers; delete local `reachableAs` / lock / `afterAll` copies; adopt harness.
- `tests/write-harness.ts` — pattern reference for `reachableAs` + `connectWriteHarness` + seed lock; **do not import from fence suites**.
- `packages/db/src/probe-tenants.ts` — `build/create/removeProbeTenant`, `assertProbeTenantsDisjoint` (unchanged).
- `packages/db/src/seed-suite-lock.ts` — `acquireSeedSuiteLock` / `releaseSeedSuiteLock`.
- `packages/db/src/client.ts` — `getPool` / `getDb` / `closeAllPools`.
- `tests/support/schedule-fixtures.ts` — domain fixtures only; not a substitute for DB fence setup.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `epic-2-retro-item-17-…` → `done` when verified.
- `_bmad-output/implementation-artifacts/epic-2-retro-2026-09-27.md` — F6 finding context (read-only; optional note in Implementation Notes).

## Tasks & Acceptance

**Execution:**
- [x] Add shared fence harness module (connect + REQUIRE_DB + afterAll teardown + `pmCtx` + `prepareSchedulableLeaf`).
- [x] Migrate all nine `tests/schedule/fence*.test.ts` to the harness for the common preamble; keep specialized prepares local.
- [x] Replace identical `prepareSchedulable` bodies (at least 2-13 / 2-15, and any other exact matches) with the shared helper.
- [x] Run a representative fence suite (DB reachable) + confirm skip path still loads without DB.
- [x] Mark `epic-2-retro-item-17-…` `done` in `sprint-status.yaml`; refresh `last_updated`.

**Acceptance Criteria:**
- Given the nine fence suites, when opened, then none redefine a local `reachableAs` / seed-lock / `afterAll` close-pools block — they call the shared harness.
- Given DB reachable, when a migrated suite runs, then existing assertions still pass (no behavior change).
- Given DB unreachable and `REQUIRE_DB` unset, when Vitest loads a fence file, then DB describes skip and the process does not throw.
- Given `REQUIRE_DB=1` and unreachable DB, when a fence file loads, then it fails at the harness gate.
- Given sprint status, when F6 is verified, then action item 17 is `done`.

## Implementation Notes

Landed on branch `cursor/f6-fence-test-harness-75a8`:
- New `tests/schedule/fence-harness.ts` — `connectFenceHarness`, `installFenceAfterAll`, `pmCtx`, `prepareSchedulableLeaf`.
- All nine `tests/schedule/fence*.test.ts` use the harness; specialized prepares stay local (`prepareBareProject`, `prepareTwoLeaves`, NFR-P1 500-WP seed, inline fence.test prepares).
- Identical leaf prepares replaced in 2-10 / 2-12 / 2-13 / 2-15 / f21 (and 2-11’s former two-step `prepareSchedulable`).
- Sprint action `epic-2-retro-item-17-…` → `done`; `last_updated` refreshed.
- Spec status remains `in-progress` for parent advancement.

**Verification:**
- Skip without DB: OK. `REQUIRE_DB=1` unreachable → fails at `connectFenceHarness`.
- Live DB all nine suites: **75 passed**; 1 pre-existing AR-50 WAL budget flake in `fence.test.ts` (unrelated to harness).
- Review patch (`cde7c77`): lock moves into `installFenceAfterAll` after PROBE build — re-verified 2-13/2-14/2-15/f21 (27 passed) + typecheck clean.

## Spec Change Log

## Review Triage Log

Review pass 1 (2026-09-30), Blind Hunter (BH), Edge Case Hunter (EC), Verification Gap (VG).

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | BH | Spec `in-progress` vs sprint item-17 `done` disagree | false | Spec is `in-review`; AC allows marking item-17 done once harness verified. Process pairing is intentional | reject |
| 2 | BH | Empty Spec Change Log / Review Triage Log | false | Those sections fill on loopback / this review pass — not a product defect | reject |
| 3 | BH | Design Notes order vs lock-inside-connect | medium | Real: `connectFenceHarness` acquired the seed lock before PROBE/`installFenceAfterAll`, so a throw in `buildProbeTenant`/`assertProbeTenantsDisjoint` leaked the lock (pre-F6 acquired lock after probe). Same root as EC#1 / BH#7 | patch |
| 4 | BH | Only 3/9 suites verified on live DB | false | Parent re-ran all nine: 75 passed; sole failure is pre-existing AR-50 WAL budget flake in `fence.test.ts` (not harness behavior) | reject |
| 5 | BH | Verification Commands block stale vs Notes | false | Fix would edit this build’s spec — rejected per triage rules | reject |
| 6 | BH | Env URL/`REQUIRE_DB` still copied per suite | false | Intentional: same pattern as `write-harness` (suites hand env in); Never force write-harness merge | reject |
| 7 | BH | connect / afterAll unpaired → lock leak | medium | Same root as #3 / EC#1 — lock must move into `installFenceAfterAll` | patch |
| 8 | BH | `prepareBareProject` still duplicates leaf ASAP | false | Spec Always: specialized prepares stay local; bare dates are the specialization | reject |
| 9 | BH | `pmCtx` lacks explicit return type | low | Cosmetic; unlikely everyday harm; reject | reject |
| 10 | BH | Fixture date/duration literals not exported | low | Cosmetic drift risk only; reject | reject |
| 11 | BH | `removeProbeTenant(…).catch(() => {})` swallows errors | defer | Pre-existing pattern copied into harness; not introduced as new silence policy | defer |
| 12 | BH | Dual `reachableAs` vs `write-harness` without note | low | Spec forbids merging; one-line comment is optional cosmetics — reject | reject |
| 13 | BH | No harness-unit tests for REQUIRE_DB/skip/leaf | false | VG: CI runs fence suites with `REQUIRE_DB=1`; parent confirmed skip + REQUIRE_DB throw + live path | reject |
| 14 | EC | Lock held if probe build/assert throws after connect | medium | Confirmed regression vs old order — same patch as #3/#7 | patch |
| 15 | EC | `getPool().connect()` can hang without timeout | defer | Pre-existing identical pattern in `write-harness`; not introduced by extract | defer |
| 16 | EC | REQUIRE_DB throw may leave pools open | defer | Pre-existing; `reachableAs` releases the client; same as write suites | defer |
| 17 | VG | (none) | — | No verification gaps filed | — |

## Design Notes

Prefer exporting a small API such as:
- `connectFenceHarness({ ownerUrl, appUrl, requireDb })` → `{ reachable }`
- `installFenceAfterAll({ reachable, ownerUrl, probe })`
- `pmCtx(probe, { userId, projectIds?, roles?, locale? })`
- `prepareSchedulableLeaf(owner, probe)` — dates/`durationDays: 3` ASAP as in 2-13/2-15

Vitest isolates modules per file — module-level state in the harness is fine (same as `write-harness`). Keep each file’s top-level `await connect…` order: reachability → probe build → lock → `afterAll`.

## Verification

**Commands:**
- `pnpm exec vitest run tests/schedule/fence-2-13.test.ts tests/schedule/fence-2-15.test.ts` — expected: green when DB up; skip DB describes when down
- Spot-check `fence-nfr-p1.test.ts` and `fence-f21-milestone-duration.test.ts` still load
- `pnpm typecheck` — expected: clean

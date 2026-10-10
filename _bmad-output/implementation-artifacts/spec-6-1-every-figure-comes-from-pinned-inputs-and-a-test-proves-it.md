---
title: 'Story 6.1 — Every figure comes from pinned inputs, and a test proves it'
type: 'feature'
created: '2026-10-10'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'e7f12c9d01592f4a93cfc2d92f2be29d2c1d4037'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-momo-keikaku-2026-09-20/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Reported figures today assemble a live `ReviewInput` without a named `ComputationInputs` pin, without a shared watermark lock, without a per-Connector snapshot ledger filter, and without a mechanical closure gate — so a Published Snapshot (and even a long-lived Review) cannot reproduce later the way FR-35 / AD-10 require.

**Approach:** Land the AD-10 pin contract for Story 6.1 only: a fully resolved `ComputationInputs` type (evolving today's `ReviewInput`), capture under `lockWatermarkShared`, ledger selection by `snapshot_id ≤ pin` per Connector with `ledger_seq_max` as assertion only, a `formulaVersion` registry with a CI recompute gate for every registered version, and a closure test that exported inputs of `domain/{evm,health,forecast,attribution,schedule}` are reachable from the pin (schedule only via `schedule_run.inputs`).

**Decisions (Harry, 2026-10-10):**
- Token scope → **Keep full spec** (~1770 tokens; accept context-rot risk).
- Q1→**A**: golden Published Snapshot recompute uses a **file fixture corpus** of pinned `ComputationInputs` + expected outputs (json), keyed by `formulaVersion` — no `published_snapshot` migration in 6.1; Publish can later store the same shape.
- Q2→**A**: wire shared-lock capture into **`loadProjectBundle` / `loadReview`** so every Review read pins under AR-37.

## Boundaries & Constraints

**Always:** Pure domain compute stays DB-free; schedule compute reads only decoded `schedule_run.inputs`; capture takes Project-scoped shared advisory lock before reading watermarks; ledger filter is snapshot-id per Connector, never `ledger_seq_max`; every registered `formulaVersion` stays executable; closure CI fails naming the unreachable export/input; live Review load takes the shared lock (Q2-A); golden recompute runs over file fixtures for every registered version (Q1-A).

**Never:** Implement EVM/Health/Forecast formula changes (6.2–6.6), Review UI layout (6.7), cause list (6.8), dispositions / split-pin re-capture after writes (6.9), `published_snapshot` table/migration, NFR-P1 page-load harness, Epic 5 residual fences 33/35/37, edit `epics.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Capture under shared lock | `loadProjectBundle` / `loadReview` inside `withTenant` tx | Takes `lockWatermarkShared` on Project key before reading heads; returns fully resolved pin incl. watermarks, `asOf`, `formulaVersion` | Lock wait as today; no silent unlock |
| Ledger filter | Entries with `snapshot_id` above pinned snapshot for that Connector | Excluded from the pin's ledger; `ledger_seq_max` equals max seq of the filtered set (assertion) | Mismatch on recompute → assertion failure in tests |
| Empty / greenfield | Project with no Connector / no snapshot | Pin carries empty snapshot map / empty ledger; compute still runs (partial Review as today) | N/A |
| Schedule reachability | Exported schedule functions | Inputs only from `ScheduleInputs` / stored `schedule_run.inputs` shape — closure treats that as the pin path | Closure fails if schedule reads live WP columns |
| formulaVersion registry | Registered versions + fixture corpus | Each version has an executable compute entry; CI recomputes every golden fixture for every registered version | Unknown version → typed/runtime refuse |
| Closure fail | New exported compute input type not reachable from pin | Closure test fails naming the export | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain/src/review.ts:55–145` — today's `ReviewInput` (commented as ComputationInputs). Evolve into / alias as `ComputationInputs`; keep `computeReview` working; add missing pin fields (`trackerSnapshotIdByConnector`, `ledgerSeqMax`, `baselineVersionId`, rate/override/disposition/setting/tenant-setting/wp-status/calendar/connector-scope/visibility/`scheduleRunSeq`, resolved Visibility Policy, calendar id+version). Prefer type alias + incremental fields over a big-bang rename of every test fixture.
- `packages/domain/src/evm.ts:37,56–88` — `FORMULA_VERSION`, `EvmInput`. Registry should own the version string; `computeEvm` remains pure.
- `packages/domain/src/health.ts:18–28`, `forecast.ts:19–24`, `attribution.ts:83–114` — exported input shapes the closure must reach from `ComputationInputs` (resolved values or watermarks that produce them).
- `packages/domain/src/schedule/recalculate.ts:119–131`, `stored-run.ts`, `re-derive.ts` — schedule pin path is `schedule_run.inputs` only; closure must not require live WP columns.
- `packages/domain/src/schedule/published-snapshot-pin.ts` — existing Baseline pin stub; extend or sibling for formulaVersion goldens per Q1.
- `packages/domain/src/index.ts` — export new registry / ComputationInputs symbols carefully (avoid Client View / present barrel traps from 5.14).
- `packages/db/src/watermark-lock.ts:118–122` — `lockWatermarkShared` ready; no production caller yet.
- `packages/db/src/repo.ts:292–423,580–757` — `loadProjectBundle` / `loadReview`: today loads full ledger (no per-Connector snapshot filter), single `pinnedSnapshot`, no shared lock, no `ledgerSeqMax` / `scheduleRunSeq` on input. Wire shared-lock capture + filter here (Q2-A).
- `packages/app/src/ports/project-read.ts` — structural `ReviewInput` / `ProjectBundle`; follow domain type changes at composition root.
- `tests/watermark-concurrency.test.ts:419+` — shared-holder vs append pattern to extend for capture.
- `tests/schedule-closure.test.ts` — walk/depcruise pattern to reuse for ComputationInputs closure (new file e.g. `tests/computation-inputs-closure.test.ts`).
- `.github/workflows/ci.yml:74–75` — update “Still absent” once closure + formulaVersion gate land.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `6-1-every-figure-comes-from-pinned-inputs-and-a-test-proves-it` → in-progress; `epic-6` → in-progress when story starts.
- Epic 5 residuals 33/35/37 — out of scope unless a hard import/type dependency blocks compile (not expected).

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/computation-inputs.ts` (or evolve `review.ts`) — define `ComputationInputs` as the fully resolved pin (AD-10 field set); alias/bridge `ReviewInput`; document schedule exception.
- [x] `packages/domain/src/formula-version.ts` (+ tests) — registry of executable versions; current `evm-2026-09-20` registered; changing a formula requires a new key.
- [x] `packages/domain` ledger helper — filter entries by `snapshot_id ≤ pinned` per Connector; compute `ledger_seq_max` as assertion over that set only.
- [x] `packages/db` capture — take `lockWatermarkShared` inside `loadProjectBundle` before reading heads; apply ledger filter; return pin on `ReviewInput`/`ComputationInputs` (Q2-A).
- [x] Closure test — enumerate exported compute signatures in `domain/{evm,health,forecast,attribution,schedule}`; fail if an input type is unreachable from `ComputationInputs` (schedule via `schedule_run.inputs` only).
- [x] Golden recompute CI — file fixture corpus keyed by `formulaVersion` (Q1-A); update `ci.yml` absent-list comments.
- [x] Unit/integration tests for matrix rows (filter, greenfield, lock ordering, registry).
- [x] `sprint-status.yaml` — mark story/epic in-progress; leave Epic 5 residuals untouched.

**Acceptance Criteria:**
- Given `domain/evm|health|forecast|attribution|schedule`, when any of them reads a value, then it comes from an append-only source `ComputationInputs` pins — and for schedule that source is `schedule_run.inputs` only (AR-19).
- Given the closure rule, when CI runs, then a test enumerates exported domain function signatures and fails if any input type is not reachable from `ComputationInputs` (AR-19, AR-35).
- Given `ComputationInputs`, when captured, then it is a fully resolved value carrying the AD-10 watermarks, Visibility Policy, `schedule_run_seq`, Period, tz, calendar id/version, `asOf`, and `formulaVersion` (AR-19).
- Given ledger selection, when entries are chosen, then filter is `snapshot_id ≤ pin` per Connector and `ledger_seq_max` is assertion only (AR-21).
- Given capture, when it runs, then it holds `pg_advisory_xact_lock_shared` on the Project watermark key (AR-37).
- Given `formulaVersion`, when a formula changes, then a new version is registered, old stays executable, and CI recomputes file-fixture goldens for every registered version (Q1-A; AR-19, AR-35).

## Implementation Notes

- `ComputationInputs` is a type alias of `ReviewInput`; AD-10 pin watermarks added on `ReviewInput`.
- Ledger filter compares snapshot **seq** (not text id) per Connector; `assertLedgerSeqMax` guards the assertion wall.
- Live capture: `lockWatermarkShared` at start of `loadBundleInTenant`; source fence in `tests/computation-inputs-capture-fence.test.ts` (no DB). Wait behaviour covered by `tests/watermark-concurrency.test.ts` when Postgres is up.
- Golden corpus: `packages/domain/src/formula-corpus/evm-2026-09-20/no-unplanned.json` + `golden-recompute.test.ts`.
- Visibility / `tenantSettingSeqMax` pin fields are present as `null` until later stories land producers.
- Multi-Connector: pin map is per-Connector; Review ticket observations still come from the Project’s overall latest snapshot (demo / single-Connector path) — deferred widening.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Closure strategy:** Prefer TypeScript type-level + AST/export walk over brittle string lists. Schedule module is special-cased: reachability of `ScheduleInputs` / stored-inputs codec counts as pinned via `schedule_run_seq` → `schedule_run.inputs`, not via live plan tables.
- **Calendar pin:** Resolve the working-day set from `holiday_calendar_version` (AD-29). Carry calendar id + version on the pin; do not introduce a second live non-working-day source.
- **Split pin (re-capture after Review writes):** Documented in AD-10 / epic context; owned by Story 6.9 — out of 6.1. 6.1 lands the initial capture shape including `schedule_run_seq`.
- **Multi-Connector snapshots:** Pin shape is `trackerSnapshotId` (and resolved snapshot payload) **per Connector**, even if the demo Tenant still has one Connector.

## Verification

**Commands:**
- `pnpm lint` — exit 0
- `pnpm exec tsc -b` (or repo typecheck scripts) — exit 0
- `pnpm depcruise` — exit 0
- `pnpm test` — exit 0; new closure + formulaVersion + capture/filter tests green
- Confirm `.github/workflows/ci.yml` absent-list no longer claims ComputationInputs closure (and golden recompute if Q1 ≠ C) as missing

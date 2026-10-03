---
title: 'Story 4.3 — Re-baseline, with a reason and a history'
type: 'feature'
created: '2026-10-03'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'bc0821d3709b8a2a3c07d16cad28742ecb7bd844'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-set-a-baseline-that-points-at-the-run-behind-it.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-2-the-re-derivation-test.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** First Set Baseline works, but a second Set is refused with `use_rebaseline` and nothing appends a new version — the PM cannot move the Baseline with a mandatory reason, so history stays one row and FR-16 stays unfinished.

**Approach:** Add `reBaseline` that requires an existing Baseline + non-empty free-text reason, reuses 4.1 pin/refuse/retention/`appendVersionWithWps` under the AD-20 Project lock, audits the append, surfaces author/time/reason on history, and proves hours stamped before the new version stay Unplanned.

**Decisions (founder frozen, 2026-10-03 — Harry):**
- Mandatory free-text reason on Re-baseline (FR-16); first-set fixed `Initial Baseline` stays 4.1 only.
- Append-only: never UPDATE/DELETE `baseline_version` / `baseline_wp`; Re-baseline appends (AR-9 / AD-5).
- Each version kept with author, time, and reason (FR-16) — expose `actor` on the history read path (DB already stores it; domain/UI currently omit it).
- AD-20 per-Project lock before allocating `seq` (AR-37 / AR-15).
- Hours recorded before a Re-baseline on a newly baselined WP stay Unplanned Work (FR-30 / FR-16) — prove via `attribute()` + stamped `activeBaselineVersionSeq`; do not invent Epic 5 ingest.
- Produce audit row on commit (NFR-A1) — new closed action `baseline.rebaseline`.
- CR candidate link **deferred** to Epic 6 / Disposition UI — zero CR surface here (no tables, no stub field).
- Still pin by FK to `schedule_run`; refuse incomplete plan; retention-by-reference — reuse 4.1/4.2, do not fork.
- Do **not** start stories 4.4–4.5.

## Boundaries & Constraints

**Always:**
- `reBaseline` requires an existing Baseline (`latestVersionSeq !== null`); first Set stays `setBaseline` + `FIRST_SET_REASON`.
- Reason is mandatory free-text after trim; empty/whitespace refuses (`invalid_input`).
- Same pin/refuse rules as 4.1 for the Current Plan head: successful latest run, complete leaves, Project start present; pin by FK; `baseline_wp` cost projection only from run outputs + live leaf flags (M-2).
- Lock: early gate → `lockWatermark({ kind: 'project' })` → re-load + re-gate → `appendVersionWithWps` (repo locks again) → audit in the same `runAuditedWrite` tx.
- History read includes `actor`, `recordedAt`, `reason` for every version; active = max `seq`.
- FR-30 proof: ledger entries stamped with an older (or null) `activeBaselineVersionSeq` stay Unplanned after a newer Baseline includes their WP — judgment uses the stamp, not today's active seq.

**Never:**
- No schema migration; no CR tables / CR link field; no Disposition UI (Epic 6).
- No compare-as-plans (4.4); no Baseline Plan-grid columns (4.5).
- No re-implement of `setBaseline`, re-derivation gate, or retention helper — call/reuse.
- No UPDATE/DELETE on Baseline rows; no copying `schedule_run.inputs` onto Baseline.
- Do not change first-set constant reason; do not mark `epic-4` done.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy Re-baseline | Existing Baseline; schedulable plan; non-empty reason | Appends new `baseline_version` + leaf `baseline_wp`; pins latest successful run; audit `baseline.rebaseline`; history shows author/time/reason; active = new seq | N/A |
| Missing / blank reason | Existing Baseline; reason `''` or whitespace | Refuse; no rows | `invalid_input` naming reason |
| No Baseline yet | No versions | Refuse; point to Set Baseline | `invalid_input` (`no_baseline` / hint) |
| Incomplete / halted head | Same as 4.1 refuse cases | Refuse; no append | Same gate details as Set |
| Append-only | UPDATE/DELETE after Re-baseline | Trigger rejects | SQLSTATE append-only |
| History author | Versions with `actor` in DB | Bundle + `/baselines` table expose author | Fail if omitted |
| Unplanned preserved | Entry stamped with seq N (or null) on WP absent from N; Re-baseline N+1 includes WP | `attribute()` still counts that entry Unplanned | Fail if judged against latest only |
| Cross-role | Viewer / no reach | `not_found`; no write | not_found |

</frozen-after-approval>

## Code Map

- `packages/app/src/baseline/set-baseline.ts` — **pattern to mirror**, do not widen into Re-baseline. Keep `FIRST_SET_REASON`, `already_exists` refuse, `baseline.set` audit.
- `packages/app/src/baseline/gates.ts` — extract/share pin+incomplete+halted checks; add `evaluateReBaselineGates` (or mode flag) that **requires** `existingBaselineSeq !== null` instead of refusing it. Keep Set and Re-baseline disable/refuse in sync.
- `packages/app/src/baseline/` — **new** `re-baseline.ts`: zod `{ projectId, reason }`, authorize `PROJECT_REACH`, `runAuditedWrite`, lock → append with trimmed reason + `stamp.actor`/`stamp.at`, audit `baseline.rebaseline`. Export `RE_BASELINE_AUDIT` / `RE_BASELINE_ROLES`.
- `packages/app/src/baseline/set-baseline-state.ts` — extend or add `getReBaselineState` so UI can show Re-baseline when `hasBaseline` and share not-schedulable disable + rail link.
- `packages/db/src/repositories/baseline/index.ts` — **reuse** `appendVersionWithWps`, `latestVersionSeq`, `loadLeafProjections`, `projectStart`; no new writer path that UPDATE/DELETE.
- `packages/db/src/repo.ts` — map `actor` onto `BaselineVersion` when loading `baselineVersions` (column already selected via `.select()`).
- `packages/domain/src/types.ts` — add `actor: string` to `BaselineVersion`; update Review/fixtures/tests that construct versions.
- `packages/domain/src/attribution.ts` — **reuse** FR-30 judgment (`e.activeBaselineVersionSeq` → `baselineByVersion`); add/extend unit proving Re-baseline does not reclassify prior stamps.
- `packages/app/src/audit/index.ts` + `payloads.ts` — append `baseline.rebaseline` (mirror `baseline.set` payload + reason).
- `packages/app/src/use-cases/role-declarations.ts` + `audit-declarations.ts` — merge new declarations.
- `tests/schedule-calendar-writes.ts` — add `re-baseline.ts` to F10 second module list.
- `apps/web` — Re-baseline control with mandatory reason (Baselines page primary; Review/Plan only if a natural entry exists when `hasBaseline`); hide Set when baseline exists (already). History table: author column. Server action → composition root wiring (mirror `setBaselineAction`).
- `apps/web` i18n (`en.json` / `ja.json`) — Re-baseline labels, reason required, author column.
- `tests/schedule/fence-4-3-*.test.ts` — matrix: happy append, blank reason, no baseline, incomplete refuse, append-only, history actor, role gate; reuse `fence-harness` / 4.1 prepare helpers.
- Continuity: 4.1 owns first Set + retention; 4.2 owns re-derive of pin — after Re-baseline, latest pin should still re-derive (optional one-liner in fence calling `reDerivePinnedBaseline`, not a new gate).

## Tasks & Acceptance

**Execution:**
- [x] `packages/app/src/baseline` — `reBaseline` writer + shared/required-exists gates + state helper; register roles/audit/F10.
- [x] `packages/domain` + `packages/db/src/repo.ts` — expose `actor` on `BaselineVersion`; FR-30 Unplanned-preservation unit.
- [x] `packages/app/src/audit` — `baseline.rebaseline` enum + payload schema.
- [x] `apps/web` — Re-baseline UI (mandatory reason) + history author column + server action / composition.
- [x] `tests/schedule/fence-4-3-*.test.ts` — I/O matrix coverage (DB fence).
- [x] `sprint-status.yaml` — move `4-3-re-baseline-with-a-reason-and-a-history` through `ready-for-dev` / `in-progress` / `review`; do not mark `epic-4` done.

**Acceptance Criteria:**
- Given a Project with an existing Baseline and a schedulable Current Plan, when the PM Re-baselines with a non-empty reason, then a new append-only version pins the latest successful `schedule_run` by FK and stores author, time, and that reason (FR-16, AR-22, AR-9).
- Given a Re-baseline without a usable reason (missing/blank), when attempted, then it is refused and no Baseline rows are written (FR-16).
- Given a Re-baseline, when it commits, then it took the AD-20 per-Project lock before allocating `seq` and wrote an audit row `baseline.rebaseline` (AR-37, AR-15, NFR-A1).
- Given hours stamped against an earlier (or null) active Baseline on a WP that a later Re-baseline newly includes, when Unplanned Work is judged, then those hours stay Unplanned (FR-30, FR-16).
- Given the Baseline history, when it is read, then every version shows author, time, and reason (FR-16).
- Given `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test`, when they run, then all exit 0.

## Implementation Notes

- **Gates:** `evaluatePinAndCompleteness` shared; `evaluateBaselineSetGates` refuses `already_exists`; `evaluateReBaselineGates` refuses `no_baseline` (+ `hint: use_set_baseline`).
- **Writer:** `reBaseline` mirrors `setBaseline` lock → re-gate → `appendVersionWithWps` → audit `baseline.rebaseline`; reason trimmed; empty/whitespace → `invalid_input` / `reason: required`; NUL refused via zod refine.
- **Domain:** `BaselineVersion.actor` exposed; `repo.ts` maps DB column; FR-30 unit proves stamp-based Unplanned after Re-baseline includes WP.
- **UI:** Baselines page hosts `ReBaselineControl` (mandatory reason + client trim guard); history table adds Author and full `recordedAt` ISO; Set stays hidden when `hasBaseline`. Action requires `typeof reason === 'string'`.
- **Fence:** `tests/schedule/fence-4-3-re-baseline.test.ts` — happy append + re-derive continuity, blank reason, no baseline, incomplete (+ `getReBaselineState` disable), append-only, role gate, state helper.
- **Review patches (iteration 0):** NUL refine on reason; FormData string guard; client whitespace validity; history shows time; incomplete fence asserts re-baseline eligibility state.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---------|---------|------------------|
| History UI shows `recordedAt.slice(0, 10)` date-only — FR-16 “time” incomplete | medium | Confirmed at `baselines/page.tsx` — AC requires author, time, reason. Route: **patch** — render timestamp with time (full ISO or local datetime), not date-only. |
| New `ja.json` Re-baseline / author keys are English copies | low | Same pre-existing ja locale pattern as story 4.1 (deferred). Reject — unlikely everyday harm; Japanese UI already largely English. |
| Whitespace-only reason: HTML `required` passes; server refuses; `writeLanded` silent → looks like no-op | medium | Confirmed: control has `required` only; action always `String(formData.get('reason'))`; refuse has no toast (same as Set). Route: **patch** — client trim-guard before submit (setCustomValidity / block empty trim). |
| Author column shows raw `user:…` actor id | low | Actor is the audit stamp identity stored on the row; no display-name map exists. Reject — inventing name presentation is out of intent. |
| Fence missing halted-head refuse after Baseline | low | Shared pin path covered by `evaluateReBaselineGates` + Set halted unit; incomplete fence covers post-Baseline refuse. Reject — unlikely everyday miss beyond gate unit. |
| Happy fence asserts audit action only, not payload fields | low | NFR-A1 is “produce audit row”; action member asserted. Payload schema is typed at write. Reject — payload field asserts are nice-to-have. |
| Baselines page double `loadGateRows` via set + reBaseline state | low | Perf duplicate only; correct answers. Reject — coalescing is complexity beyond everyday harm. |
| Spec `review` / empty Spec Change Log & Triage at review entry | false | Intermediate workflow state; triage log filled this pass. Not a product defect. |
| `reason: z.string()` unbounded / no max length | false | Free-text FR-16 does not require a max; unbounded is intentional. |
| Append-only fence voids `APPEND_ONLY_ERRCODE` and regex-matches | low | Still asserts SQLSTATE 42501/MOMO1. Reject — named constant unused is hygiene, not a product miss. |
| FR-30 only domain unit, no DB fence stamp+rebaseline | false | Frozen intent: prove via `attribute()` + stamp; do not invent Epic 5 ingest. Domain unit is the specified proof. |
| `reason` lacks NUL refine unlike `projectId` | medium | Confirmed `re-baseline.ts:33-36`. Route: **patch** — same `noNul` refine on reason. |
| `FormData.get('reason')` coerced via `String()` — File becomes `[object File]` | medium | Confirmed `actions.ts:29`. Route: **patch** — require `typeof raw === 'string'`. |
| I/O matrix halted-head not in fence (edge claim) | low | Same as halted fence row above — carried reject. |
| `getReBaselineState` disable path after Baseline + incomplete unverified (VG) | medium | Pre-verified: incomplete fence never calls `getReBaselineState`; can flip `canReBaseline` without failing suite. Route: **patch** — assert state on incomplete fence case. |

## Design Notes

**Re-baseline is Set with inverted existence + a reason.** Same pin, same cost projection, same lock, same append helper — the product difference is mandatory free-text and requiring a prior version. Keep two use cases so first-set constant reason cannot leak into Re-baseline and so audit actions stay distinct.

**FR-30 is a stamp, not a rewrite.** Re-baseline must not touch ledger rows. Prove judgment reads `activeBaselineVersionSeq` on the entry against the version map; Epic 5 still owns production ingest that writes the stamp.

**CR link stays out.** Disposition `cr_candidate` already exists for Epic 6; wiring candidates onto a Baseline version is a later seam, not a stub column here.

## Verification

**Commands:**
- `pnpm lint` — expected: exit 0
- `pnpm typecheck` — expected: exit 0
- `pnpm depcruise` — expected: exit 0
- `pnpm test` — expected: exit 0 (domain unit + DB fence when `REQUIRE_DB` / local Postgres available)

**Manual checks (if no CLI):**
- Baselines: after first Set, Re-baseline with reason → history shows two rows (author/time/reason); blank reason blocked; Set stays hidden when a Baseline exists.

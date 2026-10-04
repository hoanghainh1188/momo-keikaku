---
title: 'Story 4.4 — Compare two versions as plans, not only as rows'
type: 'feature'
created: '2026-10-03'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '30074aeb7cb8dcc9d21f40922d720d2ce57fd79e'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-set-a-baseline-that-points-at-the-run-behind-it.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-2-the-re-derivation-test.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-3-re-baseline-with-a-reason-and-a-history.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After Set / Re-baseline, history shows rows (author, time, reason) but nothing compares two Baseline versions as plans — a removed dependency can move a hundred WPs while a WP-row dump shows no reason (FR-16).

**Approach:** Compare any two Baseline versions by loading each version's pinned `schedule_run` (FK), diffing plan inputs (edges/lags/constraints/durations/actuals/%/milestones/calendar/settings) and derived dates, attributing every date move to at least one recorded input change, and rendering that on `/baselines`. Publish only stubs the Baseline-version pin Epic 6 will store.

**Decisions (founder frozen, 2026-10-03 — Harry):**
- Plan-level diff, not WP-row-only: WP by WP **and** per-Project lists for dependencies added/removed, lags changed, constraints added/changed/removed, durations changed, actual dates recorded or corrected, Percent Complete changed, milestone flags changed, Holiday Calendar version, and Project start / Project finish / Data Date (FR-16).
- A dependency is an **edge**, not a WP attribute — removed/added edges appear explicitly (FR-16).
- Every WP whose dates differ must name **at least one** input change from that list that accounts for it; a plan that moved with no recorded input reason is the failure mode FR-16 exists to prevent.
- Match WPs across versions by `wp_id`; `wbs_code` sorts only (AR-55 / epic-4-context).
- Published Snapshot records which Baseline version it used (FR-16) — **stub/link only**; do not invent full Publish workflow (Epic 6).
- Still pin by FK to `schedule_run`; refuse incomplete; retention-by-reference; append-only history — reuse 4.1–4.3, do not fork.
- Do **not** start story 4.5 (Plan-grid Baseline columns).

## Boundaries & Constraints

**Always:**
- Compare reads two Baseline versions' `schedule_run_seq` pins → `schedule.runBySeq` ×2 → decode `StoredScheduleInputs` / outputs; never Current Plan / `latestRun` / live `work_package` columns for the plan lists.
- Project-level lists include edge add/remove and lag changes as first-class entries (edge identity = predecessor `wp_id` + successor `wp_id` + type).
- WP match key = `wp_id`; sort display by `wbs_code` then `wp_id`.
- Attribution: for every WP with `earlyStart`/`earlyFinish` differing between the two pins' outputs, the result names ≥1 input change from the FR-16 list that accounts for it (own field change, incident edge add/remove/lag, project settings/calendar, or transitive predecessor input/edge change on the union graph). If none account for it, surface an explicit `unattributed` finding (product failure signal) — tests use fixtures where attribution succeeds.
- Publish stub: export a typed pin contract requiring `baselineVersionSeq` for a future Published Snapshot; no publish table, UI, or workflow.

**Never:**
- No schema migration; no UPDATE/DELETE on Baseline / schedule_run; no copying inputs onto Baseline.
- No re-implement of `setBaseline`, `reBaseline`, re-derivation gate, retention helper, or gates.
- No Plan-grid Baseline compare columns (4.5); leave the Plan toolbar stub alone.
- No full Epic 6 Publish / CR / Disposition surface.
- Do not mark `epic-4` done; do not start 4.5.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy compare | Two versions; pin runs exist; edge removed between them; successor dates moved | Project list shows edge **removed**; WP date rows for moved WPs name that edge (and/or other accounting inputs) | N/A |
| Lag / constraint / duration / actual / % / milestone | Same pins; only that field differs on a WP | Project list + WP attribution name that change | N/A |
| Calendar / Project start / finish / Data Date | Project-level setting differs | Project list entry; date-moved WPs may attribute to it | N/A |
| WP match | Re-parent renumbers `wbs_code`, same `wp_id` | Matched on `wp_id`; sort uses `wbs_code` | Fail if matched on wbs only |
| Same plan | Identical inputs+dates | Empty project lists; no date rows / no unattributed | N/A |
| Missing version / pin | Unknown seq or pin run gone | Refuse compare | `invalid_input` / `not_found` |
| Need two versions | 0–1 Baseline versions | Compare UI disabled / refuse | Clear empty state |
| Cross-role | Viewer / no reach | `not_found` | not_found |
| Publish stub | Contract helper / type | Requires `baselineVersionSeq`; unit locks the seam | N/A |
| Append-only / pin reuse | Existing Baseline rows | Untouched; compare is read-only | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain/src/schedule/stored-run.ts` — **reuse** `StoredScheduleInputs` / edges / wps / calendar `versionSeq` / projectStart|Finish|dataDate; `StoredWpScheduleOutput.earlyStart|earlyFinish`; `decode` / `parseStoredInputs`. Do not fork jsonb shapes.
- `packages/domain/src/schedule/cause.ts` — adjacent-run What-moved only; **do not** ship as FR-16 plan compare. May reuse `datesMoved` helper idea; new module owns Baseline↔Baseline plan diff + attribution.
- `packages/domain/src/` — **new** pure `compareBaselinePlans` (name flexible): two decoded pinned runs → project-level change lists + WP date deltas (match `wp_id`, sort `wbs_code`) + per-moved-WP `accountedBy` input-change refs; emit `unattributed` when none. Unit-test matrix here.
- `packages/domain/src/` — **new** Publish stub type/helper requiring `baselineVersionSeq` (Epic 6 seam); unit only.
- `packages/db/src/repositories/baseline/index.ts` — **add** `scheduleRunSeqForVersion(projectId, seq)` (or load meta for two seqs); reuse `runBySeq` from schedule repo. No new writer.
- `packages/db/src/repo.ts` / `packages/domain/src/types.ts` — optionally expose `scheduleRunSeq` on history read if UI needs it; not required if compare use-case loads pins itself.
- `packages/app/src/baseline/` — **new** read use-case `compareBaselineVersions` (authorize `PROJECT_REACH` → resolve two pins → `runBySeq` ×2 → domain compare). Pattern: `re-derive-pinned.ts`. **Do not** change `set-baseline` / `re-baseline` / `gates` / re-derive.
- `packages/app` composition + role declarations — wire read; no new audit action (read-only).
- `apps/web/.../baselines/page.tsx` — **land** version A/B picker + plan-diff sections (project lists + WP date attribution). Comment already reserves 4.4.
- `apps/web` i18n `baselines.*` — compare labels; mirror `ja.json`.
- Plan toolbar “Baseline compare” — **leave** (story 4.5).
- `tests/schedule/fence-4-4-*.test.ts` — happy edge-removed + attribution; lag/constraint; calendar/settings; match-by-wp_id; role gate; missing pin; disabled with <2 versions. Reuse fence-harness / 4.1–4.3 prepare helpers (set + reBaseline to create two versions).
- Continuity: 4.1–4.3 writers/gates/re-derive stay authoritative; compare only reads pins.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain` — plan compare + attribution pure function + Publish pin stub; unit matrix.
- [x] `packages/db` — load `schedule_run_seq` for a Baseline version seq; reuse `runBySeq`.
- [x] `packages/app/src/baseline` — authorised compare read use-case + composition/roles wiring.
- [x] `apps/web` — Baselines compare picker + project lists + WP attribution UI + i18n.
- [x] `tests/schedule/fence-4-4-*.test.ts` — I/O matrix (DB fence).
- [x] `sprint-status.yaml` — move `4-4-compare-two-versions-as-plans-not-only-as-rows` through `ready-for-dev` / `in-progress` / `review`; do not mark `epic-4` done; do not start 4.5.

**Acceptance Criteria:**
- Given any two Baseline versions, when compared, then the result lists WP-by-WP date deltas **and** per-Project input changes for edges added/removed, lags, constraints, durations, actual dates, Percent Complete, milestone flags, Holiday Calendar version, and Project start / finish / Data Date (FR-16).
- Given a dependency removed between two versions, when compared, then that edge appears explicitly in the project list and accounts for successor date moves (FR-16).
- Given any WP whose dates differ, when compared, then it names at least one accounting input change from that list — or an explicit unattributed finding (FR-16).
- Given two versions, when WPs are matched, then matching uses `wp_id` and `wbs_code` sorts only (AR-55).
- Given the Publish stub, when inspected/tested, then a Published Snapshot pin contract requires the Baseline version seq (FR-16 seam for Epic 6).
- Given `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test`, when they run, then all exit 0.

## Implementation Notes

- **Domain:** `packages/domain/src/schedule/compare-baseline-plans.ts` — `compareBaselinePlans` diffs two decoded pinned runs; edges resolved to `wp_id` before identity `(pred, succ, type)`; attribution = own fields + successor-incident edges + project calendar/settings + transitive predecessor changes on the union graph; empty → `unattributed`. Publish seam: `publishedSnapshotBaselinePin` / `PublishedSnapshotBaselinePin` requiring `baselineVersionSeq`.
- **DB:** `baseline.scheduleRunSeqForVersion(projectId, seq)` — read-only pin lookup; compare use-case loads pins then `schedule.runBySeq` ×2.
- **App:** `compareBaselineVersions` — `PROJECT_REACH`, zod seqs, refuse same/missing/incomplete pins; roles + unaudited audit merged into F10 surface (read-only, no new audit action).
- **Web:** `/baselines` GET picker (`from`/`to`) + project change list + WP date attribution table; Plan toolbar Baseline compare left alone (4.5).
- **Fence:** `tests/schedule/fence-4-4-compare-baseline-plans.test.ts` — edge-removed + lag attribution, match-by-wp_id after WBS renumber, missing version, same-version refuse, viewer `not_found`, single-version UI contract.

## Spec Change Log

## Review Triage Log

## Design Notes

**Pins are the plans.** Each Baseline version is a FK to a fully resolved `schedule_run`. Compare never rebuilds Current Plan inputs — it decodes the two pinned jsonb blobs. That keeps 4.2's retention/re-derive story intact.

**Edges are first-class.** Edge identity is `(predecessorWpId, successorWpId, type)`. Index-based stored edges must be resolved to `wp_id` before diffing so re-order of `wps[]` cannot hide an add/remove.

**Attribution is graph-aware, not a date dump.** A moved WP is accounted for by: (1) its own input-field changes, (2) edges that touch it as successor (add/remove/lag), (3) project-wide calendar/settings changes, (4) transitive predecessor WP/edge changes on the union of both graphs. Empty attribution → `unattributed` row so FR-16's failure mode is visible, not silent.

**Publish is a typed seam.** Export `PublishedSnapshotBaselinePin` (or equivalent) with required `baselineVersionSeq` and a tiny unit; Epic 6 owns the table/UI. No migration here.

**UI lands on `/baselines`.** Two-seq picker under history; Plan-grid columns stay 4.5.

## Verification

**Commands:**
- `pnpm lint` — expected: exit 0
- `pnpm typecheck` — expected: exit 0
- `pnpm depcruise` — expected: exit 0
- `pnpm test` — expected: exit 0 (domain units + DB fence when Postgres available)

**Manual checks (if no CLI):**
- Baselines: with ≥2 versions, pick A/B → see edge add/remove lists and WP date rows naming an input reason; <2 versions disables compare; Plan toolbar Baseline compare still stubbed.

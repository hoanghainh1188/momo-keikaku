---
title: 'Epic 2 retro F21 — enforce milestone ↔ duration pairing at the fence'
type: 'bugfix'
created: '2026-09-27'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '498aefee695d7e8a34e99b90f619d93c3b79e144'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A Work Package can show as ◆ (`isMilestone`) in the Plan while the scheduler treats it as multi-day (`durationDays !== 0`), or the reverse. Schema comments say a milestone is duration 0; `patchMilestone(true)` coerces duration to 0, but `createWp` writes the fields independently and `patchDuration` can overwrite duration on a flagged milestone. Engine keys off `durationDays === 0`; UI glyphs key off `isMilestone` (Epic 2 retro F21).

**Approach:** Enforce the pair at the fence in `applyPlanChange` before the repository write: a milestone always has `durationDays === 0`; a non-zero (or otherwise non-milestone-illegal) duration cannot land on a milestone. Add a fence regression suite. Close sprint action item `epic-2-retro-item-13-…`.

**Decisions (founder, 2026-09-27):**
- **Q1 → C.** On `patch_milestone: false`, also set `durationDays` to `null` so the WP is not-schedulable until a duration is entered (avoids non-◆ + duration-0 split-brain).
- **Q2 → A.** Fence-only this change — no DB CHECK migration.

## Boundaries & Constraints

**Always:**
- Gate at the fence (`applyPlanChange` mutation path) using existing `refuse('invalid_input', { … })` shape.
- Keep `patchMilestone(true)` coercing `durationDays` to `0` (already correct).
- On `patch_milestone: false`, clear duration to `null` in the same fence write (Q1 → C).
- Fence-only — no schema CHECK / migration (Q2 → A).
- Regression tests go through `applyPlanChange` (not domain-only).

**Never:**
- No Plan UI redesign. No changes to recalculate pass math or golden corpus expectations unless a real bug is exposed.
- No `import_draft` / Epic 3 work. Do not reopen story 3.1.
- Do not widen scope to F23 / F10 / formatter collapse. No DB CHECK in this change.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|----------|---------------|----------|-------|
| Create milestone OK | `create_wp` + `isMilestone: true` + `durationDays: 0` (or omitted/null → 0) | WP stored milestone + duration 0 | N/A |
| Create mismatch | `create_wp` + `isMilestone: true` + `durationDays: ≥1` | Refuse; no row | `invalid_input` names `durationDays` |
| Patch duration on milestone | Milestone WP; `patch_duration` with `≥1` or `null` | Refuse | `invalid_input` / `durationDays` |
| Patch duration stay 0 | Milestone WP; `patch_duration` with `0` | Allowed (idempotent) | N/A |
| Mark milestone | `patch_milestone: true` on multi-day WP | Flag true; duration coerced to 0 | N/A |
| Clear milestone | `patch_milestone: false` | Flag false; `durationDays` set to `null` (Q1 → C) | N/A |

</frozen-after-approval>

## Code Map

- `packages/app/src/schedule/apply-plan-change.ts` — Zod cmds `create_wp` / `patch_duration` / `patch_milestone` (~L46–127); mutation switch (~L392–430). Add pairing gates before repo calls; reuse `refuse('invalid_input', { field: ['reason'] })`.
- `packages/db/src/repositories/plan-input/index.ts` — `createWp` (~L511–526), `patchDuration` (~L425–430), `patchMilestone` (~L739–747, already coerces to 0). Prefer fence-level refuse; optional belt-and-suspenders in repo only if cheap — do not make repo the sole gate.
- `packages/domain/src/schedule/recalculate.ts` — engine keys `durationDays === 0` (~L551–555). Read-only.
- `packages/app/src/schedule/plan-grid.ts` — UI glyphs via `isMilestone` (~L731, 819–841). Read-only.
- `tests/schedule/fence-2-10.test.ts` (or new `fence-f21-milestone-duration.test.ts`) — mirror existing fence harness (`reachableAs` / probe tenant). Cases for every matrix row.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — mark `epic-2-retro-item-13-enforce-milestone-duration-pairing-at-th` → `done` when verified.
- Do **not** touch: Epic 3 workbook spike branch artifacts; `proposedGraph` / graph invariants; Plan display formatters (F2/F5).

## Tasks & Acceptance

**Execution:**
- [x] `apply-plan-change.ts` — enforce milestone ↔ duration pairing on `create_wp`, `patch_duration`, and `patch_milestone` (respect Q1/Q2).
- [x] Fence regression tests — cover every I/O matrix row (including Q1 outcome).
- [x] `sprint-status.yaml` — mark retro item-13 `done`; refresh `last_updated`.
- [x] Note outcome in `epic-2-retro-2026-09-27.md` remediation item 5 or Implementation Notes only (no frozen rewrite).

**Acceptance Criteria:**
- Given `create_wp` with `isMilestone: true` and `durationDays ≥ 1`, when applied, then the fence refuses `invalid_input` and no WP is written.
- Given a milestone WP, when `patch_duration` sets a non-zero or null duration, then the fence refuses (idempotent `0` still allowed).
- Given `patch_milestone: true` on a multi-day WP, when applied, then the WP is milestone with `durationDays === 0`.
- Given Q1’s chosen clear-milestone behaviour, when exercised through the fence, then tests lock that behaviour.
- Given the suite, when CI-equivalent fence tests run against a reachable DB, then they pass.

## Implementation Notes

- Fence gates in `applyMutation`: `create_wp` refuses `isMilestone` + `durationDays ≥ 1` (`milestone_must_be_zero`) and coerces omitted/null → `0`; `patch_duration` refuses non-zero/null on a live milestone (idempotent `0` allowed); `patch_milestone` still goes through repo.
- `patchMilestone(false)` now writes `{ isMilestone: false, durationDays: null }` (Q1 → C) in the same statement.
- Regression suite: `tests/schedule/fence-f21-milestone-duration.test.ts` (every I/O matrix row). Fence-only — no DB CHECK (Q2 → A).

## Spec Change Log

- 2026-09-27: Implemented fence pairing + Q1 clear-null; sprint item-13 → `done`.

## Review Triage Log

## Design Notes

Suggested refuse detail (implementer may adjust spelling to match house style): `durationDays: ['milestone_must_be_zero']`.

`create_wp` with `isMilestone: true` and omitted/`null` duration: coerce to `0` before write (align with `patchMilestone(true)`).

`patch_milestone: false` (Q1 → C): update must set `{ isMilestone: false, durationDays: null }` in one write — extend `patchMilestone` in plan-input if it currently only clears the flag.

## Verification

**Commands:**
- `pnpm exec vitest run tests/schedule/fence-2-10.test.ts` (and any new F21 fence file) — expected: green when DB reachable
- `pnpm typecheck` — expected: clean
- `pnpm depcruise` — expected: clean

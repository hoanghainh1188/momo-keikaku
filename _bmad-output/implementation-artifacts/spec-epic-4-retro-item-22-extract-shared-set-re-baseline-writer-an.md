---
title: 'Epic 4 retro item-22 — extract shared Set/Re-baseline writer + fence-harness helpers (F3/F4)'
type: 'refactor'
created: '2026-10-04'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `setBaseline` / `reBaseline` duplicate the authorize → dual-gate → lock → append → audit skeleton (only reason / existence gate / audit action differ), and `makeAllLeavesSchedulable` (+ often `scheduleLeaf` / `refusalPgCode`) is redeclared in each fence-4-{1..5} file despite Epic 2 fence-harness extraction — clones that will multiply before Epic 5.

**Approach:** Extract a private shared Baseline append core parameterized by gate evaluator + reason + audit action, keep thin public `setBaseline` / `reBaseline` wrappers (schemas, role/audit decls unchanged in shape), and lift identical Epic 4 fence schedulability helpers into `fence-harness` so suites import them and drop local copies. No behaviour change; close only sprint item-22 / F3+F4.

**Decision (Harry / retro default):** private shared core (`loadGateInput` → early gate → lock → re-gate → build wpRows → `appendVersionWithWps` → audit) parameterized by gate evaluator + reason + audit action; keep `setBaseline` / `reBaseline` as the public audited entrypoints.

</frozen-after-approval>

## Implementation Notes

- Chose private shared core `appendBaselineVersionWithLeaves` in `packages/app/src/baseline/append-baseline-version.ts` (Harry default): parameterized by `evaluateGates` + `reason` + `auditAction`; exported `buildBaselineWpRows` for a small unit proof of the leaf→row map / incomplete_plan refuse.
- Kept `setBaseline` / `reBaseline` as thin public wrappers — schemas, `FIRST_SET_REASON` / trim+blank reason, gate choice, audit action names, and colocated ROLE/AUDIT decls unchanged in shape.
- Fence F4: lifted `makeAllLeavesSchedulable(owner, probe)`, `scheduleLeaf(deps, ctx, projectId, leafId, durationDays?)`, and `refusalPgCode` into `tests/schedule/fence-harness.ts`; fences 4.1–4.5 import them and drop local copies. Suite-specific helpers (`prepareWithFirstBaseline`, `twoLeaves`, `prepareWithEdgeBaseline`) stay local.
- Unified `scheduleLeaf` keeps the `kind === 'scheduled'` assert (majority / stronger) and default `durationDays = 5`; 4.2 callers already pass an explicit duration.
- Closed sprint-status `epic-4-retro-item-22-…` → `done` only (did not touch item-19/20/21/23/24).
- Verified: `vitest` append-baseline-version + gates + role-declarations + audited-use-cases (110 pass); `REQUIRE_DB=1 vitest` fence-4-1…4-5 (31 pass).


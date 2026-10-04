---
title: 'Epic 4 retro item-24 slice — extract Baseline compare cells from plan-tree-grid (F5)'
type: 'refactor'
created: '2026-10-04'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 4.5 inlined Baseline compare cell rendering (and related column chrome) into the already-large `plan-tree-grid.tsx` (~1801 LOC) — Epic 4 retro F5 / same growth debt as Epic 2 F1. F10+F11 already landed; only this UI extract remains for item-24.

**Approach:** Move Baseline compare cell rendering plus related Baseline preset column chrome (colgroup / header row for the twelve columns) into a focused `plan-*` component module; keep Plan grid wiring for preset enablement, digit key `3`, and `hasBaseline` / "No Baseline yet" identical. No product behaviour change. Mark `epic-4-retro-item-24-…` done when this lands (last open slice).

**Decision (Harry / F5-only paste):** extract UI only; do not start Story 5.1, Story 3.1, or other retro items; leave F10/F11 proofs untouched.

</frozen-after-approval>

## Implementation Notes

- Agent decisions (user-invisible): new module `apps/web/src/components/plan-baseline-compare-cells.ts` (plain `createElement`, same unit-gate pattern as `user-chip-menu.ts`; avoids Story 4.4 `baseline-compare.tsx`); export `BaselineCompareColgroup`, `BaselineCompareHeaderCells`, `BaselineCompareCells`; local SummaryDash using `SUMMARY_NA_LABEL`; leave preset button / `resolvePlanPreset` / key-3 in `plan-tree-grid.tsx`.
- Add `plan-baseline-compare-cells.test.ts` via `renderToStaticMarkup` covering leaf deltas, summary N/A, and twelve-column chrome.
- Mark sprint-status `epic-4-retro-item-24-…` → `done` (F5 was the last open slice after F10+F11 on main).
- `plan-tree-grid.tsx` dropped from 1801 → 1693 LOC; Baseline constants imports removed from the grid shell (consumed only by the new module).

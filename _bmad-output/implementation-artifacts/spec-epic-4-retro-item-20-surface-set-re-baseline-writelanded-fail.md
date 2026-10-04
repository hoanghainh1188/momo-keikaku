---
title: 'Epic 4 retro item-20 — surface Set/Re-baseline writeLanded refuse (F9)'
type: 'bugfix'
created: '2026-10-04'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `setBaselineAction` / `reBaselineAction` return `void` and bare-return when `writeLanded` is false, so TOCTOU / incomplete-plan refuse looks like a successful click that changed nothing on Review, Plan, and Baselines.

**Approach:** Return one shared `BaselineWriteOutcome` (ok / refuse with code + messageKey, mirroring Plan/Settings refuse shape) from both actions; revalidate Review/Plan/Baselines only when the write landed; wire Set/Re-baseline client controls and `SetBaselineButton` to show an inline `role=alert` refuse — no silent no-op. Close only sprint item-20 / F9.

**Decision (Harry / retro default):** one shared `BaselineWriteOutcome` for both actions; client controls await that result and show refuse; adapt `SetBaselineButton` via `useActionState` or a thin client wrapper so Review/Plan/Baselines stay consistent. Do not change `writeLanded` itself or other Epic 1–3 void actions.

</frozen-after-approval>

## Implementation Notes

- Chose shared `BaselineWriteOutcome` (Settings-shaped `{ok:true}` / refuse with code+messageKey+details) over Plan's heavy success payload — Set/Re need no What-moved re-read.
- Actions inspect `Result` directly (refuseOutcome) then revalidate only on land; `writeLanded` helper left unchanged for Epic 1–3 void actions.
- Client controls (`SetBaselineControl`, `ReBaselineControl`) await outcome and render `role=alert` via shared `planWriteRefuseMessage` (no third error channel).
- `SetBaselineButton` ready path → thin `SetBaselineReadyForm` client wrapper (same await+alert pattern); disabled branches stay server-rendered (no function-prop expansion).
- Review patch: refuse alerts sit under the button row (stack), not as flex siblings inside `.btn-row`.
- Coverage: `baselines/actions.test.ts` (use-case refuse + no revalidate; land revalidates; empty id / non-string reason local refuse); `plan-write-refuse.test.ts` incomplete_plan mapping.
- Closed sprint-status `epic-4-retro-item-20-…` → `done` only.
- Verified: `vitest` baselines/actions + plan-write-refuse (10 pass).

## Review Triage Log

- Raw `baseline: incomplete_plan` via `planWriteRefuseMessage` — false; F9 AC asks code/messageKey surfaced through the existing Plan refuse channel, not a new i18n catalog.
- Spec `in-progress` vs sprint `done` / wrong verify count — low; fixed in Finalize (`status: done`, count 10).
- No RTL for `role=alert` render — low reject; AC allows unit; repo has no testing-library; action+mapper prove return and alert prose.
- `reBaselineAction` local refuse untested — low; patched (empty projectId + non-string reason).
- `SetBaselineControl` JSDoc claimed Review/Baselines — low; patched (Plan toolbar only).
- Refuse alert inside `.btn-row` flex — medium; patched (stack wrapper under the row).
- Triplicated await+alert helpers — low reject; three one-liners; shared hook would widen scope.
- Action tests omit full gate `blockingWpIds` payload — low reject; incomplete_plan detail is the refuse arm under test; extra keys only lengthen the joined string.

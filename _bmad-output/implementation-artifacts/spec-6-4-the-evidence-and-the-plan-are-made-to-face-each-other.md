---
title: '6.4 — The evidence and the plan are made to face each other'
type: 'feature'
created: '2026-10-10'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: 'ed8584cfb1a2b3e645ed1043da97c2ee343b3b39'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Reconciliation Review shows Observed % (Tickets → EVM) but does not face it against Recorded % (scheduler / FR-6b). PMs cannot Accept evidence into the plan with a mandatory reason, so progress stays an assumption and dates never get the *progress changed* path from Review.

**Approach:** Build an Observed-vs-Recorded gap list (default >10 pts, worst first) with dual EV and Accept that writes Recorded via the existing AD-25 fence (`patch_recorded_pct`), with ceremony (non-empty reason + consequence copy), audit, and a PM-adjusted marker — without owning full Review layout (6.7), Health (6.5), Forecast finishes (6.6), date-cause list (6.8), or Dispositions (6.9).

## Boundaries & Constraints

**Always:**
- Observed % drives EVM/Review figures; never moves dates.
- Recorded % (import or PM override) is what `remainingDuration` / FR-6b reads; absent → schedule as 0%; show both side by side.
- Accept writes only through `applyPlanChange` → `planInput.appendPctOverride` (AD-25); recalc cause `progress` / WP cause *progress changed*.
- Gap threshold Comfort: fixed **10** percentage points (no Project setting UI this story).
- Rounding only in `domain/present` (AR-6).
- Expand/contract for any `pct_override_event` schema change; register tables if new.
- Keep `6-1`/`6-2`/`6-3` done; set `6-4-…` → `in-progress` when impl starts.
- **Q1→A:** Thin **Progress & Dates** section after Ahead/Behind with gap list + Accept only (date-moved list + Data Date stay for 6.8/6.7).
- **Q2→B:** Expand `pct_override_event` with nullable `reason` + optional `source`; Accept requires non-empty reason; legacy Plan-grid edits may leave reason null.
- **Q3→A:** Show **PM-adjusted** on Review (+ Plan Recorded when reason present); “no Visibility Policy may hide” is a contract stub until Publish exists.
- **Q4→B:** SM-C4 deferred to `deferred-work.md` (non-blocking).
- **Q5→A:** Accept consequence = this-WP `remainingDuration` before→after only; no pre-commit multi-WP count / dry-run.
- **Token:** Keep full spec (Harry override of 1600-token band).

**Never:**
- Rewrite EVM identities / bump `formulaVersion` unless Observed math changes (it should not).
- Second mutator outside the fence; mapping writers that move dates.
- Health indicators (6.5), Forecast finish dates (6.6), full Review section reorder/chrome (6.7), seven-cause date list UI (6.8), Disposition queue (6.9).
- Epic 5 residuals, Story 3.1, Epic 7–8.
- Invent Visibility Policy writers or a Publish surface beyond a thin PM-adjusted display contract.
- SM-C4 counter-metric this story (deferred).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gap list | Leaf WP \|Obs−Rec\| > 10 pts (Rec null = 0%) | Row: wording, Observed+basis+evidence count, Recorded+source, gap, EVObs, EVRec, Accept | No Baseline → no list (same PARTIAL as divergence) |
| No Recorded | `recordedPct == null` | Source *none — scheduled as 0%*; Rec treated 0% for gap/EVRec | N/A |
| Accept happy | Non-empty reason; PM confirms | Fence `patch_recorded_pct` + reason + source `pm_override`; audit; recalc; *progress changed* when dates move; PM-adjusted | Empty reason blocked client+server |
| Accept consequence | Before commit | States Recorded override % + this-WP remaining duration before→after | Cancel leaves plan unchanged |
| Plan-grid Recorded edit | Existing inline edit | Still fences; reason may be null; source `plan_edit` | Invalid % → existing refuse |
| Estimate edit changes EV | Pin estimates move Observed EV | Flagged on Review gap/divergence row | N/A |
| Threshold Comfort | Cut considered | Fixed 10 pts only | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain/src/evm.ts` (`percentComplete`, `WpMeasure`, `computeEvm`) — **reuse** Observed % / basis / evidence / EV; do not change hours identities.
- `packages/domain/src/review.ts` (`DivergenceRow`, `divergenceRows`, `ReviewResult`) — **extend** with Observed-vs-Recorded gap rows, dual EV, Recorded source; keep pin-only inputs; **no** SM-C4.
- `packages/domain/src/schedule/recalculate.ts` (`remainingDuration`, `ScheduleWp.recordedPct`) — **reuse** for consequence copy + scheduler truth; do not change remaining-duration math.
- `packages/domain/src/schedule/cause.ts` (`progressChanged`, `'progress changed'`, run cause `'progress'`) — **reuse** as-is.
- `packages/db/src/schema.ts` (`pctOverrideEvent`) — expand nullable `reason` + optional `source`.
- `packages/db/src/repositories/plan-input/index.ts` (`appendPctOverride`, `AppendPctOverrideCommand`) — fence INSERT + `lockWatermark`; extend command.
- `packages/app/src/schedule/apply-plan-change.ts` (`patch_recorded_pct` mutation ~151–156, apply ~550+) — **extend** optional reason/source; Review Accept path requires non-empty reason; keep AD-25 sole write path.
- `apps/web/.../plan/actions.ts` (`patchWpRecordedPctAction`) — Plan-grid may omit reason; set source `plan_edit`.
- `apps/web/.../review/page.tsx` — thin Progress & Dates after Ahead/Behind; gap list + Accept; do not reorder whole page (6.7).
- `packages/domain/src/present/` + `packages/i18n/.../{en,ja}.json` — gap wording, Accept chrome, PM-adjusted, consequence strings; key parity.
- `packages/app/src/audit/` + `audited-write.ts` — audit payload carries reason; no parallel write API.
- Out of scope to change: Health/Forecast bodies, disposition writers, Epic 5 residuals, `watermark-lock` mechanics beyond existing fence calls.

## Tasks & Acceptance

**Execution:**
- [x] `packages/db` (schema + drizzle expand) — nullable `reason` + optional `source` on `pct_override_event`.
- [x] `packages/db/.../plan-input` + `packages/app/.../apply-plan-change.ts` — Accept requires non-empty reason + source `pm_override`; Plan-grid may null reason + source `plan_edit`.
- [x] `packages/domain/src/review.ts` (+ tests) — gap list (>10 pts, worst first), dual EV, sources, estimate-EV flag; no SM-C4.
- [x] `apps/web/.../review` (+ Accept UI) — Progress & Dates section; wording; this-WP remaining-duration consequence; non-empty reason; Esc/focus hygiene; PM-adjusted tag.
- [x] `apps/web/.../plan` — PM-adjusted tag when head reason present.
- [x] `packages/i18n` + present — strings; unhideable stub comment/contract.
- [x] `_bmad-output/.../sprint-status.yaml` — `6-4-…` → `in-progress` at impl start; append SM-C4 to deferred-work.
- [x] Unit tests for matrix rows (null Recorded, Accept refuse, gap sort, dual EV, fence reason).

**Acceptance Criteria:**
- Given Observed and Recorded, when computed, then Observed drives EVM/Review and never dates; Recorded drives remaining duration; absent Recorded schedules 0% with both figures visible.
- Given the gap list, when rendered, then leaf WPs with \|gap\| > 10 pts, worst first, say “Evidence says X%. The plan says Y%.” with basis, evidence count, Recorded source, dual EV, Accept.
- Given Accept, when pressed, then non-empty reason + this-WP remaining-duration consequence before commit; writes via fence with source `pm_override`; audit; *progress changed* on date movement; PM-adjusted on Review(+Plan).
- Given Comfort threshold, when cut, then fixed 10 pts only.
- Given SM-C4, when considered, then deferred (not shipped this story).

## Implementation Notes

- **2026-10-10 — story 6.4 landed (Observed vs Recorded + Accept).** Expand `pct_override_event` with nullable `reason` + optional `source` (`0014_pct_override_reason_source.sql`). Fence `patch_recorded_pct` takes optional reason/source; Accept path requires non-empty reason + `pm_override`; Plan-grid sets `plan_edit` (reason may be null). Audit payload carries reason/source/wpId/pct for Recorded writes. Domain `computeReview` adds `observedVsRecorded` gap list (fixed >10 pts, worst first, dual EV, estimate-driven flag) and `estimateDrivenEv` on divergence; inputs `recordedPctByWp` + `durationDaysByWp` from `loadReview`. Review page: thin Progress & Dates after Ahead/Behind with Accept dialog (Esc/focus, this-WP remaining-duration consequence). Plan grid: PM-adjusted tag when head reason present. i18n EN/JA + present contract stub (Visibility Policy must not hide PM-adjusted). SM-C4 deferred. Verified: `pnpm typecheck`, targeted vitest (review gap matrix, fence reason refuse, i18n parity, divergence tags, plan-grid-view), `pnpm lint`. DB migrate / fence Postgres integration not run here (no `DATABASE_URL` in this environment). Sprint left at `in-progress` (not stamped done).

## Spec Change Log

## Review Triage Log

## Design Notes

- **Dual EV:** EVObs = existing per-WP `evMh`; EVRec = `baselineMh × recordedPct` (0 when Recorded null) via exact Ratio math — display through `present`.
- **Sources (R0):** `none` (*none — scheduled as 0%*); `pm_override` (Accept); `plan_edit` (Plan-grid, reason may be null). True file/row import metadata stays future.
- **No formulaVersion bump** for gap list / Accept / presentation alone.
- Continuity from 6.3: keep formula popovers; do not regress BAC exhausted / Typical EAC / Period Δ.

## Verification

**Commands:**
- `pnpm exec tsc -b` — exit 0
- `pnpm test` (domain / db / targeted web) — new matrix cases green; known pre-existing VM failures (depcruise/schedule-closure/web-composition) do not expand
- `pnpm lint` — exit 0 when runnable

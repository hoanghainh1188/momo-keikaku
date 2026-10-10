---
title: '6.6 — The forecast, and both finish dates'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '9f8ed6f7ad0abfebeebfc6b6add93a6d45fbe0f6'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Review already shows Typical EAC and a single SPI-trend finish, but FR-32 needs both finishes side by side — the scheduler's **computed finish** and the **trend finish** — labelled honestly, with the gap named when they disagree, and FR-31 needs SV plus both finishes next to the Schedule indicator so a late project cannot hide behind SPI≈1.

**Approach:** Extend `ForecastResult` / `computeForecast` to carry computed finish + trend finish + a working-day gap, thread `schedule_run.outputs.computedFinish` (and Baseline-pinned Project start) into Review, then render dual labelled finishes in Forecast, Ahead/Behind, and under/beside the Schedule HealthBadge on Status (Q1→A), without owning Review reorder (6.7), causes (6.8), or Dispositions (6.9).

## Boundaries & Constraints

**Always:**
- Effort forecast remains the Project's selected EAC Method (R0 Typical) and **includes Unplanned Work** (FR-32) — reuse `evm.eacMh`; do not re-derive EAC in forecast.
- Show **both** finishes **together and labelled**: **computed finish** = FR-6b / `ScheduleOutputs.computedFinish` (scheduler output; same quantity Schedule Health uses); **trend finish** = Baseline start + (Baseline duration working days ÷ SPI), labelled a simple trend heuristic, not a PMI formula (FR-32).
- Trend math: Baseline start = **Project start pinned in the active Baseline** (from that Baseline's `schedule_run.inputs.projectStart`); Baseline duration = working days from that start to the Baseline's latest WP finish; division via `ceilDiv` over the exact SPI Ratio (AR-6 / AD-27); while EV < BAC never earlier than `nextWorkingDay(asOf)`; when SPI is 0 or unavailable → **no trend finish** (null).
- Keep existing field `forecastFinish` as the trend date (alias/`trendFinish` optional) for golden continuity; add `computedFinish` + gap fields rather than inventing a third finish concept.
- When both dates are present and unequal, UI **says they disagree and shows the gap in whole working days** (signed: trend later than computed → positive). When equal or either null → no disagreement chrome.
- Wire `computedFinish` from pinned/head `schedule_run` into Review (extend `scheduleHealth` or a sibling pin field) — do **not** conflate with `project.project_finish` or Float `anchor.date`.
- **Q1→A:** Co-display SV + both finish dates under/beside the Schedule HealthBadge on Status, in addition to dual finishes in Ahead/Behind and Forecast (FR-31).
- **Token:** Keep full spec (Harry override of 1600-token band).
- Keep `6-1`…`6-5` done; set `6-6-…` → `in-progress` when impl starts.
- No `FORMULA_VERSION` bump unless EVM arithmetic identity changes (this story is finish presentation + pin wiring).

**Never:**
- Rewrite EVM / Typical EAC math, Health rules (6.5), Observed-vs-Recorded Accept (6.4), Review section reorder/chrome (6.7), seven causes (6.8), Dispositions (6.9).
- Invent Post-Q1 probabilistic forecast / EAC method picker.
- Use live `project.project_finish` or Float anchor as the Forecast "computed finish".
- Hand-edit generated `sql/*.sql`; add migrations unless a real schema gap appears (column already exists).
- Round outside `domain/present`; float-compare SPI; break LEGACY/PRIOR formula corpus goldens.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy dual finishes | SPI value > 0, baseline pin has projectStart + WP finishes, schedule outputs have computedFinish | Both dates labelled; EAC = Typical eacMh | N/A |
| SPI unavailable / ≤ 0 | spi.kind ≠ value or ≤ 0 | trend finish null; computed finish still shown if present | No fake trend |
| EV < BAC floor | trend before next WD after asOf | trend = `nextWorkingDay(asOf)` | N/A |
| Dates disagree | computed ≠ trend, both non-null | UI names disagreement + working-day gap | Gap only when both present |
| Dates agree | equal ISO dates | Both shown; **no** disagreement chrome | N/A |
| No computedFinish | all-complete / null schedule outputs | computed null; trend may still show; no gap chrome | scheduleHealth decode fail → computed silent null (same as Health extras) |
| No Baseline | activeBaseline null | `forecast` null (existing); no finishes | N/A |
| Baseline start source | Baseline pin has schedule_run.inputs.projectStart | trend uses that Project start, not min WP start | Missing pin start → fall back to min baseline WP start (document in Notes) |

</frozen-after-approval>

## Code Map

- `packages/domain/src/forecast.ts` (`ForecastResult`, `computeForecast`) — **extend** with `computedFinish`, working-day `finishGapWd` (or equivalent), keep `forecastFinish` as trend; accept computed finish + Baseline Project start args; reuse `ceilDiv`, `workingDaysBetween`, `addWorkingDays`, `nextWorkingDay`, `compareRatio`.
- `packages/domain/src/review.ts` (`computeReview`, `scheduleHealth`, `ReviewResult.forecast`) — pass computed finish into `computeForecast`; optionally load Baseline-pinned `projectStart`; do not change Health feed semantics beyond reading `computedFinish`.
- `packages/domain/src/schedule/recalculate.ts` / `stored-run.ts` (`ScheduleOutputs.computedFinish`) — **consume** only.
- `packages/domain/src/calendar/index.ts` — reuse working-day helpers; do not invent a second calendar walk.
- `packages/domain/src/evm.ts` (`eacMh`, `FORMULA_VERSION`) — **reuse** EAC; no bump unless forced.
- `packages/db/src/repo.ts` (`scheduleHealth` decode ~713–752) — **extend** to keep `storedOut.computedFinish` (today dropped).
- `packages/db/src/demo-golden.test.ts` — update forecast assertions if Baseline-start source or dual fields change demo numbers.
- `apps/web/src/app/p/[projectId]/review/page.tsx` — Forecast § + Ahead/Behind finish cells: dual labelled `MetricCell`s + gap caption; Status Q1→A (SV + both finishes under/beside Schedule HealthBadge); keep EAC/ETC/VAC `FormulaMetricCell`s.
- `packages/i18n/src/messages/{en,ja}.json` — computed/trend labels, gap copy, scheduler-output / trend-heuristic notes; EN/JA parity.
- Out of scope: Disposition rail, Accept flow, Review reorder, Health threshold editor, Epic 5 residuals, Epic 7–8.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/forecast.ts` (+ new `forecast.test.ts`) — dual finishes + gap matrix; Baseline Project start; keep trend floor / SPI-null rules.
- [x] `packages/domain/src/review.ts` (+ `review.test.ts`) — wire computed finish + baseline-pinned start into `computeForecast`.
- [x] `packages/db/src/repo.ts` — retain `computedFinish` on schedule pin feed; load Baseline schedule_run `projectStart` when needed.
- [x] `apps/web/.../review/page.tsx` — dual finishes in Forecast + Ahead/Behind; Status Q1→A; gap caption when disagree.
- [x] `packages/i18n` EN/JA — label/gap/note keys; parity.
- [x] `_bmad-output/.../sprint-status.yaml` — `6-6-…` → `in-progress` at impl start.
- [x] Unit tests for I/O matrix rows; keep evm/formula-corpus/review goldens green.

**Acceptance Criteria:**
- Given the effort forecast, when it renders, then it is the EAC from the Project's selected EAC Method and includes Unplanned Work (FR-32).
- Given the two finish dates, when they render, then both are shown together and labelled: computed (scheduler / FR-6b) and trend (heuristic, not PMI) (FR-32).
- Given the trend finish, when computed, then Baseline start is Project start pinned in the active Baseline, duration is working days to Baseline latest finish, whole working days rounded up, EV<BAC floor applies, SPI 0/unavailable hides trend (FR-32, AR-6).
- Given disagreement, when they render, then the UI says so and shows the working-day gap (FR-32).
- Given Schedule indicator context (Q1→A), when Status renders, then SV and both finish dates sit under/beside the Schedule HealthBadge; Ahead/Behind and Forecast also show both finishes so late-life SPI≈1 cannot stand alone (FR-31).

## Implementation Notes

- 2026-10-10: Started impl on `cursor/story-6-6-forecast-finish-dates-0a44`. Sprint `6-6-…` already `in-progress`. Spec `context: []` — no extra context files. `uv` unavailable for bmad-build render; implementing from this spec + Code Map.
- Extended `ForecastResult` with `trendFinish` (alias of `forecastFinish`), `computedFinish`, `finishGapWd` (null when equal/missing). `computeForecast` takes `ComputeForecastOptions` for computed finish + Baseline-pinned Project start; missing pin start falls back to min Baseline WP start.
- `ReviewInput.scheduleHealth.computedFinish` + `baselineProjectStart`; `repo.ts` retains `storedOut.computedFinish` and loads Baseline schedule_run `inputs.projectStart`.
- Review UI: dual labelled finishes in Ahead/Behind + Forecast; Status Schedule HealthBadge co-displays SV + both finishes + gap caption (Q1→A). i18n EN/JA keys added with parity.
- Verification: `pnpm exec tsc -b` 0; `pnpm test` 1589 passed / 512 skipped; `pnpm lint` 0. (Clean tsc emit `.js` siblings after `-b` so fence suites stay green.) Demo golden trend date unchanged (`2026-12-15`); in-memory fixture has null computedFinish/gap until a schedule_run pin exists.
- Review fixes: empty trend when baselineStart > baselineFinish; null finishGapWd when gap helper returns 0; pinned review finishGapWd=-31; Ahead/Behind uses formula_forecast_trend; Status SV note omitted when unavailable; finishes_disagree uses absGap+direction; finish-dates-presence.test.ts for Review testids.

- 2026-10-10: Review patches — inverted baseline window empties trend; null zero gaps; pinned review finishGapWd; Ahead/Behind trend formula aligned; Status SV note only when value; absGap/direction i18n; finish-dates presence test. Deferred DB loader pin assertion (no Postgres).

## Spec Change Log

## Review Triage Log

- blind: ja.json new 6.6 strings English despite "EN/JA parity" — **false** — repo contract is key-set parity (`key-parity.test.ts`); Review label English in `ja.json` is the established convention (see most `review.*` keys); Health disclosure JA is the exception already shipped
- blind: negative `finishGapWd` reads as “-N working days” with no earlier/later wording — **low** → patch (ICU direction + abs gap in copy; add signed-gap unit test)
- blind: Ahead/Behind trend cell uses `formula_forecast_finish` while Status/Forecast use `formula_forecast_trend` — **low** → patch (unify Ahead/Behind to trend-heuristic formula key)
- blind: no DB/repo test for `computedFinish` / `baselineProjectStart` loader — **medium** → defer (no Postgres in this environment; `baseline-read`/`demo-golden` skip or null-only; same class as Story 6.5 deferred DB round-trips)
- blind: `review.test` soft-asserts gap with conditional that never runs — **medium** → patch (pin expected `finishGapWd` / force disagreement)
- blind: no UI tests for Status Q1→A / dual finish / gap testids — **medium** → patch (source/`data-testid` presence guard in web test style)
- blind: tasks `[x]` while status/sprint still in-progress — **false** — workflow state (now `in-review`); not a product defect
- blind: Status SV note labels unavailable SV as ahead_of_plan — **low** → patch (only claim ahead/behind when `svMh.kind === 'value'`)
- blind: `finishGapWorkingDays` returns 0 for equal dates while `finishGapWd` is null — **false** — intentional: helper is numeric; chrome field nulls equal/missing per frozen matrix
- blind: Ahead/Behind keeps `m-forecast-finish` vs `m-*-trend-finish` — **low** rejected (legacy testId continuity; everyday harm unlikely)
- edge: unequal ISO with zero working-day span → gap 0 chrome — **false** — both finishes are produced by working-day calendar helpers so both are working days; inclusive span ≥ 1 when ISO differs
- edge: `baselineProjectStart` after `baselineFinish` → zero-duration bogus trend — **medium** → patch (empty trend when start > finish)
- edge: empty/non-ISO computedFinish or pin start throws — **false** — DB path Zod-parses stored outputs/inputs; corrupt injects are test-only
- edge: JA English labels (claim) — **false** — same as blind ja parity
- vgap: `loadBundleInTenant` pin fields unverified — **medium** → defer (no Postgres; see blind DB loader)
- vgap: Review page dual-finish / Q1→A UI unverified — **medium** → patch (same UI source guard as blind)
- vgap other: review.test soft gap branch — **medium** → patch (same as blind soft-assert)
- vgap other: ja English values — **false** — same as blind ja parity

## Design Notes

- **Trend continuity:** Keep `forecastFinish` as the trend ISO date so `demo-golden` and existing i18n formula keys can evolve without a silent third date concept.
- **Computed finish source:** Only `ScheduleOutputs.computedFinish` / `schedule_run.computed_finish` — never `project_finish` and never Float anchor alone.
- **Gap:** Prefer whole working days via the same calendar as trend stretch; hide chrome when either date is null or dates are equal.
- **Continuity from 6.3/6.5:** Keep FormulaMetricCell popovers for EAC family; finish cells stay MetricCell-style with honest labels; do not regress Health disclosure.

## Verification

**Commands:**
- `pnpm exec tsc -b` — exit 0
- `pnpm test` (domain forecast/review + db as applicable) — matrix + goldens green
- `pnpm lint` — exit 0 when runnable

**Manual checks (if no CLI):**
- Review Forecast section: EAC + both finishes + gap when disagree
- Ahead/Behind: both finishes next to SPI
- Status: SV + finishes placement matches frozen Q1

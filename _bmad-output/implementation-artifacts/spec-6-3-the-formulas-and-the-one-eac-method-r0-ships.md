---
title: '6.3 The formulas, and the one EAC method R0 ships'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '99b9a4b'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Domain already computes CV/SV/CPI/SPI/TCPI/ETC/VAC/BAC hours and Typical EAC, but Review still shows static formula captions — no click/`Enter` formula popover, no sign-dynamic interpretations, TCPI exhausted renders as `—` plus a reason instead of **"BAC exhausted"** in the figure slot, BAC has no money form, and EAC method naming is incomplete for defending a number in front of a client.

**Approach:** Keep `computeEvm` as the single hours engine; add BAC yen (per decided Open Question), polish TCPI exhausted presentation and Typical-only EAC labeling, then make every Review metric cell open a non-modal formula popover (formula, inputs+values, interpretation, Period change, Ticket/WP drill-down) with `Esc` restoring focus — rounding only via `domain/present`.

## Boundaries & Constraints

**Always:**
- Formulas: CV=EV−AC; SV=EV−PV; CPI=EV/AC; SPI=EV/PV; TCPI=(BAC−EV)/(BAC−AC); ETC=EAC−AC; VAC=BAC−EAC (FR-30; first five from `docs/references/`; ETC/VAC PMBOK).
- BAC hours = Σ Baseline hours of baselined leaf WPs; money form per frozen BAC-money decision.
- R0 EAC = Typical only: `EAC = BAC / CPI` using **all-in** CPI; method named beside every EAC. Atypical / Schedule-constrained / Flawed-estimate stay Post-Q1.
- TCPI when `BAC − AC ≤ 0` shows **"BAC exhausted"** in place of a number (UX-DR23).
- Interpretations: CV/SV >0 under budget / ahead; <0 over / behind; CPI/SPI <1 over / behind; TCPI >1 remaining work must beat planned efficiency (FR-30); equality copy per frozen decision.
- Metric cell click/`Enter` → non-modal formula popover (formula, inputs+values, one-line interpretation, Period change, drill-down); `Esc` closes and returns focus (UX-DR19).
- Rounding only in `domain/present` (ratios 2 dp, hours 1, yen integer) for UI and snapshot outputs (AR-6).
- Consume pinned `ReviewInput` / `computeEvm` from Stories 6.1–6.2; dual CPI and Unplanned PV=EV=0 stay as shipped.

**Decisions (Harry, 2026-10-10):**
- **Period change (Q1-A):** Recompute the same metric at `asOf = period.start − 1 day` vs current `asOf`; Δ = current − prior (second `computeEvm` over the pin).
- **Drill-down (Q2-C):** Minimal WP id + contribution table for every metric; list Tickets only when the metric is AC-derived.
- **Equality copy (Q3-A):** CV/SV = 0 → “on budget” / “on plan”; CPI/SPI = 1 → neutral on-budget/on-plan copy; TCPI = 1 → “remaining work matches planned efficiency”.
- **BAC money (Q4-B):** R0 `bacJpy = costOf(bacMh, project.defaultRateYenPerHour)` matching PV/EV money; defer equal-split / rate-at-Baseline-date (record in `deferred-work.md`).

**Never:**
- Invent Post-Q1 EAC methods or a live method picker that changes math.
- Rewrite Review layout (6.7), Health rules (6.5), Forecast finish dates (6.6), Observed-vs-Recorded Accept (6.4), date causes (6.8), Dispositions (6.9).
- Change 6.2 PV largest-remainder / `FORMULA_VERSION` / legacy golden path unless a formula identity bug forces a bump.
- Round outside `domain/present`; touch Epic 5 residuals 33/35/37/29/30; rewrite pin capture/closure.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Typical EAC | all-in CPI value, BAC hours | EAC = BAC/CPI; label/method "Typical" beside EAC | CPI unavailable → EAC unavailable (existing reason) |
| TCPI exhausted | BAC − AC ≤ 0 | Figure slot text **"BAC exhausted"** (not a ratio, not bare `—`) | Domain `bacExhausted` + `unavailable('bac_exhausted')` |
| Formula popover open | Focus metric cell; click or Enter | Non-modal popover: formula, inputs+values, interpretation, Period Δ, drill-down | N/A |
| Formula popover close | Esc while open | Popover closes; focus returns to the metric cell | N/A |
| Sign interpretation | CV/SV/CPI/SPI/TCPI at boundary | Directional copy per Intent; equality per frozen decision | Unavailable metric → no directional claim |
| BAC money | Baselined leaf WPs + rates on pin | BAC yen per frozen BAC-money decision; Internal money column | Missing rate → Project default Rate fallback (same family as attribution) |
| Period change | Popover for a metric | Δ within Period per frozen Period-change decision | Unavailable prior → show unavailable / em dash, never invent |
| Drill-down | "Show Tickets / WPs" | List per frozen drill-down decision | Empty contribution → empty list, not an error |

</frozen-after-approval>

## Code Map

- `packages/domain/src/evm.ts` (`computeEvm` ~258–374, `EvmResult`) — hours formulas + Typical EAC + `bacExhausted` / TCPI unavailable already green; reuse; add BAC yen helper only if Q4-A/C.
- `packages/domain/src/evm.test.ts` — extend for exhausted TCPI presentation contract + BAC yen cases if in scope; keep dual-version goldens green.
- `packages/domain/src/present/index.ts` (`present`, `REASONS.bac_exhausted`) — today value `—` + reason `"BAC exhausted"`; change so figure slot shows **"BAC exhausted"** for that reason (UX-DR23).
- `packages/domain/src/present/present.test.ts` — lock exhausted + rounding-only contract.
- `packages/domain/src/attribution.ts` (`rateOnDate`) — reuse for Q4-A/C; do not change ledger attribution.
- `packages/domain/src/review.ts` (`ReviewResult.money`, Effort wiring ~697–698) — expose `bacJpy` (and Period-Δ / popover DTOs if domain-owned); keep pin-only inputs.
- `packages/domain/src/units.ts` (`costOf`, `allocateLargestRemainder`) — money split helpers if Q4-A/C; no PV algorithm change.
- `packages/domain/src/types.ts` (`eacMethod: 'typical'`, `BaselineWp`, `Resource.rates`) — read-only for R0 method; no Post-Q1 variants.
- `packages/domain/src/calendar/index.ts` (`ReportingPeriod`) — Period bounds for Q1-A.
- `apps/web/src/components/ui.tsx` (`MetricCell`) — make focusable/activatable; host or compose formula popover; keep DESIGN metric anatomy.
- `apps/web/src/components/plan-exceptions-rail.tsx` — reuse Esc + focus-return / non-modal `role="dialog"` pattern (do not copy Plan rail UX wholesale).
- `apps/web/src/app/p/[projectId]/review/page.tsx` (`EvmRow`, Forecast EAC/ETC/VAC `MetricCell`s, Status/Ahead-Behind metrics) — wire popover props; dynamic readings; EAC Typical naming; BAC money cell; no section reorder (6.7).
- `packages/i18n/src/messages/{en,ja}.json` — interpretation keys (sign + equality), popover chrome, Period-Δ labels, drill-down; keep existing formula strings where accurate.
- `docs/references/pmi-techniques-v1.md` — formula source for CV/SV/CPI/SPI/TCPI/EAC Typical.
- Out of scope to change: `watermark-lock.ts`, `ledger-pin.ts`, Health/Forecast bodies beyond consuming EVM, disposition writer, Epic 5 residuals.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/present/index.ts` (+ `present.test.ts`) — figure slot **"BAC exhausted"** for `bac_exhausted`; keep rounding sole site.
- [x] `packages/domain/src/evm.ts` / `review.ts` (+ tests) — BAC yen per Q4; Period-Δ support per Q1; ensure Typical EAC + exhausted TCPI stay correct; no Post-Q1 methods.
- [x] `apps/web/src/components/formula-metric-cell.tsx` / `evm-formula-row.tsx` — keyboard/click opens non-modal formula popover; Esc restores focus.
- [x] `apps/web/.../review/page.tsx` — wire popover for metric cells / EvmRows (formula, inputs, interpretation, Period Δ, drill-down per Q1–Q3); EAC Typical named; BAC money column; sign-dynamic readings.
- [x] `packages/i18n/src/messages/{en,ja}.json` (+ key-parity) — popover + interpretation strings.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` — `6-3-…` → `in-progress` when impl starts; keep `6-1`/`6-2` done.
- [x] Unit tests for matrix rows (exhausted TCPI, period Δ, drill-down, BAC money demo golden).

**Acceptance Criteria:**
- Given the formulas, when Review/domain expose them, then CV/SV/CPI/SPI/TCPI/ETC/VAC match FR-30 identities (first five from `docs/references/`).
- Given BAC, when computed, then hours = Σ baselined leaf Baseline hours and money follows frozen Q4.
- Given BAC − AC ≤ 0, when TCPI renders, then the figure shows **"BAC exhausted"** (UX-DR23).
- Given R0 EAC, when shown, then Typical only (`BAC / all-in CPI`) with method named beside every EAC.
- Given a metric cell, when click or Enter, then non-modal popover shows formula, inputs+values, interpretation, Period change (Q1), and drill-down (Q2); Esc restores focus (UX-DR19).
- Given interpretations, when values are signed/ratio, then FR-30 directional copy holds; equality follows Q3.
- Given every figure, when rendered, then rounding only in `domain/present` (AR-6).

## Implementation Notes

- `ReviewResult`: `evmAtPeriodStart` (Q1-A), `formulaMetrics[]`, `money.bacJpy` (Q4-B default Rate).
- Domain: `metric-formula.ts`, `formula-popover-detail.ts`; `present.ratioDeltaSigned`; TCPI figure shows **BAC exhausted**.
- Web: `FormulaMetricCell`, `EvmFormulaRow`; i18n under `review.metric_formula.*` (avoids clobbering `review.formula` column label).
- Verified: `pnpm exec tsc -b`, domain/i18n/db golden tests green; 4 repo tests fail on main too (depcruise/schedule-closure/web-composition — pre-existing in this VM snapshot).

## Spec Change Log

## Review Triage Log

## Design Notes

- **Popover shell:** Non-modal floating layer (DESIGN shadow `0 4px 16px rgba(29,31,35,0.12)`); not a blocking dialog. Mirror Esc/focus from schedule explainers; keep MetricCell’s label / figure / formula anatomy when closed.
- **Inputs block:** Show the named operands actually used (e.g. CPI all-in: EV, AC all-in; TCPI: BAC, EV, AC; EAC: BAC, CPI all-in) with `present()`-formatted values.
- **EAC naming:** Prefer durable label copy like existing `review.eac_typical` (“EAC (Typical)”) on every EAC surface (Forecast cell + any Effort/Cost echo) rather than a disabled method picker.
- **No formulaVersion bump** unless hours identities change; BAC yen / presentation / popover alone do not require a new corpus key.

## Verification

**Commands:**
- `pnpm lint` — exit 0
- `pnpm exec tsc -b` (or repo typecheck) — exit 0
- `pnpm depcruise` — exit 0
- `pnpm test` — exit 0; exhausted TCPI, interpretations, popover/focus, BAC money (if in scope), formulaVersion goldens green

---
title: 'Story 6.2 — EVM in hours, with Unplanned Work carrying no earned value'
type: 'feature'
created: '2026-10-10'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'dbf2b338bb35feb836e581d131b48b40f0549426'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-1-every-figure-comes-from-pinned-inputs-and-a-test-proves-it.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 6.1 pinned `ComputationInputs`, but FR-30 EVM still has AC gaps: PV uses per-WP `divRoundHalfEven` instead of AD-4 largest-remainder (date → resource id), EV falls are not flagged in Review, and the money/Internal layer needs to stay honest beside dual CPI — while Unplanned stays AC-only (PV=EV=0).

**Approach:** Close Story 6.2 ACs on the existing `domain/evm` + `review` path: replace PV allocation with largest-remainder (bump `formulaVersion`, keep `evm-2026-09-20` executable), wire an EV-fall Review signal, verify baseline-at-record Unplanned + dual CPI + money Internal footnote, and ensure Review only feeds pinned inputs into `computeEvm`. No big-bang rewrite of green paths; no 6.3 formula popovers / 6.5–6.9 surfaces.

## Boundaries & Constraints

**Always:** Pure `computeEvm` stays DB-free and reads only caller-supplied pin fields; Unplanned Project line has PV=EV=0; both CPIs always computed (all-in + planned-scope); ratios from summed PV/EV/AC never averaged; % Complete never from burned effort (estimate/count/no-evidence, 99% cap, low evidence); money = hours×Rate Internal-only with CPI-money diverge caption; new `formulaVersion` keeps `evm-2026-09-20` goldens recomputable; consume 6.1 pin/ledger filter/shared-lock without rewriting them.

**Never:** Story 6.3 formula popovers / EAC method picker UI; Health (6.5), Forecast finishes (6.6), Review layout (6.7), date causes (6.8), Dispositions / split-pin re-capture (6.9), Observed-vs-Recorded Accept (6.4); Epic 5 residuals 33/35/37; Story 3.1; Epic 7–8; edit `epics.md`; migrations unless an Open Question forces one; fake deferred 6.1 items (calendar AD-29 live resolve, multi-Connector ticket pin, injectable lock probe, fuller golden ReviewResult).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mid-window PV | Baselined leaf WP, as-of inside baseline working days | PV = sum of largest-remainder day×resource cells up to as-of; cell ties date asc then resource id asc | N/A |
| PV before/after | as-of < start / ≥ finish | 0 / full `baselineMh` | N/A |
| No assigned resources | Empty `assignedResourceIds` | Day-only largest remainder (single anonymous resource bucket) | N/A |
| AC attribution | Ledger + Mapping head at `mapping_seq_max` | AC by current Mapping; Unplanned buckets from attribution | N/A |
| Baseline-at-record | Entry stamped with older Baseline seq; WP later rebinned | Earlier hours stay Unplanned; new hours follow new Baseline | Missing/`null` stamp → not baselined for that entry |
| % Complete | Estimate vs count vs none; <3 tickets; no actual finish | Bases/flags/99% cap per FR-30 | N/A |
| EV fall | Per Harry Q1 decision | Flagged on Review for affected WP(s) | No prior → no flag (never invent) |
| Dual CPI / roll-up | Hours-basis Project with Unplanned AC | `cpiAllIn` = EV/total AC; `cpiPlannedScope` = EV/baselined AC; Project AC = baselined + Unplanned line PV=EV=0 | Ticket-Count Mode → AC-family unavailable |
| Money Internal | PM Review | PV/EV yen + AC yen Internal; caption that CPI-in-money can differ from hours | Client View does not show Internal money |

</frozen-after-approval>

## Open Questions

- **Q1 EV-fall prior** — how does Review know EV fell? options: **A** optional `priorEvByWp` (Mh map) on `ComputationInputs`/`ReviewInput`; flag when current per-WP EV < prior; loader fills from last open Review / prior as-of when available, else empty (no flags) / **B** store prior per-WP EV inside a new append-only Review snapshot table this story (heavier; migration) / **C** detect reopen only from Ticket status history without a prior EV pin (needs observation history the pin does not currently carry — likely incomplete)
- **Q2 PV resource source** — BAC/PV largest-remainder resource axis? options: **A** live `WorkPackage.assignedResourceIds` at compute time (matches AC “resource id”; mutable → PV can move without Re-baseline; document as known R0 pin hole, same class as deferred calendar live resolve) / **B** day-only largest remainder for R0 (ignore resource split; resource-id tie-break unused / single bucket) — stabler under pin, weaker vs AD-4 wording / **C** pin assigned resources onto `baseline_wp` this story (schema + Baseline capture change — irreversible shape)

## Code Map

- `packages/domain/src/evm.ts:111–124,166–270` — `plannedValue` today `divRoundHalfEven(elapsed/total)`; `percentComplete`, Unplanned via caller AC, dual CPI, Typical EAC already green. Replace PV with largest-remainder; bump `FORMULA_VERSION`; keep legacy path for `evm-2026-09-20`.
- `packages/domain/src/evm.test.ts` — PV/mid-window and golden EVM cases; extend for remainder ties + EV-fall field if added on `EvmResult`/`WpMeasure`.
- `packages/domain/src/units.ts` — add shared `allocateLargestRemainder` (or sibling); reuse `divRoundHalfEven` only for hours×Rate (`costOf`), not PV.
- `packages/domain/src/attribution.ts:336–426` — **already** judges baselined-ness via `e.activeBaselineVersionSeq`; reuse; add/strengthen re-baseline “earlier stay Unplanned” tests if thin.
- `packages/domain/src/review.ts:406–425,684–690,774+` — wires `computeEvm` from pin; `money` PV/EV at Project default Rate; Divergence rows. Add EV-fall flag plumbing + any `priorEvByWp` field on `ReviewInput`.
- `packages/domain/src/formula-version.ts` — registry must keep old key executable after bump.
- `packages/domain/src/formula-corpus/` + `golden-recompute.test.ts` — new-version fixture and/or expected PV updates; do not break `evm-2026-09-20`.
- `packages/domain/src/types.ts:157–168,75–81` — `BaselineWp` has no resources; `LedgerEntry.activeBaselineVersionSeq` already stamped.
- `apps/web/src/app/p/[projectId]/review/page.tsx:551–689` — Effort & Cost dual CPI + `cpi_money_footnote` + `<Internal />`; surface EV-fall tag (thin) without 6.3 popovers / 6.7 layout rewrite.
- `packages/domain/src/computation-inputs.ts` / `review.ts` `ReviewInput` — extend only for Q1-A prior map if chosen; do not rewrite pin capture.
- Out of scope to change: `watermark-lock.ts`, ledger filter (`ledger-pin.ts`), Epic 5 residuals, Health/Forecast formula bodies beyond consuming existing EVM outputs.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/domain/src/units.ts` (+ tests) — `allocateLargestRemainder` cells with tie-break (date asc, resource id asc).
- [ ] `packages/domain/src/evm.ts` (+ `evm.test.ts`) — PV via day×resource largest remainder; bump `FORMULA_VERSION`; branch legacy PV for `evm-2026-09-20`; EV-fall field per Q1.
- [ ] `packages/domain/src/formula-version.ts` + `formula-corpus/` — register new version; keep old goldens green; add/adjust fixture for new PV.
- [ ] `packages/domain/src/attribution.test.ts` — assert re-baseline: pre-stamp hours stay Unplanned; post-stamp hours baselined.
- [ ] `packages/domain/src/review.ts` (+ tests) — pass pinned inputs only; wire prior-EV (Q1); expose fall flags on Divergence/ReviewResult; money layer unchanged except gaps vs AC.
- [ ] `apps/web/.../review/page.tsx` (+ i18n if needed) — thin EV-fall flag; keep Internal money column + CPI-money footnote; no formula popovers.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` — `6-2-…` → in-progress when impl starts; keep `6-1-…: done`.
- [ ] Unit tests for matrix rows (PV edges, dual CPI, Unplanned line, money caption presence).

**Acceptance Criteria:**
- Given baselined leaf WP hours, when PV is computed, then milli-hours use largest remainder over baseline working days (and resources per Q2), ties date then resource id (FR-30, AR-6).
- Given Actuals Ledger + Mapping at `mapping_seq_max`, when AC is computed, then attribution follows current Mapping (FR-30, AR-18).
- Given Mapped Tickets, when % Complete is derived, then estimate/count/no-evidence, 99% cap, low-evidence flags hold and never use burned effort (FR-30).
- Given EV, when it falls per Q1, then Review flags it (FR-30).
- Given Unplanned Work, when rolled up, then Project AC = baselined leaf AC + Unplanned line with PV=EV=0 (FR-30).
- Given a ledger entry, when baselined-ness is judged, then Baseline active at record time wins; earlier Unplanned hours survive Re-baseline (FR-30).
- Given two CPIs, when shown, then all-in and planned-scope both appear; EAC uses all-in (FR-30).
- Given money, when shown Internal, then hours×Rate with caption that CPI-in-money can differ (FR-30, UX-DR28).
- Given any ratio roll-up, when computed, then from summed PV/EV/AC never averaged (FR-30).
- Given `formulaVersion` change, when CI runs, then every registered version still recomputes its goldens (AR-19).

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

- **PV cells (AD-4):** Split `baselineMh` across resources (Q2), then across working days in the Baseline window as equal quotients + remainders; assign remainders to cells with largest fractional part; ties `(date asc, resourceId asc)`. PV(asOf) = sum of cells with `date ≤ asOf` (working days only). Empty resource list → one anonymous id so day-only LR.
- **formulaVersion:** PV algorithm change requires a new key; `evm-2026-09-20` keeps `divRoundHalfEven` PV so 6.1 goldens stay byte-stable.
- **Money:** Keep PV/EV yen at Project default Rate; AC yen from attribution per-entry rates; footnote already states CPI-money can diverge — do not invent money CPI unless a later story asks.
- **Reuse 6.1:** Capture/filter/closure untouched; `computeEvm` remains pure over pin-derived `EvmInput`.

## Verification

**Commands:**
- `pnpm lint` — exit 0
- `pnpm exec tsc -b` (or repo typecheck) — exit 0
- `pnpm depcruise` — exit 0
- `pnpm test` — exit 0; PV remainder, Unplanned stamp, EV-fall, dual CPI, formulaVersion dual-key goldens green

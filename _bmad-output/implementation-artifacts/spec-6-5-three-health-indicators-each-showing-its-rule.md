---
title: '6.5 — Three Health Indicators, each showing its rule'
type: 'feature'
created: '2026-10-10'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: 'a09555fca33e25041e91be52c8b0aaf1c6e84baf'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Review Status shows Health colours and rule captions that only cover SPI/CPI/TCPI bands plus calendar Milestone slip. Thresholds are hard-coded on the Project config with no Tenant default / Project override resolve, no `tenant_setting_event`, and Schedule ignores negative Float, unmet *must finish on*, and derived-date Milestone slip — so a client cannot see why a project is amber for the FR-31 reasons.

**Approach:** Create `tenant_setting_event`, resolve thresholds (Project override at `setting_seq_max` else Tenant default at `tenant_setting_seq_max`) in one `domain/health` function with source stamped into Review inputs, close the Schedule/Effort/Unplanned rule gaps against schedule outputs and Unplanned shares, and render each indicator as glyph + word + rule with threshold/driver disclosure — without owning Forecast finishes (6.6), Review page reorder (6.7), seven causes (6.8), or Dispositions (6.9).

## Boundaries & Constraints

**Always:**
- **Q1→A:** Create `tenant_setting_event` + Project override storage on `project_setting_event`; seed Tenant defaults; resolve + pin + show source; **no** settings editor UI this story.
- **Q2→A:** Health disclosure reuses Story 6.3 formula-popover pattern (click/Enter + Esc, focus return) per indicator.
- **Q3→A:** Bump `FORMULA_VERSION` and keep the prior key executable (goldens for both).
- **Token:** Keep full spec (Harry override of 1600-token band).
- Threshold comparison only via `compareRatio` (AR-6); rounding only in `domain/present`.
- One resolve function in `domain/health`; store resolved thresholds + source in snapshot/Review inputs (FR-31, AR-19, A1).
- Create `tenant_setting_event` as `append_only` (registry + migrate + RLS/triggers/grants via `pnpm db:sql` / house pattern). Project overrides reuse `project_setting_event` (no second project-settings table).
- Defaults: SPI/CPI ≥0.95 green, ≥0.85 amber, else red; TCPI >1.1 or BAC exhausted → Effort/Cost red regardless of CPI; Unplanned Period share (ex Opening Balances) <10% / 10–20% / >20%; cumulative share shown beside.
- Schedule extras from schedule outputs: calendar Milestone slip ≥amber; derived date past Baseline ≥amber and **name which rule**; negative Float vs Project finish → red (say when Float is relative); unmet *must finish on* ≥amber, red on Milestone; name worst violation + working days late.
- Overall = worst of three; never green while Schedule is red.
- Glyph + word + rule on every indicator; hover/focus reveals threshold rule + driving figure (UX-DR26, NFR-U1).
- Keep `6-1`…`6-4` done; set `6-5-…` → `in-progress` when impl starts.
- Consume schedule Float / violations / derived dates — do not re-derive engine semantics inside health.

**Never:**
- Rewrite EVM identities, Accept/Observed-vs-Recorded (6.4), or formula-metric math (6.3) except thin Health co-display of CPI beside TCPI.
- Forecast / both finish dates (6.6), full Review reorder/chrome (6.7), seven-cause list (6.8), Disposition queue (6.9), SM-C4.
- Epic 5 residuals, Story 3.1, Epic 7–8.
- Move `compareRatio` out of `health.ts`; invent a second Project settings table; hand-edit generated `sql/*.sql`.
- Big-bang rewrite of green `computeHealth` SPI/CPI/Unplanned band paths.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Resolve Tenant default | No Project Health override ≤ `setting_seq_max` | Thresholds from `tenant_setting_event` head ≤ `tenant_setting_seq_max`; source `tenant` | Missing Tenant head → seed/DEFAULT_THRESHOLDS with declared source |
| Resolve Project override | Project setting event carries threshold override ≤ pin | Those values win; source `project`; shown next to indicator | Partial override keys fall through to Tenant for unset keys |
| SPI/CPI bands | Exact ratios on 0.95 / 0.85 boundaries | Cross-multiply via `compareRatio` only | Never float-compare |
| TCPI / BAC | TCPI > 1.1 or BAC exhausted | Effort/Cost red whatever CPI; CPI shown next to TCPI | CPI unavailable → existing unavailable path |
| Unplanned Period | Period share ex OB | Colour from Period share; cumulative share rendered beside | Null Period share → unavailable (existing copy) |
| Milestone calendar slip | Past Baseline, no actual finish | Schedule ≥ amber; rule names calendar slip | SPI green still forced ≥ amber |
| Milestone derived slip | Derived finish later than Baseline finish; date not yet past | Schedule ≥ amber; rule names derived-slip (and which of two if both) | No Baseline / no derived → rule silent |
| Negative Float | `min(floatDays)` < 0 vs Project finish anchor | Schedule red whatever SPI | Relative Float (computed-finish anchor) → rule says cannot fire / plan not implied safe |
| Unmet MFO | `must_finish_on` violation | ≥ amber; red if Milestone; names worst + days late | Separate from Float rule |
| Overall | Schedule red, CPI > 1 | Overall red (never green) | unavailable ranks between green and amber |

</frozen-after-approval>

## Code Map

- `packages/domain/src/health.ts` (`compareRatio`, `computeHealth`, `HealthInput`, `HealthIndicator`) — **extend** resolveThresholds; Float / MFO / derived-slip rules; keep SPI/CPI/Unplanned band cores; TCPI path shows CPI beside.
- `packages/domain/src/types.ts` (`DEFAULT_THRESHOLDS`, `ProjectConfig.thresholds`) — **reuse** bands; wrap with source-aware resolved type.
- `packages/domain/src/review.ts` (`computeReview`, `settingSeqMax`, `tenantSettingSeqMax`, `sharePeriod`/`shareCumulative`, milestones) — **wire** schedule outputs (float, violations, derived finishes) into `computeHealth`; stamp resolved thresholds+source on result/inputs; surface cumulative beside Unplanned.
- `packages/domain/src/schedule/recalculate.ts` (`ScheduleOutputs`, `floatDays`, `ConstraintViolation`, `ScheduleAnchor`) — **consume** only; do not change engine.
- `packages/domain/src/schedule/divergence-from-pin.ts` / plan Baseline dates — **reuse** for derived vs Baseline Milestone compare where Review already has Baseline finishes.
- `packages/domain/src/formula-version.ts` + `evm.ts` `FORMULA_VERSION` — per Q3.
- `packages/db/src/schema.ts` — **add** `tenant_setting_event`; **extend** `project_setting_event` for Health override fields (nullable; null = no override).
- `packages/db/src/table-classes.ts` + `pnpm db:sql` — register append-only; regenerate RLS/triggers/grants (never hand-edit `sql/*.sql`).
- `packages/db/src/repo.ts` / Review loaders — capture heads ≤ pins; stop hard-coding only `DEFAULT_THRESHOLDS` when Tenant head exists.
- `apps/web/.../review/page.tsx` + `apps/web/src/components/ui.tsx` (`HealthBadge` / GLYPH) — glyph+word+rule already partial; add disclosure per Q2; show override source + cumulative Unplanned; CPI beside TCPI on Effort/Cost.
- `packages/i18n` EN/JA — new Health rule/source/float/MFO/derived-slip strings; key parity.
- Out of scope: Forecast body, Disposition writers, Accept flow, Epic 5 residuals, Review section reorder.

## Tasks & Acceptance

**Execution:**
- [x] `packages/db` (schema + drizzle + registry + `db:sql`) — create `tenant_setting_event`; extend `project_setting_event` for Health overrides; seed Tenant defaults.
- [x] `packages/domain/src/health.ts` (+ tests) — `resolveThresholds`; Float / MFO / derived-slip / TCPI+CPI / cumulative-beside; matrix cases via `compareRatio`.
- [x] `packages/domain/src/review.ts` (+ tests) — feed schedule outputs + pins into health; stamp resolved thresholds+source.
- [x] `packages/db` / app load path — read Tenant/Project heads at pins into Review inputs.
- [x] `apps/web` Review Status + `HealthBadge` — glyph+word+rule; disclosure (Q2); source; cumulative; CPI beside TCPI.
- [x] `packages/i18n` — EN/JA parity for new copy.
- [x] `_bmad-output/.../sprint-status.yaml` — `6-5-…` → `in-progress` at impl start.
- [x] Unit tests for I/O matrix rows (boundaries, Float relative, MFO Milestone red, dual Milestone rules named, overall never green while Schedule red).

**Acceptance Criteria:**
- Given thresholds, when resolved, then Project override at `setting_seq_max` else Tenant `tenant_setting_event` at `tenant_setting_seq_max`, one `domain/health` resolve, value+source in inputs.
- Given defaults, when applied, then SPI/CPI/TCPI/Unplanned bands match FR-31; Unplanned uses Period share ex OB with cumulative beside.
- Given any comparison, when made, then only `compareRatio`.
- Given Schedule inputs, when computed, then calendar slip, derived slip (named), negative Float (or relative-Float copy), and unmet MFO (Milestone → red, worst+days) fire as FR-31.
- Given TCPI cross / BAC exhausted, when Effort/Cost renders, then red whatever CPI with CPI shown next to TCPI.
- Given overall, when computed, then worst of three and never green while Schedule is red.
- Given any indicator, when rendered, then glyph + word + rule; hover/focus shows threshold rule + driving figure.

## Implementation Notes

- 2026-10-10: Started impl on `cursor/story-6-5-health-indicators-e064`. Sprint `6-5-…` already `in-progress`. Fixed drizzle meta `0013`/`0014` snapshots (missing `identity.schema`) so `drizzle-kit generate` can emit `0015`.
- 2026-10-10: Schema — `tenant_setting_event` (append-only, exact ratio num/den columns) + nullable Health override pairs on `project_setting_event` (pair + den≠0 CHECKs). Migration `0015_tenant_setting_and_health_overrides.sql`. Registry + `pnpm db:sql` regenerated. Seed writes Tenant DEFAULT_THRESHOLDS head on Tenant create.
- 2026-10-10: Domain — `resolveThresholds` (Project → Tenant → DEFAULT); `HealthScheduleFeed` for Float / MFO / derived-slip; TCPI path shows CPI beside; Unplanned driver shows cumulative; every indicator carries `disclosure`. `FORMULA_VERSION` → `evm-2026-10-11`; prior `evm-2026-10-10` kept executable (`PRIOR_FORMULA_VERSION`) with corpus fixture copy.
- 2026-10-10: Review — builds schedule feed from `scheduleHealth` + Baseline milestones; stamps `health.resolvedThresholds` on result. Repo loads Tenant/Project setting heads + decodes pinned `schedule_run` outputs into `scheduleHealth`.
- 2026-10-10: UI — `HealthBadge` click/Enter disclosure (Esc focus return, Q2); Status shows threshold source; i18n EN/JA keys for source/disclosure/float/MFO/slip.
- 2026-10-10: Verified `pnpm typecheck`, `pnpm lint`, `pnpm test` (1572 passed). No live Postgres in this environment — migration not applied here; `db:sql` write-only succeeded. Spurious drizzle DROP/ADD of `pct_override_event_source_check` in 0015 is expand-safe (same constraint text).

## Spec Change Log

## Review Triage Log

## Design Notes

- **A1 (founder):** Tenant defaults + per-Project override — Project overrides live on `project_setting_event`; Tenant defaults on new `tenant_setting_event`.
- **Period Unplanned:** Attribution already excludes `opening_balance` from Period buckets — do not re-filter ad hoc in health.
- **Schedule feed:** Prefer pinned `schedule_run.outputs` (floatDays, violations, early finishes) over re-reading live WP columns.
- **Continuity from 6.3/6.4:** Keep formula popovers and Observed-vs-Recorded Progress & Dates; do not regress Accept or BAC-exhausted copy.

## Verification

**Commands:**
- `pnpm exec tsc -b` — exit 0
- `pnpm test` (domain health/review + db registry/schema as applicable) — matrix green
- `pnpm lint` — exit 0 when runnable
- `pnpm db:sql` / migrate path — registry includes `tenant_setting_event`; no hand-edited SQL drift

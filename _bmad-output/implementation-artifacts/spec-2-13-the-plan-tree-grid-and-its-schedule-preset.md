---
title: 'Story 2.13 — The Plan tree grid and its Schedule preset'
type: 'feature'
created: '2026-09-25'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '6c9f53371babaa1630b71d0886ab0ef96d446715'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-momo-keikaku-2026-09-20/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The engine, fence, and calendar publish are done (2.3–2.12), but Plan is still a thin WBS ledger (`plan/page.tsx`) with no ARIA treegrid, no Schedule preset columns from `wp_schedule` / latest `schedule_run`, and no keyboard preset switch — so R0 has no real scheduling surface (FR-7 / OQ-11 surface line).

**Approach:** Ship a Plan **ARIA treegrid** with visually frozen WBS / Name / state, the **Schedule** preset as default (derived dates, duration, predecessors, constraint, Float, Critical, Exception, Recorded %), Progress Epic-2 columns, preset keys that keep focus, Data Date muted/full ink, and a new **plan-grid read** that joins tree + schedule outputs through `compareWp`. Inline-edit duration / name / Recorded % through the fence; keep 2.10/2.11 thin controls. Strip chrome / What-moved behaviour → 2.15; predecessor/constraint typing UX → 2.14; exceptions rail + explainers → 2.16.

**Decisions (founder, 2026-09-25):**
- **Keep the full spec** (~2600 tokens accepted; same posture as 2.10–2.12).
- **Q1 → A.** Structural layout slots only: minimal schedule-strip slot, toolbar (preset switcher), empty What-moved slot, empty exceptions-rail slot — UX-DR2 order without 2.15/2.16 behaviour. (Founder allowed A or B; A chosen to honour epic layout AC.)
- **Q2 → B.** Inline edit duration, name, and Recorded % through the fence (`Enter` / blur / `Tab` / `Esc`); predecessors and constraints stay display-only until 2.14.
- **Q3 → A.** Persist preset in client `localStorage` keyed by user + project (no schema / migration).
- **Q4 → A.** Switcher shows **Schedule** + **Progress** only (Progress omits Observed % / Gap / Evidence). Baseline compare and All absent or disabled as "later"; keys `1`/`2` switch those two; `3`/`4` no-op or disabled until later epics.

## Boundaries & Constraints

**Always:**
- Layout slots in UX-DR2 order (Q1→A): schedule-strip slot → toolbar (preset switcher) → What-moved slot (empty until 2.15) → tree grid; exceptions-rail slot to the right (empty until 2.16). Slots exist; strip/rail/What-moved **behaviour** stays later.
- ARIA treegrid with `aria-level` / `aria-expanded` / `aria-posinset` / `aria-setsize`; frozen leading three columns are **visual only** (same DOM row / reading order) (UX-DR3, UX-DR24).
- Planned dates are never typed or dragged; derived-date teaching refuse from 2.10 stays (FR-5, UX-DR12, UX-DR25).
- Schedule preset (default) after freeze: derived start/finish, duration, predecessors, constraint, Float, Critical, Exception, and **Recorded %** (epic AC / UX-DR12). Fit ~1,229px against 1,232px at 1280px with sidebar collapsed (UX-DR4); mockup: `ux-…/mockups/plan-tree-grid.html`.
- Data Date ink: dates ≤ Data Date muted, after full ink (UX-DR12). Summary scheduling cells: em dash + accessible name "not applicable — summary work package, rolled up from its children" — never blank.
- Negative Float keeps minus + health-red; Critical = word + bar glyph + 3px left rule; Float header names anchor ("vs Project finish" / "vs computed finish"); not-schedulable dates/Float/Critical show "—".
- Exception cell: glyph + word + number from latest run outputs (violation / out-of-sequence / not-schedulable) — never colour alone; full explainer popover stays 2.16.
- Progress preset (Q4→A): actual start/finish, Recorded %, remaining duration (recompute live via `ceil(duration × (1 − recorded_pct))`, ≥1 when duration present — `remainingDays` is not stored). No Observed % / Gap / Evidence columns. Baseline compare / All not shipped.
- Inline edit (Q2→B): leaf **name**, **duration**, and **Recorded %** commit through `applyPlanChange` on blur / `Enter` / `Tab`; `Esc` cancels. Predecessors and constraints are display-only (2.14). FR-6a refuse → nothing written, no recalc.
- Keys `1` = Schedule, `2` = Progress change preset without losing focused row; persist via `localStorage` user+project (Q3→A). Keys `3`/`4` reserved/disabled (Q4→A).
- Row order is `compareWp` (AD-28), never SQL `ORDER BY wbs_code` alone.
- Reads go through a new authorised plan-grid use case; writes only through `applyPlanChange` — no second mutator (AR-43).
- Keep 2.10/2.11 thin Plan behaviours: no-start band / Set Project start, complete, delete confirm, derived-date refuse, first-observed.

**Never:**
- No full schedule-strip sticky chrome / Float-anchor sentence / What-moved behaviour (2.15) — slots only (Q1→A). No predecessor/constraint MS-Project typing + under-cell FR-6a UX (2.14). No exceptions rail + three explainers (2.16) — rail slot empty. No Gantt / bar drag (R1). No Baseline-compare columns (Epic 4). No Observed/Gap/Evidence columns or writers (Epics 5–6). No Comfort **All** preset.
- Do not invent weekends or calendar versions; do not edit `wp_schedule` from the UI; do not store planned dates on `work_package`.
- No migration (Q3→A; columns already exist).
- Do not replace fence mutation kinds; do not pull Organisation UI (2.17).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Schedule default | Project with successful latest run | Treegrid in slot layout; Schedule columns from `wp_schedule` + inputs; Float header names anchor; Critical per UX-DR12 | Missing/halted run → dates/Float/Critical "—"; stale acknowledged |
| Data Date ink | Leaf with early dates straddling Data Date | On/before muted; after full ink | No Data Date / no start → existing no-start band; derived "—" |
| Summary row | Non-leaf WP | Scheduling cells em dash + a11y name; name editable; duration / Recorded % not applicable | N/A |
| Negative Float / Critical | Late plan vs Project finish | Minus Float in health-red; Critical word+glyph+left rule | Complete / not-schedulable → no Critical / "—" |
| Exception cell | Violation / OOS / no duration | Glyph+word+number in cell; rail slot empty | No exception → empty (leaf) / em dash (summary) |
| Preset keys | Focus on a row; press `1` / `2` | Preset switches; same row focused; `localStorage` updated | `3`/`4` no-op/disabled; unknown ignored |
| Inline duration/name/% | Leaf edit commit (Q2→B) | Fence mutation; recalc when inputs change; grid refreshes | Invalid → refuse, cell keeps draft or reverts per existing fence UX |
| Derived date edit | Type into derived start/finish | Teaching refuse; focus toward constraint (display-only); no write | Same 2.10 message |
| FR-6a refuse | Fence rejects duration/name/% | Nothing committed; no recalc | Surface error on cell |
| 500-WP load | Epic 1 fixture Project | Structural + smoke load | Formal p75 harness → deferred-work if not built |

</frozen-after-approval>

## Code Map

- `apps/web/src/app/p/[projectId]/plan/page.tsx` — replace thin ledger table with Plan layout + treegrid host; keep no-start band / thin actions colocated. Today: `getProjectReview` + `planThinUiState`; columns are baseline/actual hours — **not** schedule outputs.
- `apps/web/src/components/plan-thin-edit.tsx` + `plan/actions.ts` — **reuse** complete / delete / derived refuse / set-start; wire any new inline mutations through `applyPlanMutationAction` → `planChange`.
- `packages/app/src/schedule/plan-edit.ts` `getPlanThinUiState` — keeps settings/constraints; **add or sibling** `getPlanGridState` (name TBD) returning ordered rows: WP tree fields + `wp_schedule` projection + edges for predecessor display + latest run `anchor` / `computedFinish` / halted / decoded exception lists + pct heads. Do not grow thin UI into a second fence.
- `packages/db/src/repositories/schedule/index.ts` — `latestRun` already returns outputs/anchor; **add** `loadWpSchedule(projectId)` (or join in the use case) reading `wp_schedule` columns (`earlyStart/Finish`, `late*`, `floatDays`, `isCritical`, `state`, `notSchedulableReason`, `stale`). Writers stay fence-only.
- `packages/db/src/repositories/plan-input/index.ts` — list live WPs (name, wbs, parent, duration, constraint, actual heads, pct) + edges for predecessor text; reuse existing list helpers where present.
- `packages/domain/src/schedule/order.ts` `compareWp` — **only** display order; sort after load.
- `packages/domain/src/schedule/stored-run.ts` — decode latest `outputs` for violations / out-of-sequence / driving predecessors / critical path; do not put `remainingDays` back into storage — recompute for Progress.
- `packages/domain/src/schedule/recalculate.ts` `WpScheduleOutput` / `ScheduleOutputs` — field contract for Exception + Float + Critical rendering.
- `apps/web` Plan grid components (**new**) — ARIA treegrid; sticky visual freeze; Schedule + Progress column sets; Data Date ink; Critical/Float/Exception renderers; layout slots (Q1→A); `localStorage` preset (Q3→A). Prefer existing web primitives; else minimal custom matching EXPERIENCE.
- `_bmad-output/planning-artifacts/ux-designs/ux-momo-keikaku-2026-09-20/{EXPERIENCE.md,mockups/plan-tree-grid.html,DESIGN.md}` — visual + column width reference (330px frozen + 899px scroll).
- Continuity from 2.12 (done): calendar publish + settings stay; Never was "No tree grid / Schedule preset" — this story owns the grid. Do not disturb calendar or Project settings writers.
- `tests/` — plan-grid coverage: order, ink, summary em dash, Float/Critical, preset focus + `localStorage`, inline duration/name/% fence commits, teaching refuse. Unit/component + load smoke; no new e2e harness required.

## Tasks & Acceptance

**Execution:**
- [x] `packages/db/.../schedule` (+ plan-input reads) — read `wp_schedule` + WP/edge fields for the grid; writers unchanged (existing fence kinds cover Q2→B).
- [x] `packages/app/src/schedule/plan-grid*.ts` (or extend `plan-edit.ts`) — authorised `getPlanGridState`; `compareWp` order; Data Date + latest-run anchor/exceptions.
- [x] `apps/web/.../plan/` + grid components — ARIA treegrid; Q1→A slots; Schedule + Progress (Q4→A); freeze/ink/Float/Critical/Exception/summary; keys `1`/`2` + `localStorage` (Q3→A).
- [x] `apps/web` server actions — wire name / duration / recorded_% (Q2→B) through existing fence; keep 2.10/2.11 thin flows; pred/constraint display-only.
- [x] `tests/` — matrix + inline-edit refuse/commit + preset focus persistence; load smoke where practical.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` — append residues (formal NFR-P1 harness, strip/What-moved behaviour, rail explainers, Baseline/All, Observed columns) only if they surface.

**Acceptance Criteria:**
- Given the Plan surface, when it renders, then UX-DR2 slot order is present (Q1→A) and the treegrid is an ARIA treegrid with the frozen three visually sticky but one reading-order row.
- Given Schedule preset (default), when it renders, then derived start/finish, duration, predecessors, constraint, Float, Critical, Exception, and Recorded % appear after the freeze and fit the measured width intent.
- Given Data Date and leaf dates, when rows render, then muted/full ink splits on/before vs after; summaries use named em dashes; negative Float keeps its sign; Critical uses word+glyph+left rule with anchor in the header.
- Given keys `1` / `2` with a focused row, when pressed, then Schedule/Progress switches without losing that row and `localStorage` persists the choice; `3`/`4` do not enable Baseline/All.
- Given Progress preset, when it renders, then actuals, Recorded %, and remaining duration appear; Observed/Gap/Evidence and Baseline/All are absent (Q4→A).
- Given inline name / duration / Recorded % on a leaf, when committed, then the fence writes and recalc runs when inputs change; predecessors/constraints are not editable here.
- Given a derived-date edit attempt, when committed, then teaching refuse fires and nothing is written.
- Given `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test`, when they run, then all exit 0.

## Implementation Notes

- 2026-09-25: Shipped Plan ARIA treegrid with Schedule (default) + Progress presets.
  - DB: `schedule.loadWpSchedule`, `plan-input.listLiveWorkPackages` / `listLiveDependencies`.
  - App: authorised `getPlanGridState` (`plan-grid.ts`) — `compareWp` order, Data Date + latest-run exceptions/anchor, remaining duration recomputed via `remainingDuration`.
  - Web: UX-DR2 slots (strip / toolbar / What-moved / treegrid / empty rail); visual sticky freeze; keys `1`/`2` + `localStorage` per user+project; `3`/`4` disabled; inline name/duration/Recorded % through fence; pred/constraint display-only; teaching refuse on derived dates.
  - Tests: `plan-grid.test.ts`, `plan-grid-format.test.ts`, `plan-tree-grid.test.ts` smoke.
  - Deferred: formal NFR-P1 p75 harness, strip/What-moved behaviour (2.15), rail explainers (2.16), Baseline/All + Observed columns — appended to `deferred-work.md`.

## Spec Change Log

## Review Triage Log

## Design Notes

**Surface line, not engine.** 2.13 does not change passes, causes, or calendar publish. It is the first consumer of `wp_schedule` + decoded `schedule_run.outputs` on the Plan page.

**Exception without the rail.** UX-DR12 still requires the cell. Decode violations / OOS / not-schedulable from the latest run; map to glyph+word+number. Rail + explainer walk stay 2.16.

**Remaining duration.** Stored outputs strip `remainingDays` (2.9 Q1→B). Progress recomputes with the FR-6b formula from duration + Recorded % heads — never invent a second stored column.

**Order.** Plan page today sorts by SQL `wbsCode`. Grid must sort with `compareWp` so Critical path / report order matches the engine.

**NFR-P1.** Fixture load smoke (row count / render budget); formal p75 harness deferred unless requested — append to `deferred-work.md` if not built.

**Inline edit leaf rule (Q2→B).** Duration and Recorded % only on leaves (schema leaf-only CHECKs). Name editable on summary and leaf. Pred/constraint cells render but do not open editors.

## Verification

**Commands:**
- `pnpm lint` — expected: exit 0
- `pnpm typecheck` — expected: exit 0
- `pnpm depcruise` — expected: exit 0
- `pnpm test` — expected: exit 0 (includes new plan-grid coverage)

**Manual checks (if no CLI):**
- Keyboard: treegrid focus, expand/collapse, `1`–`4` preset without losing row; visual freeze of leading three at 1280px collapsed sidebar.
- Cells: negative Float, Critical row rule, Data Date ink, summary em dash accessible name, Exception glyph+word+number on a known fixture.

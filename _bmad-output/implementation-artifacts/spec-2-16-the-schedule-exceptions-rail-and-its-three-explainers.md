---
title: 'Story 2.16 — The schedule-exceptions rail and its three explainers'
type: 'feature'
created: '2026-09-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '23cd19b1a0da3f5c3a8641cdfaf50149d78dbd6b'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-momo-keikaku-2026-09-20/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Plan already paints Exception cells (glyph+word+number) and mounts an empty `exceptions-rail-slot`, but there is no ranked queue to walk, no drawer with a counted toggle, and no explainer that names the chain, calendar version, or the honesty line about Float — so FR-6b / UX-DR8 / UX-DR9 stay unmet.

**Approach:** Fill the existing rail slot with three collapsible groups (violations → out-of-sequence → not-schedulable), a ≥1680px pinned column / below-1680 drawer whose toolbar toggle always shows the total count, and three non-modal explainers (violation / OOS / not-schedulable with duration fix via existing `patch_duration`). Reuse stored-run lists and Exception vocabulary; extend `getPlanGridState` so the rail gets full fields the cell currently discards. Keyboard: `j`/`k`/`Enter`/`e`/`x` (UX-DR24). Ship full **calendar_range** halt banner chrome; Comfort chain walk on the violation explainer.

**Decisions (founder, 2026-09-26):**
- **Keep the full spec** (~2000 tokens accepted; same posture as 2.10–2.15).
- **Q1 → A.** Full chrome for `calendar_range` halt (range-halt banner deferred from 2.12). Illegal-edge "This plan cannot be scheduled…" band deferred — fence refuses `graph_invalid` at write time (FR-6a); see `deferred-work.md`.
- **Q2 → B.** Include Comfort walkable chain: arrow keys move along the predecessor chain; each entry focuses that WP behind the popover.

## Boundaries & Constraints

**Always:**
- Fill `PLAN_GRID_SLOTS[4]` (`exceptions-rail-slot`) only — keep UX-DR2 order; do not invent a second layout (2.13 Q1→A).
- Three groups, fixed order, each with count (UX-DR8): Constraint violations (days-late worst first, then `compareWp`), Out-of-sequence links, Not schedulable yet. Groups with count > 0 expand by default; empty groups stay collapsed.
- Empty rail says **"No schedule exceptions"** — never vanishes (still occupies the pinned column at ≥1680).
- ≥1680px: pinned column; below: drawer closed by default. Toolbar gets a dedicated **exceptions toggle** (not inside the preset segment) that **always carries the total count** (UX-DR8 / UX-DR27). Below 1680: toggle opens/closes the drawer. ≥1680: rail stays pinned; toggle may be visually subdued but the count remains available to AT.
- Rail items use the same glyph+word+number vocabulary as Exception cells (`▲ Late Nd` / `◆ Late Nd`, `⇄ Out of sequence`, `⊘ No duration`) — never colour alone (UX-DR12).
- Violation explainer: asked date, derived date, working days late, Holiday Calendar version (from run `versionSeq` / inputs.calendar), predecessor chain as a **walkable list** (Q2→B), closing honesty line: *"This violation stays on this work package. It has not changed any other work package's Float."*
- Chain walk (Q2→B): ArrowUp/Down move along the chain; popover **stays open**; grid scrolls and focuses that WP; keyboard stays on the chain list until `Esc` closes the explainer.
- OOS explainer: neutral fact prose; **no fix**; never amber/red (UX-DR9 / UX-DR23). Date sources pinned: successor `actualStart` + predecessor finish (`actualFinish` if complete, else derived `earlyFinish`) from live WP + latest schedule rows — never invent.
- Not-schedulable explainer: consequence (excluded from passes + critical path; successors as if absent; blocks next Baseline) **plus duration field** reusing fence `patch_duration` / existing plan action — no new kind.
- Keyboard (UX-DR24): when Plan is active and not editing a cell / not inside the chain list — `j`/`k` walk the whole rail across groups; `Enter` on a rail item scrolls the grid, focuses the row, opens the explainer; `e` opens the explainer for the focused grid row's exception; `x` toggles the drawer (**only below 1680** — no-op when pinned). Activating the **Exception cell** (click or Enter on that cell) opens the **same** explainer as the matching rail item. `j`/`k` into a collapsed group with count > 0 **expands it** then focuses the first item; count 0 → no-op.
- Breakpoint: **`>= 1680` pinned**, below = drawer. Resize across the breakpoint: entering pinned shows the rail; leaving pinned restores the last drawer open/closed preference.
- Multi-kind / multi-edge: one WP may appear in **more than one** rail group; Exception cell priority stays violation → OOS → not-schedulable. OOS rail = **one item per edge** (pred→succ), even when several share a successor. Tie on `daysLate` → `compareWp`.
- Missing targets: empty violation `chain` → explainer still opens with “No driving chain recorded” (Arrow no-op). Chain/OOS ids absent from the live tree → show stored WBS/name if available else short id; Arrow/Enter **skip** focus. OOS missing dates → name WPs, no invented dates. Halt banner missing `rangeStart`/`rangeEnd` → omit the Loaded clause or say “range unavailable” — never fake bounds.
- Latest run **halted** (`outputs` null): rail shows empty copy + count 0; do **not** decode exceptions from the halted run. If `haltedReason = calendar_range`, show Q1→A banner; other stale/halt reasons keep the thin/generic 2.13 stale line — never the calendar-range copy.
- Explainer open when a recalc settles: **close** or **rebind** the same wpId if it still has that exception — never keep a popover on a stale DTO.
- **`calendar_range` halt banner** (Q1→A): replace the thin 2.13 stale line with: *"Schedule halted: calendar range. Loaded {rangeStart}–{rangeEnd}. Derived dates are stale — extend the Holiday Calendar range in Project settings."* No publish CTA on Plan. Grid keeps last-good derived dates marked stale; never invent dates. Illegal-edge persisted band is out of scope (fence refuse).
- Domain lists / fence kinds / Exception cell labels stay the source of truth — rail reads, does not re-derive.

**Never:**
- No Links panel Comfort (`l`) — stays deferred (2.14 Q1→A).
- No persisted illegal-edge "cannot be scheduled" band (Q1→A) — write-time FR-6a refuse covers it.
- No Gantt / bar drag. No second mutator for duration. No new fence kinds. No migration.
- Do not put the exceptions count inside the preset segment; do not add a calendar-publish CTA on the Plan halt banner.
- Do not decode rail exceptions from a halted run's null outputs; do not use calendar-range banner copy for non-`calendar_range` stale/halt.
- Do not change strip / What-moved / pred-constraint editors except shared focus/scroll hooks the rail needs.
- Do not convey exceptions by colour alone. Do not hide the count when the drawer is shut.
- Do not claim a violation moved another WP's Float or displaced the critical path.
- Do not steal keyboard from the chain list into the grid on Arrow walk (popover stays; `Esc` closes).
- Do not invent dates, chain entries, or calendar range bounds when data is missing.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Rail empty | Successful run, no violations/OOS/not-schedulable | Rail visible; "No schedule exceptions"; count 0 on toggle | N/A |
| No run yet | No latest run / outputs null (not halted) | Empty rail + count 0; no calendar-range banner | N/A |
| Rail ranked | Mixed exceptions | Three groups in fixed order; violations worst-late first then compareWp; non-zero groups expanded | N/A |
| Multi-kind WP | Same WP Late + OOS (+ NS) | Cell: violation wins; rail lists in every applicable group | N/A |
| Multi OOS edges | Several OOS edges, same successor | One rail item per edge; cell still one OOS label | N/A |
| Drawer <1680 | Viewport below 1680px | Drawer; toolbar toggle shows total count; `x` toggles | N/A |
| Pinned ≥1680 | Viewport ≥1680 (incl. exact 1680) | Rail pinned; `x` no-op; count available to AT | N/A |
| Resize breakpoint | Cross 1680 with drawer open/closed | Pinned shows rail; return below restores drawer preference | N/A |
| Violation explainer | Open on Late row | Asked/derived/days late/calendar version/chain/honesty line | Empty chain → “No driving chain recorded” |
| Chain walk | ArrowUp/Down in violation chain | Grid scrolls+focuses WP; popover stays; keys on chain until Esc | Skip missing/deleted ids |
| OOS explainer | Open on OOS row | Neutral prose from pinned date sources; no fix; neutral ink | Missing dates → name WPs only |
| Exception cell | Click / Enter on Exception cell | Same explainer as matching rail item | Summary / no exception → no-op |
| Not-schedulable | Open + set duration | Exclusion copy; `patch_duration` + fence; rail/cell refresh | Refuse under control |
| Duration while halted | `calendar_range` + duration from explainer | Fence runs; banner/stale honest — never green schedule | Refuse under control |
| Keyboard walk | `j`/`k`/`Enter`/`e`/`x` | Cross-group walk; collapsed group expands on walk; Enter/`e`/cell | Ignore while editing; count 0 no-op; chain owns Arrows |
| Recalc while explainer open | Successful settle | Close or rebind same wpId; no stale DTO | N/A |
| Calendar-range halt | Latest `haltedReason = calendar_range`, outputs null | Q1→A banner (+ range or “unavailable”); rail empty count 0; dates stale | Never decode halted outputs |
| Other stale/halt | Stale or halt ≠ `calendar_range` | Thin/generic 2.13 stale line; not calendar-range copy | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/components/plan-tree-grid.tsx` — empty `plan-exceptions-rail-slot` (~L1326, `aria-hidden`); `ExceptionCell` (~L336); toolbar ~L1105 preset-only; `onGridKeyDown` lacks `e`/`x`/`j`/`k`; thin `schedule-stale` banner (~L1158). **Fill** rail mount; add exceptions toggle beside preset seg; wire keyboard + Exception-cell activate → same explainer; keep strip/What-moved/pred/constraint untouched.
- `apps/web/src/app/globals.css` — `.plan-body` grid `1fr 0`; `.plan-exceptions-rail-slot { display: none }` (~L1153–1163). **Open** slot: pinned ≥1680 / drawer below; `{spacing.rail-width}` ~360px.
- `apps/web/src/lib/plan-grid-view.ts` — `PLAN_GRID_SLOTS[4] = 'exceptions-rail-slot'`; view model has per-row `exceptionLabel`/`exceptionKind` only. **Extend** with rail lists + calendar version + total count + halt range bounds for banner.
- `packages/app/src/schedule/plan-grid.ts` — `resolveException` (~L453) builds cell labels from violations/OOS/`no_duration` then discards full fields. `getPlanGridState` parses `storedOutputs.violations` / `outOfSequence` / not-schedulable but only maps cell data; `latest.holidayCalendarVersionSeq` loaded unused. **Add** top-level rail payload (full violation fields + chain ids, OOS pairs with pinned date sources from live WP + schedule rows, not-schedulable roster, calendar version + rangeStart/rangeEnd for halt banner).
- `packages/domain/src/schedule/recalculate.ts` / `stored-run.ts` — `ConstraintViolation` (asked/derived/daysLate/chain), `outOfSequence`, `notSchedulable`; calendar `{ versionSeq, rangeStart, rangeEnd, … }` on inputs. **Reuse**; do not reshape engine outputs.
- `apps/web/.../plan/actions.ts` + duration cell — `patchWpDurationAction` / fence `patch_duration`. **Reuse** from not-schedulable explainer (including while halted — honesty via banner/stale).
- Continuity from 2.15 (done): strip + What-moved filled; polite live region; Exception cell vocabulary locked. Continuity from 2.13: slot order, Exception cell.
- `tests/` — extend `plan-grid.test.ts`, `plan-grid-view.test.ts`; add rail/explainer unit coverage; optional `fence-2-16` for duration-from-explainer (+ halted path). Mockup reference: `ux-…/mockups/plan-tree-grid.html`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/app` `plan-grid.ts` — expose rail lists + calendar version + halt range bounds + OOS date joins; keep `resolveException` labels as shared vocabulary.
- [x] `apps/web` view model + rail component — three groups (expand non-zero), empty copy, pinned/drawer ≥1680, dedicated toolbar exceptions toggle with count, `x`.
- [x] `apps/web` three explainers — violation (honesty line + Comfort chain walk Q2→B, Esc closes), OOS (pinned dates, no fix), not-schedulable + duration via existing action; `j`/`k`/`Enter`/`e`; Exception cell activates same explainer.
- [x] `apps/web` calendar-range halt banner — exact Q1→A copy with loaded range + settings pointer; no publish CTA.
- [x] `tests/` — matrix rows incl. halted-empty rail, multi-kind/multi-edge, breakpoint/`x` no-op, empty chain, missing ids/dates, explainer rebind, non-calendar stale copy.
- [x] `deferred-work.md` — append illegal-edge persisted band deferral (Q1→A) if not already present.

**Acceptance Criteria:**
- Given the Plan surface, when exceptions exist, then the rail shows three ordered groups with counts and matching glyph+word+number items; non-zero groups start expanded.
- Given a viewport below 1680px, when the drawer is shut, then the dedicated toolbar exceptions toggle still shows the total exception count.
- Given no exceptions, when the rail renders, then it says "No schedule exceptions".
- Given each explainer type, when opened, then it meets UX-DR9 content rules (honesty line / no OOS fix / duration field); violation chain Arrow-walk focuses WPs with popover staying open until Esc (Q2→B).
- Given `j`/`k`/`Enter`/`e`/`x` or Exception-cell activate, when used as specified, then rail walk, focus+explainer, and drawer toggle work (ignore while editing; chain list owns Arrows).
- Given a `calendar_range` halt, when the Plan renders, then the banner uses the pinned copy with loaded range and settings pointer; derived dates stay stale — never invented (Q1→A); no illegal-edge persisted band; no Plan publish CTA.
- Given `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test`, when they run, then all exit 0.

## Implementation Notes

- `getPlanGridState` builds `PlanExceptionsRail` via `buildExceptionsRail` on successful runs only; halted runs keep empty lists but still surface calendar `rangeStart`/`rangeEnd`/`versionSeq` from inputs for the Q1→A banner.
- Rail vocabulary reuses `resolveException` labels; OOS is one item per edge; multi-kind WPs appear in every applicable group.
- Client: `PlanExceptionsRail` + three non-modal explainers; `≥1680` pinned via `matchMedia`; drawer preference restored on breakpoint exit; toolbar `Exceptions · N` toggle is outside the preset segment.
- Explainer rebind after recalc uses `rebindExplainer` against the settle payload's `exceptions` (and model refresh).
- Illegal-edge persisted band already recorded in `deferred-work.md` (Q1→A). No optional `fence-2-16` integration test added — unit coverage covers the matrix rows without DB.
- Matrix audit (2026-09-27): extracted pure `walkExceptionsRailKey` / `nextDrawerOpenForXKey` / `nextDrawerOpenForBreakpoint` / `scheduleStaleBannerKind` / `groupIdForRailKey`; wired into `plan-tree-grid` + rail expand; unit tests cover j/k empty no-op, expand group id, `x` pinned no-op, breakpoint pref restore, calendar vs generic banner, halted write-success empty rail.
- Review patches (2026-09-27): auto-open drawer for explainers; chain walk without stealing focus; rebind rail selection; duration try/finally; empty-group collapse; fence asserts for rail + halt bounds. Deferred BH5 formatter dedupe + BH11 national provenance.
- Code-review patches (2026-09-27, founder option 2): `blankDerivedDates` keeps last-good row dates on `calendar_range` with stale marker; multi-hop chain lag toward violated WP; explainer autofocuses chain list; Enter gated off cell controls; `j`/`k` scroll rail item; reveal/focus expand ancestors; breakpoint clears explainer; verification-gap asserts.

## Spec Change Log

## Review Triage Log

| ID | Source | Verdict | Route | Evidence |
|----|--------|---------|-------|----------|
| BH1 | blind | high | patch | Verified: `PlanExceptionsRail` early-returns hidden aside when `!pinned && !drawerOpen`, so `ExceptionExplainer` never mounts — cell/`e`/Enter set state with no visible popover. |
| BH2 | blind | medium | patch | Verified: model refresh calls `rebindExplainer` but leaves `railSelectedKey` pointing at removed keys. |
| BH3 | blind | false | reject | `StoredScheduleWp` has `wbsCode` only (no name). Code already seeds WBS from stored inputs; name cannot exist for deleted-only ids — short-id fallback is honest. |
| BH4 | blind | low | patch | Verified: `plan-body--rail-drawer-open` set in JSX; no CSS rule — delete unused className. |
| BH5 | blind | low | defer | App vs web banner formatter duplication — same helper-dedupe backlog as 2.13 BH8 / 2.15 BH10. |
| BH6 | blind | medium | patch | Verified: chain `<li>` has no click/Enter handler; only ArrowUp/Down call `onFocusWp`. |
| BH7 | blind | medium | patch | Verified: `chainIdx` resets to 0; skip-present only inside Arrow loop — first paint can highlight a missing WP. |
| BH8 | blind | false | reject | UX-DR24 Enter-after-`j`/`k` is intended to open the selected rail item; editing cells already ignore keys. |
| BH9 | blind | low | reject | SSR default pinned→effect correct is a one-frame flash; unlikely everyday defect; matching 2.15 reduced-motion posture. |
| BH10 | blind | false | reject | After `latest === null` sets `minFloat = null`, lines 1050–1051 refill from `wpSchedules` when not halted. |
| BH11 | blind | low | defer | National provenance “when cheap” is Design Notes optional polish, not Always. |
| BH12 | blind | false | reject | Empty triage/changelog mid first review pass is expected; this triage fills them. |
| BH13 | blind | medium | patch | Same root as BH1/VG — drawer×explainer + fence `getPlanGridState.exceptions` gap. |
| BH14 | blind | low | patch | Verified: length effect only forces open; empty groups can stay `aria-expanded={true}` — collapse when count hits 0. |
| EC1 | edge | high | patch | Verified: `focusWpInGrid` calls `.focus()`; chain `onBlur` clears `chainFocusActive` — Q2→B keyboard ownership lost after first Arrow. |
| EC2 | edge | high | patch | Same as BH1 — explainer gated behind drawer visibility. |
| EC3 | edge | medium | patch | Verified: `x` toggles drawer without clearing `explainer`. |
| EC4 | edge | medium | patch | Same as BH2 — stale `railSelectedKey` + Enter. |
| EC5 | edge | low | reject | Force-open non-empty groups matches Always “expand by default”; user re-collapse after is not everyday failure. |
| EC6 | edge | medium | patch | Verified: `commit` awaits without try/finally — throw leaves `pending` true. |
| EC7 | edge | high | patch | Same root as EC1 (filed as claim). |
| EC8 | edge | high | patch | Same root as BH1/EC2 (filed as claim). |
| VG1 | verif-gap | medium | patch | Pre-verified: no `getPlanGridState` assertion on `exceptions` lists; cell path alone stays green if rail assignment skipped. |
| VG2 | verif-gap | medium | patch | Pre-verified: halted calendar bounds for banner never asserted from `getPlanGridState`. |

Grouped routes: **patch** (auto-open drawer + keep explainer visible; chain focus without stealing DOM focus / restore list; clear explainer+selection on drawer close / rebind; chain click + first present idx; duration try/finally; drop dead CSS class; collapse empty groups; fence asserts for exceptions + halt bounds). **defer** BH5, BH11. Rejected BH3/8/9/10/12, EC5.

## Design Notes


**Slot, not a new page.** Rail behaviour fills the 2.13 mount. Exception cell already ships UX-DR12 marks — rail items must echo `resolveException` labels.

**Full fields were discarded.** `getPlanGridState` already parses violations/OOS; 2.16 surfaces them as rail DTOs (asked/derived/chain, OOS peer dates from WP actuals / schedule rows, calendar `versionSeq`). Prefer `"Holiday Calendar version {seq}"` (plus national provenance when cheap from inputs) over inventing a display-name table.

**Explainers are non-modal popovers.** One modal level only (UX-DR24). Duration fix reuses the duration editor's fence path. Exception cell and rail item share one explainer. Chain walk keeps the popover; Esc closes (War Room, 2026-09-26).

**Halt vs illegal edges (Q1→A).** Architecture refuses graph offences; only `calendar_range` leaves a halted+stale Plan. Ship full range-halt banner with pinned copy + settings pointer (no Plan publish CTA); illegal-edge persisted band stays deferred (write-time FR-6a). **Chain walk (Q2→B)** is Comfort in-scope for this story.

**Toolbar toggle.** Count lives on a dedicated exceptions control beside the preset segment — never inside it (War Room).

**Edge sweep (2026-09-27).** Halted runs contribute no rail rows; calendar-range banner is reason-gated; multi-kind WPs list in every applicable group; OOS is per-edge; `j`/`k` expands collapsed non-empty groups; `x` is drawer-only; explainer must not outlive a stale DTO after recalc.

## Verification

**Commands:**
- `pnpm lint` — expected: exit 0
- `pnpm typecheck` — expected: exit 0
- `pnpm depcruise` — expected: exit 0
- `pnpm test` — expected: exit 0

**Manual checks (if no CLI):**
- Narrow viewport — drawer + count on toggle; wide — pinned rail.
- Open each explainer type; confirm honesty line / no OOS fix / duration commits.
- `j`/`k` across groups; `Enter` focuses the row; `e` from grid; `x` toggles.

### Review Findings

Code review of `23cd19b` → `bf0bd51` (PR #83, 2026-09-27), mode full. Layers: blind-hunter, edge-case-hunter, verification-gap, acceptance-auditor. Build-review triage above already shipped; these are the post-merge findings.

- [x] [Review][Patch] On `calendar_range` halt, surface last-good derived dates marked stale — founder chose option 2 (2026-09-27). Today `blankDerived` nulls early start/finish/float/critical whenever `haltedReason !== null`. For `calendar_range` only: keep `wp_schedule` values when present, leave `stale: true`, never invent dates; other halt reasons keep the 2.13 em dash. Strip scalars stay null. Add a unit assertion [packages/app/src/schedule/plan-grid.ts:1066]
- [x] [Review][Patch] Multi-hop violation chain looks up lag on the wrong edge — immediate-driver-first `['P1','P0']` pairs P1 with P0 and P0 with the violated WP; successor of `chain[i]` is `chain[i-1]` when `i > 0`, else the violated WP. Add a two-link test. One-link chains still resolve [packages/app/src/schedule/plan-grid.ts:333]
- [x] [Review][Patch] Violation explainer focuses the dialog shell, so ArrowUp/Down never reach the chain list until the user tabs to it — Q2→B walk misses on open. Focus the chain `<ul>` (or handle arrows on the dialog) [apps/web/src/components/plan-exceptions-rail.tsx:329]
- [x] [Review][Patch] Table `Enter` opens the rail explainer whenever `railSelectedKey` is set, and date / inline cell `Enter` does not `stopPropagation`, so a cell commit also opens the explainer. Gate Enter-to-explainer to table-level focus, or stop the event in cell editors [apps/web/src/components/plan-tree-grid.tsx:1061]
- [x] [Review][Patch] `j` / `k` set `railSelectedKey` (`aria-current`) and do not move DOM focus or scroll the rail item; the handler lives only on the grid table, so the shortcuts stop once focus is in the explainer [apps/web/src/components/plan-tree-grid.tsx:1050]
- [x] [Review][Patch] `revealWpInGrid` scrolls a `[data-wp-id]` node and does not expand collapsed ancestors, so a hidden WP is not revealed [apps/web/src/components/plan-tree-grid.tsx:809]
- [x] [Review][Patch] Breakpoint effect can set `drawerOpen` false without clearing `explainer` or `chainFocusActive` (`x` and the toolbar toggle already clear). Reopening the drawer shows a stale popover [apps/web/src/components/plan-tree-grid.tsx:767]
- [x] [Review][Patch] Fence 2.14 asserts the rail violation label and `daysLate` and does not assert that stored chain indexes became live WP ids [tests/schedule/fence-2-14.test.ts:478]
- [x] [Review][Patch] The one-link builder fixture sets lag 2 on `p→v` and never asserts `lagDays` (this assertion does not catch the multi-hop bug; the two-link test on the lag patch does) [packages/app/src/schedule/plan-grid.test.ts:398]
- [x] [Review][Patch] `toPlanGridViewModel` serialisation does not assert `calendarRangeStart` / `calendarRangeEnd` [apps/web/src/lib/plan-grid-view.test.ts:184]
- [x] [Review][Patch] The same serialisation fixture leaves `outOfSequence` empty, so `successorActualStart` / `predecessorFinish` are unasserted [apps/web/src/lib/plan-grid-view.test.ts:172]
- [x] [Review][Patch] Web `calendarRangeHaltBannerCopy` tests both bounds and both-null; one-sided null is unasserted (the app helper already covers it) [apps/web/src/lib/plan-exceptions.test.ts:166]

- [x] [Review][Defer] `chainFocusActive` may stay true after a recalc rebind closes the explainer, so `onGridKeyDown` keeps returning early and `j` / `k` stay dead [apps/web/src/components/plan-tree-grid.tsx:751] — deferred: maybe-false. Unmount usually blurs the chain list and `onBlur` clears the flag (`plan-exceptions-rail.tsx:490`). Settle with a runtime repro: recalc while the chain `<ul>` is focused and see whether grid `j` / `k` stay dead.

Formatter dedupe (`calendarRangeHaltBanner` vs `calendarRangeHaltBannerCopy`) stays the existing BH5 defer; this pass does not re-file it.

#### Rejected

- Pinned explainer clipped / invisible (blind) — `false`: `.plan-ex-pop` is `position: absolute` and the pinned slot is not positioned, so the containing block is `.plan-body` (`globals.css:1153`, `:1305`). The slot's `overflow: auto` does not clip it.
- Drawer popover covers the list (blind) — `low`: the popover is visible inside the drawer; a portal is more than a direct correction.
- `resolveWpLabel` shows a short id when the name is missing (blind) — `false`: stored inputs carry `wbsCode` and no name; the spec fallback is the short id.
- Group effect forces open whenever a group's length changes (edge) — `low`: Always says non-zero groups expand by default (`plan-exceptions-rail.tsx:73`).
- Pinned toolbar Exceptions control is a click no-op (edge) — `false` as a defect: `x` and the toggle are specified no-ops while pinned; the count stays on the label.
- Lag 0 and a missing edge both render an em dash (edge) — `low`: the spec does not require a third glyph.
- Not-schedulable empty commit surfaces the raw token `invalid_input` (edge) — `low`: same machine-code pattern as other fence refuses; a display map is more than a direct correction (`plan-exceptions-rail.tsx:581`).
- Duration above the Postgres integer max leaves the explainer pending (edge) — `false`: `commit` uses `try/finally` and clears `pending` (`plan-exceptions-rail.tsx:590`). The integer column overflow is pre-existing.
- OOS cell can light when the predecessor index is missing and the rail drops that edge (acceptance) — `low`: only corrupt stored indexes (`plan-grid.ts:833` vs `:904`).
- Sprint key `review` while the spec status is `done` (process) — bookkeeping for section 6 of this review, after the decision and the patch choice.
- Empty Spec Change Log on the first pass (process) — `false`: the build triage already filled the log this story uses.
- A user-collapsed group reopens when its length changes (edge) — `low`: matches expand-by-default.
- SSR paints the rail pinned for one frame (edge) — `low`: one frame, same posture as the 2.15 reduced-motion flash.
- `Enter` after `j` / `k` on the grid table is a hijack (blind) — `false` for that half: UX-DR24 Enter opens the selected rail item. The cell-bubbling half is the patch at `plan-tree-grid.tsx:1061`.

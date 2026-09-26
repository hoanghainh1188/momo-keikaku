---
title: 'Story 2.15 — The schedule strip and the What-moved band'
type: 'feature'
created: '2026-09-26'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd37ea58653ffc84a8d65e84bd523a56176e6d182'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-momo-keikaku-2026-09-20/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Plan already has empty UX-DR2 strip and What-moved slots (2.13), but Float numbers have no sticky context sentence and a recalc can redraw a hundred dates with no plain answer — OQ-11 / UX-DR5 / UX-DR10 stay unmet.

**Approach:** Fill the existing **schedule strip** (sticky context + Float anchor sentence + inline Project settings through the fence) and **What-moved band** (summary line, FR-28 cause groups, polite announce, cell highlight, attribution). Reuse fence Project-settings kinds and stored run causes; extend the plan-grid read / write success payload so the UI can compare before→after. Rail stays empty (2.16). Core only — no Undo (Q1→A); Data Date is fence date edit only (Q2→A); ship in-flight "…" (Q3→A).

**Decisions (founder, 2026-09-26):**
- **Keep the full spec** (~1900+ tokens accepted; same posture as 2.10–2.14).
- **Q1 → A.** Core only: omit *Undo this edit* (Comfort).
- **Q2 → A.** Strip Data Date = fence date edit only; advance-to-Reporting-Period stays off the strip.
- **Q3 → A.** Ship UX-DR23 in-flight blanking ("…" on affected derived dates) with this story.

## Boundaries & Constraints

**Always:**
- Fill `PLAN_GRID_SLOTS` strip + What-moved only — keep UX-DR2 order; do not invent a second layout (2.13 Q1→A).
- Strip (sticky): Project start, Project finish or *not set*, Data Date, computed finish, minimum Float, Float **anchor as a sentence** (UX-DR5) — never a bare "vs …" label alone.
- Strip inline edits of Project start / finish / Data Date go through existing fence kinds (`set_project_start` / `clear_project_start` / `patch_project_finish` / `patch_data_date`) — same semantics as Project settings (FR-43); finish set/clear keeps the teaching confirm from 2.11. Data Date is **date edit only** on the strip (Q2→A) — no advance-to-period CTA here.
- After each successful recalc: What-moved one-liner (`N moved · finish A→B · min Float X→Y`) + *See what moved* grouped under **FR-28's seven causes** with old/new dates; entry focuses that WP (UX-DR10).
- Edit that moves nothing → band says **"No dates moved"** (not silence).
- Band persists until next recalc or dismiss.
- Successful recalc announced **politely** (UX-DR26) — completes 2.14 Q2→C deferral; FR-6a refuse stays assertive (2.14).
- Changed cells: 300 ms highlight in primary-soft; reduced-motion users get highlight without transition.
- Other PM's recalc: attributed ("edited by X, N ago") and **no Undo** (UX-DR23).
- During in-flight recalc: grid stays interactive; affected derived dates show "…" — never paint stale values as current (UX-DR23).
- Domain `deriveWpCauses` / fence kinds unchanged; rail explainers stay 2.16.

**Never:**
- No *Undo this edit* (Q1→A). No Data Date advance-to-period CTA on the strip (Q2→A). No exceptions-rail behaviour (2.16). No Links panel. No Gantt. No second mutator for Project settings.
- Do not invent causes outside FR-28's closed set. Do not store What-moved as a new table if prev/latest run + outputs suffice — prefer read-path join / client payload.
- Do not clear assertive FR-6a region semantics from 2.14.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Strip default | Successful latest run + Project finish set | Sticky strip; anchor sentence vs Project finish with date; min Float shown | Halted/missing run → computed finish / min Float "—" / relative sentence rules still honest |
| Strip relative anchor | No Project finish | Sentence: Float measured against computed finish — relative because no Project finish | N/A |
| Strip edit settings | Inline start / finish / Data Date commit | Fence write + recalc; strip + grid refresh | FR-6a / settings refuse under control; finish confirm modal reused |
| What-moved after edit | Recalc moves N WPs | Band one-liner + cause groups; polite announce; cell highlight | N/A |
| Nothing moved | Recalc changes no dates | Band: "No dates moved" | N/A |
| Dismiss / persist | Dismiss band; look away | Gone until next recalc; otherwise persists | N/A |
| Other PM | Latest run actor ≠ current user | Attribution; no Undo | N/A |
| In-flight | Recalc pending | Interactive grid; affected derived dates "…" | Never show previous early* as if current |

</frozen-after-approval>

## Code Map

- `apps/web/src/components/plan-tree-grid.tsx` — empty `plan-schedule-strip-slot` / `plan-what-moved-slot` (`aria-hidden`). **Fill** with strip + band components; keep slot order; wire polite live region (success) beside existing assertive FR-6a region.
- `apps/web/src/lib/plan-grid-view.ts` — `PLAN_GRID_SLOTS`, `toPlanGridViewModel` today drops `projectFinish` / `computedFinish` / `anchor` / min Float / causes / actor. **Extend** view model for strip + What-moved bindings.
- `packages/app/src/schedule/plan-grid.ts` `getPlanGridState` — already has `anchor`, `computedFinish`, `floatAnchorLabel`, per-row floats. **Add** min Float scalar; load latest (+ previous) run for What-moved deltas; expose `actor` / causes / early dates needed for groups.
- `packages/domain/src/schedule/cause.ts` / `stored-run.ts` — FR-28 causes already on outputs. **Reuse**; do not redefine the seven causes.
- `packages/db/.../schedule` `latestRun` — select currently omits `actor`. **Extend** read; optional previous-run helper for old finish / min Float / early dates.
- `packages/app/src/schedule/apply-plan-change.ts` + `plan-edit.ts` — Project settings kinds already exist. **Reuse** for strip; do not add kinds.
- `apps/web/.../plan/actions.ts` + `settings/actions.ts` + `project-schedule-settings.tsx` — refuse/confirm patterns for finish/Data Date. **Reuse** thin wrappers for strip; today plan mutations return `{ ok: true }` only — **widen** success payload (or a follow-up read) so What-moved can render without a full page reload race.
- Continuity from 2.14 (done): assertive FR-6a refuse; polite success was deferred here (Q2→C). Pred/constraint editors stay; strip/band are additive.
- `tests/` — strip sentence/anchor; settings fence from strip; What-moved summary + nothing-moved; cause grouping; attribution; polite announce hook; in-flight "…" (Q3→A).

## Tasks & Acceptance

**Execution:**
- [x] `packages/db` + `packages/app` plan-grid / run reads — min Float, actor, prev/latest compare inputs for What-moved; leave fence kinds unchanged.
- [x] `apps/web` view model + strip component — sticky UX-DR5 sentence + inline settings via fence (Data Date date-only, Q2→A); finish teaching confirm reused; in-flight "…" (Q3→A).
- [x] `apps/web` What-moved band — summary, cause groups, dismiss/persist, polite announce, highlight, attribution; no Undo (Q1→A).
- [x] `apps/web` plan actions — surface enough post-recalc data for the band (payload or immediate re-read).
- [x] `tests/` — matrix rows + FR-28 grouping + nothing-moved + strip refuse/confirm.
- [x] `deferred-work.md` — append Undo (Q1→A) and strip advance-to-period CTA (Q2→A).

**Acceptance Criteria:**
- Given the Plan surface, when it renders with a successful run, then the sticky strip shows start/finish/Data Date/computed finish/min Float and the Float anchor as a sentence (UX-DR5).
- Given a strip edit of Project start, finish, or Data Date, when committed, then the fence writes and recalculates as in Project settings.
- Given a recalculation that moves work, when it settles, then What-moved shows the one-liner and FR-28-grouped moves with old/new dates; polite announce fires; cells highlight briefly.
- Given a recalculation that moves nothing, when the band appears, then it says "No dates moved".
- Given another PM's run, when the band shows, then it is attributed and offers no Undo.
- Given Plan after this story, when What-moved shows for own or others' edits, then Undo is absent (Q1→A); strip Data Date has no advance-to-period CTA (Q2→A); in-flight recalc blanks affected derived dates with "…" (Q3→A).
- Given `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test`, when they run, then all exit 0.

## Implementation Notes

- **2026-09-26 (implement):** Branch `cursor/spec-2-15-schedule-strip-what-moved-0abf`.
  - `packages/db` `latestRun` now selects `actor`/`at`; added `previousSuccessfulRun` for What-moved join.
  - `getPlanGridState` exposes `minFloat`, `floatAnchorSentence`, `finishTeaching`, `whatMoved` (prev/latest outputs + FR-28 cause groups). Pure helpers: `floatAnchorSentence`, `buildWhatMovedBand`, `minFloatFromRows`.
  - Web: sticky `PlanScheduleStrip` (fence kinds only; finish teaching confirm; Data Date date-edit only) + `PlanWhatMovedBand` (summary / See what moved / dismiss / attribution / no Undo). Polite `aria-live` beside assertive FR-6a. In-flight derived dates show "…"; moved cells get 300 ms `primary-soft` highlight (reduced-motion: no transition).
  - Plan actions widen success with What-moved + strip scalars via immediate `planGridState` re-read after fence write.
  - Tests: `plan-grid.test.ts` sentence/minFloat/What-moved; `plan-strip-what-moved.test.ts`; `fence-2-15.test.ts` (DB-gated).
  - `deferred-work.md`: appended Q1→A Undo and Q2→A advance-to-period; marked 2.14 polite-announce deferral resolved YES by this story.
  - Verified: `pnpm lint`, `pnpm typecheck`, `pnpm depcruise`, `pnpm test` all exit 0 (DB fence cases skip when Postgres unreachable).

## Spec Change Log

## Review Triage Log

## Design Notes

**Slots, not a new page.** Strip and What-moved are behaviour inside mounts 2.13 already reserved. Keep rail empty.

**What-moved needs before/after.** Prefer latest `schedule_run` vs previous successful run (same Project) for finish / min Float / per-WP early dates; causes come from the new run's outputs. If only one run exists, treat prior as empty ("No dates moved" or first-run wording without fake deltas).

**Polite announce completes 2.14 Q2→C.** Assertive refuse stays; do not merge the two live regions into one mode.

**Min Float on the strip.** Derive from latest outputs (domain already computes `minFloat` in the backward pass) — surface a scalar on grid state rather than scanning the client tree as the source of truth.

## Verification

**Commands:**
- `pnpm lint` — expected: exit 0
- `pnpm typecheck` — expected: exit 0
- `pnpm depcruise` — expected: exit 0
- `pnpm test` — expected: exit 0

**Manual checks (if no CLI):**
- Scroll the grid — strip stays; Float sentence matches whether Project finish is set.
- Edit Data Date on the strip — recalc; What-moved names causes; polite announce.
- Two-browser attribution — other user's edit shows name, no Undo.

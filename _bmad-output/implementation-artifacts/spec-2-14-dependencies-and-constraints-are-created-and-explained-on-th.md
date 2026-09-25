---
title: 'Story 2.14 — Dependencies and constraints are created and explained on the grid'
type: 'feature'
created: '2026-09-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0924d5e2484b574444ec5a051a23070d1f01820e'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-momo-keikaku-2026-09-20/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Schedule already shows predecessors and constraints (2.13), but both cells are display-only — FR-6a has no keyboard typing surface, no under-cell refuse that keeps the draft, and no assertive announce when a graph rule blocks the edit.

**Approach:** Turn the existing Schedule predecessor and constraint columns into MS-Project-shaped editors that commit through the fence (`add_dependency` / `remove_dependency` / `re_lag_dependency` / `patch_constraint`). Parse → diff → fence; map FR-6a offences into named under-cell prose while **keeping typed text**; announce refuse **assertively** (no polite success announce here — Q2→C); when a committed constraint is already impossible, paint the violation in that row's Exception cell in the same interaction. Core cells only — no Links panel (Q1→A).

**Decisions (founder, 2026-09-25):**
- **Keep the full spec** (~2000+ tokens accepted; same posture as 2.10–2.13).
- **Q1 → A.** Core only: predecessor + constraint cells. Comfort Links panel (`l`) deferred.
- **Q2 → C.** Ship assertive FR-6a refuse live region only; defer polite success / UX-DR26 recalc announce to 2.15 with What-moved.

## Boundaries & Constraints

**Always:**
- Reuse Schedule columns and `formatPredecessorsText` / `formatConstraintLabel` — no second editor surface (Q1→A).
- Predecessor text: MS-Project `2.3FS+2d, 2.4`; `FS` omittable (only R0 type); lag in working days, may be negative; autocomplete WBS + name over **leaf WPs only** (UX-DR6).
- On commit: diff typed edge set vs live edges; apply via existing fence kinds only — no new mutator (AR-43).
- FR-6a refuse under the cell naming offence + WPs (cycle / ancestor / summary / other project); **cell keeps typed text**; no write, no recalc (UX-DR6, FR-6a).
- Refuse announced **assertively** via `aria-live="assertive"` (UX-DR26 half). Successful recalc stays silent here (Q2→C); polite announce → 2.15.
- Constraint cell: one column, type then date (`asap` / `must_start_on` / `must_finish_on`); non-default requires date; clear date → asap; milestone target = `must_finish_on` here, not a separate field (UX-DR7 / §3).
- Impossible committed constraint → Exception cell updates in the **same interaction** (rail explainers stay 2.16).
- Graph invariants stay in `domain/schedule/validate` + `checkPlanInvariants`; fence `details.dependencies` remains codes-only — wording is this story's presentation layer.
- Summary rows stay named em dash (not editable) for pred/constraint; leaf-only edges and leaf-only constraints.

**Never:**
- No Links panel / `l` handler (Q1→A). No strip / What-moved behaviour or polite success announce (2.15 / Q2→C). No exceptions-rail explainers (2.16). No Gantt; no non-FS link types; no second write path bypassing `applyPlanChange`.
- Do not put WP ids into fence `details`; do not invent migrations; do not edit `wp_schedule` from the UI; do not clear typed text on refuse.
- Do not pull Baseline/All presets or Observed columns.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Pred happy path | Leaf types `2.3FS+2d, 2.4` and commits | Edges diffed; fence add/re-lag/remove; grid shows canonical `formatPredecessorsText`; no polite announce (Q2→C) | N/A |
| Pred autocomplete | Type partial WBS or name | Leaf-only suggestions; summaries excluded | Empty query → no spurious picks |
| Pred cycle / ancestor / summary / cross-project | Typed commit that breaks a graph rule | Under-cell prose with offence + WPs; draft kept; assertive announce; no write/recalc | Fence codes + `validate` lists drive wording |
| Pred parse fail | Malformed token | Under-cell parse refuse; draft kept; assertive; no write | Same keep-text rule |
| Constraint edit | Type + date commit on leaf | `patch_constraint`; label refreshes; asap when date cleared; success silent | Zod asap⇔null / must_*⇔date |
| Milestone target | Edit must-finish date on milestone leaf | Same constraint cell + fence; no separate milestone field | Invalid type/date → refuse, keep draft |
| Impossible constraint | Commit must_* the graph already fails | Write+recalc succeed; Exception cell shows violation same interaction | Never claim the date is met |
| Summary row | Focus pred/constraint on summary | Em dash + a11y name; not editable | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/components/plan-tree-grid.tsx` — today: pred `<span className="plan-pred">`, constraint readOnly input; `InlineTextCell` / `InlineNumberCell` for name/duration/% (Enter/blur/Tab commit, Esc cancel, `.plan-cell-error`, keep editing on refuse). **Extend** with predecessor editor (autocomplete + under-cell FR-6a) and constraint editor (type+date); reuse commit/refuse UX; add **assertive** `aria-live` for FR-6a refuse only (Q2→C) — no polite success region. Derived-date teaching `role="status"` stays.
- `apps/web/src/app/p/[projectId]/plan/actions.ts` — `patchWpNameAction` / duration / % via `fenceMutation` → `planChange`. **Add** thin actions for predecessor-set apply and `patch_constraint` (or one apply-predecessors that fans fence kinds) — still only `applyPlanChange`.
- `packages/app/src/schedule/apply-plan-change.ts` — kinds already: `add_dependency`, `remove_dependency`, `re_lag_dependency`, `patch_constraint`. **Reuse; do not invent a mutator.** Pre-write `checkPlanInvariants` → `invalid_input` + `details.dependencies` codes only.
- `packages/app/src/schedule/plan-invariants.ts` + `packages/domain/src/schedule/validate.ts` — offences: cycles / ancestorDescendant / summaryEndpoints / crossProject. Comment already assigns wording+WP names to 2.14. **Add** a pure explainer (app or domain helper) that turns `GraphOffences` (+ WBS map) into UX-DR6 sentences; call it from the parse/commit path before or beside the fence refuse.
- `packages/app/src/schedule/plan-grid.ts` — `formatPredecessorsText`, `formatConstraintLabel`, `getPlanGridState`, `resolveException`. **Reuse** formatters + Exception mapping; extend `toPlanGridViewModel` / row payload so editors get leaf candidate list, `constraintType`/`constraintDate`, and live edge ids (view model today strips type/date/edges to labels only).
- `packages/db/src/repositories/plan-input/index.ts` — `addDependency` (FS hardcoded), `removeDependency`, `reLagDependency`, `patchConstraint`. **Reuse writers.**
- Continuity from 2.13 (done): treegrid, Schedule columns, Exception cell, fence name/duration/% — pred/constraint were intentionally display-only (Q2→B). Do not disturb strip/What-moved slots or 2.10/2.11 thin controls.
- `tests/` — new fence-2-14 / plan-grid editor coverage: parse+diff, FR-6a under-cell keep-text, constraint type/date/asap, milestone via constraint, Exception refresh after impossible constraint, assertive announce where testable. Reuse `tests/schedule/fence.test.ts` patterns for cycle refuse.

## Tasks & Acceptance

**Execution:**
- [x] `packages/app/src/schedule/` — parse MS-Project predecessor text; diff edge set; FR-6a explainer from `validate` lists; leave fence kinds unchanged.
- [x] `packages/app/src/schedule/plan-grid.ts` (+ view model) — expose leaf autocomplete candidates, constraint type/date, edges needed for editors; keep display formatters.
- [x] `apps/web/.../plan/actions.ts` — wire predecessor-set + `patch_constraint` through existing `applyPlanChange`.
- [x] `apps/web/.../plan-tree-grid.tsx` — editable pred (autocomplete, keep-text refuse, assertive live region) + constraint (type+date); Exception same-interaction refresh; no Links panel; no polite success announce (Q1→A, Q2→C).
- [x] `tests/` — matrix cases + FR-6a wording/keep-text + constraint/milestone + impossible-constraint Exception.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` — append Links panel (Q1→A) and polite recalc announce (Q2→C) if not already present.

**Acceptance Criteria:**
- Given a leaf predecessor cell, when the PM types MS-Project text with optional `FS` and signed lag, then autocomplete offers leaf WPs only and commit diffs edges through the fence.
- Given a graph-rule reject, when the error renders, then under-cell prose names the offence and WPs, the typed text remains, nothing is written, and the refuse is announced assertively.
- Given the constraint cell, when edited, then type+date live in one column; clearing the date returns asap; a milestone target is edited here as `must_finish_on`.
- Given a constraint the graph already makes impossible, when committed, then the row's Exception cell shows the violation in the same interaction.
- Given Plan after this story, when it loads, then no Links panel / `l` handler ships (Q1→A), and successful pred/constraint commits do not announce politely (Q2→C).
- Given `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test`, when they run, then all exit 0.

## Implementation Notes

- 2026-09-25: Pure helpers in `packages/app/src/schedule/predecessors.ts` — `parsePredecessorsText` (MS-Project `2.3FS+2d, 2.4`, FS optional, signed lag), `diffPredecessorEdges` (remove → re-lag → add), `explainGraphOffences` / `explainProposedGraphRefuse` (UX-DR6 sentences from `validate` + WBS map). Fence kinds unchanged.
- 2026-09-25: `applyPredecessorSet` parses → validates proposed graph (refuse before any write) → fans existing `add_dependency` / `remove_dependency` / `re_lag_dependency` via `applyPlanChange`. Refuse carries `details.refuse` prose so the cell can keep typed text.
- 2026-09-25: `getPlanGridState` / view model expose `leafCandidates`, per-row `predecessorEdges`, and pass through `constraintType` / `constraintDate` for editors.
- 2026-09-25: Thin actions `applyPredecessorsAction` + `patchWpConstraintAction` (clear date → asap). Grid: predecessor autocomplete (leaf-only), under-cell FR-6a keep-text refuse, assertive `aria-live` region (Q2→C); constraint type+date editor. No Links panel / `l` (Q1→A); no polite success announce.
- 2026-09-25: Tests — `predecessors.test.ts` (parse/diff/explain/autocomplete); `fence-2-14.test.ts` (add+canonicalise, cycle refuse, must_finish_on/asap, impossible-constraint Exception, parse refuse). Deferred Links panel + polite announce already in `deferred-work.md`.
- 2026-09-25: Review fixes — pickSuggestion trims trailing commas; committingRef blocks re-entrant blur; assertiveRefuse cleared on success/Escape; draft sync only when not editing; reuse `filterLeafCandidates` from `@momo/app`; fence-2-14 covers remove + re-lag; `planWriteRefuseMessage` extracted + unit-tested. Deferred: combobox keyboard, atomic fan-out, WAL flake, RTL keep-text.

- 2026-09-25: Matrix gap fill — fence covers `must_start_on` + milestone `must_finish_on` + summary non-leaf/leafCandidates; `explainProposedGraphRefuse` covers ancestor + cross-project prose. UI keep-text is structural (`PredecessorCell` leaves `draft` on refuse + assertive live region); no RTL harness in repo.

## Spec Change Log

## Review Triage Log

| ID | Source | Verdict | Route | Evidence |
|----|--------|---------|-------|----------|
| BH1 | blind | false | reject | Spec is `in-review`; sprint → review is present-step process, not an implementation defect. |
| BH2 | blind | false | reject | Empty Spec Change Log / Triage Log during first review pass is expected; this triage fills them. |
| BH3 | blind | medium | patch | Verified: `pickSuggestion` keeps trailing comma in `prefix` (`before.trimEnd()`), yielding `2.3,, 2.4`. |
| BH4 | blind | low | defer | Autocomplete exists (mouse); full ArrowUp/Down combobox is nicer than Core typing AC requires. |
| BH5 | blind | false | reject | EXPERIENCE UX-DR6 example for cross-project is exactly "that work package is in another project" (no WP ids). |
| BH6 | blind | low | reject | Non-leaf / missing successor refuse is unreachable from Schedule editors (leaf-only cells). |
| BH7 | blind | medium | defer | Fan-out uses sequential `applyPlanChange`; mid-fail after pre-validate is rare (concurrency/DB). Atomic multi-mutation needs fence redesign, not a one-line patch. |
| BH8 | blind | medium | patch | Verified: success path never clears `assertiveRefuse`; stale text can linger / block re-announce. |
| BH9 | blind | low | reject | `predecessorEdges` supports server apply/tests; unused in cell render is dead weight, not user-facing. |
| BH10 | blind | medium | patch | Verified: web duplicates `filterLeafCandidates` as `filterLeafSuggestions` — drift risk. |
| BH11 | blind | medium | patch | Verified: fence-2-14 never exercises remove / re-lag through `applyPredecessorSet`. |
| BH12 | blind | low | reject | Manual checklist gaps are documentation; Core AC covered by fence/unit where harness exists. |
| BH13 | blind | low | defer | Unrelated `fence.test.ts` WAL flake noted in Implementation Notes; record in deferred-work. |
| EC1 | edge | medium | defer | Same root as BH7 — partial fan-out. |
| EC2 | edge | medium | patch | Verified: Enter/Tab commit then blur timeout can re-enter `commit` without a guard. |
| EC3 | edge | medium | patch | Same root as BH8 — stale assertive region. |
| EC4 | edge | medium | patch | Verified: `useEffect` syncs `draft` from `row.predecessorsText` even while `editing`. |
| EC5 | edge | medium | patch | Verified: constraint `useEffect` syncs type/date while editing. |
| EC6 | edge | false | reject | Same as BH5 — UX-DR6 exact cross-project sentence. |
| EC7 | edge | medium | defer | Same as BH7/EC1. |
| VG1 | verif-gap | medium | patch | Pre-verified: remove/re-lag apply path untested — same as BH11. |
| VG2 | verif-gap | medium | patch | Pre-verified: grid does not adopt `filterLeafCandidates` — same as BH10. |
| VG3 | verif-gap | medium | patch | Mapping already prefers `details.refuse`; missing pure unit test — extract + test. UI keep-text/RTL deferred (no harness). |

Grouped routes: **patch** (double-comma pick; commit guard; clear assertive; draft sync while editing; adopt `filterLeafCandidates`; remove/re-lag fence tests; refuseMessage unit test). **defer** BH4, BH7/EC1/EC7, BH13, VG3 UI half. Rejected BH1/2/5/6/9/12, EC6.

## Design Notes

**Fence returns codes; UI owns sentences.** `checkPlanInvariants` deliberately omits WP ids. On commit, run `validate` over the **proposed** graph (parsed edges) with a WBS map and format UX-DR6 lines ("2.1 → 2.3 → 2.1 would be a cycle", …). If that guard fails, never call the fence. If it passes, fence still re-checks as backstop — on fence refuse, re-explain from the same proposed graph.

**Canonical after success.** After a successful write, replace the draft with server `formatPredecessorsText` / `formatConstraintLabel` so lag=0 drops `FS+0d` and order stays sorted.

**Exception same interaction.** Constraint commit that schedules a violation is a successful fence write + recalc; refresh `getPlanGridState` and let existing `resolveException` paint the cell — do not invent a optimistic Exception.

**Parse location.** Prefer `packages/app` pure helpers next to formatters so web stays thin and tests run without React.

## Verification

**Commands:**
- `pnpm lint` — expected: exit 0
- `pnpm typecheck` — expected: exit 0
- `pnpm depcruise` — expected: exit 0
- `pnpm test` — expected: exit 0 (includes new 2.14 coverage)

**Manual checks (if no CLI):**
- Type a cycle into predecessors — under-cell prose, draft kept, assertive live region, no date movement.
- Edit constraint to an impossible must-finish — Exception glyph+word+number appears without opening a rail.
- Autocomplete never lists summary WPs; summary pred/constraint cells stay named em dashes.

---
title: 'Story 2.4 — the four graph rules are invariants, not entry checks'
type: 'feature'
created: '2026-09-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '914551093873acd8eac398d1871337424735a013'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing checks FR-6a's four graph rules today. A cycle, an ancestor/descendant link, a summary endpoint or a cross-project link is caught only by the database, and only for the last two. A cycle, or a re-parent that turns a legal link into an ancestor/descendant pair, would reach the scheduler, which would then have to guess.

**Approach:** Add the pure `validate(plan, edges)` in `packages/domain/src/schedule/validate.ts` (AR-46). It returns all four offence lists separately, in `compareWp` order, with each cycle rotated to its minimum WP (AR-56). Prove the database backstops AR-45 and AR-62 with statement tests.

**Decisions (founder, 2026-09-23):**
- **Q1 → B, Q3 → pure guard.** Add `packages/app/src/schedule/plan-invariants.ts` with `checkPlanInvariants(plan, edges) → Result<void, AppError>`. It calls `validate` and, on any offence, returns `invalid_input` whose `details` map `dependencies` to the rule codes present — `DEPENDENCY_CYCLE`, `ANCESTOR_DESCENDANT_LINK`, `SUMMARY_ENDPOINT`, `CROSS_PROJECT_LINK` — declared once beside the guard, in that fixed order. It takes no ctx, touches no port or database, and is not a use case, so the role gate is not touched. 2.9's `applyPlanChange` calls it on every mutation, before the write; a `deferred-work.md` entry says so.
- **Q4 → defer.** A `deferred-work.md` entry: 2.5's `domain/schedule.recalculate` calls `validate` before the passes and halts, naming the offending edges (FR-6a). Nothing named `recalculate` is created here (AD-25).
- **Q2 → A.** Mapping 23503/23514 in `runAuditedWrite` stays deferred. Its entry (l.1048) is re-pointed at the first `wp_dependency` / `work_package` writer (2.9/2.10), which should reuse the guard's rule codes.

## Boundaries & Constraints

**Always:**
- `validate` is total over its input. It never stops at the first offence, and every list is empty when the plan is legal.
- **Leafness comes from the plan's own parent links:** a WP that is some supplied WP's `parentId` is a summary. The stored `isLeaf` / `child_count` is never trusted, because `validate` must judge a *proposed* post-move plan.
- The four checks are independent. One edge may appear in several lists. For example, a leaf-to-leaf edge cannot be ancestor/descendant, so every ancestor/descendant edge is also a summary-endpoint edge, and both are reported.
- Output is deterministic under any shuffle of the WPs or edges, proved with `expectShuffleInvariant` (`tests/support/shuffle-invariant.ts`).
- `domain/schedule` imports nothing from `domain/attribution`, and `packages/domain` gains no dependency.

**Never:**
- No migration or schema change, no `applyPlanChange`, no `recalculate`, no use case, no port and no writer of `wp_dependency`. `app/schedule` holds only the guard.
- No UI, and no message keys for the offences (2.14 owns the wording).

## I/O & Edge-Case Matrix

| Scenario | Input | Expected |
|---|---|---|
| Legal plan | Leaf chain A→B→C | Four empty lists |
| Cycle | `3`→`1`, `1`→`2`, `2`→`3` | One cycle `[1, 2, 3]`, rotated to its `compareWp` minimum |
| Self-link | A→A | A one-WP cycle `[A]` |
| Two cycles, one component | A→B→A and B→C→B | One cycle per strongly connected component (see Design Notes) |
| Ancestor/descendant | S (summary) → its descendant leaf L | The edge is in `ancestorDescendant` **and** in `summaryEndpoints`, but not in `cycles` |
| Re-parent made it illegal | A leaf A→B plan where B is re-parented under A, no edge touched | Caught: the edge is now ancestor/descendant and has a summary endpoint |
| Summary endpoint | A leaf → a WP that has a child | In `summaryEndpoints`, naming the summary end(s) |
| Cross-project | An endpoint whose `projectId` ≠ `plan.projectId` | In `crossProject` |
| Unknown endpoint | An edge names an id absent from `plan.wps` | Throws, naming the id (a caller defect; Epic 3's Import Preview reports unknown references) |
| All four at once | One plan carrying each offence | All four lists are non-empty |

</frozen-after-approval>

## Code Map

- `packages/domain/src/schedule/order.ts` -- reuse `compareWp`, `WpOrderKey` and `canonicalWps` (a duplicate id already throws). The header comment lists "a rejected cycle" as a `compareWp` site.
- `packages/domain/src/types.ts:69` -- `WorkPackage` has `id`, `wbsCode` and `parentId` but no `projectId`, and there is no Edge or Plan type. Define `validate`'s minimal structural input types in `validate.ts` rather than widening `WorkPackage`.
- `packages/domain/src/index.ts:15` -- the barrel. Export `schedule/validate` next to `schedule/order`.
- `tests/support/shuffle-invariant.ts` -- `expectShuffleInvariant(fn, input, n)` and `seededShuffle`. Domain tests import this repo-root helper, as `order.test.ts` does.
- `packages/db/drizzle/0000_scheduling_schema.sql:342-356,425-426` -- `wp_dependency`:
  - there is one `project_id` for both ends, and the FKs `wp_dependency_predecessor_fk` / `_successor_fk` map `(tenant, project, wp, is_leaf)` to `work_package_leaf_key`;
  - both FKs are MATCH FULL and DEFERRABLE INITIALLY DEFERRED, so a cross-project edge fails at COMMIT with 23503;
  - `type` is plain `text` with `wp_dependency_type_check` (`= 'FS'`);
  - there is no self-link CHECK (a self-link is `validate`'s cycle, and adding a CHECK would need a migration, which is out of scope).
- `packages/db/src/schema-catalog.test.ts` --
  - l.175 and l.190 already pin MATCH FULL and the deferrable pair;
  - the statement matrix starts at about l.375: summary endpoint → 23503 at COMMIT (l.389), and `'SS'` → 23514 (l.466);
  - there is **no cross-project test**;
  - the file-local helpers are `refusedInRolledBackTx`, `writeTenantShell` and `writeWp`. `refusedInRolledBackTx` returns only the SQLSTATE. Extend it (or add a sibling) to also return `constraint`, so the tests can name the FK or CHECK that fired.
- `packages/app/src/result.ts` -- `Result`, `AppError`, and the `invalid_input` `details` contract (field → named rule codes, declared beside their raiser, as `PROGRAM_NOT_IN_DEPARTMENT` is). Reuse its constructors, and do not widen `APP_ERROR_CODES`.
- `packages/app/src/schedule/` -- new. `.dependency-cruiser.cjs` l.193/208 only fence `db/repositories/{schedule,plan-input}` to it, so it needs no rule change. Do not add it to `use-cases/index.ts`.
- `packages/app/src/use-cases/audited-write.ts:95-108` -- today an unrecognised error is rethrown and becomes a 500. Leave it untouched (Q2 → A).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- 2.3's shuffle entry is at l.1071, and the 23503/23514 entry at l.1048.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/schedule/validate.ts` -- `validate(plan, edges)` returning `{ cycles, ancestorDescendant, summaryEndpoints, crossProject }`, with AR-45/46/56 and FR-6a cited in the header.
- [x] `packages/domain/src/schedule/validate.test.ts` -- every matrix row; shuffle invariance over the all-four plan; every list's order pinned; the same cycle given from any start reported identically.
- [x] `packages/domain/src/index.ts` -- export `schedule/validate`.
- [x] `packages/app/src/schedule/plan-invariants.ts` + `.test.ts` -- `checkPlanInvariants` and its four rule-code constants. Test: a legal plan is `ok`; each offence alone yields exactly its code; the all-four plan yields all four codes in fixed order.
- [x] `packages/db/src/schema-catalog.test.ts` -- a cross-project dependency is refused at COMMIT with 23503 on a `wp_dependency_*_fk`. Each of `SS`, `FF` and `SF` is refused with 23514 on `wp_dependency_type_check`, while the column still accepts them as text, so widening is one CHECK.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- two new entries: 2.9's fence calls `checkPlanInvariants` on every mutation, and 2.5's `recalculate` calls `validate` and halts. Also append a `re-pointed:` line to the l.1048 entry, without rewriting it.

**Acceptance Criteria:**
- Given any plan, when `validate` runs, then it reports all four offence kinds separately, in `compareWp` order, identically under shuffled input.
- Given the repository, when lint, the typechecks, depcruise and `pnpm test` run, then all pass.

## Design Notes

**Cycles.** The Tarjan SCC algorithm runs over the edges. For each strongly connected component with more than one WP, or with a self-link, one cycle is reported: the shortest cycle through the component's `compareWp`-minimum WP. It is found by BFS, visiting successors in `compareWp` order, so it starts at the minimum by construction. Listing every elementary cycle is exponential. One named cycle per component is enough to reject the edit, and it is stable.

**Ordering.** `cycles` is sorted by first WP. The edge lists are sorted by (predecessor, successor) under `compareWp`. `summaryEndpoints` also names which end(s) are summaries.

## Implementation Notes

- `validate`'s input types are `PlanGraphWp` (`WpOrderKey` + `projectId` + `parentId`), `PlanGraph` and `PlanGraphEdge`; `WorkPackage` is not widened. Output ids, not rows: `cycles: string[][]`, edge lists as `{ predecessorId, successorId }`, and `summaryEndpoints[].summaryIds` names the summary end(s), predecessor first. A small `hasOffences` helper is exported beside it.
- Two caller defects throw besides an unknown endpoint: a duplicate WP id (through `canonicalWps`) and a loop in the parent links (checked up front, so the throw does not depend on which edges exist). A `parentId` naming a WP outside the plan ends the ancestor walk, because a foreign endpoint's tree need not be supplied.
- Tarjan is iterative (a 20,000-WP ring is tested); a duplicate edge is reported once per occurrence in the edge lists and collapsed in the cycle graph.
- The guard's codes are lowercase values (`'dependency_cycle'`, …) under the upper-case constant names, following `PROGRAM_NOT_IN_DEPARTMENT`. It is not exported from `packages/app`'s barrel; 2.9 imports it inside `app/schedule`.

## Spec Change Log

## Review Triage Log

Review pass 1 (2026-09-23): Blind Hunter (BH), Edge Case Hunter (EC) and Verification Gap (VG).

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | BH, EC | A self-link on a summary WP gives `summaryIds: ['S','S']` | low | `[pred, succ].filter(...)` in `validate.ts` keeps both ends when `pred === succ`. A direct correction | patch |
| 2 | BH, EC | `checkPlanInvariants` lets `validate`'s throws escape as a 500 | false | The throws are caller defects the frozen matrix requires ("Unknown endpoint → throws"); no caller exists that can reach them. The caller contract is fixed in #3 | reject |
| 3 | EC, BH | The 2.9 deferred entry says to pass "the Project's whole WP tree", but a cross-project edge's foreign WP is not in that tree, so `validate` would throw instead of reporting `crossProject`. It also never says to drop a deleted WP's edges | medium | `endpoint()` throws on any id absent from `plan.wps`. A 2.9 implementer following the entry literally would 500 | patch |
| 4 | BH, EC | `Math.min(...component)` can throw `RangeError` for a very large component, undoing the iterative Tarjan | low | Spread arguments are bounded in V8. Unreachable at the tested scale, but the fix is a direct correction (a loop) | patch |
| 5 | BH | `PlanGraphEdge` and `EdgeRef` are the same shape exported twice | low | Two exported names for one shape can drift. A direct correction (an alias) | patch |
| 6 | VG | `hasOffences` is tested only with empty and cycle-only results | medium | Pre-verified: dropping any non-cycle clause keeps the suite green, and 2.5 is told to gate on it | patch |
| 7 | VG | That a duplicate edge is reported once per occurrence (and once in cycles) is untested | low | Pre-verified. A single test, no new surface | patch |
| 8 | BH, EC, VG | The cross-project DB test puts setup inside the `try`, so a setup failure reads as "the FK is not deferred". It also accepts either FK name, although only the successor can fire | low | Both are direct corrections: move setup out of the `try`, and pin `wp_dependency_successor_fk` | patch |
| 9 | BH | The guard discards the offence lists 2.14 needs | false | Founder decision Q3: `details` carries codes only, and 2.14 reads `validate`'s lists. The cost is one extra pure call | reject |
| 10 | BH | The Verification section omits the app test | low | The fix edits this build's spec. Verified anyway: the full `pnpm test` ran, 88 files and 1148 tests | reject |
| 11 | BH | The spec's `in-review` disagrees with sprint-status's `in-progress` | false | The workflow syncs sprint-status at step 5 | reject |
| 12 | BH | `writeSecondProject` duplicates the project INSERT | low | A future NOT NULL column fails loudly in both places. Fixing it is a helper refactor, more than a direct correction | reject |
| 13 | BH | No test pins that the DB lets a cycle or an ancestor/descendant link through, and none covers a foreign predecessor | low | The docs already call the FKs only a backstop, and the successor case proves the shared-`project_id` mechanism. A new test surface | reject |
| 14 | BH | `validate` test gaps: empty plan, summary-only cycle, both ends foreign, tie between two shortest cycles | low | No defect is shown. The BFS visits successors in ascending canonical index and the shuffle tests pin determinism | reject |
| 15 | BH | A bare `validate` at the package root may collide | false | AR-46 fixes the name `domain/schedule/validate`, the domain has no other `validate` export, and typecheck passes | reject |
| 16 | BH | The "widening is one CHECK" test infers acceptance from `data_type = text` rather than dropping the CHECK | low | A domain type would read `USER-DEFINED`, so the proxy holds for everything except a trigger, which the schema does not have. More than a direct correction | reject |
| 17 | BH | `refusal()` drops a non-pg error's message | low | It mirrors the file's existing `refusalCode` (l.91). A diagnostics-only helper change | reject |
| 18 | EC | A foreign WP whose children are not supplied is judged a leaf | low | That edge is already reported in `crossProject`, and leafness from the supplied plan is the specified rule | reject |
| 19 | EC | A self-link inside a larger component is not named | false | By design (Design Notes): one cycle per component, and re-validation after the fix names what remains | reject |

## Verification

**Commands:**
- `pnpm exec vitest run packages/domain/src/schedule` -- expected: all pass
- `pnpm exec vitest run packages/db/src/schema-catalog.test.ts` -- expected: all pass, with the database up
- `pnpm lint && pnpm typecheck && pnpm depcruise` -- expected: exit 0

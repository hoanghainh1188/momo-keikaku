---
title: 'Story 2.10 — Work Packages, actual dates and Custom Fields, edited through the fence'
type: 'feature'
created: '2026-09-24'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '8c51e4569028b82cad82dafab2c0c4add95adb5f'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The fence (`applyPlanChange`, 2.9) only accepts duration / constraint / dependency patches. A PM still cannot create, delete, move or re-parent Work Packages, record actual dates, set Recorded %, or define Custom Fields through the single AD-25 writer — so FR-5 / FR-8 / FR-6b's remaining triggers have no home.

**Approach:** Widen `applyPlanChange`'s mutation union and `plan-input` writers to cover WP authoring (create / delete / move / re-parent, name, duration, effort, resources, milestone, constraint), actuals via `wp_status_event`, Recorded % via a new `pct_override_event` (`append_only`), and Custom Field schema + value writes. Every new shape keeps `checkPlanInvariants` on the proposed graph, `lockWatermark` before append-only INSERTs, 23503/23514 → `invalid_input`, and one transactional recalculation. Wire `recordedPct` + `pctOverrideSeqMax` in `resolveScheduleInputs`. Ship a thin UI layer (server actions + teaching refuse / complete + delete confirms); full tree grid stays 2.13+.

**Decisions (founder, 2026-09-24):**
- **Q1 → B.** Minimal server-action + thin UI for complete / delete confirm / derived-date teaching refuse. Full plan authoring surface stays 2.13+.
- **Q2 → A.** Compound mutation may advance `project.data_date` in the same fence call when the PM confirms an actual finish after the current Data Date (pulls that slice of 2.11 forward).
- **Q3 → B.** CF definition + value **schema** and fence value writes (and definition writes needed to seed values); definition UX later. No 100-CF UI; a write-path probe at 100 definitions is enough for NFR-P1.
- **Q4 → A.** Real read of Mapped Ticket first-observed activity as evidence beside actual start; one-click fill never auto-writes — only an accepted proposal becomes `source = accepted-from-proposal` on `wp_status_event`.
- **Keep the full spec**, with no split (~2184 tokens accepted).

## Boundaries & Constraints

**Always:**
- One fence only — no parallel WP / actuals / pct / CF writer outside `app/schedule` → `db/repositories/plan-input` (AR-43). Widen the union; do not invent a second path.
- Soft-delete WPs (`deleted_at`); hard-delete their edges in the same transaction; never auto-relink predecessor→successor (FR-5, AD-25).
- Leaf→summary: clear leaf-only columns **in the same UPDATE** that bumps the parent's `child_count` (CHECK is not deferrable). Same action must resolve duration/constraint/deps (move to child or drop) before commit.
- Actual dates live only in `wp_status_event` (full-state restatement per row; head = max seq). Refuse finish-before-start. Source on the event (typed / imported / accepted-from-proposal) for audit (NFR-A1). First-observed activity is shown as evidence with one-click fill and is never written by the system unless the PM accepts (Q4 → A).
- When an actual finish is later than the Project Data Date, the fence compound advances `project.data_date` in the **same** mutation when the PM confirms — never silently, never as a separate later write (Q2 → A).
- `pct_override_event` is created here as `append_only`, registered in `table-classes.ts`, policies regenerated. FR-30's mandatory-reason / Observed-vs-Recorded UI is Epic 6 — this story writes the Plan-grid Recorded % as an ordinary fence input.
- Call `checkPlanInvariants` before every new mutation shape (including create/delete/re-parent with no edge touch). Map 23503/23514 (and finish COMMIT-time deferred-FK residue from 2.9 where practical). `lockWatermark` on Project before first INSERT on `wp_status_event` / `pct_override_event` (no-op if fence already holds it).
- Custom Fields (Q3 → B): text / number / date / single-select schema + fence writes for definitions and values; no definition UX this story. 100 CFs is the NFR-P1 tested bound on the write path (101st warned, not blocked). CF values are plan inputs; they are **not** scheduling inputs; still written through the fence.
- Thin UI (Q1 → B): server actions wrapping the fence; complete flow (propose today, show first-observed evidence); delete confirm listing edge endpoints; derived-date edit refused with teaching copy and focus moved to the constraint cell. Planned dates are never typed — there is no planned-date column to write (FR-5 / UX-DR12).

**Never:**
- No full tree grid / What-moved band / exceptions rail / Schedule preset (2.13–2.16). Thin UI only (Q1 → B).
- No standalone Project settings UI (2.11); Data Date advances only via the actuals compound (Q2 → A).
- No CF definition management UI (Q3 → B); no FR-30 audited override ceremony; no Observed % as a scheduling input; no calendar publish (2.12); no `confirmImport`; no Gantt.
- Do not cascade-delete edges via FK; do not leave dead edges in the next run's inputs; do not store `remainingDays`; do not auto-write first-observed dates.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Create leaf | New WP under parent (or root) with name + optional duration/effort/resources/milestone | Row inserted; parent's `child_count` bumped; `schedule_run` with cause `wp_created`; `wp_schedule` rebuilt | Graph refuse → full rollback |
| Leaf→summary | Leaf with duration/constraint/deps given a child; resolution chooses move-to-child or drop | Same-statement clear of leaf-only cols + edge handling per choice; recalc | Unresolved leaf inputs → refuse before write |
| Delete WP with edges | Soft-delete WP that has in/out edges; confirm lists endpoints | Edges hard-deleted; no relink; cause `wp_deleted` | Missing WP → not_found |
| Re-parent | Move WP under new parent | `parent_id` + both parents' `child_count` adjusted; invariants on proposed tree; cause `wp_moved` | Ancestor/summary/cycle → `invalid_input` |
| Actuals happy | Typed or accepted-proposal actuals on/before Data Date | `wp_status_event` append; cause `actual_dates`; head feeds next resolve | Finish &lt; start → refuse |
| Actual after Data Date | Actual finish &gt; `data_date`; PM confirms advance | Same fence call writes status event **and** advances `data_date` (Q2 → A) | Decline advance → refuse whole mutation |
| First-observed fill | Mapped Tickets exist; PM one-click fills | Proposal shown as evidence; written only on accept with `source = accepted-from-proposal` | No mapping → no proposal (typed still works) |
| Recorded % | Patch percent on leaf | `pct_override_event` append; `recordedPct` resolved; cause `progress` | Out-of-range → refuse |
| CF value write | Definition rows exist; set values on WPs | Values persisted through fence; 100 defs meet NFR-P1 write probe; 101st warned | Invalid type/value → refuse |
| Derived-date refuse | PM types into a derived date cell | Teaching refuse; focus → constraint cell; nothing written | N/A |
| Closure | New writers for WP / status / pct / CF | AR-52 writers grep covers them; only `app/schedule` imports plan-input | Fail CI on leak |

</frozen-after-approval>

## Code Map

- `packages/app/src/schedule/apply-plan-change.ts` — widen `planMutationSchema` / `runCause` / `proposedGraph` (simulate WP set + `parentId` for create/delete/re-parent; compound actuals+`data_date`) / `applyMutation`. Reuse `runAuditedWrite`, fence-start `lockWatermark`, `checkPlanInvariants`, `mapSchedulingConstraint`, `recalculateProject`. Do not change auth/tx shape.
- `packages/app/src/schedule/recalculate-project.ts` — `resolveScheduleInputs`: stop stubbing `recordedPct: null` and `pctOverrideSeqMax: 0`; load pct heads + max seq (mirror `statusHeads` / `wpStatusSeqMax`).
- `packages/db/src/repositories/plan-input/index.ts` — add WP create/soft-delete/re-parent/patch (name, effort, resources, milestone), explicit edge deletes, `wp_status_event` append, `pct_override_event` append, CF definition/value writers, `data_date` patch for the actuals compound. Reuse `requireProject` / `isLeafWp` / returning+`projectNotFound`.
- `packages/db/src/repositories/schedule/index.ts` — `loadPlanRows`: pct heads + `pctOverrideSeqMax`; keep finish-without-start skip; soft-deleted WPs excluded from graph.
- First-observed port — read Mapped Ticket first activity date for a WP (reuse existing mapping / observation readers if present; otherwise add a narrow read in `packages/app` or `packages/db` used only by the complete-flow UI/server action). Never write from this path.
- Thin UI — server actions calling `applyPlanChange`; complete / delete confirm / derived-date teaching refuse. Prefer colocating under existing PM plan routes; do not build the 2.13 tree grid.
- `packages/db/src/schema.ts` + `packages/db/drizzle/0002_*.sql` (expand-only) — `pct_override_event` + CF definition/value tables (Q3 → B). Register in `packages/db/src/table-classes.ts`; run `pnpm db:policies`. Do not amend `0000_scheduling_schema.sql`.
- `packages/domain/src/schedule/cause.ts` — `ScheduleRunCause` already has `wp_created` / `wp_deleted` / `wp_moved` / `actual_dates` / `progress` / `data_date`; map new kinds; do not invent parallel cause names.
- `packages/domain/src/schedule/stored-run.ts` — watermarks already have `pctOverrideSeqMax`; ensure encode path receives real values.
- `.dependency-cruiser.cjs` + `tests/schedule-closure.test.ts` — keep `SCHEDULING_REPOSITORIES`; widen writers grep for `workPackage` insert/parentage/soft-delete, `wp_status_event`, `pct_override_event`, CF tables, `data_date` updates from plan-input only.
- `tests/schedule/fence.test.ts` (+ new cases) — create/delete/re-parent/actuals/pct/leaf→summary/compound Data Date; COMMIT-time 23503 audit-absence probe if practical.
- `packages/db/src/repo-writes.ts` `recordPlanDisposition` — **do not** route plan-grid edits here; Disposition stays FR-29.
- Continuity from 2.9 (done): fence lock for whole mutation+recalc; `pg-errors` walks `.cause`; minimal union was intentional — widen, don't fork.

## Tasks & Acceptance

**Execution:**
- [x] `packages/db/src/schema.ts` + `drizzle/0002_*.sql` + `table-classes.ts` — add `pct_override_event` + CF definition/value tables; regenerate policies; catalog tests green.
- [x] `packages/db/src/repositories/plan-input/*` — WP create/delete/move/re-parent/patch; status + pct appends with `lockWatermark`; leaf→summary same-statement clear; edge hard-delete on WP delete; CF schema writers; compound `data_date` advance.
- [x] `packages/app/src/schedule/apply-plan-change.ts` + `recalculate-project.ts` — widen mutation union; proposed-graph for tree edits; wire `recordedPct` / `pctOverrideSeqMax`; map causes including compound actuals+data_date.
- [x] First-observed read + thin UI (server actions) — complete / delete confirm / derived-date teaching refuse; one-click fill never auto-writes.
- [x] `tests/schedule-closure.test.ts` + `tests/schedule/fence*.test.ts` — AR-52 coverage for new writers; leaf→summary; actuals refuse; compound Data Date; 100-CF write-path probe.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` — close/annotate 2.10-directed residues (invariants on WP shapes, watermark on status/pct, 23503 COMMIT probe / generic mapper as far as this story takes them).

**Acceptance Criteria:**
- Given any new FR-5 / FR-8 scheduling or plan-input edit in scope, when it commits through `applyPlanChange`, then write + recalculation share one tenant transaction under the per-Project lock, and dependency-cruiser still forbids other importers of plan-input/schedule repos.
- Given a leaf that gains a child, when the PM resolves move-or-drop in the same action, then leaf-only columns clear in the same statement as `child_count` and the graph remains legal or the whole mutation rolls back.
- Given a WP delete with edges, when it commits, then edges are gone (not relinked), the WP is soft-deleted, and a `schedule_run` with cause `wp_deleted` exists.
- Given actual dates and Recorded %, when written, then heads come from `wp_status_event` / `pct_override_event`, watermarks are non-zero when events exist, and finish-before-start is refused.
- Given an actual finish after the Data Date, when the PM confirms, then the same fence call advances `data_date` and appends the status event; declining advances nothing.
- Given Mapped Tickets with first-observed activity, when the complete flow opens, then the evidence is shown and one-click fill writes only after accept with `source = accepted-from-proposal`.
- Given Custom Field schema + value writes, when a Project has 100 definitions, then the fence write path meets the NFR-P1 probe; the 101st is warned not blocked.
- Given a derived-date edit attempt in the thin UI, when submitted, then it is refused with teaching copy and focus moves to the constraint cell.
- Given `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test`, when they run, then all exit 0.

## Implementation Notes

- 2026-09-24: Branch `cursor/story-2-10-plan-fence-7832` off `main` @ `8c51e45`. Context loaded (`epic-2-context.md`). Starting with schema (`pct_override_event` + CF definition/value), then plan-input writers, fence widen, thin UI, tests.
- Schema: migration `0002_pct_override_and_custom_fields.sql` (MATCH FULL hand-edited); `pct_override_event` append-only; `custom_field_definition` / `custom_field_value` mutable-audited; policies regenerated; registry 32 tables / 25 tenant-owned.
- Fence widened: create/delete/reparent/patch WP, actuals (+ compound data_date), recorded %, CF definition/value. `resolveScheduleInputs` wires `recordedPct` + `pctOverrideSeqMax`. Leaf→summary clears leaf-only cols with `child_count` bump; edges hard-deleted on WP delete (no relink).
- Thin UI: plan page complete / delete confirm / derived-date teaching refuse; first-observed read from ledger of mapped tickets; accept writes `source=accepted-from-proposal` only.
- Deferred-work: invariants on WP shapes closed for 2.10; watermark on status/pct closed; generic `runAuditedWrite` 23503 COMMIT probe still open.
- Risk: 100-CF probe runs 101 full fence recalcs (slow); MATCH FULL must stay in migration (live DB repaired after generate-before-edit); Disposition `work_package` insert remains FR-29 exception.

## Spec Change Log

## Review Triage Log

## Design Notes

**Widen, don't fork.** 2.9's Q4 deliberately left authoring to this story. The product rule is one fence; Disposition's `insert(work_package)` remains the FR-29 exception path, not a plan-grid writer.

**Same-statement leaf clear.** PostgreSQL CHECKs are immediate. A two-statement "bump child_count then null duration" fails mid-way. The writer must UPDATE parent `child_count` and clear the former leaf's duration/constraint in statements that leave every row legal at end-of-statement; prefer one UPDATE per affected row that sets all required columns together.

**CF ≠ scheduling input.** Definitions/values are mutable plan state (AD-21) but absent from `ScheduleInputs`. Fence still owns the write so there is no second mutator; recalculation is idempotent for CF-only edits. Q3 → B ships schema + fence writes without definition UX.

**Compound Data Date (Q2 → A).** Advancing `data_date` inside the actuals mutation keeps "how far the plan has got" as one statement. Standalone settings UI remains 2.11.

## Verification

**Commands:**
- `pnpm lint` — expected: exit 0
- `pnpm typecheck` — expected: exit 0
- `pnpm depcruise` — expected: exit 0
- `pnpm test` — expected: exit 0 (includes schedule-closure + new fence cases)

---
title: 'Story 2.1 — The scheduling schema lands in one migration'
type: 'feature'
created: '2026-09-23'
status: 'done'
baseline_commit: '24072bd350313c220a735f88af4d417aff16c66f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-momo-keikaku-2026-09-20/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The schema is still the demo spike's: `drizzle-kit push`, no migration history, no foreign keys at all, planned/actual dates typed onto `work_package`, and none of the tables the scheduler (2.3–2.9) needs. Every Epic 2 story is blocked on it, and AD-30 allows exactly one pre-production migration to fix it.

**Approach:** Switch to `drizzle-kit generate` + `migrate` (AD-19) and produce **one** migration, `packages/db/drizzle/0000_*.sql`, that is the whole schema: the Epic 1 tables with composite `(tenant_id, …)` FKs, plus the scheduling slice (AR-59, SPINE:515–605). Three clauses drizzle-kit cannot emit are hand-written and pinned by catalogue assertions. Register every new table; regenerate the policy SQL.

**Founder decisions 2026-09-23:**
- **Scope kept whole** (~2,300 tokens), since AD-30 allows only one migration.
- **Branch 1-A.** 2.1 and 2.2 share one branch (`story/2-1-2-2-scheduling-schema`) and one PR, which merges only when CI is green after 2.2, so `main` is never red. 2.1 is done when the migration, seed and the schema-level DB tests (catalogue, RLS, registry, seed) work. Type errors outside `packages/db` belong to 2.2 and are listed in Implementation Notes. *Amended by the founder, 2026-09-23, review pass 1:* the golden EVM figures (`db-round-trip.test.ts`) and the Review, Mapping, Client View and Project-header reads in `cross-tenant.test.ts` need a Baseline, which 2-A removes. They belong to 2.2 on this branch.
- **Seed 2-A.** The seed writes no Baseline, because there is no engine to produce a `schedule_run` yet. The demo has no Baseline or EVM until Epic 4.
- **Match type 3-A.** `MATCH SIMPLE` applies to exactly the FKs with a nullable member column (`project.program_id`, `mapping_event.wp_id`, `disposition_event.wp_id`, if it gets an FK). Every other composite FK is `MATCH FULL`. CI asserts the expected `confmatchtype` for each FK.

## Boundaries & Constraints

**Always:**
- New tables: `wp_dependency` (`mutable-audited`), `schedule_run`, `holiday_calendar_version`, `wp_status_event` (`append-only`), `wp_schedule` (`derived`) — registered in `table-classes.ts` in dependency order (parents before children: `schedule_run` before `baseline_version`).
- `work_package`: add `duration_days int` (nullable), `constraint_type text NOT NULL DEFAULT 'asap' CHECK IN ('asap','must_start_on','must_finish_on')`, `constraint_date date`, `child_count int NOT NULL DEFAULT 0`, `is_leaf boolean GENERATED ALWAYS AS (child_count = 0) STORED`, the leaf-only CHECK (SPINE:518 verbatim), `UNIQUE (tenant_id, project_id, id, is_leaf)`; drop `start`, `finish`, `completed_at`, `milestone_done_at`.
- `project`: add nullable `project_start`, `project_finish`, `data_date`.
- `wp_dependency`: SPINE:519–520 shape — `type` CHECK `= 'FS'`, `lag_days int`, `pred_is_leaf`/`succ_is_leaf NOT NULL DEFAULT true CHECK (… = true)`, FKs into the `(tenant_id, project_id, id, is_leaf)` key `DEFERRABLE INITIALLY DEFERRED`, `MATCH FULL`.
- `wp_status_event`: the single home of actual start/finish — each row restates the WP's full actual state `(actual_start, actual_finish)` (nulls allowed; head = max `seq` per WP), plus `source`, `actor`, `at`.
- `baseline_version.schedule_run_seq NOT NULL` → `schedule_run`, composite with `tenant_id, project_id`; `baseline_wp` = `start, finish, baseline_mh, is_milestone, is_catch_all` + keys, leaf-only via FK into the `is_leaf` key. Pre-existing Baselines are deleted, not migrated.
- Composite tenant FKs on existing tables, each against a `UNIQUE (tenant_id, id)` (or wider) target: the seven relationships named in epics.md:814–818 plus every other tenant-owned child → parent pair (`mapping_event` → WP by `(tenant_id, project_id, wp_id)`). `MATCH FULL`, except the nullable-member FKs, which are `MATCH SIMPLE` (decision 3-A). `ON DELETE NO ACTION` everywhere, because Plan deletion is soft.
- CI asserts from `pg_constraint`/`pg_attribute`: `condeferrable` on the two leaf FKs, `confmatchtype` per FK, `attgenerated = 's'` on `is_leaf`.
- The spine records that the expand/contract exemption is spent (AD-19/AD-30).

**Never:** no scheduling logic, no use cases, no UI; no reads switched to the new tables beyond what compiles; no hand edits to `packages/db/sql/*.sql`; no second migration file.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| Fresh DB | empty Postgres 18 | `drizzle-kit migrate` then `db:policies` ×2 succeed; `rls.test` passes | — |
| Cross-tenant child | `work_package` row whose `(tenant_id, project_id)` names another Tenant's project | insert rejected | 23503 |
| Summary endpoint | dependency to a WP with `child_count > 0` at commit | commit rejected | 23503 at COMMIT |
| Mid-txn re-parent | edge added, then parent's `child_count` fixed later in same txn | commits | — |
| Summary with duration | `child_count > 0`, `duration_days = 3` | rejected | 23514 |
| Non-FS link | `type = 'SS'` | rejected | 23514 |

</frozen-after-approval>

## Code Map

- `packages/db/src/schema.ts` -- all table defs; header comment (lines 14–25) is stale ("no composite FKs") — rewrite. `is_leaf` is a plain boolean today.
- `packages/db/src/schema-membership.ts` -- `tenant_membership`; out of FK scope (global bridge).
- `packages/db/src/table-classes.ts` -- registry; class strings are hyphenated (`append-only`, `mutable-audited`, `derived`); order = delete order in `probe-tenants.ts:464`.
- `packages/db/src/registry.test.ts` -- hard-coded counts (24/17), global list, append-only list (:74–119), `TRUNCATE_ORDER` (:67) — update.
- `packages/db/src/rls.test.ts` -- live-catalogue test; home for the new `pg_constraint`/`attgenerated` assertions (or a sibling `schema-catalog.test.ts`).
- `packages/db/src/sql/generate.ts`, `scripts/db-policies.ts` -- regenerate via `pnpm db:sql`; do not hand-edit output.
- `packages/db/src/seed.ts` -- truncate list (:700), identity resync list (:711), WP/baseline inserts (:283, :302–350).
- `drizzle.config.ts` -- `out: ./packages/db/drizzle` (dir does not exist yet).
- `.github/workflows/ci.yml:390–398`, `scripts/demo.ts:85` -- replace `drizzle-kit push --force` with `drizzle-kit migrate`.
- `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` -- AD-19/AD-30 note that the exemption is spent.

## Tasks & Acceptance

**Execution:**
- [x] `packages/db/src/schema.ts` -- add tables/columns/FKs/UNIQUEs/CHECKs per Boundaries; drop the four WP columns; reshape baselines -- source for `generate`.
- [x] `packages/db/drizzle/0000_*.sql` -- `drizzle-kit generate`, then hand-append `DEFERRABLE INITIALLY DEFERRED`, `MATCH FULL`, `GENERATED … STORED`; a leading comment names each hand edit -- AD-30.
- [x] `packages/db/src/table-classes.ts`, `registry.test.ts`, `packages/db/sql/*.sql` -- register 5 tables, update counts, `pnpm db:sql`.
- [x] `packages/db/src/schema-catalog.test.ts` -- catalogue assertions (deferrable, match type per FK, `attgenerated`), plus the matrix's reject cases -- CI gate.
- [x] `ci.yml`, `scripts/demo.ts`, `package.json` -- `db:migrate` script; CI and demo use it.
- [x] `packages/db/src/seed.ts`, `packages/db/src/repo.ts`, `repo-writes.ts`, probe cleanup -- add the new tables to the truncate and delete order; stop writing Baselines and the dropped WP columns (decision 2-A); read actual dates from `wp_status_event`.
- [x] Spine -- record the spent exemption.

**Acceptance Criteria:**
- Given a fresh Postgres 18, when CI's prepare step runs, then the one migration, policies and seed apply, and every catalogue assertion passes.
- Given the migrated schema, when `information_schema` is read, then `work_package` has no `start`, `finish`, `completed_at`, `milestone_done_at`, and every tenant-owned FK is composite and includes `tenant_id`.
- Given a later schema edit regenerated by drizzle-kit, when a hand-written clause is lost, then the catalogue test fails naming it.

## Implementation Notes

**Where things landed.**
- Migration: `packages/db/drizzle/0000_scheduling_schema.sql` (+ `meta/`), generated by drizzle-kit 0.31.10 and hand-edited only as its leading comment lists. `drizzle-kit generate` afterwards reports "No schema changes"; `drizzle-kit check` is clean.
- drizzle-kit **does** emit `GENERATED ALWAYS AS (child_count = 0) STORED` for PostgreSQL, so it needed no hand edit; `attgenerated = 's'` is still asserted. The real hand edits are `MATCH FULL` (27 FKs), explicit `MATCH SIMPLE` (7 FKs) and `DEFERRABLE INITIALLY DEFERRED` (2 FKs). Recorded in AD-30.
- 34 composite FKs, all `ON DELETE/UPDATE NO ACTION`, every one `tenant_id`-led on both sides. Names and match types live in `schema.ts` (`FK_MATCH_SIMPLE`, `FK_DEFERRABLE`), which the catalogue test reads.
- `schema-catalog.test.ts`: FK set = Drizzle's declared set; `confmatchtype` per FK; `condeferrable`/`condeferred` on exactly the two leaf FKs; NO ACTION; composite + `tenant_id` on tenant-owned FKs; the seven audit-named edges; `attgenerated`; dropped/added `work_package` columns; and the five matrix rows. Checked by hand that dropping `MATCH FULL` on `rate_entry_resource_fk` and `DEFERRABLE` on `wp_dependency_successor_fk` fails two tests naming both constraints.
- `registry.test.ts` also checks that the registry is in FK dependency order, read off the Drizzle FKs, because `probe-tenants.ts` deletes in reverse registry order.

**Choices the spec left open (review these).**
- **`MATCH SIMPLE` goes beyond decision 3-A's three names.** It applies to every FK with a nullable member column, since `MATCH FULL` would reject every row whose nullable member is null (`tenant_id` is always set). Besides `project_program_fk`, `mapping_event_work_package_fk` and `disposition_event_work_package_fk` (which got an FK), four more FKs have a nullable member: `work_package_parent_fk`, `schedule_run_prev_run_fk`, `actuals_ledger_entry_baseline_version_fk` and `mapping_event_mapping_rule_fk`. The other way was to leave those four relationships with no FK.
- **No FK from tenant-owned tables to `tenant(id)`.** It could only be single-column, which conflicts with AC "every tenant-owned FK is composite". The `global` identity tables and `tenant_membership` also have no FKs, as scoped.
- **New table shapes.** The spine lists these columns without types, so I chose them:
  - `wp_dependency`: `seq` identity PK and `lag_days NOT NULL DEFAULT 0`.
  - `wp_status_event`: `source`/`actor`/`at` NOT NULL, and `source` has no CHECK.
  - `schedule_run`: `holiday_calendar_version_seq NOT NULL` with an FK (AD-11 says the run carries it), `anchor`/`computed_finish` as nullable `date`, and `outputs` nullable.
  - `wp_schedule`: PK `(tenant_id, project_id, wp_id)` and `state` CHECK nullable.
  - `baseline_wp`: gains `project_id`, `wp_is_leaf` and `is_catch_all`, with UNIQUE `(tenant_id, baseline_version_seq, wp_id)`.
  - `baseline_wp → work_package` points into the leaf key and is **not** deferrable. The catalogue test asserts non-deferral on every FK except the two in `wp_dependency`.
- **Seed (decision 2-A).** It writes no Baseline, and every `actuals_ledger_entry.active_baseline_version_seq` is null. `child_count` comes from parentage, and the writer refuses a fixture whose `isLeaf` disagrees. The two fixture milestones with a done date become `wp_status_event` rows (`actual_finish` only, `source = 'seed'`). Duration, constraint and the Project settings stay null/default.
- **`repo.ts` seam.** The domain `WorkPackage` keeps the spike's shape. `start`/`finish` read as null. `completedAt`/`milestoneDoneAt` read from the head `wp_status_event`.
- **Test harness adjustments**, needed for the DB-level tests to reflect the new schema:
  - `rls.test.ts`: tenant B now needs a Project and a Tracker Snapshot.
  - `tests/read-use-cases.ts`: the four unread scheduling tables are declared unreached, and Baseline labels are no longer required.
  - `tests/write-expectations.ts`: the new columns are added.
  - `seed-fixture-clock` / `seed-load-orchestration`: the Baseline assertions now target `wp_status_event.at` and `tracker_snapshot.seq`, and a new case checks that no Baseline is written.
  - `db-round-trip.test.ts` now holds the seed-suite lock shared. Without it, its reads and the seed suites' TRUNCATE deadlocked (40P01) in 3 of 5 full runs. After the fix it happened in 0 of 4.

**Handed to 2.2 on this branch (decision 1-A). Everything still red:**
- `pnpm typecheck` (root, `apps/web`, `apps/worker`), lint and depcruise are all **green**. The domain type did not change, so nothing outside `packages/db` failed to compile. 2.2 still owns reshaping `WorkPackage` and removing the spike's reads of `start`/`finish`/`milestoneDoneAt`: the Plan page, `evm.ts`, `review.ts`, `gen-fixtures.ts`, `fixtures.ts` and `load-generator.ts`.
- `pnpm test`: 998 pass and **27 fail, all with one cause**. `computeReview` throws `no baseline version with seq -Infinity` because the seed writes no Baseline (2-A). The failures are `packages/db/src/db-round-trip.test.ts` (7, golden EVM figures) and `tests/cross-tenant.test.ts` (20, the Review/Mapping/Client View reads and the golden-figure reproduction). 2.2 regenerates the goldens and makes the reads total without a Baseline.
- **Local databases created with `push` must be recreated** before `pnpm db:migrate` (README-DEMO has the command). Verification ran on a fresh database, `momo_verify`, in the same container, and the developer's `momo_keikaku` database was left untouched.

- **Orchestrator re-verification (2026-09-23, fresh `momo_verify`):** migrate ×2, pgboss ×2, policies ×2 and seed all succeed. typecheck, lint and depcruise are green, and `drizzle-kit generate` reports no drift. All five matrix tests ran and passed. `pnpm test` gave 997 passing and **28** failing, one more than the report: `cross-tenant > getProjectHeader > computes exactly the same numbers`. The cause is the same (no Baseline), and it too is handed to 2.2.

## Spec Change Log

## Review Triage Log

Pass 1 (2026-09-23): blind-hunter, edge-case-hunter, verification-gap.

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | edge (claim) | `db-round-trip.test.ts` and the Review/Mapping/Client View reads in `cross-tenant.test.ts` fail (28 tests), yet the frozen Decision 1-A says 2.1 is done when "the migration, seed and DB-level tests work" | high | Re-run on fresh `momo_verify` gives 28 failures. `repo.ts:146` computes `Math.max()` over zero Baselines, so the result is `-Infinity` and `computeReview` throws. The frozen Decisions 1-A and 2-A cannot both be met. | intent_gap. Resolved: the founder amended 1-A so these tests belong to 2.2. No revert. |
| 2 | verif-gap | CI has no drift gate between `schema.ts` and `packages/db/drizzle/` | medium | Pre-verified: no `drizzle-kit generate`/`check` step exists in `ci.yml`, `package.json` or `scripts/`. | patch |
| 3 | verif-gap | The `wp_status_event` read path and the seeded `actual_finish` values have no assertion | medium | Pre-verified: the only tests assert `events.length > 0` and `at`. | patch (seed values); head-selection test is required of 2.2 because 2.2 rewrites the reader |
| 4 | verif-gap | The leaf-only CHECK is tested only through `duration_days` | medium | Pre-verified: `writeWp` cannot set `constraint_type` or `constraint_date`. | patch |
| 5 | blind, edge, verif-gap | `repo.ts` now fills `completedAt` for milestones and changes its format to a date string, which lifts the EVM 99% cap for reached milestones | medium | Before: fixture milestones had `completedAt: null` and `milestoneDoneAt` set (`gen-fixtures.ts:245`). Now `completedAt = actualFinish` for every WP, and `evm.ts:147` reads it. | patch (`completedAt: w.isMilestone ? null : actualFinish`) |
| 6 | blind | No index on the referencing side of the two FKs into the `is_leaf` key (`wp_dependency` successor, `baseline_wp`). Every `child_count` change rechecks them, which puts the cost on the 300 ms recalculation budget. | medium | The referenced key changes whenever `is_leaf` flips, and `wp_dependency_edge_key` does not lead with the successor. The other FK targets (`id`, `seq`) are immutable. | patch (two indexes) |
| 7 | blind | The `wp_dependency` `why` text says "A deleted leaf takes its edges with it", but the FKs are NO ACTION and WP deletion is soft | low | `table-classes.ts:224` promises a behaviour no mechanism provides. Fixing it only means correcting the text. | patch (text) |
| 8 | blind | The `schema.ts:354` comment names `app/plan` as the `child_count` maintainer, but the epic context puts every plan write behind `app/schedule`'s fence | low | The epic-2 context says `db/repositories/plan-input` is imported only by `app/schedule`. Fixing it only means correcting the text. | patch (text) |
| 9 | blind | The spine (`:603`) still describes a "17-table schema" that lacks the AD-3 RLS, grants and triggers | low | Stale since stories 1.2 and 2.1: the registry has 29 tables and generates RLS, grants and triggers. Fixing it only means correcting the text. | patch (text) |
| 10 | blind | The `seed-fixture-clock` message says "two milestone actual finishes" but asserts `> 0` | low | Fixing it only means changing the assertion. | patch |
| 11 | blind, edge | Missing defensive CHECKs: self-edge, `parent_id <> id`, `duration_days >= 0`, `constraint_type`/`constraint_date` coupling, `child_count >= 0`, start ≤ finish on the project, actual and baseline dates | low | No writer exists yet. 2.4 reports cycles (all offences, not first) at the app level, and a DB self-edge CHECK would pre-empt that report. 2.14 edits a constraint "type, then date", so a coupling CHECK could reject its intermediate state. Each fix adds a guard on state not yet demonstrated. | reject (low, guard-adding) |
| 12 | blind, edge | A `schedule_run` `halted_reason`/`outputs` CHECK and a run-chain CHECK are missing | false | SPINE:167/551 say `outputs` may be dropped for runs that are neither pinned nor latest, so `(halted_reason IS NULL) = (outputs IS NOT NULL)` would be wrong. | reject |
| 13 | blind, edge | The seed takes `completedAt.slice(0,10)` as a UTC date, and `milestoneDoneAt ?? completedAt` drops one of the two | false | `fixtures/demo/project.json` has no non-null `completedAt`, so the branch is never reached with data. 2.2 regenerates the seed and fixtures. | reject |
| 14 | edge | The registry-order test passes silently when a parent table is unregistered | false | Another test in `registry.test.ts` requires every `schemaTables` entry to be registered exactly once, so `position.get(parent)` cannot be undefined. | reject |
| 15 | blind, edge | `actuals_ledger_entry_baseline_version_fk` is scoped to the Tenant only, so a ledger row can pin another Project's Baseline | medium | Real. The ledger row has no `project_id`, and the gap predates this change: before it there was no FK at all. Scoping it by Project needs a new column. | defer |
| 16 | blind | No tenant-owned table has an FK to `tenant(id)`, and `tenant_membership`, `session` and `account` have no FKs | low | Real, but outside the frozen scope ("between tenant-owned tables") and pre-existing. Tenant deletion is Epic 8. | defer |
| 17 | blind | CI runs `db:migrate` as the owner, not AD-19's `migrator` role | low | Pre-existing: `push` also ran as the owner. `__drizzle_migrations` sits in the `drizzle` schema, so the public-schema registry test does not cover it. | defer |
| 18 | blind | It is unclear whether soft-deleted children count toward `child_count`, and whether edges survive a soft delete | maybe-false | Settled by 2.10's WP delete/re-parent writer, which does not exist yet. | defer (medium, unverified) |
| 19 | blind | The spec's Verification and Implementation Notes disagree, and the sprint status and spec status differ | — | Fixing it means editing this build's spec. Status sync is step 5's job. | reject |
| 20 | blind | A manual `drizzle-kit push` against a migrated database could drop the hand-written clauses; the MATCH FULL gate protects a clause that has no current effect | low | This needs a deliberate manual misuse. The catalogue test would catch the result on the next CI run. | reject |


Pass 1 outcome: patches #2 to #10 were applied by the implementation agent and re-verified on a fresh `momo_verify`. Migrate ×2, pgboss ×2, policies ×2 and seed all succeeded. `drizzle-kit generate` reported no drift. Typecheck, lint and depcruise are green. `pnpm test` gave 1000 passing and 28 failing. The failures are 7 in `db-round-trip` and 21 in `cross-tenant`, all Baseline-dependent, and belong to 2.2 under the amended decision 1-A. Deferred items #15 to #18, plus 2.2's head-selection test, were appended to `deferred-work.md`.

## Verification

**Commands:**
- `pnpm typecheck` -- no errors in `packages/db`, `tests/` DB harness or `scripts/`; the remaining errors (spike readers) are listed in Implementation Notes and handed to 2.2 on the same branch
- `pnpm db:migrate && pnpm db:policies && pnpm db:policies && pnpm seed && pnpm test` against `pnpm db:up` -- pass

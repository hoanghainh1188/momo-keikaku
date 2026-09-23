---
title: 'Story 2.2 — The demo spike is disposed of, file by file'
type: 'refactor'
created: '2026-09-23'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1-the-scheduling-schema-lands-in-one-migration.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 2.1's migration removed the columns the spike read and stopped seeding Baselines, so the shared 2.1+2.2 branch is red: 28 DB tests fail because `computeReview` throws when there is no Baseline. The spike also still ships three files that no R0 story owns: `gantt.tsx`, `client-view.ts`, and the `c/[projectId]` page.

**Approach:** Reshape the domain `WorkPackage` to the new schema. Its actual dates come from the head `wp_status_event`, and it has no planned start or finish. Regenerate the fixture, seed, load generator and goldens. Make the reads total when no Baseline exists. Remove the three files and everything that exists only for them. Record every one of the 46 spike files with its disposition.

**Founder decisions 2026-09-23:**
- **Scope split.** This spec covers goals 1 and 2 only: a green branch, and the disposal. Two goals are deferred to `deferred-work.md` as follow-ups: moving the pages' `bigint` and date arithmetic into use cases, with the SV note fix, and extending the +30% layout gate.
- **Spec length kept** at about 2,100 tokens.
- **No-Baseline Review (Q1-A).** `computeReview` returns a *no-Baseline* Review. It does not throw.
  - `evm`, the SPI and CPI ratios, `forecast` and milestone divergence are `null`.
  - Coverage, AC and the Unplanned split still compute. Every mapped hour counts as non-baselined Unplanned, because every ledger entry's Baseline seq is null.
  - The bundle's `baseline` becomes `BaselineVersion | null` and `activeBaselineSeq` becomes `number | null`. No `-Infinity` and no `!` remain.
  - The Review page shows a "No Baseline yet" state in the EVM block, with the i18n key in `en` and `ja`. The Plan and Baselines pages render their no-Baseline case without throwing.
  - The DB goldens (`db-round-trip`, and the cross-tenant pinned figures) are re-pinned to the no-Baseline figures.
  - `demo-golden`, which runs in memory with the fixture Baseline, keeps its full EVM figures unchanged.

## Boundaries & Constraints

**Always:**
- **`WorkPackage` type.** Drop `start`, `finish`, `completedAt` and `milestoneDoneAt`. Add `actualStart` and `actualFinish` (`IsoDate | null`), read from the head `wp_status_event`, meaning the highest `seq` for that WP.
  - `evm.ts` keeps its old meaning. "PM-marked complete" is `!isMilestone && actualFinish !== null`, and "milestone done" is `isMilestone && actualFinish !== null`.
  - Any planned date the domain needs comes from the active Baseline's `baseline_wp` rows, never from the WP.
- **Fixture.** Regenerate `fixtures/demo/project.json` with `scripts/gen-fixtures.ts`. WP rows carry `actualStart` and `actualFinish` and no planned dates. The in-memory `baseline` object stays.
- **Goldens.** `packages/db/src/demo-golden.test.ts` is pure and in memory: it keeps full EVM from the fixture Baseline, and its figures do not change. Only its Client View section is removed.
- **Removals.**
  - Files: `gantt.tsx`, `client-view.ts`, `c/[projectId]/page.tsx`.
  - Code that exists only for them:
    - the use case `getClientView`, its role and composition entries, and its read-use-case registry entry;
    - the `GEOMETRY_KEY = 'fraction'` carve-out in the cross-tenant harness;
    - the shell nav link and the Review page's "preview client view" button;
    - `revalidatePath('/c/…')` in `actions.ts`, and the `/c/` URL in `scripts/demo.ts`;
    - the `.gantt-*` CSS and the Plan page's Gantt column;
    - i18n keys used only by these files, removed from both `en` and `ja`.
  - Shared `clientView.*` keys (`status`, `overall`, `slipped`, `milestones`, `milestone`, `done`, `open`, `wbs`, `work_package`) stay where they are.
- **Head-selection test.** A DB test proves that the highest `seq` per WP wins, and that a non-milestone WP carries no milestone date (deferred from 2.1).
- **Disposition table.** It goes into this spec's Implementation Notes: 46 rows with the git-measured list (commits `55220c4` + `13b047e`). It records three facts:
  - `present.ts` was replaced by `present/` in 1.2.
  - The table row's `{layout,plan}/page.tsx` is really `layout.tsx` + `plan/page.tsx`.
  - The count of 46 versus 43 is the three `*.test.ts` files.
- **Final state.** `packages/domain` keeps `zod` as its only runtime dependency. Typecheck, lint, depcruise and the full `pnpm test` pass on a fresh database.

**Never:** no scheduler logic; no new tables or migrations; no fabricated Baseline or `schedule_run`; no moving page arithmetic into use cases, and no layout-gate work (both deferred).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| No Baseline | seeded demo Tenant (2-A) | Review, Mapping and Header reads return; the Review's EVM block is `null` and Coverage/AC/Unplanned are populated (Q1-A) | none thrown |
| Head selection | two `wp_status_event` rows for one milestone, different `actual_finish` | the bundle carries the later `seq`'s date | — |
| Non-milestone done | head event with `actual_finish` on a leaf that is not a milestone | `actualFinish` is set; the WP counts as PM-complete in EVM, not as a milestone | — |
| Removed route | GET `/c/prj-ec2` | 404 | — |

</frozen-after-approval>

## Code Map

- `packages/domain/src/types.ts:77-98` -- `WorkPackage`, `BaselineWp` and `BaselineVersion`.
- `packages/domain/src/review.ts:130-186,261-270` -- throws when there is no active Baseline; milestones and divergence read `wp.finish`/`start`.
- `packages/domain/src/evm.ts:137,147` -- PV from the Baseline; the complete flag.
- `packages/domain/src/forecast.ts:25-37` -- already tolerates an empty Baseline list.
- `packages/app/src/ports/project-read.ts:48-54`, `packages/db/src/repo.ts:89-148,281,313` -- the `ProjectBundle` shape; the `Math.max()` of `-Infinity` and the `find()!` sit here.
- `packages/db/src/{fixtures,load-generator,seed}.ts`, `scripts/gen-fixtures.ts`, `fixtures/demo/project.json` -- regenerate them.
- `apps/web/src/app/p/[projectId]/{plan,review,baselines}/page.tsx` -- adapt to the new type and drop the Gantt. Keep their arithmetic (deferred).
- Client View fallout: `packages/app/src/use-cases/get-client-view.ts`, `use-cases/index.ts:11`, `packages/app/src/index.ts:93`, `role-declarations.ts:27,48`, `apps/web/src/server/composition.ts:64,419`, `shell.tsx:101-109`, `review/page.tsx:56`, `actions.ts:65`, `scripts/demo.ts:98`, `scripts/build-i18n-catalog.mjs:19,34`.
- Tests: `db-round-trip.test.ts:86-150` and `tests/cross-tenant.test.ts:367-400,679-733` (both re-pin); `tests/read-use-cases.ts:274,360`; `tests/role-declarations.test.ts:81,192`; `tests/web-composition.test.ts:684,724,843`; `projection-reads.test.ts:143-160`; `demo-golden.test.ts:179`.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/domain` -- reshape `WorkPackage`; implement the no-Baseline Review (Q1-A); delete `client-view.ts` and its export.
- [ ] `packages/db` (repo, fixtures, seed, load-generator) + `scripts/gen-fixtures.ts` + `fixtures/demo/project.json` -- read the head status event; regenerate.
- [ ] `packages/app` + `apps/web` -- remove the Client View use case and route, the Gantt, the dead i18n keys and CSS; adapt the three pages.
- [ ] Tests -- re-pin the DB goldens; add the head-selection test; update the registries and snapshots.
- [ ] This spec's Implementation Notes -- the 46-row disposition table.
- [ ] `deferred-work.md` -- close the discharged rows by naming 2.2 (`:481` Gantt half, `:491`, `:1004-1008` umbrella, `:1029`, and the `/c/` part of `:971`).

**Acceptance Criteria:**
- Given a fresh database prepared as CI does, when `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm test` run, then all pass.
- Given the repository, when it is searched for `gantt`, `client-view`, `clientProjection` or `/c/`, then only historical docs match.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- Fresh `momo_verify`: `pnpm db:migrate`, `pnpm pgboss:migrate` ×2, `pnpm db:policies` ×2, seed; then `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm test` -- all green, 0 failed.
- `pnpm exec drizzle-kit generate` -- "No schema changes".

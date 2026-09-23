---
title: 'Story 2.2 — The demo spike is disposed of, file by file'
type: 'refactor'
created: '2026-09-23'
status: 'done'
baseline_commit: '7cd5e0cb47105d6e119dd25e285aff1a8351d3b8'
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
  - *Amended by the founder on 2026-09-23 (review pass 1):* with no Baseline, the **Unplanned health indicator is `unavailable`**, the same as Schedule and Effort/Cost. So Overall is never red just because a Baseline is missing. The Unplanned split is still shown, for information, and the copy says it is not judged until a Baseline exists: every mapped hour counts as non-baselined until then.

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
- [x] `packages/domain` -- reshape `WorkPackage`; implement the no-Baseline Review (Q1-A); delete `client-view.ts` and its export.
- [x] `packages/db` (repo, fixtures, seed, load-generator) + `scripts/gen-fixtures.ts` + `fixtures/demo/project.json` -- read the head status event; regenerate.
- [x] `packages/app` + `apps/web` -- remove the Client View use case and route, the Gantt, the dead i18n keys and CSS; adapt the three pages.
- [x] Tests -- re-pin the DB goldens; add the head-selection test; update the registries and snapshots.
- [x] This spec's Implementation Notes -- the 46-row disposition table.
- [x] `deferred-work.md` -- close the discharged rows by naming 2.2 (`:481` Gantt half, `:491`, `:1004-1008` umbrella, `:1029`, and the `/c/` part of `:971`).

**Acceptance Criteria:**
- Given a fresh database prepared as CI does, when `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm test` run, then all pass.
- Given the repository, when it is searched for `gantt`, `client-view`, `clientProjection` or `/c/`, then only historical docs match.

## Implementation Notes

**Where things landed.**
- `WorkPackage` (`packages/domain/src/types.ts`) lost `start`, `finish`, `completedAt` and `milestoneDoneAt` and gained `actualStart`/`actualFinish`. `evm.ts` exports `isMarkedComplete(wp)` = `!isMilestone && actualFinish !== null`; a milestone's done date is `isMilestone && actualFinish`, read in `review.ts`'s `milestoneRows`.
- No-Baseline Review (Q1-A): `ReviewInput.activeBaselineSeq` is `number | null`. `ReviewResult.evm`, `money`, `forecast`, `milestones` and `divergence` are `| null`, and `behindPlan` is false. `computeHealth` takes `evm: EvmResult | null` and, with no Baseline, colours all three indicators — Unplanned Work included, per the amended Q1-A — `unavailable` with the rule "Unavailable — no Baseline yet", so Overall is `unavailable`, never red for that reason. The Unplanned split is still computed and shown. A seq that names no version still throws, because that is an inconsistent input, not a missing Baseline. `formulaVersion` falls back to `FORMULA_VERSION`.
- `repo.ts`: the head event supplies both actual dates. The active Baseline is a `reduce` by `seq` (null when there is none), so there is no `Math.max()` of nothing, no `-Infinity` and no `find()!`. `ProjectBundle.baseline` is `BaselineVersion | null` in both `repo.ts` and the app port.
- Fixture: `gen-fixtures.ts` keeps the planned dates internally, because the Baseline and the Ticket work windows are drawn from them and the PRNG sequence must not move. It writes WP rows without them. Regenerating with it gives `project.json` with the same Tickets and Baseline, and `demo-golden` passes unchanged. The seed writes one `wp_status_event` per WP with any actual date (M1 and M2).
- Pages: the Review page shows `review.no_baseline_yet` in the status metrics, Ahead/behind, Effort/Cost (AC, planned-scope and the Unplanned line still render) and Forecast. The Plan page drops the Gantt column and shows actual dates in place of "Current dates". The Plan header and the Baselines BAC caption fall back to the same key.
- Removed: the files `gantt.tsx`, `client-view.ts` and `c/[projectId]/page.tsx`; `get-client-view.ts` with its role, index, `ClientView` type and composition entries; `earnedProgress` from `domain/present` (it existed only for the Gantt and the client projection); the `GEOMETRY_KEY` carve-out; the shell's Client section; the "preview client view" button; `revalidatePath('/c/…')`; the `/c/` URL in `scripts/demo.ts`; the `.gantt-*`, `.preview-band` and `.client-sheet` CSS and the `--earned` token; 30 i18n keys used only by the removed code (all 5 `gantt.*`, 15 `clientView.*`, 4 `plan.*`, 3 `review.*` and 3 `shell.*` keys), plus the two already-unused `shell.client_view*` keys; the `app/c/` and `components/gantt` prefixes in `build-i18n-catalog.mjs`; and the `clientView`/`gantt` blocks in the one-shot `merge-story-19-i18n.mjs`, so that re-running it cannot bring them back.
- Tests: `db-round-trip` re-pinned to the no-Baseline figures. AC, Opening Balances (900.2 h, 900 228 mh), Coverage and the Unmapped groups keep their golden values. The Unplanned split is 166.0 / 1364.7 / 130.8 h (total 1661.5 h, 100.0% share), and Health is unavailable on all three indicators, Overall `unavailable`. The cross-tenant reproduction pins the same figures, so BAC and SPI are no longer in its census. The new `wp-status-head.test.ts` (probe `xtprobe-head`, band 920 000 000) covers head selection; it was checked by flipping the reader to `desc`, which made it fail. `review.test.ts` has 6 new cases and `evm.test.ts` has 2.

**Review pass 1 fixes (2026-09-23).** Unplanned indicator `unavailable` with no Baseline, and the goldens re-coloured. `review.no_baseline_yet` reworded: the split is shown and not judged. Planned-scope AC hidden with no Baseline. `no-baseline-{status,ahead-behind,effort-cost,forecast}` test ids. The Plan page flags an unreached milestone past its Baseline finish. The Baselines history shows an empty-state row (`baselines.none_recorded`). The head-selection test covers `actualStart`. A `computeEvm` case shows the 99% cap lifted by a leaf's actual finish and not by a milestone's. `baseline-read.test.ts` (probe `xtprobe-rdbl`, band 930 000 000) reads a present Baseline. `packages/i18n/src/key-usage.test.ts` checks every literal `t('…')` key in `apps/web/src`. A divergence row's actual dates are asserted. README steps are marked where they need a Baseline.

**Choices the spec left open (review these).**
- "Milestone divergence null" is read as **milestones and divergence** both null.
- `DivergenceRow.currentStart/currentFinish` became `actualStart/actualFinish`, and `MilestoneRow.currentDate` was dropped. A WP no longer has a current planned date, and the actual dates are the only dates it carries. The Review column "Current finish" is now "Actual finish" (new key `review.actual_finish`). It is amber when the actual finish falls after the Baseline finish.
- Plan page: summary rows show no actual dates. Rolling up actual dates is the scheduler's job, and a max over partly finished children would be wrong. Two Plan captions that described the Gantt were replaced by new keys (`plan.the_baseline_is_never_edited`, `plan.summary_rows_roll_up_effort`), and "Current dates" became `plan.actual_dates`. The `ja` catalogue repeats the English, as every existing key does.
- Tests that used `/c/` only as a sample path (`session-gate.test.ts`, one comment in `resolve-request-context.test.ts`) now use `/admin/…`. `README-DEMO.md` lost the `/c/` URL, the Gantt and Client View steps, and gained a note that the seeded demo has no Baseline. The rest of its walkthrough numbers have been stale since 2.1, and the note says so rather than rewriting it.
- `scripts/peek.ts` and `peek-db.ts` guard the null EVM.
- Search check: `gantt`, `client-view`, `clientProjection` and `/c/` now match only `_bmad-output/**` history, plus one comment in `cross-tenant.test.ts` about the removed carve-out that says "Client View" but none of the four terms.

**Disposition of the 46 spike files** (git-measured: `git show --name-status 55220c4 13b047e`, every row `A`, `*.ts`/`*.tsx`).
Three facts are recorded as the story requires:
- `packages/domain/src/present.ts` no longer exists; story 1.2 replaced it with the `present/` directory.
- The epics table's `{layout,plan}/page.tsx` row is really two files: `p/[projectId]/layout.tsx` and `p/[projectId]/plan/page.tsx`.
- The count is 46 against the proposal's 43 because of the three `*.test.ts` files: `attribution.test.ts`, `evm.test.ts` and `demo-golden.test.ts`.

| # | File | Disposition |
|---|---|---|
| 1 | `apps/web/next-env.d.ts` | Kept (adjusted in 1.1) |
| 2 | `apps/web/next.config.ts` | Kept (adjusted in 1.1) |
| 3 | `apps/web/src/app/actions.ts` | Kept; split and rewired in 1.2. 2.2 dropped `revalidatePath('/c/…')` |
| 4 | `apps/web/src/app/c/[projectId]/page.tsx` | **Removed in 2.2.** The Client View is FR-36 (R1) |
| 5 | `apps/web/src/app/layout.tsx` | Kept; rewired in 1.2 |
| 6 | `apps/web/src/app/p/[projectId]/baselines/page.tsx` | Kept; adapted in 2.2 (no-Baseline caption). Rebuilt in Epic 4 |
| 7 | `apps/web/src/app/p/[projectId]/connectors/page.tsx` | Kept; rewired in 1.2, rebuilt in Epic 5 |
| 8 | `apps/web/src/app/p/[projectId]/layout.tsx` | Kept; rewired in 1.2, rebuilt with the Plan surface in 2.13–2.16 |
| 9 | `apps/web/src/app/p/[projectId]/mapping/page.tsx` | Kept; rewired in 1.2, rebuilt in Epic 5 |
| 10 | `apps/web/src/app/p/[projectId]/plan/page.tsx` | Kept; 2.2 dropped the Gantt and shows Baseline plus actual dates. Rebuilt in 2.13–2.16 |
| 11 | `apps/web/src/app/p/[projectId]/review/page.tsx` | Kept; 2.2 added the "No Baseline yet" state and dropped the preview button. Rebuilt in Epic 6 |
| 12 | `apps/web/src/app/page.tsx` | Kept; rewired in 1.2 |
| 13 | `apps/web/src/components/disposition-rail.tsx` | Kept; rebuilt in Epic 6 |
| 14 | `apps/web/src/components/gantt.tsx` | **Removed in 2.2.** FR-7 puts the Gantt in R1 |
| 15 | `apps/web/src/components/map-ticket-form.tsx` | Kept; rebuilt in Epic 5 |
| 16 | `apps/web/src/components/scope-ledger-bar.tsx` | Kept; rebuilt in Epic 6 |
| 17 | `apps/web/src/components/shell.tsx` | Kept; 2.2 removed the Client nav section. 2.17 reuses the shell |
| 18 | `apps/web/src/components/ui.tsx` | Kept; restyled in 1.2 |
| 19 | `drizzle.config.ts` | Kept; adjusted in 1.1, and `generate`/`migrate` since 2.1 |
| 20 | `packages/db/src/client.ts` | Kept; rewritten in 1.2 |
| 21 | `packages/db/src/demo-golden.test.ts` | Kept; 2.2 removed the Client View section. The in-memory full-EVM figures are unchanged |
| 22 | `packages/db/src/fixtures.ts` | Kept; 2.2 reads `actualStart`/`actualFinish` |
| 23 | `packages/db/src/index.ts` | Kept; rewritten in 1.2 |
| 24 | `packages/db/src/repo.ts` | Kept; 2.2 reads the head status event and makes the Baseline total |
| 25 | `packages/db/src/schema.ts` | Kept; rewritten in 1.2 and 2.1 |
| 26 | `packages/db/src/seed.ts` | Kept; 2.2 writes status events from the fixture's actual dates |
| 27 | `packages/domain/src/attribution.test.ts` | Kept; fixture WP reshaped in 2.2 |
| 28 | `packages/domain/src/attribution.ts` | Kept (Epic 5) |
| 29 | `packages/domain/src/calendar.ts` | Kept (2.12, and Epic 5's `periodOf`) |
| 30 | `packages/domain/src/client-view.ts` | **Removed in 2.2.** Not in R0; AD-12 rebuilds it in R1 |
| 31 | `packages/domain/src/evm.test.ts` | Kept; 2.2 added the `isMarkedComplete` cases |
| 32 | `packages/domain/src/evm.ts` | Kept (Epic 6); the complete flag now comes from `actualFinish` |
| 33 | `packages/domain/src/forecast.ts` | Kept (Epic 6); unchanged, and not called without a Baseline |
| 34 | `packages/domain/src/health.ts` | Kept (Epic 6); tolerates a null EVM |
| 35 | `packages/domain/src/index.ts` | Kept; the `client-view` export was removed |
| 36 | `packages/domain/src/ledger.ts` | Kept (Epic 5) |
| 37 | `packages/domain/src/mapping.ts` | Kept (Epic 5) |
| 38 | `packages/domain/src/present.ts` | Replaced by `present/` in 1.2 (the file no longer exists). 2.2 removed `earnedProgress` from it |
| 39 | `packages/domain/src/review.ts` | Kept (Epic 6); returns the no-Baseline Review (Q1-A) |
| 40 | `packages/domain/src/types.ts` | Kept; `WorkPackage` reshaped in 2.2 |
| 41 | `packages/domain/src/units.ts` | Kept (1.2) |
| 42 | `scripts/demo.ts` | Kept (folded into 1.8); 2.2 removed the `/c/` URL |
| 43 | `scripts/gen-fixtures.ts` | Kept; regenerated in 2.2 without planned dates on WP rows |
| 44 | `scripts/peek-db.ts` | Kept as a developer utility with no story; handles the null EVM |
| 45 | `scripts/peek.ts` | Kept as a developer utility with no story; guards the null EVM |
| 46 | `vitest.config.ts` | Kept; adjusted in 1.1 |

**Verification (fresh `momo_verify`, 2026-09-23).** `db:migrate`, `pgboss:migrate` ×2, `db:policies` ×2 and `seed` succeeded. The root, `apps/web` and `apps/worker` typechecks, lint and depcruise are green. `pnpm test`: **74 files, 1017 tests, 0 failed**. `drizzle-kit generate` reported "No schema changes". `pnpm --filter @momo/web build` succeeded, and its route table has no `/c/[projectId]`, so `/c/prj-ec2` is Next's 404 for a signed-in user (an anonymous request is still redirected to `/sign-in` by the session gate first). The pages were not exercised in a browser, because signing in needs the demo password typed into the form.

- **Orchestrator re-verification (2026-09-23).** Ran on a fresh `momo_verify` with the CI prepare sequence, including `pnpm seed` (this loads `.env.development`, which sets `CLOCK_MODE=fixture`). Typecheck (root and web), lint and depcruise pass; `drizzle-kit generate` finds no drift. `pnpm test` passed 1017/1017, twice. A seed run through bare `tsx scripts/seed.ts` stamps `demo_anchor` from the wall clock and empties the current Reporting Period, so it is not the CI path. The matrix row "Removed route → 404" had no covering test, so the orchestrator added `apps/web/src/app/removed-routes.test.ts`. It pins that no `c` segment exists and that no top-level dynamic, catch-all or group segment could capture `/c/<id>`.

## Spec Change Log

## Review Triage Log

Pass 1 (2026-09-23): blind-hunter, edge-case-hunter, verification-gap.

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind | With no Baseline, the Unplanned indicator (and so Overall) is red, and `review.no_baseline_yet` says Unplanned Work "does not need" a Baseline | high | Re-pinned: non-baselined 0.0 → 1364.7 h, share 100%, Unplanned red, Overall red — caused only by the missing Baseline. Q1-A does not say how health reads with no Baseline. | intent_gap. Resolved: the founder amended Q1-A so Unplanned is `unavailable` with no Baseline. No revert; applied with the patches. |
| 2 | blind | The Review still shows planned-scope AC (0.0 h) with no Baseline | medium | `review/page.tsx` ~409 renders `mappedBaselinedMh + catchAllMh`, which is always 0 with no Baseline. | patch (hide it in the no-Baseline state) |
| 3 | blind, edge | An unreached milestone past its Baseline date is no longer flagged on the Plan page | medium | The Gantt's `slipped` went with it; the new `late` needs an actual finish. | patch (`late` also covers an unreached milestone with `asOf > b.finish`) |
| 4 | blind, edge | The Review renders `data-testid="no-baseline"` up to four times | low | Direct correction: give each placement its own test id. | patch |
| 5 | edge | The Baselines page shows headers and an empty body when there is no Baseline | low | `baselines/page.tsx:35-45`. Direct correction: add an empty-state row. | patch |
| 6 | verif-gap, blind | A non-null `actualStart` is never written or read | medium | Pre-verified: every event in the tests has `actualStart: null`. | patch |
| 7 | verif-gap | `computeEvm` never proves that a marked-complete leaf lifts the 99% cap | medium | Pre-verified: the golden cases only build WPs with `actualFinish: null`. | patch |
| 8 | verif-gap, blind | No DB test reads a Baseline that is present (`reduce` by `seq`, `baseline_wp` mapping, meta) | medium | Pre-verified: the seed writes none and no test inserts one. | patch (probe test with two versions) |
| 9 | verif-gap | No test checks that the `t('…')` keys the pages use exist in the catalog | medium | Pre-verified: 32 keys were deleted and only a parity test exists. A hand scan is clean today. | patch |
| 10 | blind | `review.test` does not assert the divergence rows' actual dates | low | A new branch with no assertion; the fix only adds a test. | patch |
| 11 | blind | Steps 1–7 of README-DEMO still quote SPI 0.91 and 16.8% amber | low | A note at the top does not fix a click-through script. Direct correction: mark the affected steps inline. | patch |
| 12 | blind | The `clientView.*` namespace survives | false | The frozen Always keeps the shared `clientView.*` keys deliberately. | reject |
| 13 | blind | New prose in `health.ts` is hard-coded English, and the new `ja` values mirror English | false | This follows the existing domain-prose pattern (retro item 11, deferred) and story 1.9's decision 2-B (English mirror). | reject |
| 14 | blind | The sprint status disagrees with the spec status | — | Step 5 syncs it. | reject |
| 15 | blind | `removed-routes.test` ignores redirects and middleware, rejects route groups, and says "404" where an anonymous request gets 307 | low | `next.config.ts` has no rewrites or redirects, and the middleware only gates the session. Rejecting route groups is a deliberate, commented choice. | reject |
| 16 | blind, edge | `activeBaselineSeq: null` with non-empty versions is silently read as no Baseline | low | `repo.ts` derives both from the same rows. The fix adds a guard for state not shown to occur. | reject |
| 17 | edge | In count mode with no Baseline, the Effort rule names the missing Baseline, not count mode | low | Both reasons are true, and the indicator is unavailable either way. | reject |
| 18 | edge | The frozen claim says "every mapped hour is non-baselined", but catch-all hours go to overflow | — | The code is correct; fixing it means editing this spec's frozen text. | reject |
| 19 | edge | The AC search for `/c/` matches `removed-routes.test.ts` | low | That test is the proof of the removal; the match is intended. | reject |
| 20 | edge | The follow-up row claims the Plan page computes a milestone-overdue flag | false | After patch #3 it does again. | reject |
| 21 | blind | There are no render tests for the three pages | low | Pre-existing: no page ever had one. | defer |


Pass 1 outcome: all patches were applied, and the founder resolved #1 by amending Q1-A. Re-verified on a fresh `momo_verify` with the CI prepare sequence: typecheck (root and web), lint, depcruise and `next build` pass, and `drizzle-kit generate` finds no drift. `pnpm test` passed 1025/1025 on 15 of 17 full runs. The other two runs failed intermittently, in suites this story does not touch: `mapping_event_pkey` 23505 in `project-scoped-ids`, and `membership`, `org-writes` and `seed-sequences` in the other. The captured cause is the known pre-existing race: client-allocated `seq` with no `pg_advisory_xact_lock` (`repo-writes.ts:107`), which is story 1.2's watermark slice (still in progress). This story adds two probe suites (`wp-status-head`, `baseline-read`), which may raise the concurrency the race needs.

## Verification

**Commands:**
- Fresh `momo_verify`: `pnpm db:migrate`, `pnpm pgboss:migrate` ×2, `pnpm db:policies` ×2, seed; then `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm test` -- all green, 0 failed.
- `pnpm exec drizzle-kit generate` -- "No schema changes".

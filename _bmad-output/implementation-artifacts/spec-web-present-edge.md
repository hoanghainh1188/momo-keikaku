---
title: 'AD-1 web → domain edge: apps/web imports domain/present only; the rest moves behind use cases, then the gate'
type: 'refactor'
created: '2026-09-21'
status: 'done'
baseline_commit: '54ae62e92c559879a32b17cd614e24ef1094133e'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-2-arithmetic-and-codec.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Eight `apps/web` files import `@momo/domain` directly, an edge AD-1's diagram does not
draw and the dependency-cruiser gate does not forbid. Most imports are presentation formatters,
but pages also run domain logic (`clientProjection`, `DEFAULT_VISIBILITY`, `mappingHead`) and
arithmetic (`sum`, `costOf`, `ratio`, `compareBigint`, `ZERO`, `isBehindPlan`) themselves.

**Approach:** Decided by the founder on 2026-09-21: allow the edge **for `domain/present` only**.
Everything else a page takes from the domain moves behind `packages/app` use cases or into the
Review result; pages import presentation through a `present` subpath; then a dependency-cruiser
rule forbids `apps/web → packages/domain` except `packages/domain/src/present/`.

## Boundaries & Constraints

**Always:**
- The six routes render HTML identical to the baseline commit (golden 2936.0 / 1661.5 / 0.91).
- A page imports from the domain only `@momo/domain/present` (formatters, and the presentation
  types it re-exports: `Mh`, `Ratio`, `Metric`), and nothing that computes.
- New read use cases follow slice 3's pattern (port, `Result`, `not_found`) and are registered in
  the cross-tenant harness, which drives them against two probe Tenants.
- Figures a page used to compute (PV/EV money, Unplanned component shares, "behind plan") come from
  the Review result, computed in the domain with the same helpers (`costOf`, `ratio`, `compareRatio`).
- The new rule is watched to fail: a page importing `@momo/domain` (the barrel) or a non-present
  module is refused by `pnpm depcruise`.

**Never:**
- No change to what is computed or rendered, to write use cases, to tenancy, or to the arithmetic
  representation. No change to `apps/worker`.
- No new edge beyond `apps/web → packages/domain/src/present/`; the codec in `present/` is not a
  page's to call.
- No ARCHITECTURE-SPINE edit in this build — the AD-1 amendment follows separately.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | On failure |
|---|---|---|---|
| Client page | `/c/prj-ec2` | same HTML; projection from a use case, never computed in the page | — |
| Client page, foreign/missing Project | another Tenant's id | `not_found` → 404, as the other pages | — |
| Mapping page | `/p/prj-ec2/mapping` | same rows, same order (by mh descending) from a use case | — |
| New read use case unregistered | exported with no harness entry | pure gate fails naming it, no database | — |
| Page imports `@momo/domain` or `@momo/domain/review` | any `apps/web` file | `pnpm depcruise` fails naming file and rule | — |
| Page imports `@momo/domain/present` | any `apps/web` file | allowed | — |

</frozen-after-approval>

## Code Map

- Domain imports in `apps/web` today: `c/[projectId]/page.tsx:4` (`clientProjection`,
  `DEFAULT_VISIBILITY`, used :25); `mapping/page.tsx:3` (`mappingHead` :18, `compareBigint` sort
  :30, plus `hours`, `share`); `plan/page.tsx:3` (`ZERO` fallback at :137 into `earnedProgress`);
  `review/page.tsx:5-8` (`costOf` PV/EV money :373/:380, `ratio` component share :173,
  `isBehindPlan` :99, plus formatters); `baselines/page.tsx` (`sum` of `baselineMh` :43);
  `connectors`, `gantt.tsx`, `scope-ledger-bar.tsx`, `ui.tsx` — formatters/types only.
- `packages/domain/src/index.ts` barrel re-exports everything; `present/index.ts` holds the
  formatters, `present/codec.ts` the codec. `client-view.ts` (`clientProjection`,
  `DEFAULT_VISIBILITY`), `mapping.ts` (`mappingHead`), `health.ts` (`isBehindPlan`,
  `compareRatio`), `review.ts` (`computeReview`, `ReviewResult`), `units.ts` (`sum`, `costOf`,
  `ratio`, `compareBigint`, `ZERO`).
- `packages/app/src/use-cases/` (`getProjectHeader`, `getProjectReview`, `runProjectRead`,
  `index.ts` = the enumerated surface) and `ports/project-read.ts` (`ProjectReview` restates the
  domain's `ReviewResult` by type import, so a new Review field follows).
- `apps/web/src/server/composition.ts` — add bindings for any new use case; `server/result.ts`
  `valueOrNotFound` for the 404.
- `tests/read-use-cases.ts` + `tests/cross-tenant.test.ts` — register each new read (`invoke`,
  `mustSurface`); `tests/web-composition.test.ts` if bindings are added.
- Resolution: `tsconfig.base.json` maps `@momo/domain/*`; `apps/web/tsconfig.json` maps bare names
  only; `tsconfig.depcruise.json` is the resolver config; `vitest.config.ts` aliases. A subpath needs
  mapping in each so Next, TypeScript, vitest and depcruise all land on `packages/domain/src/present`.
- `.dependency-cruiser.cjs` — add the rule beside `apps-not-to-db`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/review.ts` (+ `present/index.ts`) -- Review result gains PV/EV money, each
      Unplanned component's share, and the behind-plan flag; `present` re-exports `Mh`/`Ratio`/
      `Metric` as types and accepts a missing progress ratio (drops the page's `ZERO`).
- [x] `packages/app/src/use-cases/` -- `getClientView` (the projection with default visibility) and a
      Mapping read returning the Mapping surface's rows already joined and ordered; exported, tested
      with a fake port.
- [x] `apps/web/src/server/composition.ts` + the pages/components -- call the new bindings; import
      only `@momo/domain/present`; baselines' total from the result or a native sum, no domain import.
- [x] Path mapping for `@momo/domain/present` in `apps/web/tsconfig.json`, `tsconfig.depcruise.json`,
      `vitest.config.ts` as needed.
- [x] `tests/` -- register the new reads in the harness; extend `web-composition.test.ts` if bindings
      are added.
- [x] `.dependency-cruiser.cjs` -- rule `web-to-domain-present-only`; `deferred-work.md` -- resolve
      the web→domain entry, record anything found.

**Acceptance Criteria:**
- Given `apps/web`, when its imports are listed, then every domain import is `@momo/domain/present`.
- Given the suite, when lint, the three typechecks, depcruise and tests run, then all pass, the
  harness drives the new reads and still discharges NFR-S1.

## Implementation Notes

- **The rule allows `present/index.ts`, not the whole `present/` directory.** The intent says the
  codec "is not a page's to call", and `present/index.ts` used to `export * from './codec'`, so
  `@momo/domain/present` would have carried it. `present/index.ts` no longer re-exports the codec;
  the domain barrel exports `./present/codec` directly (every existing caller imports it from
  `@momo/domain`, unchanged), and `web-to-domain-present-only`'s `pathNot` is
  `^packages/domain/src/present/index[.]ts$`. Stricter than the Code Map's "except
  `packages/domain/src/present/`"; it forbids nothing a page imports today.
- `present` re-exports `Jpy` beside `Mh`/`Ratio`/`Metric` (types only). `earnedProgress` takes
  `Ratio | undefined` and presents a missing one as zero, so the Plan page drops `ZERO`.
- `ReviewResult` gained `money: { pvJpy, evJpy }` (`costOf(pvMh|evMh, defaultRateYenPerHour)`),
  `behindPlan` (`isBehindPlan(evm.spi)`), and `share: Ratio | null` on each Unplanned component
  (`ratio(mh, cumulative.unplannedMh)`, null while that is zero) — the page's own expressions,
  moved. `ProjectReview` follows by its type import of `ReviewResult`.
- New reads, slice 3's pattern (`runProjectRead` over `loadReview`, same `not_found`/`invalid_input`
  contract): `getClientView` → `{ clientName, projection }` with `DEFAULT_VISIBILITY`;
  `getProjectMapping` → `ProjectMapping` (Coverage figures, leaf non-milestone WPs with
  `wbsCode`/`name`/`label`, rules with the target's label, the top 60 Tickets by hours — stable
  sort, so ties keep snapshot order — each with `wpId`/`wpLabel`/`source` from the current
  Mapping head). The pure join is `toProjectMapping`, deliberately not exported from
  `use-cases/index.ts`. Both are bound in the composition root and exported as types from `@momo/app`.
- Pages: Client View calls `getClientView`; Mapping calls `getProjectMapping`; Review reads
  `r.money`, `r.behindPlan`, `c.share`; Baselines sums natively (`reduce(..., 0n)`); every
  component and page imports only `@momo/domain/present`.
- Resolution: `apps/web/tsconfig.json` maps `@momo/domain/present` explicitly (it maps bare names
  only); `vitest.config.ts` gets an alias ahead of the bare `@momo/domain` one, because Vite matches
  an alias key as a prefix and would resolve the subpath to `index.ts/present`;
  `tsconfig.base.json` and `tsconfig.depcruise.json` already had `@momo/domain/*`, and depcruise
  lands on `present/index.ts` (no `not-to-unresolvable` hit).
- Harness: both reads registered with their own `mustSurface` (`clientViewLabels` — names,
  Milestones, WBS-level-2 schedule; `projectMappingLabels` — leaf WPs and rules; the top-60 Tickets
  are covered by the relative assertions rather than restated). Two harness changes were needed
  and are recorded in `deferred-work.md` where they leave a gap: a per-entry `minimumLabels`
  (the client projection carries 84 labelled strings, under the default floor of 100; set to 50),
  and `canonicalise` treating a non-integer under key `fraction` — `earnedProgress`'s sanctioned
  geometry float, which the codec otherwise refuses — as text.
- Tests: `packages/app/src/use-cases/projection-reads.test.ts` (fake port: projection, join and
  order, the 60 cap, the shared contract); `tests/web-composition.test.ts` now also drives the four
  read bindings (right port, demo Tenant, restricted handle, and the use case's own value shape);
  `demo-golden.test.ts` pins the three new Review fields at the baseline's rendered values
  (76.6% / 0.0% / 23.4%, ¥5,839,220 / ¥5,323,172, behind plan).

## Spec Change Log

- 2026-09-21 (after review round 1) — the ARCHITECTURE-SPINE AD-1 amendment, which this spec's
  Never list left for afterwards, was made in the same branch once the code was green: the dotted
  `apps/web → domain/present` arrow, the AD-1 clause and gate bullet, AD-4's layout-only float
  exception, and AD-12 placing `clientProjection` in `domain/client-view`. Two rounds of adversarial
  review (`reviews/review-adversarial-ad1-web-present.md`).

## Review Triage Log

Round 1, 2026-09-21 — blind-hunter (B), edge-case-hunter (E), verification-gap (V).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| B1 / V2 | `web-to-domain-present-only` watched to fail by hand only | medium | Pre-verified; no test runs dependency-cruiser on planted imports — the same holds for every older rule | defer |
| B2 | Nothing limits what `present/index.ts` re-exports; a computing re-export would pass the gate | medium | The rule allows the file; depcruise does not follow re-exports | patch |
| B3 | Subpath resolves through three alias configs, no `exports` map | low | Works in all four tools today and the gate covers misuse; an `exports` map changes resolution repo-wide | reject |
| B4 | `earnedProgress(undefined)` renders 0% and its branch is untested | low | Same semantics the page had with `?? ZERO`; the test is missing | patch |
| B5 | `behindPlan` is false while SPI is unavailable | low | Pre-existing: `isBehindPlan` answered false for an unavailable SPI before this change | reject |
| B6 / V1 | The zero-Unplanned `share: null` guard, now inside every Review load, has no test | medium | Pre-verified; removing it throws `RangeError` behind six pages with every test green | patch |
| B7 | `getClientView` has no runtime check that the projection carries no money | false | `demo-golden.test.ts` walks `clientProjection`'s output and fails on any bigint or Ratio; the use case returns it unchanged | reject |
| B8 | `web-composition.test.ts` hardcodes 60; its Review fixture copies `loadReview`'s assembly | low | The constant is a direct fix; the fixture copy is test-only | patch (constant) |
| B9 | `minimumLabels: 50` has no derivation | low | A floor under a measured 84; fix adds derivation logic | reject |
| B10 | Mapping page re-maps `leafWps` needlessly | low | Cosmetic | reject |
| B11 | `invalid_input` for an absent `projectId` untested in the new reads | low | Only `''` is in the shared-contract table | patch |
| B12 | Barrel header narrates history | low | Cosmetic | reject |
| E1 | Mapping row `wpId` could be `''` while `wpLabel` is null | false | An unmap is stored with `wp_id` null (`repo-writes.ts`), so the head never carries `''` | reject |
| E2 | Floats inside an array under a key named `fraction` skip the codec's refusal | low | Name-matched exemption already recorded in deferred-work; no such array exists | reject |

## Verification Results

- 2026-09-21: `pnpm lint`, `pnpm typecheck`, `pnpm --filter @momo/web typecheck`,
  `pnpm --filter @momo/worker typecheck`, `pnpm depcruise` (101 modules, 257 dependencies) — exit 0;
  `pnpm test` with `REQUIRE_DB=1` — 23 files, 332 tests pass (cross-tenant harness 37, driving
  four reads).
- `grep -rn "@momo/domain" apps/web/src` — every import is `@momo/domain/present` (the one other hit
  is a comment in `gantt.tsx`).
- Six routes captured on `next dev` as `momo_app` (fresh `.next`, re-seeded, scripts/link tags and
  action ids stripped) before the change and after it: review, plan, mapping, baselines, connectors
  and `c/prj-ec2` identical. `/c/nope`, `/c/prj-nope`, `/p/nope/mapping` → 404. Dev server stopped;
  `tenant` holds `ten-momo` only.
- Sabotage, each watched to fail then restored: a page importing `@momo/domain`, `@momo/domain/review`,
  `@momo/domain/present/codec` and `packages/domain/src/units` by relative path — `pnpm depcruise`
  names `web-to-domain-present-only` and the file each time; `toProjectMapping` exported from
  `use-cases/index.ts` with no registry entry — the pure gate names it; `getClientView` loading
  with a constant Tenant instead of `ctx.tenantId` — five harness assertions fail.

## Verification

**Setup:** `pnpm db:up`; export `DATABASE_URL`, `APP_DATABASE_URL`, `REQUIRE_DB=1`.

**Commands:**
- `pnpm lint`, the three typechecks, `pnpm depcruise`, `pnpm test` -- all pass.
- `grep -rn "@momo/domain" apps/web/src` -- every hit is `@momo/domain/present`.
- Six routes on `next dev` as `momo_app`, HTML diffed against a baseline-commit worktree (scripts,
  link tags, action ids stripped) -- identical; `/c/nope` → 404.

**Sabotage (each watched to fail, then restored):** a page importing `@momo/domain`; a page
importing `@momo/domain/review` by subpath; a new read unregistered in the harness; the client
use case ignoring `ctx.tenantId`.

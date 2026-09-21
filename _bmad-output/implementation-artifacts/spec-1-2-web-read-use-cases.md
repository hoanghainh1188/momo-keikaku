---
title: 'Story 1.2 slice 3 — the seven read call sites move onto packages/app use cases'
type: 'feature'
created: '2026-09-21'
status: 'done'
baseline_commit: '45468c385595c83cf6f221dc8b51e6dbb8fbaa71'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-2-cross-tenant-harness.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** AD-1's central rule is violated in the code every page renders: nine `apps/web` files
import `@momo/db` directly, one imports `drizzle-orm`. The deeper problem is that there is no
application layer to move them to — `packages/app` holds configuration and nothing else, so
authorisation (1.5), audit (1.3) and the Tenant on a request (1.4) have no surface to attach to,
and each of those stories would otherwise have to invent one.

**Approach:** Build the minimum use-case layer and move the seven **read** call sites onto it — a
port `packages/app` declares, two use cases, a `Result` type with a closed error enum, and one
named composition root that wires them. Move the cross-tenant harness's read-surface pointer in
the same change, so isolation cover follows the code instead of lagging it.

## Boundaries & Constraints

**Always:**
- **Two use cases, not seven.** The seven call sites' union is the whole `ProjectBundle` plus the
  whole `ReviewResult`; the layout reads four fields, the six pages read the rest. A narrower DTO
  per page is a rewrite of the views, not a rewiring, and it is not this slice.
- **Direction holds: `packages/app` may declare `@momo/domain`, never `@momo/db`.** The port is
  declared in `packages/app`; `packages/db`'s existing functions satisfy it **structurally**, so
  no new import edge is created in either direction and the type check happens at the wiring point.
- **One named composition root**, `apps/web/src/server/composition.ts` — the only file under
  `apps/web` permitted to import `@momo/db`. The next slice's dependency-cruiser rule names that
  exact path, so the exception is auditable rather than a hole. Recorded as a deliberate second
  carve-out beside `packages/db/auth`, which ARCHITECTURE-SPINE.md calls the only one.
- **`ctx` carries `{ tenantId }` and nothing else** — a story-1.4-shaped placeholder with one
  field, constructed in the composition root, replacing `WEB_TENANT_ID` in one place rather than
  seven.
- **`Result<T, AppError>` with a closed `code` enum and a `messageKey`** — the architecture's
  shape, kept to the two codes this slice can actually produce. The domain returns codes, never
  prose.
- **The harness moves with the surface.** `cross-tenant.test.ts` enumerates the read surface
  mechanically; after this slice the read use cases are in `packages/app`, so the enumeration must
  point there and still fail naming an unregistered read. It must keep working as the restricted
  role, and it must keep discharging NFR-S1.
- **The six routes render identically.** The golden figures (2936.0 / 1661.5 / 0.91) and every
  existing gate stay green — 146 tests, lint, all three typechecks.

**Never:**
- **No write use cases and no `dependency-cruiser`** — the next slice, deliberately: `actions.ts`
  is the file that still imports Drizzle, so the gate cannot go on until the writes move.
- **No audit module** (story 1.3), **no `RequestContext` or `resolveRequestContext`** (1.4), **no
  roles or authorisation checks** (1.5). A use case gains none of those here.
- **No narrowing of what the pages render**, no change to `packages/domain`, no arithmetic or
  codec rewrite, no watermark advisory locks.
- No new production dependency beyond a workspace one, and no change to `packages/db`'s public
  behaviour — only where its functions are called from.

## Decisions taken at approval, 2026-09-21

- **Reads only; the writes and the gate are the next slice.** The seven read call sites and the
  five write actions share no code, so they split cleanly — but they do **not** split from the
  gate, because `actions.ts` is the file that still imports Drizzle. Hence reads, then
  (writes + gate), not (reads + writes) then gate.
- **The gate's breadth, decided now because it constrains this slice's shape:** AC-6's wording —
  `apps/*` may not import a repository or Drizzle — not full AD-1. Full AD-1 would also flag
  `apps/worker`'s `pg-boss` and `pg` and drag the queue-adapter move into `packages/adapters`
  along with it, which is the day-one-red the epic warns about. Recorded in `deferred-work.md`.
- **The composition root is one named file in `apps/web`**, not a new `packages/composition`.
  Standard hexagonal practice puts it where it already is, dependency-cruiser can name one exact
  path so the exception is auditable, and a shared composition package would split per app anyway
  because the worker composes pg-boss instead. It is a deliberate **second** carve-out beside
  `packages/db/auth`, which the spine calls the only one, and it is recorded as such.
- **The cross-tenant harness moves to a root `tests/` directory** and enumerates the use cases.
  It needs `@momo/db`, `@momo/app` and the wiring between them at once, which makes it a
  composition root of its own; a suite that spans layers belongs outside all of them, and this
  keeps a second ignore out of the dependency-cruiser rule set. It also buys one thing the
  repository-level enumeration cannot prove: that a use case has not *widened* what the
  repository returns — swallowed an error and returned a default, say. `vitest.config.ts` gains
  the directory.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | On failure |
|---|---|---|---|
| A page renders | a use case called with `{ tenantId }` and a known `projectId` | the same data the direct call returned; the route renders the pinned golden figures | — |
| A Project that does not exist, or belongs to another Tenant | `{ tenantId: A }`, `projectId` of B | `Result` carrying `not_found` — never `forbidden`, so existence is not disclosed | fail if it throws a raw error or discloses |
| A malformed input | empty or absent `projectId` | `invalid_input` with a message key, not a thrown string | — |
| A new read use case | an exported use case with no harness registry entry | the harness's pure gate fails naming it, with no database | runs with no database |
| Isolation, after the move | every read use case driven against two probe Tenants | unchanged: nothing of the other Tenant, NFR-S1 still discharged | name the use case and the strings |

</frozen-after-approval>

## Code Map

- `packages/app/src/` — `config.ts` and `index.ts` only; `index.ts` already says "use cases arrive
  with story 1.2 onwards". `package.json` declares **`zod` alone**. It needs `@momo/domain` added,
  and a `paths` entry: `tsconfig.base.json` maps only `@momo/domain` and `@momo/db`; `@momo/app` is
  mapped in `apps/web/tsconfig.json` only, and `vitest.config.ts` aliases neither.
  `config.ts` exports an **eager** `config` singleton reading `process.env` — do not put use cases
  behind that barrel or every pure use-case test needs `DATABASE_URL`.
- `packages/db/src/repo.ts` — `loadProjectBundle(db, tenantId, projectId)` and `loadReview(...)`,
  both already opening `withTenant` internally, so the pages never see a `Tx`. These are what the
  port must describe. `projectId` still defaults to `prj-ec2` — the use case must not carry that
  default forward.
- The seven read call sites, with what each actually reads:
  `p/[projectId]/layout.tsx:16` — four fields (`project.name`, `meta.clientName`,
  `meta.snapshotAgeMinutes`, `input.pinnedSnapshot.observedAt`);
  `review/page.tsx:17` — `bundle.project`, `input.period`, `wps`, `baseline.wps`,
  `meta.connector.spaceLabel` plus ~45 `review` paths;
  `plan/page.tsx:16`, `mapping/page.tsx:17`, `baselines/page.tsx:15`, `connectors/page.tsx:15`,
  `c/[projectId]/page.tsx:24` — each a subset of the same bundle + review.
- `apps/web/src/server/db.ts` — today's composition root: `webDb()` and `WEB_TENANT_ID`. It is the
  **ninth** file importing `@momo/db`, and it is not in the epic's count of eight. This becomes
  `composition.ts`, the named exception.
- `apps/web/src/app/actions.ts` — **out of scope**, and the reason the gate waits: it imports
  `drizzle-orm` at `:4` and `@momo/db` at `:5`, and issues its own reads at `:115` and `:151`.
- `packages/db/src/read-use-cases.ts` — the harness registry. Its header already names this slice:
  "the import below and `READ_SURFACE_MODULE` are the change — one pointer". `invoke` is typed
  `(handle: Db, target: UseCaseTarget)`, so its **signature** moves too, not only the import.
- `packages/db/src/cross-tenant.test.ts` — 23 assertions, 4 of them with no database. Must keep
  passing, and must keep failing when a read is added without an entry.
- `apps/web/next.config.ts:4` — `transpilePackages` already lists `@momo/app`.
- ARCHITECTURE-SPINE.md:569 — `Result<T, AppError>`, `AppError = { code, messageKey, details? }`,
  code from a closed enum, authorisation failures surface as `not_found`. :249 — `RequestContext`
  is `{ tenantId, userId, roles, projectIds, locale }` resolved by `resolveRequestContext`, which
  is **story 1.4's**, not this slice's.

## Tasks & Acceptance

**Execution:**
- [x] `packages/app/src/result.ts` — `Result<T, AppError>`, the closed `code` enum (`not_found`,
      `invalid_input`) and its message keys. No prose, no i18n lookup.
- [x] `packages/app/src/ports/project-read.ts` — the port the two use cases depend on, written so
      `packages/db`'s existing functions satisfy it structurally.
- [x] `packages/app/src/use-cases/` — `getProjectHeader` and `getProjectReview`, each
      `(deps, ctx, input) => Promise<Result<…>>`, validating input and mapping a missing Project to
      `not_found`. Export them from `packages/app/src/index.ts` without dragging in `config.ts`.
- [x] `packages/app/package.json`, `tsconfig.base.json`, `vitest.config.ts` — declare
      `@momo/domain`, and add the `@momo/app` alias where the workspace resolves paths.
- [x] `apps/web/src/server/composition.ts` — the named composition root: builds the handle, wires
      the port, constructs `{ tenantId }`, exports ready-to-call use cases. The only `apps/web`
      file importing `@momo/db`. Replaces `server/db.ts`.
- [x] The seven read call sites — call the use case, handle the `Result`'s error arm, render the
      same output.
- [x] `tests/cross-tenant.test.ts` + its registry — move the harness out of `packages/db`, point
      the enumeration at `packages/app`'s use cases, and keep every assertion, the no-database
      gate and the probe-Tenant lifecycle. `probe-tenants.ts` stays in `packages/db` (it writes
      through Drizzle); `vitest.config.ts` gains `tests/**/*.test.ts` and the `@momo/app` alias.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` — record the second carve-out, and
      anything found and not fixed.

**Acceptance Criteria:**
- Given a read call site, when it renders, then it reaches its data through a `packages/app` use
  case and imports neither `@momo/db` nor `drizzle-orm`.
- Given `apps/web`, when its imports are listed, then exactly one file imports `@momo/db` and it is
  the named composition root.
- Given a use case asked for a Project another Tenant owns, when it runs, then it returns
  `not_found` rather than throwing or disclosing existence.
- Given a read use case added to `packages/app` with no harness registry entry, when the suite
  runs **without a database**, then it fails naming it.
- Given a use case that swallows the repository's error and returns a default, when the harness
  runs, then a completeness assertion fails — the thing the repository-level enumeration could
  not see.
- Given the whole suite, when lint, the three typechecks and the tests run, then all pass, the
  harness still discharges NFR-S1, and the six routes still render the pinned golden figures.

## Implementation Notes

**What landed.** `packages/app` gains `result.ts` (`Result<T, AppError>`, the closed enum
`not_found | invalid_input`, one message key each, `ok`/`fail`), `ports/project-read.ts`
(`ProjectReadPort<Handle>`, `ProjectReadDeps<Handle>`, the restated `ProjectBundle`/`ProjectReview`,
and `isProjectNotFound`), and `use-cases/` — `getProjectHeader` and `getProjectReview`, each
`(deps, ctx, input) => Promise<Result<…>>`, sharing one internal `runProjectRead` that validates
with zod, calls the port with `ctx.tenantId`, maps an invisible Project to `not_found` and lets
everything else propagate. `use-cases/index.ts` exports the two use cases and nothing else,
because its namespace IS the read surface the harness enumerates; it does not import `config`.
`apps/web/src/server/db.ts` became `composition.ts` (git rename); the seven call sites call its
`getProjectHeader`/`getProjectReview` and unwrap through `server/result.ts`'s exhaustive
`valueOrNotFound`, which renders Next's 404 for both codes. The harness and its registry moved
to `tests/` (git renames), and `tsconfig.base.json`, the root `tsconfig.json`, `vitest.config.ts`
and `eslint.config.js` (the `tests` tree joins the fenced sources) learned the directory and the
`@momo/app` alias.

**The handle is a type parameter of the port**, not a closure the composition root builds. That
is what lets `packages/db`'s functions be handed over *as they are* —
`projectRead: { loadProjectBundle, loadReview }` — so the match really is structural, and the
`satisfies ProjectReadDeps<Db>` at the composition root is where TypeScript checks it. The port's
members are function-typed properties rather than methods, so the check is strict rather than
bivariant.

**How an invisible Project becomes `not_found`.** `repo.ts` rejects with a plain `Error`
reading `project <id> not found — …`, and this slice may not change `packages/db`'s behaviour, so
`isProjectNotFound` matches that prefix on the caller's own `projectId`. A connection failure,
another Project's not-found, anything else: rethrown. Pinned from both sides and recorded in
deferred-work with the durable fix.

**The harness now drives the use cases.** `invoke` takes `(deps: ProjectReadDeps<Db>, target)`
and returns the use case's `Result` untouched; the harness splits it into `value`, `refused` or a
thrown `error`. An own-Tenant `refused` is a failure like a throw. The cross-Tenant probe is
stricter than it was at repository level: it must be the error arm with `not_found` — not a
throw, not an `ok` — and the whole outcome, error arm included, is scanned for probe A's token.
The two golden-figure checks go through `getProjectReview`, the same use case the Review page
calls. Every other assertion is unchanged; the file still runs 23, and 4 without a database.

**Behaviour the pages did not have before:** a Project id that does not resolve now renders
Next's 404 (`/p/nope/review`, `/c/nope` → 404) where it used to throw into a 500. That is the
`not_found` arm doing its job, not a change to what an existing Project renders.

## Spec Change Log

- 2026-09-21 — the second acceptance criterion ("exactly one file imports `@momo/db`") and the
  verification grep ("exactly one hit") are not met, and cannot be within this spec: its own Code
  Map and Never list keep `actions.ts` out of scope, and `actions.ts` imports `drizzle-orm` at :4
  and `@momo/db` at :5. The grep lists two files, `composition.ts` and `actions.ts`. Laundering
  `actions.ts`'s import through a re-export in the composition root would have produced one hit
  while leaving the violation in place, so it was not done. The criterion is met for every READ
  call site; the remainder closes with the writes slice. Recorded in deferred-work.
- 2026-09-21 — the Code Map says `config.ts` "exports an **eager** `config` singleton". It does not
  any more: `config` is a getter per key, so importing it reads no environment
  (`config.test.ts`'s header still says eager and is stale). The instruction the claim supported —
  keep the use cases out from behind `config` — was followed anyway: `use-cases/index.ts` does not
  import it, and the harness imports that module rather than the barrel.
- 2026-09-21 — the Verification section's `pnpm test packages/db/src/cross-tenant.test.ts` is now
  `pnpm test tests/cross-tenant.test.ts`: the file moved, as the Tasks list requires.
- 2026-09-21 — added `packages/app/src/use-cases/project-reads.test.ts` (16 tests, no database),
  which the Tasks list did not name. The I/O matrix's `invalid_input` row has no other home — the
  harness never sends a malformed id — and the "anything else propagates" rule is what makes the
  swallow sabotage meaningful, so it is pinned where it is cheap.
- 2026-09-21 — `apps/web/src/server/result.ts` (`valueOrNotFound`) is a file the Tasks list did not
  name: the seven call sites' error-arm handling, written once and exhaustive over the closed enum.
- 2026-09-21 (review fixes) — `apps/web/src/server/result.test.ts` pins `valueOrNotFound`: the `ok`
  value unchanged, and both codes throwing Next's not-found error (digest
  `NEXT_HTTP_ERROR_FALLBACK;404`), watched to fail with a plain throw in its place. The schema now
  refuses a NUL in `projectId` (Postgres rejects it, so `/p/%00/review` was a 500), watched to
  fail with the refinement removed. `ProjectInput` is derived from the schema; `details` is built
  without mutation; `fail` lost its unused type parameter; the barrel exports the result and port
  modules as types only, keeping `ok`/`fail`/`isProjectNotFound` package-internal; the two
  composition roots dropped the return annotation so the `satisfies` is what checks.

## Review Triage Log

Round 1, 2026-09-21 — blind-hunter (B), edge-case-hunter (E), verification-gap (V).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| B5 / V1 | `valueOrNotFound` and the new 404 behaviour have no automated test | medium | `apps/web` has no test file; replacing `notFound()` with a throw regresses to 500 with every gate green | patch |
| B1 / V2 | A registry entry's `name` and `invoke` can disagree, so `getProjectHeader` could lose RLS cover silently | medium | The gate compares names only; both use cases share deps/input and `mustSurface`. Gap pre-dates this slice (repository level) | defer |
| B2 / V3 | A use case exported from the `@momo/app` barrel instead of `use-cases/index.ts` escapes the coverage gate | medium | `readSurfaceFunctionNames()` reads only `use-cases/index.ts`; `composition.ts` imports from the barrel. Same class as the existing "enumerates one module" entry | defer |
| B3 | The barrel exports runtime helpers (`fail`, `ok`, `isProjectNotFound`, `APP_ERROR_MESSAGE_KEYS`) to inbound adapters | low | `export *` of `result` and `ports/project-read`; `apps/web` needs only types from them | patch |
| B4 / E1 | A NUL byte in `projectId` (`/p/%00/review`) passes zod, Postgres rejects it (`null character not permitted`, measured), page 500s | low | `z.string().min(1)` only. Whitespace/over-long ids answer 404 already — that part is false | patch |
| B6 | Every project page loads the bundle twice (layout + page) | low | Pre-existing; the composition root is now the one place to fix it (React `cache()`) | defer |
| B7 | `ProjectInput` is declared as an interface and as a zod schema, untied | low | `project-input.ts`; a field added to one leaves the other stale | patch |
| B8 | `@momo/app` vitest alias unused by the harness | false | The harness imports by path on purpose (no `config`); the alias costs nothing and serves future tests | reject |
| B9 | `satisfies` is redundant with the return annotation; comments credit the wrong construct | low | `composition.ts` and `restrictedDeps()` are annotated `(): ProjectReadDeps<Db>` | patch |
| B10a / V-other | `config.test.ts` header still says `config` parses `process.env` eagerly | low | Measured at `config.test.ts:13-14` | patch |
| B10b | ARCHITECTURE-SPINE.md:81 still says "One carve-out" | low | Planning doc; editing it invalidates the epic context cache and is a planning decision — already recorded in deferred-work | defer |
| B10c | AC-2 wording should be amended | — | Fix is an edit to this spec | reject |
| B11 | Cross-probe failure message omits which error code came back | low | `tests/cross-tenant.test.ts` cross-probe `expect` message | patch |
| B12 | `fail<C>`'s type parameter is discarded by its return type | low | `result.ts` returns `Result<never, AppError>` | patch |
| B13 | `runProjectRead` builds `details` by mutation in a loop | low | Project coding rules require immutable patterns | patch |
| B14 | Edited comments not re-wrapped; stray double blank line in deferred-work.md | low | `ci.yml`, `cross-tenant.test.ts`, `read-use-cases.ts`, `deferred-work.md` | patch |
| E2 | AC-5 ("swallow → completeness fails") is met only when the own-Tenant read also fails; a pure swallow is caught by the not_found probe instead | — | Sabotage #3/#4. The swallow IS caught; the mismatch is the AC's wording — fix is a spec edit | reject |
| E3 | AC-2 unmet: `actions.ts` still imports `@momo/db` and `drizzle-orm` | — | The frozen intent excludes the writes ("reads only; … `actions.ts` is the file that still imports Drizzle"); already in Change Log and deferred-work | reject |
| E4 | The barrel re-exports `config` beside the use cases | false | `config` is lazy; `use-cases/index.ts` does not import it, which is what the task asks | reject |

## Design Notes

**Why the port is satisfied structurally rather than implemented explicitly.** `packages/db`
declares `@momo/domain`, `drizzle-orm` and `pg`, and deliberately not `@momo/app` — `client.ts`
records that importing it "inverts the architecture's import direction". A port that
`packages/db` had to import in order to implement would force exactly that edge. Declaring the
port in `packages/app` and letting the existing functions satisfy its shape keeps both packages
where they are, and TypeScript still checks the match — at the composition root, which is the one
place that names both sides.

## Verification

**The local database.** Postgres `18.6-alpine` on host port **55433** (`pnpm db:up`). Every command
needs both keys exported — there is no fallback:

```
export DATABASE_URL='postgres://momo:momo@localhost:55433/momo_keikaku'
export APP_DATABASE_URL='postgres://momo_app:momo_app@localhost:55433/momo_keikaku'
export REQUIRE_DB=1
```

**Commands:**
- `pnpm lint`, `pnpm typecheck`, `pnpm --filter @momo/web typecheck`,
  `pnpm --filter @momo/worker typecheck` — exit 0.
- `pnpm test` — the existing 146 assertions still pass, plus any new ones.
- `pnpm test packages/db/src/cross-tenant.test.ts` with no `DATABASE_URL` — the pure coverage gate
  still runs and passes.
- `grep -rn "@momo/db\|drizzle-orm" apps/web/src` — exactly one hit, the composition root.
- **Run the app.** `apps/web` has no automated test, so the six routes are checked by running it:
  `/p/prj-ec2/review`, `/plan`, `/mapping`, `/baselines`, `/connectors` and `/c/prj-ec2` all 200,
  the Review page rendering 2936.0 / 1661.5 / 0.91, and `pg_stat_activity` showing `momo_app`.

**Sabotage (each watched to fail, then restored):** add a read use case with no registry entry;
point a page back at `@momo/db` directly; make a use case return the raw error instead of
`not_found`; ask for another Tenant's Project id through the use case; break the port's shape at
the composition root and watch the typecheck name it.

### Results, 2026-09-21

Against `postgres:18.6-alpine` on 55433 with both keys and `REQUIRE_DB=1` exported.

| Command | Result |
| --- | --- |
| `pnpm lint`, `pnpm typecheck`, `pnpm --filter @momo/web typecheck`, `pnpm --filter @momo/worker typecheck` | all exit 0 |
| `pnpm install --frozen-lockfile` | passes (the lockfile gained `@momo/app → @momo/domain`) |
| `pnpm test` | **165 passed across 14 files** after review round 1 (160 across 13 before it; 146 across 12 before this slice) — measured in full |
| `pnpm test tests/cross-tenant.test.ts` | 23 passed |
| the same with no `DATABASE_URL`/`APP_DATABASE_URL`/`REQUIRE_DB` | **4 passed, 19 skipped** |
| `grep -rln "@momo/db\|drizzle-orm" apps/web/src` | `server/composition.ts` and `app/actions.ts` — see the Change Log |
| the six routes on `next dev` as `momo_app` | all **200**; Review renders 2936.0 / 1661.5 / 0.91; `/p/nope/review` and `/c/nope` → **404** |
| the six routes against a worktree of the baseline commit, same database | HTML **identical** after stripping script/link tags and Next's per-build `$ACTION_ID_…` hashes |
| `pg_stat_activity` during a request | `momo_app` |
| `SELECT id FROM tenant` after all sabotage runs | `ten-momo` alone |

**Sabotage — each watched to fail, then restored.**

| # | Sabotage | What caught it |
| --- | --- | --- |
| 1 | `export { getProjectHeader as getSabotageProbe }` added to `use-cases/index.ts` | the pure gate, with **no database**: *"these functions are exported from packages/app/src/use-cases/index.ts and have no entry in tests/read-use-cases.ts: getSabotageProbe"* |
| 2 | the `not_found` mapping removed, so the repository's error is thrown raw | 2 failures: *"getProjectHeader THREW when probe Tenant B asked for A's Project id, instead of answering not_found"*, and the same for `getProjectReview` |
| 3 | the use case swallowing every failure into `ok({})` | 2 failures: *"… did not answer not_found … it answered ok, so it turned an invisible Project into a value"* |
| 4 | 3, plus the repository failing for the caller's OWN Tenant (tenant and project arguments swapped) | 10 failures, the completeness floor among them: *"getProjectHeader under xtprobe-a-000589 did not return 630 of the 630 fixture values"*. The symmetry and token scans stayed green — every Tenant got the same empty default — which is exactly the blind spot the floor exists for |
| 5 | the use case ignoring `ctx` and reading a fixed Tenant | 15 failures: token scans, symmetry, numbers, labels, the demo-Tenant direction and the cross probe |
| 6 | `projectRead: { loadProjectBundle: loadReview, … }` at the composition root | web typecheck, TS2322 at `composition.ts` |
| 7 | the port's `loadReview` promising a field the repository does not return | TS2322 at `composition.ts`, at the harness's own composition root, and at the fake port in the unit test |
| 8 | a page pointed back at `@momo/db` directly | **nothing automated** — lint and typecheck stay at 0; only the grep shows it. The gate is the next slice's; recorded in deferred-work |

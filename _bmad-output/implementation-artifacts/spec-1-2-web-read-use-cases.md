---
title: 'Story 1.2 slice 3 — the seven read call sites move onto packages/app use cases'
type: 'feature'
created: '2026-09-21'
status: 'ready-for-dev'
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
- [ ] `packages/app/src/result.ts` — `Result<T, AppError>`, the closed `code` enum (`not_found`,
      `invalid_input`) and its message keys. No prose, no i18n lookup.
- [ ] `packages/app/src/ports/project-read.ts` — the port the two use cases depend on, written so
      `packages/db`'s existing functions satisfy it structurally.
- [ ] `packages/app/src/use-cases/` — `getProjectHeader` and `getProjectReview`, each
      `(deps, ctx, input) => Promise<Result<…>>`, validating input and mapping a missing Project to
      `not_found`. Export them from `packages/app/src/index.ts` without dragging in `config.ts`.
- [ ] `packages/app/package.json`, `tsconfig.base.json`, `vitest.config.ts` — declare
      `@momo/domain`, and add the `@momo/app` alias where the workspace resolves paths.
- [ ] `apps/web/src/server/composition.ts` — the named composition root: builds the handle, wires
      the port, constructs `{ tenantId }`, exports ready-to-call use cases. The only `apps/web`
      file importing `@momo/db`. Replaces `server/db.ts`.
- [ ] The seven read call sites — call the use case, handle the `Result`'s error arm, render the
      same output.
- [ ] `tests/cross-tenant.test.ts` + its registry — move the harness out of `packages/db`, point
      the enumeration at `packages/app`'s use cases, and keep every assertion, the no-database
      gate and the probe-Tenant lifecycle. `probe-tenants.ts` stays in `packages/db` (it writes
      through Drizzle); `vitest.config.ts` gains `tests/**/*.test.ts` and the `@momo/app` alias.
- [ ] `_bmad-output/implementation-artifacts/deferred-work.md` — record the second carve-out, and
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

## Spec Change Log

## Review Triage Log

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

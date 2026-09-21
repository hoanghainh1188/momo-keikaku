---
title: 'Story 1.4 slice 1 — identity tables, the tenant-membership bridge, a per-request RequestContext, and email + password sign-in'
type: 'feature'
created: '2026-09-21'
status: 'ready-for-dev'
baseline_commit: '7830e3b6729b5e5ae11f26dad194dae508b08918'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-organisation-hierarchy.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nobody signs in. Every request runs as the hard-wired demo Tenant (`DEMO_TENANT_ID`)
and every audited write is stamped `user:linh` (`WEB_ACTOR`), so neither isolation nor the audit
trail refers to a real person, and nothing can later be revoked.

**Approach:** Add Better Auth 1.7.5's four tables and `tenant_membership` (all class `global`), bound
only through `IdentityPort` in `packages/db/auth`. Build `RequestContext { tenantId, userId, roles,
projectIds, locale }` per request in `resolveRequestContext` (`packages/app/src/authz`), validating the
session's `activeTenantId` against the bridge every time. It replaces `UseCaseContext` and `WEB_ACTOR`
everywhere. Email + password sign-in, an 8-hour sliding idle timeout, cookie cache off, `nextCookies()`.

Split by the founder on 2026-09-21: revocation and membership writes, Google, and password reset are
slices 2–4 (`deferred-work.md`). Also decided by the founder on 2026-09-21: the seed creates the
demo users `linh` (PM) and `hoang` (Tenant Admin) with memberships and a password from a required
`SEED_DEMO_PASSWORD` (CI sets it), with no provisioning script yet; a user with zero or more than one
membership signs in but sees a plain "no access" page (more than one also logs the reason) until a
tenant switcher exists; every route except `/sign-in`, `/no-access` and `/api/auth/*` requires
sign-in, `/c/` included (the Client View is a PM/Admin preview until OQ-8). After the spec review
(founder, 2026-09-21): `@momo/db-auth` exports a factory, and the composition root builds the one
auth instance lazily and exports auth bindings beside the use-case bindings. AD-1 is amended for
this in the same branch, after an adversarial review, and records Better Auth's internal `Date`
use as a named AD-15 exception. Rate-limiting the sign-in action is deferred on purpose (recorded).

## Boundaries & Constraints

**Always:**
- `user` (plus `locale`, default `en`), `session` (plus `active_tenant_id`), `account`,
  `verification`, and `tenant_membership(user_id, tenant_id, role, project_ids)` are registered as
  `global` with no RLS. Better Auth's user model is renamed to the table `auth_user`, because `user`
  is a reserved word. `tenant_membership` is marked in the registry as the one bridge table that
  carries `tenant_id` without RLS. No additional field is client-writable (`input: false`). The app role gets DML on the four Better Auth tables only.
  `tenant` and `tenant_membership` stay SELECT-only.
- Legacy `app_user` is removed from the schema, registry, seed and harness.
- `tenant_membership` is read by one repository function, called only by `resolveRequestContext`.
  A source test pins two things: only that reader, the seed and the probe import the Drizzle symbol,
  and no other application source contains `FROM`/`JOIN tenant_membership`. The barrel of
  `@momo/db` does not export the symbol.
- On every request: no session, an expired session, or an `activeTenantId` without a matching
  membership all resolve to "not signed in". A session whose tenant does not validate is deleted.
  The web redirects to `/sign-in`, which never redirects on its own. Nothing under `/p/` or `/c/`
  renders. The resolver runs at most once per render (React `cache()`). A server action resolves the context
  once and passes it to every binding it calls. The root layout and `/no-access` never call the
  redirecting resolver.
- The audit actor is `user:<userId>` from the context. `actor` leaves `AuditedWriteDeps`.
- Idle timeout: config key `SESSION_IDLE_TIMEOUT_HOURS`, default 8. Sessions slide on every page and
  action request. `session.cookieCache` stays disabled.
- Sign-up is disabled. Identity ids are UUIDv7 from the id port. The route handler serves an
  explicit allowlist of the endpoints this slice uses (`/get-session`, `/sign-out`,
  `/sign-in/email`) and answers 404 to everything else, parametrised routes included. Sign-in
  always uses `rememberMe: true`, so the session slides. After sign-in the user goes to `/`, with no
  return-path parameter.
- Sign-in errors are one generic message and never reveal whether the email exists.
- Seed users have fixed UUIDv7 ids, and the seeded audit history uses `user:<id>`.

**Never:**
- No revocation or membership write, no Google, no reset or mail, no role checks (these are 1.5's),
  no tenant switcher, no Next 16 upgrade (Next stays 15.5, so the file is `middleware.ts`), no
  next-intl (1.9).
- Only `packages/db/auth` imports `better-auth`. In `apps/web` only the composition root imports
  `@momo/db-auth`. The route handler, the middleware, the sign-in and sign-out actions use the
  composition root's auth bindings. Both rules are enforced by dependency-cruiser.
- No constant tenant id or actor literal remains in `apps/web`, and a test pins this.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected |
|---|---|---|
| Sign in | Seeded PM, correct password | Session created, `activeTenantId` set, lands on `/` |
| Wrong password / unknown email | — | Same generic error, no session |
| Tenant tampered | `session.active_tenant_id` has no matching membership | Not signed in, redirected |
| Idle | Last request > timeout ago | Next request redirected |
| Active user | Requests every < timeout | Session slides, never expires |
| Signed out | Sign-out then back button | Redirected |
| No membership | Valid credentials, zero memberships | Signed in, every route shows "no access" |
| Several memberships | Valid credentials, two memberships, no active tenant | "No access", reason logged, no tenant chosen |
| Writes | PM writes a mapping | Audit actor = `user:<their id>`, `tenant_id` = active tenant |

</frozen-after-approval>

## Code Map

- `packages/app/src/use-cases/context.ts:11` defines `UseCaseContext`; it is referenced in 27 places
  (use cases, `audited-write.ts:74`, `project-write-input.ts:91`, `org-writes.ts`, both unit tests).
  Replace it with `RequestContext` from `authz/`. Do not keep an alias.
- `packages/app/src/ports/audited-write.ts:20` has `actor`, which `runAuditedWrite`
  (`use-cases/audited-write.ts:87`) stamps. Move it to `ctx.userId`.
- `apps/web/src/server/composition.ts:76-101` holds `WEB_TENANT_ID`, `WEB_ACTOR`, `webContext()` and
  17 pre-bound bindings. Each binding becomes `async (input) => run(await requestContext(), input)`,
  where `requestContext()` reads `headers()`, calls `resolveRequestContext`, and redirects to
  `/sign-in` when it resolves to nothing.
- `packages/db/auth/` (`@momo/db-auth`) is an empty skeleton. Add it to `tsconfig.base.json` paths,
  `apps/web` deps and tsconfig, the vitest alias and `transpilePackages`. Depcruise already allows
  `apps/web → packages/db/auth`.
- `packages/db/src/table-classes.ts:41,202` makes `global` SELECT-only. Add an optional per-entry
  `appPrivileges` override. Update `generate.ts`, then run `pnpm db:sql`. Registry counts
  (`registry.test.ts:62-71`) go from 18/17 to 22/16. `rls.test.ts:479-500` must read the override.
- `schema.ts:55` (`appUser`), `seed.ts:64,162-177`, `tests/read-use-cases.ts:555-564` (unreached
  entry), `tests/cross-tenant.test.ts:239,974,996` all change when `app_user` is removed.
- `packages/app/src/config.ts:40-58` gets `BETTER_AUTH_SECRET` (required), `BETTER_AUTH_URL` and
  `SESSION_IDLE_TIMEOUT_HOURS`, using the lazy getters. Add them to `apps/web/.env.local` and CI.
- `tests/web-composition.test.ts` pins `'user:linh'` and the tenant at lines 17, 95, 161-171, 293-311.
- The ESLint `db.` ban, clock and env fences apply to the new code. `packages/db` may import
  neither `@momo/app` config nor `@momo/adapters`, so everything reaches `createAuth` as arguments.
- `composition.ts:103-106` has a rule: importing the file reads no config (because of `next build`).
  The auth instance is therefore memoised and built on first use.
- `rls.test.ts:308-331` fails a table that has `tenant_id` but a `tenantColumn` of `null`. This is
  why the bridge flag exists.
- `seed.ts:467` issues `TRUNCATE` on unquoted names. `probe-tenants.ts:401-415` skips tables without
  a tenant column, so probe users, accounts, sessions and memberships need explicit cleanup.
- `seed.ts:244` and `fixtures.ts:221` hold the `'user:linh'` actor in seeded history.
- Better Auth source facts:
  - The rate limiter runs only in the HTTP router.
  - `rememberMe: false` disables refresh.
  - `nextCookies()` skips refresh on pure RSC requests.
  - `getSession` accepts `disableRefresh` and `returnHeaders`.
- `pg` in Node-runtime middleware on Next 15.5 may need `serverExternalPackages`. Spike it first.
  The middleware and the route handlers are separate bundles, so each gets its own lazily built
  auth instance and its own pool (at most 8 connections each). Confirm this in the spike.
- The Better Auth details that constrain the implementation:
  - `auth.api.updateSession` refuses `input: false` fields even on server calls. `setActiveTenant`
    must use `(await auth.$context).internalAdapter.updateSession(token, { activeTenantId })`, so
    `sessionFrom` returns the session token.
  - `disabledPaths` matches exact paths in the HTTP router only. It is not enough on its own, hence
    the allowlist wrapper.
  - The Drizzle adapter looks up `schema[modelName]`, so the schema object passed to it is keyed
    `auth_user`. Property names stay camelCase (`emailVerified`, `userId`, `expiresAt`,
    `activeTenantId`, `locale`); only the column strings are snake_case.
  - `generateId` goes under `advanced.database.generateId`.
- `tsconfig.depcruise.json` replaces `paths` rather than merging them, so add `@momo/db-auth` there
  as well. `pnpm depcruise` scans `apps` and `packages` only.
- `packages/db/auth/package.json` pins `better-auth@1.7.5` and `drizzle-orm@0.45.2`, so the
  peer dependency does not install a second drizzle.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/db/src/schema.ts`, `table-classes.ts`, `sql/generate.ts`, `sql/*.sql`, `registry.test.ts`, `rls.test.ts` -- add the five identity tables with snake_case columns (`auth_user`), remove `app_user`, add the privilege override and the bridge flag, regenerate -- AR-40, AD-21
- [ ] `packages/db/src/repo-membership.ts` + `packages/db/src/source-discipline.test.ts` -- the single `tenant_membership` reader, and the narrowed source test described under Boundaries -- "nothing else reads that table"
- [ ] `packages/db/auth/src/{auth,identity}.ts` -- `createAuth({ db, secret, baseURL, idleHours, generateId })`: `betterAuth` with the Drizzle adapter, `emailAndPassword` (sign-up disabled), `expiresIn` = idle hours, `updateAge` 5 min, no cookie cache, `disabledPaths`, session `additionalFields.activeTenantId` (`input: false`), user `locale` (`input: false`), `nextCookies()` last. Also a `hashPassword` wrapper for the seed, and an `IdentityPort` implementation (`sessionFrom(headers)` with `disableRefresh`, `setActiveTenant`, `endSession`). Sign-in and sign-out are auth bindings, not port methods. The spine's `{ userId, email, locale }` lookup is deferred to 1.7 -- AD-1 carve-out 1
- [ ] `packages/app/src/authz/{request-context,resolve-request-context}.ts` + tests, `ports/identity.ts`, `ports/membership.ts` -- `RequestContext` and the resolver. When no active tenant is set it chooses the single membership (zero or several → a distinct `no_access` outcome) and persists it through `IdentityPort` -- AR-40
- [ ] `packages/app/src/**`, `config.ts` -- replace `UseCaseContext` with `RequestContext`, and the actor with `ctx.userId`; add the lazy keys `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SESSION_IDLE_TIMEOUT_HOURS` and `SEED_DEMO_PASSWORD` -- AD-12
- [ ] `apps/web/src/server/composition.ts`, `app/api/auth/[...all]/route.ts`, `src/middleware.ts`, `app/sign-in/{page,actions}.tsx`, `app/no-access/page.tsx`, a sign-out control in `app/layout.tsx`, `next.config` -- the web edge.
  - The middleware runs on the nodejs runtime. It calls `getSession` with `returnHeaders`, forwards `Set-Cookie`, and redirects when there is no session.
  - `requestContext()` is injectable for tests. It redirects to `/sign-in` or `/no-access` by outcome.
- [ ] `scripts/seed.ts`, `packages/db/src/seed.ts`, `fixtures.ts`, `probe-tenants.ts` -- the script reads `SEED_DEMO_PASSWORD`, hashes it through `@momo/db-auth`, and passes the hash to `seed(db, { demoPasswordHash })`. It creates users `linh` and `hoang` with fixed UUIDv7 ids, credential accounts and memberships, and quotes identifiers in `TRUNCATE`. Probe Tenants get their own members, removed by tenant and user id -- OQ decisions
- [ ] `tests/**` (the harnesses, `web-composition`, `audited-use-cases`) -- build a `RequestContext`; the actor assertions use the context's user
- [ ] `tests/identity.test.ts` (Postgres) -- the I/O matrix through `auth.api` and `resolveRequestContext`:
  - idle expiry: set `expires_at` in the past;
  - sliding: set `expires_at` to `now + expiresIn − updateAge − 1s`, call `getSession` with `returnHeaders`, and assert that `expires_at` moved and a `Set-Cookie` came back;
  - a single-membership sign-in persists `active_tenant_id`;
  - `/reset-password/x`, `/update-session` and `/sign-up/email` answer 404;
  - `/no-access` renders for a user with zero memberships;
  - each of the four Better Auth tables round-trips through the adapter;
  - no probe identity rows remain after the harness runs.
- [ ] `apps/web` middleware unit test -- a `Request` in, `Set-Cookie` forwarded, redirect when there is no session
- [ ] `.dependency-cruiser.cjs`, `.github/workflows/ci.yml` -- the `better-auth` and `@momo/db-auth` import rules; the new environment variables in the test job
- [ ] `ARCHITECTURE-SPINE.md` (AD-1, AD-15), `deferred-work.md` -- the amendment after an adversarial review (up to two rounds); a deferred entry for the sign-in rate limit

**Acceptance Criteria:**
- Given the catalog, when `rls.test` runs, then the five identity tables exist with no RLS, and the app role's privileges match the registry, including the override.
- Given any use case, when it is called from `apps/web`, then its context came from `resolveRequestContext` for that request. No constant tenant or actor remains in `apps/web`.
- Given any of the following, when CI runs, then a test fails, and each has a recorded sabotage probe:
  - `session.cookieCache` is enabled;
  - the membership reader is imported elsewhere;
  - `better-auth` is imported outside `packages/db/auth` (within `apps/` and `packages/`, which is what depcruise scans);
  - a tenant literal appears in `apps/web`;
  - the resolver's membership check is skipped;
  - the bridge flag is set on a second table.
- Given the running app, when a signed-out browser opens `/p/<id>/plan`, then it lands on `/sign-in`. After signing in as the seeded PM, the page renders.

## Design Notes

- **Sliding refresh.** With `nextCookies()`, Better Auth skips session refresh on pure RSC requests,
  so the Node-runtime `middleware.ts` calls `getSession` on page requests and forwards its
  `Set-Cookie`. That is what makes the timeout idle-based rather than a lapse measured from sign-in.
  The authoritative check is still `resolveRequestContext`.
- **The auth instance lives behind the composition root.** `createAuth` takes everything as
  arguments: the handle, the secret, the base URL, the idle hours and the id generator
  (`uuidV7IdsOn(systemClock)`). So `packages/db/auth` reads no env and imports no adapter.
  Better Auth stamps `expires_at` from its own `Date` (an AD-15 exception). The resolver never
  compares session times against the `Clock`, and Better Auth's own check is the authority.
- **The active tenant is written by `IdentityPort.setActiveTenant`**, called from the resolver. A
  Better Auth hook would have to read `tenant_membership` from `packages/db/auth`, which breaks the
  single-reader rule.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm depcruise` -- expected: clean
- `REQUIRE_DB=1 pnpm test` (after `pnpm exec drizzle-kit push --force && pnpm db:policies && pnpm seed`) -- expected: all green
- The sabotage probes listed in the acceptance criteria. Each must fail a test, and each is recorded
  in the CI header.

**Manual checks:**
- Preview `web` on port 3101: signed-out redirect, sign in, write a mapping, audit row actor, sign out.

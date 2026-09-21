---
title: 'Story 1.4 slice 1 — identity tables, the tenant-membership bridge, a per-request RequestContext, and email + password sign-in'
type: 'feature'
created: '2026-09-21'
status: 'done'
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
- [x] `packages/db/src/schema.ts`, `table-classes.ts`, `sql/generate.ts`, `sql/*.sql`, `registry.test.ts`, `rls.test.ts` -- add the five identity tables with snake_case columns (`auth_user`), remove `app_user`, add the privilege override and the bridge flag, regenerate -- AR-40, AD-21
- [x] `packages/db/src/repo-membership.ts` + `packages/db/src/source-discipline.test.ts` -- the single `tenant_membership` reader, and the narrowed source test described under Boundaries -- "nothing else reads that table"
- [x] `packages/db/auth/src/{auth,identity}.ts` -- `createAuth({ db, secret, baseURL, idleHours, generateId })`: `betterAuth` with the Drizzle adapter, `emailAndPassword` (sign-up disabled), `expiresIn` = idle hours, `updateAge` 5 min, no cookie cache, `disabledPaths`, session `additionalFields.activeTenantId` (`input: false`), user `locale` (`input: false`), `nextCookies()` last. Also a `hashPassword` wrapper for the seed, and an `IdentityPort` implementation (`sessionFrom(headers)` with `disableRefresh`, `setActiveTenant`, `endSession`). Sign-in and sign-out are auth bindings, not port methods. The spine's `{ userId, email, locale }` lookup is deferred to 1.7 -- AD-1 carve-out 1
- [x] `packages/app/src/authz/{request-context,resolve-request-context}.ts` + tests, `ports/identity.ts`, `ports/membership.ts` -- `RequestContext` and the resolver. When no active tenant is set it chooses the single membership (zero or several → a distinct `no_access` outcome) and persists it through `IdentityPort` -- AR-40
- [x] `packages/app/src/**`, `config.ts` -- replace `UseCaseContext` with `RequestContext`, and the actor with `ctx.userId`; add the lazy keys `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SESSION_IDLE_TIMEOUT_HOURS` and `SEED_DEMO_PASSWORD` -- AD-12
- [x] `apps/web/src/server/composition.ts`, `app/api/auth/[...all]/route.ts`, `src/middleware.ts`, `app/sign-in/{page,actions}.tsx`, `app/no-access/page.tsx`, a sign-out control in `app/layout.tsx`, `next.config` -- the web edge.
  - The middleware runs on the nodejs runtime. It calls `getSession` with `returnHeaders`, forwards `Set-Cookie`, and redirects when there is no session.
  - `requestContext()` is injectable for tests. It redirects to `/sign-in` or `/no-access` by outcome.
- [x] `scripts/seed.ts`, `packages/db/src/seed.ts`, `fixtures.ts`, `probe-tenants.ts` -- the script reads `SEED_DEMO_PASSWORD`, hashes it through `@momo/db-auth`, and passes the hash to `seed(db, { demoPasswordHash })`. It creates users `linh` and `hoang` with fixed UUIDv7 ids, credential accounts and memberships, and quotes identifiers in `TRUNCATE`. Probe Tenants get their own members, removed by tenant and user id -- OQ decisions
- [x] `tests/**` (the harnesses, `web-composition`, `audited-use-cases`) -- build a `RequestContext`; the actor assertions use the context's user
- [x] `tests/identity.test.ts` (Postgres) -- the I/O matrix through `auth.api` and `resolveRequestContext`:
  - idle expiry: set `expires_at` in the past;
  - sliding: set `expires_at` to `now + expiresIn − updateAge − 1s`, call `getSession` with `returnHeaders`, and assert that `expires_at` moved and a `Set-Cookie` came back;
  - a single-membership sign-in persists `active_tenant_id`;
  - `/reset-password/x`, `/update-session` and `/sign-up/email` answer 404;
  - `/no-access` renders for a user with zero memberships;
  - each of the four Better Auth tables round-trips through the adapter;
  - no probe identity rows remain after the harness runs.
- [x] `apps/web` middleware unit test -- a `Request` in, `Set-Cookie` forwarded, redirect when there is no session
- [x] `.dependency-cruiser.cjs`, `.github/workflows/ci.yml` -- the `better-auth` and `@momo/db-auth` import rules; the new environment variables in the test job
- [x] `ARCHITECTURE-SPINE.md` (AD-1, AD-15), `deferred-work.md` -- the amendment after an adversarial review (up to two rounds); a deferred entry for the sign-in rate limit

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

## Implementation Notes

- **Tables.** `auth_user`, `session`, `account`, `verification` in `schema.ts` (camelCase properties,
  snake_case columns, `authSchema` keyed by model name for the adapter). `tenant_membership` lives in
  its own module, `schema-membership.ts`, which the `@momo/db` barrel does not re-export (the barrel
  is `export * from './schema'`, so the symbol could not stay in `schema.ts`); `drizzle.config.ts`
  reads both files. Registry: 22 tables, 16 tenant-owned; per-entry `appPrivileges` (DML on the four
  Better Auth tables) and `tenantBridge` (tenant_membership only), read through `appPrivilegesOf` /
  `TENANT_BRIDGES`. SQL regenerated.
- **Reader.** `packages/db/src/repo-membership.ts` `membershipsOf(db, userId)`, on a `tx`, ordered by
  Tenant; exported by the barrel as the only way to the table.
- **`@momo/db-auth`.** `createAuth`/`authOptions` (factory, everything as arguments), `identityOn`
  (`sessionFrom` with `disableRefresh`, `setActiveTenant` via `internalAdapter.updateSession`,
  `endSession`), `bindings.ts` (`serveAllowlisted`, `sessionForMiddleware`, `signInWithPassword`,
  `signOutOf`), `hashPassword`. Cookie prefix `momo`; telemetry off.
- **App.** `authz/request-context.ts` (`RequestContext`, `Role`, `Locale`, `auditActorOf`),
  `authz/resolve-request-context.ts` (`signed_in` / `no_access` / `signed_out`; deletes a session
  whose active Tenant does not match; persists the single membership; logs "several" through
  `onNoAccess`; memberships with an unknown role are ignored). `ports/identity.ts`,
  `ports/membership.ts`. `UseCaseContext` deleted; `AuditedWriteDeps.actor` removed — the runner
  stamps `auditActorOf(ctx)`. Config: `BETTER_AUTH_SECRET` (32+), `BETTER_AUTH_URL` (URL),
  `SESSION_IDLE_TIMEOUT_HOURS` (int 1–720, default 8), `SEED_DEMO_PASSWORD` (8+), all lazy getters.
- **Web.** Composition root: lazily memoised auth instance and id port; `requestContext()` (React
  `cache()` over the resolution, redirects to `/sign-in` or `/no-access`), `signInState()`
  (non-redirecting, for the root layout and `/no-access`); every binding is `(input, ctx?)` — a server
  action resolves once and passes `ctx`; auth bindings `handleAuthRequest`, `refreshSession`,
  `signInWithEmail`, `signOut`. `middleware.ts` (Node runtime) → `server/session-gate.ts`
  (`isPublicPath`, forwards `Set-Cookie`, redirects). `/sign-in` (client form, `useActionState`, one
  generic message, lands on `/`), `/no-access`, the sign-out form in the root layout, the allowlisted
  route handler. The top-bar chip shows the role from the context instead of the constant "Linh · PM".
- **Seed.** `demo-identities.ts` (fixed UUIDv7 ids for `linh`/`hoang`, `actorOf`); `writeTenantRows`
  writes users, memberships and — when `passwordHash` is given — credential accounts; probes get
  prefixed users with opaque names and no accounts; `removeProbeTenant` deletes members by Tenant and
  their sessions/accounts/users by user id; `TRUNCATE` quotes identifiers; `scripts/seed.ts` hashes
  `SEED_DEMO_PASSWORD` through `@momo/db-auth`. Seeded history actor: `user:019b76da-…051111111111`.

## Spec Change Log

- 2026-09-21 — files the Tasks list did not name: `packages/db/src/schema-membership.ts` (see above),
  `packages/db/src/demo-identities.ts`, `packages/db/auth/src/{bindings,password}.ts` and
  `auth.test.ts`, `apps/web/src/server/session-gate.ts` (+ test; the middleware file stays a two-line
  wiring so the gate is testable without the composition root), `apps/web/src/components/sign-out.tsx`,
  `apps/web/src/app/sign-in/sign-in-form.tsx`, `tests/request-context.ts`,
  `packages/app/src/authz/resolve-request-context.test.ts`.
- 2026-09-21 — the bridge source test excludes test files (a test must be able to seed a membership)
  and strips comments before matching.
- 2026-09-21 (spine review) — `.dependency-cruiser.cjs`'s `exclude` narrowed to our own build output:
  the bare `dist` exclusion dropped every edge into better-auth's `dist/`, so
  `better-auth-only-in-db-auth` could never fire. Found by round 1 of
  `reviews/review-adversarial-ad1-identity.md`; the rule was then watched to fire on resolved edges.

## Verification Results (2026-09-21)

Against `postgres:18.6-alpine` on 55433 with `REQUIRE_DB=1`; locally `app_user` had to be dropped
before `drizzle-kit push` (rename prompt; recorded in deferred-work), then `pnpm db:policies`,
`pnpm seed` with `SEED_DEMO_PASSWORD`.

| Command | Result |
| --- | --- |
| `pnpm lint`, `pnpm typecheck`, `pnpm --filter @momo/web typecheck` | exit 0 |
| `pnpm depcruise` | exit 0 — 153 modules, 421 dependencies |
| `pnpm test` | **562 passed across 33 files** (510 across 29 before) |

**Sabotages — each watched to fail, then restored.**

| # | Sabotage | What caught it |
| --- | --- | --- |
| 1 | `session.cookieCache: { enabled: true }` | `packages/db/auth/src/auth.test.ts`; `tests/identity.test.ts` (4 more rows) |
| 2 | `tenantMembership` imported from a module in `packages/app` | `source-discipline.test.ts` |
| 3 | `better-auth` / `@momo/db-auth` imported from `apps/web/src/components` | `pnpm depcruise` (`better-auth-only-in-db-auth`, `web-db-auth-only-from-composition-root`); rule re-proved on resolved edges after the `exclude` fix |
| 4 | `'ten-momo'` literal in an `apps/web` file | `tests/web-composition.test.ts` text scan |
| 5 | the resolver's membership match skipped | 4 failures: resolver unit test ×2, `web-composition`, `identity` |
| 6 | `tenantBridge` on `department` | `registry.test.ts` (plus drift/count failures when its tenantColumn is nulled) |

**Manual (`next dev`, port 3101).** Signed out, `/p/prj-ec2/plan` and `/c/prj-ec2` → 307 `/sign-in`.
Wrong password and unknown email → identical 401. `/sign-up/email`, `/reset-password/abc` → 404.
Signed in as `linh` via `/api/auth/sign-in/email` (curl): `/p/prj-ec2/plan` 200, chip "PM",
`active_tenant_id` persisted on first render; the Mapping form posted without JS wrote
`audit_log` actor `user:019b76da-a800-7000-8000-051111111111`, tenant `ten-momo`. Session due for
refresh → the middleware slid `expires_at` to 8 h and sent `Set-Cookie`. Tampered
`active_tenant_id` → 307 `/sign-in`, session row deleted. `hoang`: chip "Tenant Admin"; sign-out form
→ 303 `/sign-in`, replaying the old cookie → 307 `/sign-in`. Zero memberships and two memberships →
307 `/no-access` (the second logged its reason). The browser form itself was not driven (the agent
does not type passwords into a browser); the sign-in page was checked visually at 375 px.

## Review Triage Log

Review round 1 (2026-09-21): Blind Hunter, Edge Case Hunter, Verification Gap. B = blind, E = edge case, V = verification gap.

| # | Finding | Verdict | Route | Evidence |
|---|---|---|---|---|
| B1 | `/` redirects every sign-in to `/p/prj-ec2/review` | low | defer | Pre-existing literal in `app/page.tsx`; only the demo Tenant exists in this slice. |
| B2, E2, V3 | Middleware matcher excludes by prefix, disagrees with `isPublicPath`; matcher untested | low | patch | `(?!…sign-in…)` skipped `/sign-inx`, `/sign-in/x`; anchored, and a matcher-vs-`isPublicPath` table test added. |
| B3 | Every `APIError` on sign-in silently equals "wrong password" | low | patch | A misconfiguration would be invisible; now logs status and code only for non-credential errors. |
| B4, V1 | `signInWithPassword` success path and `rememberMe: true` never exercised | medium | patch | Only refusals called the binding; new identity row signs in through it and slides the session. |
| B5 | Sign-in action validates without zod, no length caps | low | patch | Spine rule; zod schema added (email ≤ 254, password 1–128). |
| V2 | Sign-in server action untested | medium | patch | `actions.test.ts` added: refusal, invalid forms, redirect to `/`. |
| V4 | Nothing checks the demo seed's users, credential accounts, memberships | medium | patch | New DB-gated identity row per `DEMO_USERS` entry. |
| B6, E4 | `setActiveTenant` throws if the session vanishes mid-render | low | reject | Needs a concurrent sign-out racing the first render; fix adds a branch to the port. |
| B7 | No FK / role CHECK on `tenant_membership`; unknown role signs out unlogged | low | reject | No membership writes exist in this slice; unknown role is tested; no FKs by the demo deviation. |
| B8 | `/no-access` copy wrong for several memberships; log repeats per request | low | patch (copy) / reject (log) | Copy made neutral; log is once per request via `cache()`. |
| B9 | Pool budget per bundle not recorded | low | reject | Performance note without a demonstrated failure. |
| B10 | `config.ts` comment names non-existent `parseConfig` callers | low | patch | No non-test caller exists (grep); comment corrected. |
| B11 | README-DEMO says "No authentication", no env vars | low | patch | README updated. |
| B12 | Sign-out control is a fixed overlay over `/c/` and `/no-access` | maybe-false | reject | Cosmetic at most (low); not observed. |
| B13 | Comment names `MembershipPort`; duplicated `SessionIdentity`; empty role chip | low / false | patch (name) / reject | Name fixed; the duplicate is required (db-auth cannot import app) and checked by `satisfies`; roles are never empty (resolver keeps known roles only). |
| E1 | Middleware 307 on an expired session's action POST | maybe-false | defer | A 303 may be right for non-GET; needs a signed-out action POST observed in `next dev`. |
| E3 | `endpointOf` comment contradicts trailing-slash stripping | low | patch | Comment corrected. |
| E5 | `getSession` throw in middleware → 500 | false | reject | A database outage failing loudly is correct; a bad cookie resolves to null, not a throw. |
| E6 | `SESSION_IDLE_TIMEOUT_HOURS=` (empty) throws instead of defaulting | low | reject | Fails loudly naming the key. |
| E7 | Probe removal would delete a user with another membership | false | reject | Probe users are prefixed per probe and belong to no other Tenant. |
| E8 | Empty `roles` renders an empty chip | false | reject | See B13. |
| E9 | Duplicate memberships per Tenant | false | reject | Primary key `(user_id, tenant_id)`. |
| E10 | Callers of `membershipsOf` not pinned | low | patch | Source test now pins the identifier to five shipping files, the resolver among them. |

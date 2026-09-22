---
title: 'Story 1.4 slice 4 — password reset, the first mail out, and where identity events land'
type: 'feature'
created: '2026-09-22'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '270db5d73139fc21ee91522d9e553a77986362b6'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-google-sign-in.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A user who forgets their password has no way back in — only the seed sets passwords.
FR-3 requires reset, reset requires mail, and the system cannot send mail at all today. A reset
also has nowhere to be recorded: `audit_log` needs a Tenant, and a reset resolves none.

**Approach:** Declare `MailerPort` in `packages/app` and implement it in `packages/adapters`; hand
it to `createAuth` as an argument, as `google` is handed, so `packages/db/auth` stays the only
importer of Better Auth and imports neither `@momo/app` nor `@momo/adapters`. Add the global,
insert-only `identity_event` table as the sink for identity events that happen before any Tenant
exists. Two new public pages request a link and consume it, both through server actions.

## Boundaries & Constraints

**Decisions taken with the founder, 2026-09-22:**
- **Identity events land in a new `identity_event` table** — global, `tenantColumn: null`,
  insert-only for the app role — as the AD-1 adversarial review's F3 proposes. Later identity work
  (link, unlink, invitation acceptance) records there too, never in `audit_log` or `operator_audit`.
- **A completed reset sets `email_verified`.** Redeeming a token the product mailed is what proves
  the address. Written from `onPasswordReset`, which fires before session revocation.
- **The sign-in throttle stays deferred to Epic 8**, as `deferred-work.md` records. R0 runs locally.
- **`mailer-console` only.** `mailer-ses` moves to Epic 8, where the AWS account exists to test it
  against; the port is shaped so it is a drop-in. AD-18's R0 requirement is met there.

**Always:**
- The port is declared in `packages/app/src/ports/`, implemented in `packages/adapters/`, matched
  structurally at one `satisfies` line in `apps/web/src/server/composition.ts`.
- One generic answer to every reset request — sent, unknown, no credential account — so nothing
  discloses whether an email has an account (NFR-S5). The email is lowercased and trimmed at the
  boundary before Better Auth sees it.
- Both flows are server actions calling `auth.api.*`, never HTTP: `serveAllowlisted` matches an
  exact method and path and so cannot express `/reset-password/:token`, and both reset paths stay
  in `DISABLED_PATHS`. The emailed link is our own `/reset-password?token=…`, built from
  `sendResetPassword`'s `token` argument — never Better Auth's `url`.
- `resetPasswordTokenExpiresIn: 3600` and `revokeSessionsOnPasswordReset: true` are pinned
  explicitly, not inherited: a reset ends every session of that user, an attacker's included.
- An `identity_event` row is written only on a **completed** reset, never on a request: the request
  endpoint is unauthenticated, enumerable and unthrottled, so recording it would be a write
  amplifier. Its `at` comes from a `now` argument on `CreateAuthOptions` (AD-15 — Better Auth's own
  `Date` exception covers its four tables, not ours).
- Mail copy is hardcoded English in one pure, unit-tested builder. `packages/i18n` is empty until
  story 1.9; nothing here invents an i18n layer.

**Never:**
- No new HTTP endpoint, no change to `serveAllowlisted`'s matcher, no `/verify-email` or
  `/change-password` path re-enabled.
- No `audit_log` row, no `AUDIT_ACTIONS` member, and reset is **not** exported from
  `packages/app/src/use-cases/index.ts` — that module's namespace is what the audit and
  cross-tenant gates enumerate, and a Tenant-less flow does not belong in a Tenant-shaped gate.
- The adapter reads no environment, no wall clock and no `JSON.stringify`; configuration arrives as
  an argument, as `uuidV7IdsOn(systemClock)` takes its clock.
- No user is created by this flow, and no `account` row is created for a user who has none: a
  Google-only user requesting a reset gets the same generic sentence and no mail.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Request, known email | seeded user | One mail through `MailerPort`; `verification` row `reset-password:<token>` | N/A |
| Request, unknown email | `nobody@…` | Same page, same sentence, no mail, no row | N/A |
| Request, mixed case | `Hoang@…` | Lowercased first, so the seeded user is found | N/A |
| Consume, valid token | fresh token, new password | Password replaced; `email_verified` true; one `identity_event`; every session of that user deleted | N/A |
| Consume, reused token | token already spent | Refused, one generic sentence; no second `identity_event` | Row consumed atomically |
| Consume, expired token | row older than 1 h | Refused, same sentence | `expires_at` column is the gate |
| Consume, short password | 7 characters | Refused before any write | Better Auth's `minPasswordLength` (8) |
| Mailer fails | transport throws | Request answers exactly as on success | Logged without the address; never surfaced |

</frozen-after-approval>

## Code Map

- `packages/app/src/ports/mailer.ts` (new) -- `MailerPort` and its message interface. Copy
  `ports/clock.ts:1-20`'s ALL-CAPS header and "declared here, satisfied structurally" wording;
  `readonly` arrow-function members. Export as a **type only** from `packages/app/src/index.ts`,
  beside `:42-43`.
- `packages/app/src/config.ts:120,215` + `config.test.ts` -- `MAILER`
  (`z.enum(['console','ses']).default('console')`, AD-17's dev default) and its getter, in
  `AUTH_GOOGLE`'s shape. `ses` is accepted and, until Epic 8, fails at the composition root naming
  the missing adapter — the key is not a lie about what ships.
- `packages/adapters/src/mailer-console.ts` (new) + `mailer-console.test.ts`, `index.ts` -- the dev
  adapter, its sink passed in. The barrel header (`index.ts:1-6`) still says mail "arrives in later
  stories" — rewrite. Test in `ids.test.ts`'s shape: hand-rolled fakes, prose test names.
- `packages/db/src/schema.ts` -- `identity_event` beside the four auth tables: id (UUIDv7),
  `user_id` → `auth_user`, `action`, `at` timestamptz, `payload` jsonb.
- `packages/db/src/table-classes.ts` -- the entry: `class: 'global'`, `tenantColumn: null`,
  `appPrivileges: ['SELECT', 'INSERT']`, a `why` naming this story. Insert-only comes from the
  missing UPDATE/DELETE grant, as `tenant`'s SELECT-only does.
  **`registry.test.ts:127-151` pins the override set to exactly five tables and each non-bridge
  override to `['SELECT','INSERT','UPDATE','DELETE']` — both assertions must grow.** Regenerate
  `packages/db/sql/*` with `pnpm db:sql` or the drift test fails.
- `packages/db/src/repo-identity-event.ts` (new) -- `identityEventWriterOn(db)`, in
  `repo-membership-write.ts`'s shape, with the closed action list (`password.reset` today). Add its
  fence entries to `source-discipline.test.ts` beside `membershipWriterOn`'s (`:188-196`).
- `packages/db/auth/src/reset.ts` (new) -- the pure, testable pieces, as `google.ts` keeps
  `discoveryUrlOf`: `resetLinkOf(baseURL, token)` and the mail-body builder. No `@momo/app` import.
- `packages/db/auth/src/auth.ts` -- `CreateAuthOptions` (`:97-113`) gains `mailer`, `now` and the
  identity-event writer, each shaped like `google`; `emailAndPassword` (`:127`) gains
  `sendResetPassword`, `onPasswordReset`, `resetPasswordTokenExpiresIn`,
  `revokeSessionsOnPasswordReset`. `onPasswordReset` sets `email_verified` through `options.db` and
  writes the event. Header lines 15-16 ("No password reset and no mail yet") are now false.
  **`auth.test.ts:30` pins `emailAndPassword` with `toEqual` and will fail; update it.**
- `packages/db/auth/src/bindings.ts` -- two bindings in `signInWithPassword`'s exact shape
  (`:103-131`): `requestPasswordReset(auth, headers, email)` and
  `resetPassword(auth, headers, { token, password })` — `try`/`isAPIError`/`console.warn` of status
  and code only, each returning a boolean carrying no reason. Re-export from `index.ts`.
  **Do not touch `SERVED_AUTH_ENDPOINTS` or `DISABLED_PATHS`.**
- `apps/web/src/server/composition.ts` -- a `??=`-memoised `webMailer()` near `webAuth()`
  (`:154-158`) switching on `config.MAILER`, with `satisfies MailerPort`; fed into the **one**
  `baseAuthOptions()` value so both instances agree (AD-1's no-drift rule), together with
  `systemClock.now` and the writer over `webDb()`. Two bindings beside `signInWithEmail` (`:273`).
  No adapter is exported. `tests/web-composition.test.ts` pins the wiring.
- `apps/web/src/app/forgot-password/{page.tsx,forgot-password-form.tsx,actions.ts,actions.test.ts}`,
  `apps/web/src/app/reset-password/{page.tsx,reset-password-form.tsx,reset-token.ts,actions.ts,actions.test.ts}`
  (new) -- top level, not under `sign-in/` (a sub-route of `/sign-in` is gated). Mirror
  `sign-in/page.tsx:6-33` (force-dynamic, awaited `searchParams`, `auth-page`/`auth-sheet`
  markup), `sign-in-form.tsx` (`useActionState`), `actions.ts:1-41` (zod, generic refusal,
  `redirect`), `actions.test.ts` (`vi.hoisted` + `vi.mock('@/server/composition')`,
  `redirectedTo()`). `reset-token.ts` is `google-refusal.ts:10-13`'s pure `string | string[]`
  reader. The token rides a hidden field; the action never re-reads the URL.
- `apps/web/src/server/session-gate.ts:29-36`, `middleware.ts:18`,
  `session-gate.test.ts:48,82-103` -- the three places that must change together: `isPublicPath`
  gains both routes, the matcher excludes exactly the same two, the test asserts complements.
- `apps/web/src/app/globals.css:743-773` -- new auth CSS at the end of that block, with a
  story-naming comment like the Google one.
- `tests/password-reset.test.ts` (new, Postgres) -- `connectWriteHarness` + `describe.skipIf`, its
  own probe Tenant, `createAuth` on `appDb()` with a capturing fake mailer (`fake.hits()` and the
  audit gate's push-array are the precedents; no outbox helper exists). Drives the matrix, reading
  `verification`, `account.password`, `auth_user.email_verified` and `identity_event` as `owner()`.
  Expire a token by moving `expires_at` in SQL, never the wall clock. `afterAll` →
  `removeProbeTenant`, plus the file-level `closeAllPools()`.
- `tests/identity.test.ts:370-384` -- already asserts `POST`/`GET /reset-password/x` → 404. That
  stays true under a server-action transport; keep it deliberate, not accidental.
- `README-DEMO.md:24-34` -- the `MAILER` key and where console mail appears.

**Do not change:** `packages/app/src/audit/`, `audit-declarations.ts`, `tests/read-use-cases.ts`,
`tests/audited-use-cases.test.ts`, `packages/db/auth/src/identity.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/app/src/ports/mailer.ts`, `index.ts`, `config.ts` + `config.test.ts` -- the port and `MAILER` -- AD-17, AD-18
- [x] `packages/adapters/src/mailer-console.ts` + test, `index.ts` -- the dev adapter; the barrel's stale header
- [x] `packages/db/src/{schema,table-classes,repo-identity-event}.ts`, `registry.test.ts`, `source-discipline.test.ts`, `pnpm db:sql` -- the table, its one writer, its fences, regenerated SQL
- [x] `packages/db/auth/src/{reset,auth,bindings,index}.ts`, `auth.test.ts` -- the callbacks, pinned options, two bindings, the stale header note
- [x] `apps/web/src/server/composition.ts`, `tests/web-composition.test.ts` -- `webMailer()`, one options value, two bindings
- [x] `apps/web/src/app/{forgot-password,reset-password}/*` + co-located tests, `globals.css` -- the two pages
- [x] `apps/web/src/server/session-gate.ts`, `middleware.ts`, `session-gate.test.ts` -- both routes public, in all three places
- [x] `tests/password-reset.test.ts`, `tests/identity.test.ts` -- the matrix; reset still 404s over HTTP
- [x] `README-DEMO.md`, `deferred-work.md`, `HANDOFF.md` -- local instructions; mark slice 4; defer `mailer-ses`, the throttle, and the spine amendment recording `identity_event` and the four decisions above

**Acceptance Criteria:**
- Given `MAILER=console` and a seeded user, when a reset is requested and the link followed with a
  new password, then the user signs in with it and not with the old one.
- Given each sabotage, when CI runs, then a test fails: `revokeSessionsOnPasswordReset` removed (a
  session alive after reset); `resetPasswordTokenExpiresIn` removed (`auth.test.ts`'s options pin,
  which is the only thing that can catch it — Better Auth's own default is 3600 too, so removing
  the line changes no behaviour); the boundary's lowercasing removed (`Hoang@…` finds nobody); the
  generic sentence replaced by a distinguishable one; `/reset-password` removed from
  `DISABLED_PATHS` **and** added to `SERVED_AUTH_ENDPOINTS` (both gates must be defeated before it
  is served, so only changing both is a real sabotage); `identity_event` granted UPDATE or DELETE
  (the registry assertion must catch it).
- Given the mailer throws, when a reset is requested, then the page answers exactly as on success
  and the address appears in no log line.

## Implementation Notes

- The Google-only "no mail" rule is enforced in `sendResetPassword` itself: a small
  `hasCredentialAccount(options.db, user.id)` read (SELECT on `account` filtered to
  `providerId: 'credential'`) gates whether `mailer.send` is ever called. Better Auth still
  creates the `verification` row before calling `sendResetPassword` (it always does, once a user
  is found by email), so a Google-only user's request still leaves an unused, expiring token row
  behind — the same shape as the identity-event-cleanup gap recorded below, and harmless since the
  mail (the only channel the token travels over) is never sent.
- `identityEventWriterOn(db)` takes the bare handle and issues its insert on a `tx` via
  `db.transaction(...)`, per the bare-handle rule (`source-discipline.test.ts`), the same shape as
  `repo-membership.ts`'s reader — there is no tenant transaction to fold it into (`identity_event`
  is global).
- `packages/db/auth/src/auth.ts` reuses `CreateAuthOptions.generateId` (the same UUIDv7 port
  already used for identity ids) to mint the `identity_event` row's id, rather than adding a
  fourth id-generation argument.
- `/forgot-password` and `/reset-password` follow `/sign-in?google=refused`'s REDIRECT shape
  rather than `useActionState`: every outcome (sent, or refused) is a redirect to the same page
  with a query flag (`?sent=1`, `?refused=1`), never a distinguishable value returned to
  re-render — which is also what let a `redirectedTo()` test helper, copied from
  `sign-in/actions.test.ts`, pin both actions' outcomes exactly.
- A "Forgot your password?" link was added to `sign-in-form.tsx` (not in the spec's Code Map, but
  the two pages would otherwise be reachable only by typing the URL).

## Spec Change Log

- 2026-09-22 — two acceptance-criteria sabotages were written at planning time against a wrong
  model of the code, and were corrected after the implementation diff was judged. (1)
  "`resetPasswordTokenExpiresIn` removed (an hour-old token accepted)" is impossible: Better
  Auth's own default is 3600 s (`@better-auth/core`'s `init-options`, applied at
  `password.mjs:73`), so removing the line changes no behaviour and only `auth.test.ts`'s options
  pin discriminates it. (2) "`/reset-password` added to `SERVED_AUTH_ENDPOINTS` (it must stay
  404)" assumed the allowlist was the only gate; `DISABLED_PATHS` blocks the same path
  independently at Better Auth's own router, so defeating one gate alone still yields 404. The
  criterion now names both gates. KEEP: the remaining four sabotages are real pass→fail
  transitions and were each watched to fail.
- 2026-09-22 — `packages/db/auth/src/auth.ts`: the comment above the two pinned reset options
  claimed "Better Auth's own defaults happen to match" for BOTH. That is true only of
  `resetPasswordTokenExpiresIn`; `revokeSessionsOnPasswordReset` defaults to `false`
  (`@better-auth/core`'s `init-options`; read at `password.mjs:171`), so the line is an override,
  not a restatement. Rewritten to separate the two, because the comment as written invited a
  future reader to delete a line that silently keeps an attacker's session alive through a reset.

## Review Triage Log

## Design Notes

- **Why the mailer is an argument, not an import.** `packages/db/auth` may import neither
  `@momo/app` nor `@momo/adapters` (depcruise `better-auth-only-in-db-auth`,
  `inner-packages-not-to-adapters`), and `sendResetPassword` is mandatory — without it the endpoint
  throws `RESET_PASSWORD_DISABLED`. Passing it on `CreateAuthOptions`, exactly as `google` is
  passed, is the only shape that satisfies both.
- **Why our own link.** Better Auth builds `${baseURL}/reset-password/${token}?callbackURL=…`, a
  parametrised route under `/api/auth` that `serveAllowlisted` 404s by design. The `token` argument
  is handed to the callback separately, so the product builds its own page URL.
- **The earlier `verification` finding does not apply here.** Slice 3 found Better Auth reading
  expiry from the row's JSON `expiresAt`; that is the OAuth state path. Reset uses
  `consumeVerificationValue`, which gates on the `expires_at` **column** and deletes the row inside
  one locked transaction — single use is atomic, and a test may expire a token by moving the column.
- **Why `identity_event` is `global` rather than `append-only`.** `append-only` carries a
  tenant-owned shape and its trigger; this table has no `tenant_id` at all. Insert-only comes from
  the grant list, which is the same mechanism AD-21 relies on, and the registry assertion pins it.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm --filter @momo/web typecheck && pnpm --filter @momo/worker typecheck && pnpm depcruise` -- expected: clean
- `pnpm exec drizzle-kit push --force && pnpm db:sql && pnpm db:policies && pnpm db:policies && pnpm seed` -- expected: clean, and `db:policies` idempotent
- `REQUIRE_DB=1 pnpm test` -- expected: all green
- The sabotages in the acceptance criteria, each watched to fail, then restored

**Manual checks:**
- `pnpm dev` with `MAILER=console`: request a reset for the seeded user, copy the link out of the
  terminal, set a new password, sign in with it. CI never runs `next build`, so the two pages are
  confirmed here or not at all.

## Verification Results (2026-09-22)

Against a native Postgres 16 instance (Docker was unavailable in this session's sandbox; CI's
`postgres:18.6-alpine` service should still be the one re-checked before merge), `REQUIRE_DB=1`,
after `drizzle-kit push --force`, `pnpm pgboss:migrate`, `pnpm db:policies` (applied twice,
idempotent) and `pnpm seed`.

| Command | Result |
| --- | --- |
| `pnpm lint` | exit 0 |
| `pnpm typecheck`, `pnpm --filter @momo/web typecheck`, `pnpm --filter @momo/worker typecheck` | exit 0 |
| `pnpm depcruise` | exit 0 — 178 modules, 499 dependencies |
| `pnpm db:sql` | regenerated; only `grants.sql` changed (the `identity_event` grant) |
| `REQUIRE_DB=1 pnpm test` | **758 passed across 43 files** (528 across 42 without a database) |
| `pnpm --filter @momo/web exec next build` | exit 0; `/forgot-password` and `/reset-password` compile as dynamic routes |

**Sabotages — each watched to fail, then restored.**

| Sabotage | What caught it |
| --- | --- |
| `revokeSessionsOnPasswordReset` removed | `auth.test.ts` (options pin); `tests/password-reset.test.ts` (a session survives the reset) |
| `resetPasswordTokenExpiresIn` removed | `auth.test.ts` (options pin) — Better Auth's own default happens to equal 3600 too, so no behavioural test distinguishes it; the explicit pin is what a future Better Auth default change would need |
| The boundary's lowercasing removed (`apps/web/src/app/forgot-password/actions.ts`) | `forgot-password/actions.test.ts` |
| `identity_event` granted UPDATE | `registry.test.ts` (the override-set assertion) and its SQL-drift check (`grants.sql`) both fail |
| `/reset-password` added to `SERVED_AUTH_ENDPOINTS` alone (`DISABLED_PATHS` untouched, per the spec) | Confirmed to still answer 404 (`tests/password-reset.test.ts`) — `DISABLED_PATHS` independently blocks it at Better Auth's own router, so this one change alone does not reach `auth.handler`; matches the acceptance criterion's own wording ("it must stay 404") rather than a pass→fail transition |
| The mailer throws | `tests/password-reset.test.ts` — the request still answers `true`, and the console.warn line names no address |

**Not run in this session:** a real-browser click-through of `/forgot-password` and
`/reset-password` under `next dev` (no browser in the sandbox). `next build` succeeded and the
same `createAuth` options the composition root builds are exercised end-to-end against Postgres
by `tests/password-reset.test.ts`, but the actual Next.js request/response cycle and form
submission were not driven by a browser. Recorded in `deferred-work.md`.

---
title: 'Story 1.4 slice 4 — password reset, the first mail out, and where identity events land'
type: 'feature'
created: '2026-09-22'
status: 'in-progress'
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
- [ ] `packages/app/src/ports/mailer.ts`, `index.ts`, `config.ts` + `config.test.ts` -- the port and `MAILER` -- AD-17, AD-18
- [ ] `packages/adapters/src/mailer-console.ts` + test, `index.ts` -- the dev adapter; the barrel's stale header
- [ ] `packages/db/src/{schema,table-classes,repo-identity-event}.ts`, `registry.test.ts`, `source-discipline.test.ts`, `pnpm db:sql` -- the table, its one writer, its fences, regenerated SQL
- [ ] `packages/db/auth/src/{reset,auth,bindings,index}.ts`, `auth.test.ts` -- the callbacks, pinned options, two bindings, the stale header note
- [ ] `apps/web/src/server/composition.ts`, `tests/web-composition.test.ts` -- `webMailer()`, one options value, two bindings
- [ ] `apps/web/src/app/{forgot-password,reset-password}/*` + co-located tests, `globals.css` -- the two pages
- [ ] `apps/web/src/server/session-gate.ts`, `middleware.ts`, `session-gate.test.ts` -- both routes public, in all three places
- [ ] `tests/password-reset.test.ts`, `tests/identity.test.ts` -- the matrix; reset still 404s over HTTP
- [ ] `README-DEMO.md`, `deferred-work.md`, `HANDOFF.md` -- local instructions; mark slice 4; defer `mailer-ses`, the throttle, and the spine amendment recording `identity_event` and the four decisions above

**Acceptance Criteria:**
- Given `MAILER=console` and a seeded user, when a reset is requested and the link followed with a
  new password, then the user signs in with it and not with the old one.
- Given each sabotage, when CI runs, then a test fails: `revokeSessionsOnPasswordReset` removed (a
  session alive after reset); `resetPasswordTokenExpiresIn` removed (an hour-old token accepted);
  the boundary's lowercasing removed (`Hoang@…` finds nobody); the generic sentence replaced by a
  distinguishable one; `/reset-password` added to `SERVED_AUTH_ENDPOINTS` (it must stay 404);
  `identity_event` granted UPDATE or DELETE (the registry assertion must catch it).
- Given the mailer throws, when a reset is requested, then the page answers exactly as on success
  and the address appears in no log line.

## Implementation Notes

## Spec Change Log

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

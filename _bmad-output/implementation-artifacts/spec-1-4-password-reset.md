---
title: 'Story 1.4 slice 4 — password reset, the first mail out, and where identity events land'
type: 'feature'
created: '2026-09-22'
status: 'done'
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
- 2026-09-22 — a THIRD acceptance-criteria sabotage is false, found by two review layers
  independently and verified in the library: "the boundary's lowercasing removed (`Hoang@…` finds
  nobody)". Better Auth lowercases the address inside `findUserByEmail`
  (`internal-adapter.mjs:572`), and this change's own integration test hands the binding
  `ADMIN.email.toUpperCase()` and still expects one mail. Removing `.toLowerCase()` from the action
  therefore changes no behaviour; only `trim()` is load-bearing, and the sole guard that fires is a
  call-shape assertion in `forgot-password/actions.test.ts`. The criterion is not rewritten here —
  a finding whose fix is to edit this build's spec is rejected by rule — but it is recorded so the
  claim is not read as fact, and `HANDOFF.md`, which is not spec text, is corrected.
- 2026-09-22 — a FOURTH sabotage, "the generic sentence replaced by a distinguishable one", is
  asserted by nothing: both routes have only an `actions.test.ts` pinning redirect targets, and no
  test renders either page or reads its copy. Recorded rather than patched, because a page-render
  test is the same deferred work as the missing browser pass. Of the six sabotages this spec
  claimed, three are real pass→fail transitions and were each watched to fail; three were written
  against a wrong model of the code.

## Review Triage Log

Three layers ran against the diff since the baseline: blind hunter (16 findings), edge-case hunter
(12) and verification gap (2 gaps + 2 other). Severities below are this triage's, not the
reviewers' — each claim was checked at its cited location first.

**`onPasswordReset` cannot fail safely** — `high`. Verified in the library, not inferred:
`password.mjs:170-171` awaits `onPasswordReset` and only then runs `deleteUserSessions`. The hook
(`auth.ts:205-213`) has no `try`/`catch`, so a failed `markEmailVerified` or `identityEvents.record`
leaves the password already replaced and the token already spent, skips session revocation entirely
— defeating the pinned `revokeSessionsOnPasswordReset: true` — and, being no `APIError`, is
rethrown by `bindings.ts:167` and escapes the server action as a 500 instead of the one generic
refusal. The likeliest trigger is real: code deployed before `db:policies` applies the new
`identity_event` grant. Route: patch.

**The two writes inside `onPasswordReset` are separate transactions** — `medium`. Confirmed:
`markEmailVerified` and `record` each open their own `db.transaction`. A failure between them sets
`email_verified` with no event recording why, and the table is insert-only so the gap can never be
corrected. Same root cause as the row above; fixed with it. Route: patch.

**The binding rethrows a non-`APIError`, so both actions can 500** — `medium`. Same root cause as
the first row and resolved by it: once the hook cannot throw, the rethrow path is unreachable for
this flow. Route: patch.

**The mailer-failure log prints `error.message` raw** — `medium`. Confirmed at `auth.ts:194-196`.
The spec, the code comment and the test all promise the address never reaches a log, but the test
only proves it for a fake throwing `'mailer transport is down'` — it holds by fixture, not by
construction. A real transport routinely names the rejected recipient (SES `Invalid destination:
…`, SMTP 550). Latent today, live the day `mailer-ses` lands. Route: patch.

**A second outstanding reset link outlives a completed reset** — `medium`. Verified in the library:
the verification identifier is `reset-password:<token>`, unique per token, and
`consumeVerificationValue`'s `deleteMany` is scoped to that one identifier
(`internal-adapter.mjs:840-846`). Request a reset twice, use the second link, and the first still
works for the rest of its hour — so a user resetting precisely to lock someone out does not. Graded
on harm rather than likelihood, per "when the harm is real but you cannot tell how bad, pick the
higher grade". The fix is a single scoped delete on a table the app role already holds DELETE on,
riding inside the `try`/`catch` the row above adds, which is what keeps it a patch rather than an
intent gap. Route: patch.

**`MAILER=ses` is documented wrongly and pinned by nothing** — `medium`. Two verified halves.
(1) `composition.ts:147-148` says a misconfigured deployment "finds out at boot" and
`README-DEMO.md:38` says "the web app fails to start"; neither is true — `webMailer()` runs inside
`baseAuthOptions()`, reached only when an instance is first built. Because `sessionAuth()` shares
that value, the first request through the middleware throws and every route including `/sign-in`
500s, which is loud but is not "fails to start". (2) No test sets `MAILER=ses`:
`config.test.ts:142-155` only proves `parseConfig` accepts it, and `web-composition.test.ts` never
stubs the key, so replacing the throw with a silent console fallback keeps CI green while a
production deployment writes every live reset link to its logs. Route: patch.

**The `requestPasswordReset` binding's refusal branch is run by no test, and the form reaches it** —
`medium`, filed pre-verified by the verification-gap layer, which demonstrated it empirically. The
action's zod has no `.email()` and the form carries `noValidate`, so `hoang` reaches Better Auth,
which refuses it with `VALIDATION_ERROR` before any database access. Delete the `try`/`catch` and
the suite stays green while a mistyped address becomes an error page. Route: patch.

**`auth.test.ts`'s exact pin on `emailAndPassword` was weakened** — `medium`. Confirmed: `:38` is
now `toMatchObject`, which no longer catches an *added* key — exactly what the pin existed to catch,
and exactly how a future `requireEmailVerification: false` would slip in. `:209-210` then re-assert
two keys the same `toMatchObject` already covers, so the file grew while the guarantee shrank.
Route: patch.

**`/reset-password` tells the user to request a new link and offers none** — `medium`. Confirmed:
the file imports no `Link` and contains no `href`, while `/forgot-password` carries "Back to sign
in". A signed-out visitor holding a spent or expired token is left with no way forward. Route: patch.

**The one-hour lifetime is restated in three places with nothing tying them together** — `medium`.
Confirmed: `resetPasswordTokenExpiresIn: 3600`, the mail body's "expires in 1 hour", and the page
copy's "It expires in 1 hour", plus a test asserting the literal string. Changing the option turns
the other two into lies with every gate still green. Route: patch (derive the copy from the same
constant inside `packages/db/auth`, where both already live — no new cross-package surface).

**The console mailer's own format is pinned by nothing, and a spy is dead** — `low`. Confirmed:
`mailer-console.test.ts:17` asserts `consoleMailLine(...)` against itself, and no test names the
`--- mail (console) ---` delimiters that `README-DEMO.md` tells demo users to look for;
`tests/web-composition.test.ts:135,189` declares and fills `spies.mailLines` and never asserts it.
Kept despite `low` because both fixes are a direct addition and a direct deletion. Route: patch.

**Two comments describe boundaries stricter than the code** — `low`. Confirmed:
`forgot-password/actions.ts:20-24` says only a submission with no usable email is refused before the
binding, but without `.email()` a non-empty non-address is forwarded and refused downstream; and
`globals.css`'s new block describes an "updated" message that exists nowhere in the change. Both
fixes are direct corrections, so the `low` rejection rule does not apply. Route: patch.

**`HANDOFF.md` records the lowercasing sabotage as caught** — `medium`. Verified in the library:
`findUserByEmail` lowercases the address itself (`internal-adapter.mjs:572`), and the change's own
integration test hands the binding `ADMIN.email.toUpperCase()` and still expects one mail. So
removing `.toLowerCase()` at the boundary changes no behaviour; only `trim()` is load-bearing, and
the only guard that fires is a call-shape assertion. The next session reads `HANDOFF.md` as fact,
so the false claim is corrected there. Route: patch. The same correction is owed to this spec's
acceptance criteria, but a finding whose fix is to edit this build's spec is rejected by rule — it
is recorded in the Spec Change Log instead, as the two earlier mis-modelled sabotages were.

**The "generic sentence replaced by a distinguishable one" sabotage has no test** — `medium`.
Confirmed: only `actions.test.ts` exists for both routes and it pins redirect targets; no test
renders either page or asserts its copy. Recorded here and in the Spec Change Log rather than
patched: a page-render test is the same deferred work as the missing browser pass, and the
acceptance criterion is spec text this rule forbids patching.

**The consume matrix is order-dependent shared state** — `low`. Confirmed: each `it` mutates
`RESETTER`'s password and the next assumes the previous value, and the first asserts exactly one
`identity_event`. Running one case with `.only` breaks them for reasons unrelated to the code.
Rejected: a developer meets this only when isolating a case, and the fix is a restructure rather
than a direct correction. Recorded in `deferred-work.md`.

**`identity_event.action` is a closed list only in TypeScript** — `low`. Confirmed:
`schema.ts:171` is `text('action').notNull()` with no `pgEnum` and no CHECK, while
`repo-identity-event.ts` claims the column does not accept an arbitrary string. The claim holds for
callers going through the one writer, which `source-discipline.test.ts` fences. Rejected: the fix
is a migration plus regenerated SQL, well past a direct correction. Recorded in `deferred-work.md`.

**The app role's unused `SELECT` on `identity_event`, and the always-null payload** — `low`.
Confirmed: no application code reads the table, and the only caller writes `payload: null`, so an
operator learns only "user X reset at T". Rejected: `['SELECT', 'INSERT']` is what the approved
Code Map specifies, and forensic fields are a design decision for whoever first reads the table.
Recorded in `deferred-work.md`.

**`sendResetPassword`'s early return is a response-timing oracle** — `maybe-false`. A user with no
credential account skips the transport entirely while a credential user awaits it inline. With
`mailer-console` the difference is noise; whether it is measurable through a real SES call on this
unthrottled endpoint is exactly what is not established. Would be `medium` if true. Route: defer,
with what would settle it.

**An oversized hidden token could break the refusal redirect** — `low`, `maybe-false`. The claim is
that an arbitrarily long token yields a `Location` header that throws instead of redirecting;
nothing in the diff or the surrounding code settles what Next.js does at that size. Rejected per the
rule for a `maybe-false` that would only be `low`, with the note recorded.

**A Google-only user still gets a `verification` row** — `low`. Confirmed: Better Auth creates the
row before `sendResetPassword` runs, and the credential gate is inside that callback. The token is
never disclosed to anyone, so nothing can consume it and it expires. Rejected: unreachable in
practice, and gating the consume side too would add a second lookup guarding a state never shown
reachable.

**`?sent=1` replaces the form, so a mistyped address has no retry** — `low`. Confirmed: the page
renders the hint and form or the confirmation, never both. Rejected as a UX preference the spec does
not settle; it costs a visitor one trip back to `/sign-in` and discloses nothing either way.

**A successful reset gives no confirmation** — `low`. Confirmed: `submitReset` redirects to a bare
`/sign-in`. Rejected on the same ground; the `globals.css` half of this finding (a comment naming a
message that does not exist) is patched above.

**The composition root discards the request binding's boolean** — `false`. The binding already logs
its own refusal with status and code, and `requestPasswordReset` is declared `Promise<void>`
deliberately, because every outcome must look the same to the caller (NFR-S5). There is no bad
outcome at the cited location: nothing downstream needs a distinction it is forbidden to draw.

**`identity_event.user_id` carries no foreign key** — `false`. Raised by this triage, not by a
layer, against the Code Map's "`user_id` → `auth_user`". Checked and disproved: `schema.ts` contains
no `references()` at all, and `session.userId` and `account.userId` are declared exactly the same
way. The new table follows the house convention rather than deviating from it.

**AC1 is not proven end to end** — `medium`, already deferred. Confirmed: the suite drives a
capturing fake rather than `mailerConsoleOn`, `web-composition.test.ts` mocks that adapter away, and
no browser exists in the sandbox. Route: defer — already recorded in `deferred-work.md` by the
implementation; no second entry added.

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

### Review Findings

Whole-story code review of story 1.4, first pass: the `packages/db` group (the Better Auth
carve-out and the data layer), 2,545 lines across 28 files, from slice 1's baseline `7830e3b` to
`e940c06`. Four layers ran — blind hunter (18), edge-case hunter (8), verification gap (2),
acceptance auditor (3). The acceptance auditor found no acceptance-criteria violation and no spec
contradiction in the data layer. Severities below are this triage's; each claim was checked at its
cited location first. Groups C (`packages/app`), D (`apps/web`), E (`tests`) and F (fences and
tooling) remain for later passes.

- [ ] [Review][Decision] Nothing ever removes an expired `verification` row, and the reset's own sweep cannot use an index — Story 1.4 introduces three kinds of row in that table (OAuth state, reset tokens, and a never-mailed token for every Google-only user who requests a reset) and adds no cleanup anywhere. Verified: no `delete` against `expiresAt` exists in `packages/db`, `apps/worker` or `scripts`. Separately, `invalidateOtherResetTokens` filters on `value = <userId> AND identifier LIKE 'reset-password:%'`, but `verification` is indexed on `identifier` alone, so the sweep degrades as the table grows — which it does, unboundedly, for the same reason.

- [ ] [Review][Patch] The new `global` tables are outside every probe-cleanup path [packages/db/src/probe-tenants.ts:437-443]
- [ ] [Review][Patch] `rls.test.ts`'s no-row-level-security pin omits `identity_event` [packages/db/src/rls.test.ts:382]
- [ ] [Review][Patch] `DISABLED_PATHS` and `SERVED_AUTH_ENDPOINTS` are not pinned exactly [packages/db/auth/src/auth.test.ts:141]
- [ ] [Review][Patch] `signOutOf` reports every `APIError` as a successful sign-out [packages/db/auth/src/bindings.ts:175-183]
- [ ] [Review][Patch] `next` is an undeclared dependency of `@momo/db-auth`, and its absence fails silently [packages/db/auth/package.json]
- [ ] [Review][Patch] The token-lifetime constant is not exported, so the forgot-password page still hand-writes "1 hour" [packages/db/auth/src/index.ts:31]
- [ ] [Review][Patch] The reset hook's failure containment is never exercised [tests/password-reset.test.ts]
- [ ] [Review][Patch] No test carries a non-`en` locale from `auth_user` through to the resolved context [tests/identity.test.ts]
- [ ] [Review][Patch] `IdentityEventWriter` drops the `payload` field its counterpart carries [packages/db/auth/src/reset.ts:32-39]
- [ ] [Review][Patch] `GOOGLE_REFUSED_URL` is re-declared as a literal in the web app [apps/web/src/app/sign-in/actions.ts:14]
- [ ] [Review][Patch] A probe Tenant's baseline actor prefixes in the wrong order, so it names no seeded user [packages/db/src/seed.ts:252]

- [x] [Review][Defer] `bindings.ts`'s routing logic has no unit test, although all of it is pure [packages/db/auth/src/bindings.ts] — deferred: `endpointOf`'s trailing-slash normalisation, the method-and-path match, `notFound()`'s `cache-control`, and the re-throw branch in all five wrappers need no database; a suite for them is substantial new work and the `tests` group has not been reviewed yet.
- [x] [Review][Defer] `minPasswordLength` is inherited while the file's stated rule is to pin what reset depends on [packages/db/auth/src/auth.ts:165] — deferred: `hashPassword` accepts any non-empty string, so `SEED_DEMO_PASSWORD` may be shorter than the minimum the reset flow enforces; choosing the password policy is a decision, not a correction.
- [x] [Review][Defer] `identity_event.action` is a closed list in TypeScript only [packages/db/src/schema.ts:171] — deferred: already recorded from the slice-4 review; carried, no second entry added.
- [x] [Review][Defer] Google discovery has no timeout and no retry [packages/db/auth/src/bindings.ts:40-43] — deferred: already in the spine's Deferred section as an Epic 8 item; carried, no second entry added.

#### Rejected

- `serveAllowlisted` answers 404 to `HEAD` — `low`. No caller sends `HEAD` to `/api/auth`, and mapping it onto the `GET` entry adds a branch to the one boundary that should stay literal.
- The barrel exports `SERVED_AUTH_ENDPOINTS` but not `servedEndpoints()` or `GOOGLE_CALLBACK_ENDPOINT` — `low`. The only consumer is the composition root, which uses neither.
- `seed.ts` infers probe mode from `own('') !== ''` — `low`. A smell with no named divergence; `idPrefix` is on the options object if it is ever worth passing.
- Probe credential-account ids are double-prefixed — `low`. They stay unique and nothing reads their shape.
- `authOptions` validates `idleHours` and not `secret` or `baseURL` — `low`. Both are required keys that `packages/app/src/config.ts` parses and rejects before the composition root can pass them.
- `exactlyOne` puts a user id in its error message — `low`. A UUID is not the email, password or address the redaction rule names, and the message fires only on an impossible row count.
- `sessionForMiddleware` has no catch, so a session-read failure 500s every protected page — `low`. `/sign-in` is public and the gate returns before the check, so the user can still recover; redirecting to sign-in during a database outage is not better behaviour.
- Probe removal deletes an `auth_user` who might hold a membership in another Tenant — `low`. Probe users are created per probe with prefixed ids, so this was not shown reachable.
- `registry.test.ts` asserts the append-only class list rather than `appPrivilegesOf` — `maybe-false`. `rls.test.ts`'s catalog assertion reads `appPrivilegesOf`, so an override adding UPDATE or DELETE would still fail there; what would settle it is adding such an override and watching which gate catches it.
- A Google-only user's reset request leaves a live, never-mailed `verification` row — `low` here, and folded into the decision above. Rejected on its own in the slice-4 review on the ground that the token is never disclosed to anyone.

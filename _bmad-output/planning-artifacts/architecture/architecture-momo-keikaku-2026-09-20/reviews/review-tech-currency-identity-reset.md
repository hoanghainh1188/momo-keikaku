# Tech-currency review: story 1.4 slice 4 amendment (password reset, MailerPort, identity_event)

- Reviewed: 2026-09-22
- Target: `git diff main -- _bmad-output/planning-artifacts/architecture` on `docs/spine-identity-event-reset`. That covers `ARCHITECTURE-SPINE.md` (AD-1 carve-out (1), AD-5, AD-14, AD-15, AD-16, AD-17, AD-18, AD-21, AD-23, i18n row, Structural Seed, Deferred) and `.memlog.md`.
- Method: each technical claim about Better Auth was checked against the installed sources: `node_modules/.pnpm/better-auth@1.7.5_…/node_modules/better-auth/dist` (below: `BA/`), `@better-auth/core@1.7.5` (`CORE/`) and `@better-auth/drizzle-adapter@1.7.5`. The shipped code (`packages/db/auth/src/{auth,bindings}.ts`) and the tests (`tests/identity.test.ts`, `tests/password-reset.test.ts`, `packages/db/auth/src/auth.test.ts`) were read to see what they actually pin. Currency was checked with `npm view better-auth`, `gh release list` and `gh api …/security-advisories` for better-auth/better-auth. AWS SES was checked against the AWS developer guide. The PostgreSQL trigger claim was checked against `packages/db/sql/triggers.sql`.

## Verdict

**Pass with changes.** All seven Better Auth behaviours the amendment relies on hold in the installed 1.7.5 source. 1.7.5 is still `latest`, and no published advisory touches the email + password reset path. Two claims are stronger than reality, though: that a reset request "discloses nothing" (known and unknown emails already take different database paths), and that `identity_event` is insert-only "by trigger" (the trigger does not exist yet). The SES sandbox sentence also leaves out the limit that matters most for reset mail. None of these blocks the amendment. Each needs one sentence changed.

## Claim check

| # | Claim (spine line) | Evidence | Status |
|---|---|---|---|
| 1 | `onPasswordReset` runs after the password is replaced and before sessions are revoked; a throw skips revocation (l.94, l.303) | `BA/api/routes/password.mjs:162-171`: hash, then `createAccount`/`updatePassword`, then `await onPasswordReset(...)` at 170, then `deleteUserSessions` at 171 only if the flag is set. Nothing wraps line 170, so a throw exits before 171. | Confirmed |
| 2 | `revokeSessionsOnPasswordReset` defaults to false (l.469) | `password.mjs:171` is a plain truthiness check. `CORE/dist/types/init-options.d.mts:771-775` says `@default false`. The project sets `true` (`auth.ts:195`). | Confirmed |
| 3 | `resetPasswordTokenExpiresIn` defaults to 3600 (l.311) | `password.mjs:73`: `resetPasswordTokenExpiresIn \|\| 3600 * 1`. Because it uses `\|\|`, a `0` would also fall back to 3600. | Confirmed |
| 4 | `/request-password-reset` and `/reset-password` in `disabledPaths`; `/reset-password/:token` answers 404 because no reset path is on the allowlist (l.94) | `BA/api/index.mjs:166-168`: `disabledPaths.includes(normalizedPath)` is an exact string match, so `/reset-password/x` is **not** disabled by it. The 404 comes only from `serveAllowlisted` (`bindings.ts:70-75`). `auth.api.*` calls skip the router, which is why the server actions still work. `tests/identity.test.ts:441-442` and `tests/password-reset.test.ts:465-472` pin GET and POST `/reset-password/:token` as 404 **through the allowlist**. `auth.test.ts:164-182` pins the `disabledPaths` list itself. | Confirmed. The spine attributes the 404 correctly, to the allowlist. |
| 5 | Token spent atomically; expiry gated on `expires_at` (l.469) | `BA/db/internal-adapter.mjs:787-860`: `consumeVerificationValue` runs under a lock in a transaction. The drizzle adapter's `consumeOne` on `pg` is `DELETE … WHERE id IN (SELECT … LIMIT 1) RETURNING` (`drizzle-adapter/dist/index.mjs:471-490`), so a second racer gets `null`. The row is deleted even when expired, then `consumed.expiresAt < new Date()` returns `null`. Password length is checked **before** consuming (`password.mjs:154-157`), so a short password does not burn the token (`password-reset.test.ts:375`). The expiry compare uses the library's wall-clock `new Date()`, which matches the AD-15 exception. | Confirmed |
| 6 | `sendResetPassword` is called only for a user found by email; lookup lowercases | `password.mjs:59-72`: an unknown email returns before the hook. `internal-adapter.mjs:568-572`: `findUserByEmail` lowercases the input. `password-reset.test.ts:290` pins a mixed-case lookup. | Confirmed |
| 7 | Unknown vs known email indistinguishable (l.469, l.810) | The response body is identical (`password.mjs:68-71` and `87-90`), and the binding returns `true` either way. Timing is **not** identical: see F1. | Partly refuted |
| – | Better Auth's `url` points at a parametrised route; the product builds its own link from `token` (l.94) | `password.mjs:81`: `${baseURL}/reset-password/${token}?callbackURL=…`. `token` is passed at line 85. | Confirmed |
| – | Hook mail is sent inline, not in the background (l.810, "once `mailer-ses` sends inline") | `BA/context/create-context.mjs:215-224`: `runInBackgroundOrAwait` awaits unless `advanced.backgroundTasks.handler` is set, and the project sets none. | Confirmed |
| – | Better Auth 1.7.5 is current | `npm view better-auth dist-tags`: `latest: 1.7.5` (released 2026-09-14). Nothing newer on 1.x. Security advisories filtered for reset or verification-token topics: none is open against 1.7.5. The nearest ones are GHSA-qq9h-g4jm-xgf3 (magic-link/email-OTP pre-account hijack, fixed 1.7.0-beta.10) and GHSA-7w99-5wm4-3g79 (find-then-delete race in oauth-provider, which is why `consumeVerificationValue` exists). The project uses neither plugin. | Confirmed, current |
| – | SES sandbox 200/day, 1/s (l.352) | AWS SES DG, "Request production access": 200 messages per 24 h, 1 message/s, **send only to verified addresses or domains**, and sandbox status is **per Region**. | Numbers confirmed; incomplete (F3) |

## Findings

### F1 (medium): "discloses nothing" is true of the response but not of timing, even today

- Evidence: For an unknown email, `password.mjs:59-67` runs one user SELECT, then `findVerificationValue("dummy-verification-token")`, which is a SELECT plus a DELETE of expired rows (`internal-adapter.mjs:718-758`). For a known email, `password.mjs:59,75-86` runs a user SELECT that joins accounts, an INSERT into `verification`, and the project's hook: `hasCredentialAccount` SELECT (`auth.ts:206`) and then `mailer.send`. These are different statements and different round-trip counts, and the INSERT commit is on the known-email path only. The spine's Deferred item (l.810) names only the password/no-password split "once `mailer-ses` sends inline". AD-23 (l.469) states "discloses nothing" without qualification.
- Fix: At l.469, say the request discloses nothing in its response, and that a timing difference between known and unknown emails exists today and is closed by Epic 8's throttle or queued send. At l.810, widen the timing clause from "whether that user has a password" to "whether the email has an account, and whether it has a password".

### F2 (medium): AD-21 says `identity_event` is insert-only "by grant and by trigger", but the trigger does not exist

- Evidence: Spine l.429: "so it is insert-only by grant and by trigger although its class is `global`". `packages/db/sql/triggers.sql` has no `identity_event` trigger. `deferred-work.md` (new entry) says so: "insert-only by grant only … the code does not have yet". AD-5 (l.154) does say the trigger is "owed in code", but AD-21 states it as present fact. Until the trigger lands, the owner role can UPDATE or DELETE rows silently.
- Fix: At l.429, write "insert-only by grant today and, once the owed trigger lands (`deferred-work.md`), by trigger". Alternatively, land the generator change before merging the spine.

### F3 (low): the SES sandbox sentence omits the verified-recipient restriction and the per-Region scope

- Evidence: Spine l.352: "New SES accounts start in the sandbox (200/day, 1/s)". [AWS SES DG: Request production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html): in the sandbox you can send only to verified addresses or domains, and "the sandbox status for your account is unique per each AWS Region". For password reset this matters more than the quotas: a sandboxed `mailer-ses` fails for every unverified user. The project logs only the error `name` and answers the generic sentence, so the failure is silent. The request also requires acknowledging a bounce and complaint handling process.
- Fix: Change the sentence to: "New SES accounts start in the sandbox per Region (verified recipients only, 200/day, 1/s), so requesting production access in `ap-northeast-1`, with a bounce and complaint handling path, is an R0 launch task."

### F4 (low): "A hook never throws" overstates `sendResetPassword`; the fallback is Better Auth's logger, which logs the whole error

- Evidence: Spine l.94: "A hook never throws". In `auth.ts:206`, `hasCredentialAccount(...)` runs **outside** the try/catch, so a database error rejects the hook. `create-context.mjs:219-223` then catches it and calls `logger.error("Failed to run background task:", e)` with the full error object, message included. That goes around the AD-16 rule (l.322) of logging a mail failure by `name` only. A Drizzle error message carries the SQL and its parameters (a user id, not the email). The response is unchanged, so this is not a disclosure to the caller.
- Fix: Either move `hasCredentialAccount` inside the try in code, or narrow the spine to "`onPasswordReset` never throws; a `sendResetPassword` failure is caught by Better Auth and logged whole".

### F5 (low): reset tokens are stored in plaintext in `verification.identifier`

- Evidence: `createVerificationValue` stores the identifier `reset-password:<token>` as given unless `verification.storeIdentifier` is set (`internal-adapter.mjs:701-704`; `CORE/…/init-options.d.mts:1207-1213`, `@default "plain"`). The project does not set it. Spine l.322 says a reset token appears "only in the mail body and the page's hidden field, never in a log line". That is true of logs, but anyone who can read `verification` (a backup, the owner role, `scripts/peek-db.ts`) holds live one-hour tokens for every pending reset. `"hashed"` exists in 1.7.5, but it would break `invalidateOtherResetTokens`'s `LIKE 'reset-password:%'` (`auth.ts:160-165`).
- Fix: Add one sentence to AD-16: reset tokens rest in plaintext in `verification` for their hour (Better Auth's default `storeIdentifier: 'plain'`). Moving to `'hashed'` needs the invalidation query to key on something other than the identifier prefix, and that decision is deferred to the NFR-S5 security check sheet (Epic 8).

### F6 (low): "the same `BEFORE UPDATE OR DELETE` trigger" does not cover TRUNCATE

- Evidence: Spine l.154 and l.155. In PostgreSQL, row-level `ON DELETE` triggers do not fire on `TRUNCATE`. The repo therefore pairs every `append_only_guard` with a statement-level `append_only_truncate_guard` (`packages/db/sql/triggers.sql:22-45`). The deferred-work fix for `identity_event` asks only for an UPDATE and DELETE test.
- Fix: At l.154, say `identity_event` gets both append-only guards (row `BEFORE UPDATE OR DELETE` and statement `BEFORE TRUNCATE`), as the other insert-only tables do. Add a TRUNCATE attempt to the deferred test.

## Checked and not raised

- The test pins the spine names exist and assert what the spine says. `tests/password-reset.test.ts` covers: revocation with and without a failed event write (`:318`, `:424`), the reused token (`:348`), expiry on `expires_at` (`:363`), invalidation of other tokens (`:391`), no mail and no account for a Google-only user (`:296`), and no `identity_event` on the request side (`:458`). `auth.test.ts:38-47` pins the four `emailAndPassword` options.
- MailerPort, `mailer-console`, and `MAILER=ses` throwing until Epic 8 are project mechanisms with no external claim to check.

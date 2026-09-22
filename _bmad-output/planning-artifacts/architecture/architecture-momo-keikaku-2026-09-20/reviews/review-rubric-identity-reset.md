---
title: 'Rubric review: password reset through MailerPort and the global identity_event (story 1.4 slice 4)'
reviewed: 'ARCHITECTURE-SPINE.md and .memlog.md working-tree diff against main (branch docs/spine-identity-event-reset)'
date: 2026-09-22
lens: good-spine rubric (divergence points for the level below, enforceable rules, deferrals, ratifies the code, internal consistency, silently omitted dimensions)
code_checked: packages/db/auth/src/{auth,reset,bindings}.ts; packages/db/src/{repo-identity-event,schema,table-classes,probe-tenants}.ts; packages/db/sql/triggers.sql; packages/app/src/{ports/mailer,config}.ts; packages/adapters/src/mailer-console.ts; apps/web/src/server/{composition,session-gate}.ts; apps/web/src/middleware.ts; apps/web/src/app/{reset-password,forgot-password}/*; tests/{password-reset,identity,web-composition}.test.ts; better-auth 1.7.5 dist (api/routes/password.mjs, db/internal-adapter.mjs, db/verification-token-storage.mjs, context/create-context.mjs); spec-1-4-password-reset.md; deferred-work.md (slice 4, whole-story review and spine-amendment entries)
---

# Method

I read the full diff. I then checked every factual claim in the new text against the merged code and against Better Auth 1.7.5 as installed. After that I walked the rubric: the divergence points for stories 1.5, 1.7 and 1.9, invitation, Epic 8, and R1 magic link and Microsoft; whether each touched Rule can be enforced; whether any Deferred item lets two units diverge; and the omitted dimensions (mail operations, NFR-D1, NFR-O1).

# Verdict

**Not ready to finalize.** Most of the factual claims are right, and the amendment ratifies the code. These all match the code:
- the `createAuth` signature and the `ResetMailer`/`satisfies MailerPort` split
- the allowlist and the 404 pin (`tests/identity.test.ts:441-442`, `tests/password-reset.test.ts:465-473`)
- `resetPasswordTokenExpiresIn: 3600` and `revokeSessionsOnPasswordReset: true` as an override of Better Auth's default
- the atomic token spend (`consumeVerificationValue`)
- the public paths, changed together in `session-gate.ts` and the middleware matcher
- `MAILER`'s lazy read and its `ses` throw
- `now` wired to `systemClock`, and `updated_at` stamped from it

Two HIGH findings remain:
- A dev-only rule that protects both secrets and deliverability is stated but cannot be enforced, and its dangerous value is the default.
- AD-23 promises reset guarantees that the code makes best-effort, and it does not say so.

Several MEDIUM findings leave the next units (invitation, story 1.7, Epic 8) free to diverge.

# Findings

## F1 (HIGH): `MAILER=console` "must never reach a deployment with real users", but nothing stops it, and it is the default

**Evidence:**
- AD-16 (spine:322) says `MAILER=console` must never reach a deployment that has real users (AD-17).
- AD-17 (spine:339-340) makes `console` the default.
- `packages/app/src/config.ts:171-173` sets `MAILER: z.enum(['console','ses']).default('console')`, with no cross-key rule. Compare the `https:`/loopback rule the same file applies to the OIDC issuer (`config.ts:61`, `:164`).
- `apps/web/src/server/composition.ts:156-158` wires `console.log` as the sink.
- `packages/adapters/src/mailer-console.ts:31-33` writes the recipient and the full body, including the reset link, to that sink.

**Consequence:** A deployment that forgets to set `MAILER` still boots cleanly. It then writes every user's email address and a live one-hour reset token to CloudWatch. That breaks AD-16 (secrets in logs) and NFR-O1 (no account emails in operator logs). No user receives the mail either, which is exactly what AD-19's Prevents clause ("an R0 that cannot send the mail two FRs require") exists to stop. Once `mailer-ses` exists, forgetting the key is the likely mistake.

**Fix:** Add a Rule to AD-17: `MAILER=console` is refused at first read unless `BETTER_AUTH_URL`'s host is loopback (the same shape as the issuer rule), or `MAILER` has no default outside local dev. The rule is pinned in `config.test.ts`, and AD-16's "must never" sentence points to it.

## F2 (HIGH): AD-23 says a completed reset always invalidates other tokens and sets `email_verified`; the code skips both when the event write fails

**Evidence:**
- AD-23 (spine:469): a completed reset "invalidates the user's other outstanding reset tokens, sets `email_verified` … and records one `identity_event`". These are stated as guarantees.
- AD-14 (spine:303) names only the event as best-effort: "the reset stands without its event".
- `packages/db/auth/src/auth.ts:228-243` runs `identityEvents.record`, then `markEmailVerified`, then `invalidateOtherResetTokens`, one after another inside one `try`. The ordering is deliberate: the comment at `:223-227` puts the event first so that the flag is never set without a record of why. So a failed event insert also skips the flag and leaves every other outstanding reset link live for up to an hour.
- The failure-containment test (`tests/password-reset.test.ts:424-455`) asserts only that sessions are revoked and the new password works. It checks neither the flag nor the second link.

**Consequence:** A later unit (Epic 8's throttle and sweep, or an account-lifecycle story) that relies on the spine will assume that a reset always closes other links. It does not, on the path where the database is already misbehaving.

**Fix:** Either make AD-23 say that all three post-reset steps are best-effort, in that order, and that a failure of the first skips the rest; or, better, add a Rule that `invalidateOtherResetTokens` runs even if the event write fails. The failing-writer test would then also assert that a second, earlier link is refused.

## F3 (MEDIUM): AD-1's closed export list for the composition root was not updated

**Evidence:**
- AD-1 carve-out (2) (spine:94) says the composition root exports "the **auth bindings** (the route handler, the middleware's session refresh, sign-in with a password or Google, whether Google is offered, sign-out) and the request-context resolution only".
- The code now also exports `requestPasswordReset` and `resetPassword` (`composition.ts:334`, `:342`).
- `tests/web-composition.test.ts:741-755` drives both.
- The amendment updated carve-out (1)'s list of `db/auth` functions but not this one.

**Fix:** Add "requesting and completing a password reset" to the composition root's list of auth bindings in carve-out (2).

## F4 (MEDIUM): The `identity_event` trigger is described in the present tense and has no registry mechanism, and AD-5's "nothing else" now contradicts the NFR-D1 question

**Evidence:**
- AD-21 (spine:429) says `identity_event` "holds SELECT and INSERT only … plus AD-5's append-only trigger, so it is insert-only by grant and by trigger". Only AD-5 (spine:~157) says the trigger is owed.
- `packages/db/sql/triggers.sql` is generated only for class `append-only` (`packages/db/src/sql/generate.ts`). The `identity_event` entry (`table-classes.ts:151-155`) is `global`, with only `appPrivileges`.
- The spine's own heading says "**Two** per-entry exceptions". A global table with a trigger needs a third per-entry flag, which the generator and the catalog assertion must read through one function (the same rule the bullet sets for grants).
- The deferred-work entry (`deferred-work.md:819-823`) says "include `identity_event` in the append-only set while its class stays global". That wording invites a second, ad-hoc list.
- AD-5 (spine:156) allows "**Two** sanctioned exceptions … and nothing else" (compaction, `purgeTenant`). The new Open Question (spine:827) and the memlog ("Only the maintenance path may delete, for NFR-D1") introduce a third deletion, of user data, that AD-5 forbids.

**Fix:**
- In AD-21, say "the trigger is owed (deferred-work)" and name the registry flag (for example `appendOnlyGuard: true`) as the third per-entry exception, read through the same single function.
- In AD-5, either name user-data deletion as a sanctioned maintenance exception that writes `operator_audit`, or state that it must ride inside `purgeTenant`.

## F5 (MEDIUM): Invitation acceptance is classed as both an identity event and an audited membership use case

**Evidence:**
- AD-14 (spine:303) lists "an invitation acceptance" among identity events that write `identity_event` and "are **not** use cases of this list".
- AD-23 (spine:467) says "Role, membership, invitation and revocation changes go through `app` use cases and are audited (AD-14)".
- spine:470 says the invitation's INSERT joins the one membership writer. That writer runs inside a tenant transaction with an audit row (spine:~461).

**Consequence:** The invitation story cannot tell whether acceptance writes `audit_log`, `identity_event`, or both. It could build any of the three.

**Fix:** State in AD-14 that the membership INSERT on acceptance is an audited use case in the inviting Tenant's transaction (`audit_log`), and that `identity_event` records only the user-level fact, if anything (for example, a first credential set). Otherwise, drop "invitation acceptance" from AD-14's list.

## F6 (MEDIUM): Nothing fences who reads `identity_event`, and story 1.7 is named as its first reader

**Evidence:**
- AD-21's `global` row (spine:~427) fences only the writer.
- The application role holds `SELECT` (`table-classes.ts:155`).
- The new Deferred entry (spine:809) makes "story 1.7's audit-log reader" the natural owner.

**Consequence:** The rows carry no `tenant_id`. An audit viewer scoped to a Tenant that joins them by the users it can see would show a Tenant Admin a user's identity activity that is not that Tenant's. In R1 a Client Viewer can belong to several Tenants. This is AD-3's boundary, and no Rule covers it.

**Fix:** Add a Rule to AD-21: no surface scoped to a Tenant reads `identity_event`, and a reader is an operator surface or is decided by a spine-reviewed change. Narrow the grant to `INSERT` until that reader exists.

## F7 (MEDIUM): AD-16's claim about where the reset token lives is wrong, and hashing it would silently break invalidation

**Evidence:**
- AD-16 (spine:322) says "A reset token appears only in the mail body and the page's hidden field".
- Better Auth stores it in plaintext as `verification.identifier = 'reset-password:<token>'` (`api/routes/password.mjs:74-78`). `verification.storeIdentifier` is unset in `auth.ts`.
- The token is also in the page URL and in every refusal redirect (`apps/web/src/app/reset-password/actions.ts:32-44`).
- Anyone who can read the database can therefore set any user's password within the hour. This includes a Google-only user: their request still writes a live token that is never mailed (spec-1-4-password-reset.md:512), and consuming it creates a credential `account` (`password.mjs:164-168`). AD-23's "no reset creates … an `account` row" therefore rests on the token staying secret, and the spine does not say so.
- Switching to `storeIdentifier: 'hashed'` hashes the whole identifier (`db/verification-token-storage.mjs:8-12`). That silently breaks `invalidateOtherResetTokens`'s `LIKE 'reset-password:%'` (`auth.ts:164`) and `probe-tenants.ts`'s cleanup of reset rows.

**Fix:**
- In AD-16, state where the token lives: the mail, the URL, and plaintext in `verification`.
- Decide whether the plaintext is accepted until Epic 8 (Deferred) or hashed now.
- Record that hashing requires the invalidation to stop matching on the identifier prefix.

## F8 (MEDIUM): No operations for mail, and the blast radius of `MAILER=ses` is unstated

**Evidence:**
- AD-19 (spine:391-403) is unchanged. It has no metric or alarm for mail-send failures, and no bounce or complaint handling. SES requires that handling before it grants production access.
- A send failure is only a `console.warn` of the error name (`auth.ts:211-213`). It carries no log key and does not go through `pino`, contrary to the Logging convention.
- FR-17's PM mail comes from `apps/worker`, which has no composition root or mailer. The spine does not say that the worker's mailer follows the same `MAILER` switch.
- `composition.ts:147-151` records that `MAILER=ses` breaks the middleware as well, so every route answers 500. AD-17 (spine:340) says only that it throws. AD-17's Google paragraph says "only the middleware keeps answering" for a configuration error, which a reader will wrongly generalise.

**Fix:**
- Add to AD-19's alerting: a mail-failure metric and alarm, plus SES bounce and complaint handling, as Epic 8 deliverables.
- Add to AD-17: `MAILER=ses` before `mailer-ses` exists takes down the whole web bundle, middleware included.
- Name the worker's mailer wiring as part of the worker's future composition root.

## F9 (LOW): SES production access is both an R0 launch task and part of the R1 set

**Evidence:** AD-18 (spine:352) says that requesting SES production access "is an R0 launch task". The Deferred R1 set (spine:806) lists "SES production access". The amendment edited the AD-18 sentence next to it and left both in place. R0 reset mail to real users needs production access (the sandbox mails only verified addresses).

**Fix:** Remove "and SES production access" from the R1 set.

## F10 (LOW): Smaller gaps

- **The sweep points at nothing.** The Deferred sweep (spine:810) says "where the sweep runs is AD-19's to decide", but AD-19 says nothing about it. Either name the run site (worker, once it has a composition root) or say "undecided".
- **The i18n exception is incomplete for story 1.9.** The reset pages' copy lives in `apps/web`, not `db/auth`. The hour is stated a second time in `apps/web/src/app/forgot-password/reset-link-hours.ts`, pinned equal only by a test. Story 1.9 has three places to move, not one. Name them in the i18n row.
- **"`identityEvents` is `packages/db`'s `identityEventWriterOn`" (spine:94).** It is the writer that `identityEventWriterOn(webDb())` returns (`composition.ts:183`). Say "the writer `identityEventWriterOn` builds".

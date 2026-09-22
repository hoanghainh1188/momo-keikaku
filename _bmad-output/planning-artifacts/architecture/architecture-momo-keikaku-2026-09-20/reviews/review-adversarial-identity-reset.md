# Adversarial review, round 1: password reset, MailerPort and `identity_event` (2026-09-22)

**Target:** `git diff main -- _bmad-output/planning-artifacts/architecture` on `docs/spine-identity-event-reset`. It records story 1.4 slice 4 (PR #34) into AD-1, AD-5, AD-14, AD-15, AD-16, AD-17, AD-18, AD-21, AD-23, the i18n convention, the Structural Seed, Deferred and Open Questions. The decisions are the last eleven `.memlog.md` entries.

**Method:** a construction attack, as in `review-adversarial-ad1-google.md`. For each rule I built two units one level down that obey every AD to the letter and still build incompatibly. The candidate units were story 1.5, story 1.7, story 1.9, FR-2 invitation, Epic 8 mail and throttle, R1 magic link and Microsoft, a mail-sending `apps/worker`, account lifecycle and NFR-D1, and the seed and probe tooling.

I checked every claim against:

- `packages/db/auth/src/{auth,reset,bindings}.ts` and `packages/db/src/{repo-identity-event,table-classes,schema,seed,probe-tenants}.ts`
- `packages/db/src/{registry,rls}.test.ts` and `packages/db/sql/{grants,triggers}.sql`
- `apps/web/src/server/composition.ts`, `apps/web/src/middleware.ts`, `apps/web/src/server/session-gate.ts` and `apps/web/src/app/{forgot,reset}-password/*`
- `packages/app/src/config.ts` and `packages/adapters/src/mailer-console.ts`
- `tests/{password-reset,identity}.test.ts`
- `deferred-work.md`
- the installed Better Auth 1.7.5 sources: `api/routes/password.mjs`, `db/internal-adapter.mjs` (`consumeVerificationValue`), `db/verification-token-storage.mjs` and `oauth2/link-account.mjs`

Claims I could not verify in this repo are marked **[speculation]**.

**Verdict:** The amendment describes slice 4's code accurately. It closes round-1 F10 and most of F3's "where do identity events go". But it defines `identity_event` by *when* an event happens ("before any Tenant is resolved") rather than by *what it is about*. Its scope is therefore undefined for the first two units that will use it (invitation acceptance and story 1.7's reader), and the spine now gives invitation acceptance two contradictory audit sinks.

Four more holes need spine text before the next identity story:

- The reset is presented as a lockout, but a Google link survives it.
- The "never deploy `MAILER=console`" guard points at an AD-17 rule that does not exist, and the unsafe transport is the default.
- `email_verified` still has writers but no meaning.
- "Insert-only by trigger, class `global`" cannot be built on today's registry without breaking two tests and the NFR-D1 delete path.

---

## Round-1 findings: what this amendment closes

| Round-1 item | Status | Why |
|---|---|---|
| F1: no sign-in method creates users (instance-wide) | **Open** | The amendment adds a second method-specific clause ("password reset creates nothing"), but there is still no instance-wide rule. R1 magic link (`disableSignUp` defaults to false) is still unconstrained. |
| F2: owner and meaning of `email_verified` | **Partly closed** | The writers are now *listed* ("the seed and a completed password reset are the two things that set it", Deferred), but as a description of today, not a closed rule. There is no meaning, no rule for invitation, and no lowercase CHECK. See F4. |
| F3: a legal home for Tenant-less identity work | **Sink closed, owner not** | `identity_event` is the sink. The `packages/app/identity` family was declined, so the policy (who is mailed, what proves an address, event ordering, token invalidation) lives in `packages/db/auth`'s hooks. That is tolerable for reset alone. It opens F1 (invitation acceptance has no owner and two sinks), F9 (the 1.9 renderer has no contract) and the worker-mail gap. See "Did declining F3's family open a hole?" below. |
| F5: `verification` is shared, and nobody owns cleanup | **Partly closed, partly reopened** | Cleanup is now owned (Deferred, with AD-19 to place it). But the amendment explicitly lets product code write `verification` directly, which the round-1 tightening ("Better Auth's alone") forbade. The new direct writes depend on a Better Auth storage option the spine does not pin. See F7. |
| F7: pattern for unauthenticated entry points | **Partly closed** | Reset follows the server-action pattern and is named under the Epic 8 throttle. The throttle's store and ordering are unpinned (F8). |
| F10: sessions survive a reset | **Closed** | `revokeSessionsOnPasswordReset: true` is pinned in `auth.ts` and by `tests/password-reset.test.ts:318`. The survival problem has moved to the Google link (F2). |

### Did declining F3's `packages/app/identity` family open a hole?

Yes, but not for reset itself. It opens holes for the next three pre-tenant units:

1. **Invitation acceptance.** It needs a user created, an `account`, a membership INSERT, an event and `email_verified`. It cannot live in `db/auth` (membership writes are `app` use cases, per AD-23), and it cannot be a normal use case (there is no session and no actor). F1 shows that the two sinks the spine names for it disagree.
2. **Link and unlink events.** These are written from a Better Auth hook like reset's. AD-14's "named exception" covers `onPasswordReset` only, so a link builder must either silently extend it or claim a same-transaction guarantee that cannot hold.
3. **Mail rendering (1.9) and worker mail (FR-17, FR-36).** Two renderers with no shared contract (F9).

The declined family is not the only possible fix. Naming the owner for each of the three is enough.

---

## F1 (HIGH): invitation acceptance has two mandated audit sinks, and the spine forbids each one

**Unit A (FR-2 invitation, audit_log builder):** AD-23 says "Role, membership, invitation and revocation changes go through `app` use cases and are audited (AD-14)". AD-14's rule is `audit.record(ctx, …)` inside `withTenant`, and the enumerating test covers it. Acceptance INSERTs a `tenant_membership` row for a known Tenant (the invitation names it), so this builder writes `audit_log` in the membership transaction.

**Unit B (FR-2 invitation, identity_event builder):** the amended AD-14 says identity events, including "an invitation acceptance when their stories land", "write to `identity_event` … **never to `audit_log`** … and are **not** use cases of this list: the audited-use-case gate does not enumerate them". This builder writes `identity_event` only, outside the membership transaction, and exempts acceptance from the gate.

**How they diverge:**

- Unit B's Tenant Admin sees no "X joined" in story 1.7's log, and the membership INSERT is the one membership write with no audit row. That is exactly what AD-23's "Prevents" line forbids.
- Unit A violates AD-14's "never to `audit_log`".
- Each builder can cite the spine against the other.
- The best-effort exception bleeds: Unit B can argue its event, too, is "an identity event" and so after the fact.

**Evidence:**

- `ARCHITECTURE-SPINE.md`: AD-14 (new sentence) and AD-23 ("Role, membership, invitation … audited (AD-14)").
- The Open Questions line: "Where their identity events land is decided: `identity_event`".

**Tightening (AD-14):**
> An identity event is a change to a *user's credentials or identity links* (password set or reset, provider link or unlink, email verified, user created or deleted) and carries no Tenant. A change that creates, alters or removes a `tenant_membership` row is a tenant-scoped audited use case: it writes `audit_log` in its `withTenant` transaction and is enumerated by the gate, even when it runs before a session exists (invitation acceptance). The acceptance's user-side effects (user created, email verified) additionally write `identity_event`. The best-effort exception names `onPasswordReset` only. Each later hook-driven event (link, unlink) must be named here with its own exception before it lands.

---

## F2 (HIGH): the reset is presented as a lockout, but a Google link survives it and is never recorded

**Unit A (slice 4, as merged):** a completed reset replaces the password and ends every session (`password.mjs:170–171`, `deleteUserSessions`). AD-23's "Prevents" line now lists "a reset request that … leaves an attacker's session alive" as closed.

**Unit B (slice 3's Google link, as merged):** Better Auth writes a `google` row in `account` from the callback (`link-account.mjs:99`). The only preconditions are a verified Google email equal to the local email and `email_verified` on the local user (`link-account.mjs:78–79`). The spine defers unlinking and link auditing to account lifecycle.

**Construction (the takeover that reset does not end):**

1. An attacker has transient control of the victim's inbox (the very threat a reset answers).
2. The attacker creates a Google account for the victim's non-Gmail address. Google verifies it through that inbox, so `email_verified` is true **[speculation: Google's non-Gmail sign-up flow, not verified here]**.
3. The seeded victim is already `email_verified` (`seed.ts:462`). The attacker signs in with Google, and the link is written.
4. The victim notices and resets. Sessions end, but the `account` row stays (`resetPassword` touches only the credential account). The attacker signs in with Google again at once.
5. There is no unlink path. `identity_event` records the reset but not the link, so an operator reading it sees only "user X reset at T" (Open Questions admits `payload` is null).

The amendment also *widens* the surface: before slice 4 only seeded users were linkable. Now any user becomes linkable after one reset (AD-23's "a completed reset is what makes an unseeded user linkable to Google").

**Evidence:**

- `packages/db/auth/src/auth.ts` (`onPasswordReset` touches `identity_event`, `auth_user` and `verification` only)
- `password.mjs:162–171`
- `link-account.mjs:74–109`
- the AD-23 "Prevents" line

**Tightening (AD-23):**
> A completed password reset is an account recovery. It ends every session **and removes every non-credential `account` row (provider links) of that user**, recording one `identity_event` per link removed, so a reset returns the account to "password only". Until link auditing lands, the Google link itself writes `identity_event` (`google.link`) from an `account.create.after` hook under the same best-effort exception, so an operator can see a link. The "Prevents" line claims only what these two sentences deliver.

(If the founder prefers to keep links through a reset, the Prevents line must instead say "a reset does not end access through a linked provider", and unlinking moves out of Deferred.)

---

## F3 (HIGH): `MAILER=console` is the default, and the spine's "never in a deployment" guard does not exist

**Unit A (AD-16 as amended):** "`mailer-console`'s stdout *is* the mail body, which is why `MAILER=console` must never reach a deployment that has real users **(AD-17)**."

**Unit B (AD-17 and the config as built):**

- AD-17 contains no such rule. It lists `MAILER=console` among the dev defaults and guards only the reverse case: "a deployment that asks for real mail cannot silently get console mail".
- `config.ts:171` is `.default('console')`.
- AD-18 ships one image, and the config has no deployment or environment key to refuse on (no `NODE_ENV`, `APP_ENV` or similar key in `packages/app/src/config.ts`).

**How they diverge:** a Fargate task definition that omits `MAILER` gets console mail with no error. Every reset token (valid for one hour) lands in CloudWatch, readable by anyone with log access. `consoleMailLine` also prints `to: <address>`, which AD-16's own NFR-O1 reasoning ("a real transport's rejection names the recipient", so log the name only) forbids.

This is the *only* transport until Epic 8. Any pre-Epic-8 pilot, demo or staging with real users is exposed. Each builder obeys the spine: the Epic 8 deploy author follows AD-17 (default), and the AD-16 reader believes AD-17 forbids it.

**Evidence:**

- `packages/app/src/config.ts:171–173`
- `apps/web/src/server/composition.ts:154–167` (`ses` throws, `console` is silent)
- `packages/adapters/src/mailer-console.ts` (`to:` line)
- AD-16 and AD-17 text

**Tightening (AD-17):**
> `MAILER` has **no default outside local dev**: the schema requires it whenever `BETTER_AUTH_URL` is not a loopback origin, and `MAILER=console` with a non-loopback `BETTER_AUTH_URL` fails at first read naming the key. `mailer-console` prints the recipient's domain only, never the full address. AD-16's parenthesis then points at a rule that exists.

(The same missing-profile shape applies to `CLOCK_MODE=fixture` and `TRACKER_ADAPTER_OVERRIDE=fixture`. Consider one "is this a deployment" predicate for all three.)

---

## F4 (HIGH): `email_verified` has writers but no meaning, and invitation is forced into one of two broken choices

**Unit A (slice 4):** the reset sets `email_verified` on the **user id** in the token (`markEmailVerified(db, user.id, at)`), but mails only users who already hold a credential account (`hasCredentialAccount`).

**Unit B (FR-2 invitation, creating the invitee's `auth_user` before acceptance):** the spine says only who sets the flag *today* (Deferred: "the seed and a completed password reset"). It does not say what the flag means or who may set it later. Whatever the builder chooses, it obeys the letter and loses:

- **`email_verified = false` and no credential yet:** a reset never mails this user (`auth.ts`, `sendResetPassword`'s early return). The user can never become verified, so the user can never link Google. That dead end holds until acceptance sets a password.
- **`email_verified = true` at invite time:** the product claims a proof it never obtained. Anyone holding a Google account for that address, including one for a mistyped invitation address, **signs in through Google without ever accepting the invitation**. `link-account.mjs:59–79` links by email to the pre-created user. Membership still decides the Tenant, but the attacker now owns the identity the real invitee will later be attached to.

**Unit C (account lifecycle, email change, a Deferred item):**

1. A reset token is mailed to the old address. It is keyed by `user_id` (`verification.value`), not by address.
2. The user changes email.
3. Whoever holds the old inbox redeems the token.
4. `markEmailVerified` stamps the **new** address as verified without any proof, which makes it Google-linkable.

**Evidence:**

- `auth.ts` (`hasCredentialAccount`, `markEmailVerified`)
- `password.mjs:74–79` (identifier `reset-password:<token>`, value = user id)
- `link-account.mjs:59–79`
- `seed.ts:462`
- AD-23 and the Deferred bullet

**Tightening (AD-23, restating round-1 F2 as a rule):**
> `email_verified = true` means that the product delivered a single-use token *to the address the row holds now* and it was redeemed, or that the operator seeded the user. Its writers are closed: the seed, a completed reset, and invitation acceptance (which redeems the invitation token). Nothing sets it at invitation time. Any change to `auth_user.email` sets it false and deletes the user's `reset-password:*` rows in the same statement group. A pre-created, unaccepted invitee is not linkable. `auth_user.email` is stored lowercased (CHECK).

---

## F5 (MEDIUM-HIGH): story 1.7 is named as `identity_event`'s first reader, but the table has no tenant scope, a second action vocabulary, and best-effort rows

**Unit A (story 1.7):** Open Questions names "story 1.7's audit-log reader" as "the natural owner" of `identity_event`'s first read. Story 1.7's acceptance criteria say: a Tenant Admin filters "the log", each row shows "the action from the closed enum" (`packages/app/audit`), and the answer is `not_found` for non-admins.

**Unit B (any tenant-bearing identity event):** F1's invitation acceptance or a later lifecycle event that records a `tenantId` in `payload`. The writer accepts any payload, and nothing says it must not carry one.

**How they diverge:**

- **Cross-tenant disclosure.** `identity_event` is `global`, with no RLS and an unfiltered application-role `SELECT` (`grants.sql:31`). The only way 1.7 can scope it is a join through `tenant_membership` on `user_id`. Tenant A's admin then sees every event of a user who is also in Tenant B, including an `invitation.accepted` whose payload names B. A non-RLS table plus a per-user join leaks the existence of another customer. Nothing in AD-3 or AD-21 forbids the query.
- **Two closed enums.** `IdentityEventAction` lives in `packages/db`; AD-14's action enum lives in `packages/app/audit`. 1.7 must merge two vocabularies with no rule for their names.
- **A revoked member vanishes.** Revocation deletes the membership row (AD-23), so the join drops their resets. A takeover investigation loses exactly the user who was removed for it.
- **Completeness.** 1.7 presents "the log". `identity_event` is best-effort by design (AD-14's exception), and fixture mode stamps it with wall time while `audit_log` uses the Clock (AD-15 as amended), so a merged, time-sorted view interleaves rows weeks apart.

**Evidence:**

- `repo-identity-event.ts` (untyped `payload`)
- `grants.sql:31`
- `epics.md` story 1.7
- AD-15's "Nothing computes from either" (a 1.7 sort does)

**Tightening (AD-21 and AD-14):**
> `identity_event` rows never carry a Tenant id or Tenant-derived data in `payload`. No Tenant-scoped use case reads `identity_event`: it is an operator record, read through the maintenance or operator path. Story 1.7 shows `audit_log` only. If a Tenant Admin must ever see a member's identity events, that is a new decision that also rules on scoping and completeness. Remove "story 1.7's audit-log reader is the natural owner" from Open Questions.

---

## F6 (MEDIUM): "insert-only by trigger while class `global`" cannot be built on today's registry, and the NFR-D1 delete path has no grant

**Unit A (the deferred trigger task as written, `deferred-work.md:822–823`):** "have the trigger generator (`table-classes.ts`' append-only set …) include `identity_event` while its class stays `global`".

**Unit B (the registry and its tests):**

- A table has exactly one class (`table-classes.ts:47`). `APPEND_ONLY` is `class === 'append-only'` (`:306`).
- `rls.test.ts:481–485` fails any table that carries the trigger without being append-only.
- `registry.test.ts:100–114` pins the nine append-only names.
- `MAINTENANCE_PRIVILEGES.global` is `[]`, and `registry.test.ts:123–126` asserts that maintenance holds nothing on `global`.

**How they diverge:**

- One builder reclassifies `identity_event` as `append-only`, which contradicts AD-21 ("class `global`") and silently gives it the class's maintenance grants.
- Another adds a per-entry `appendOnlyGuard` flag and relaxes `rls.test`.
- A third follows the deferred text literally and gets a red suite.

Under every option except the first, the spine's "only the `maintenance` path may delete, for NFR-D1" is false: the trigger lets `momo_maintenance` through, but that role holds no `DELETE` on the table.

AD-5 also still says:

- "Each append-only table has a `seq bigint` (identity)"
- "**Two** sanctioned exceptions … compaction and `purgeTenant`"

Both now contradict the new sentence, since the NFR-D1 user-row deletion is a third exception.

**Evidence:**

- `packages/db/src/table-classes.ts:47–58, 270–282, 306–308`
- `registry.test.ts:100–126`
- `rls.test.ts:454–488`
- AD-5 bullets 3, 5 and 7

**Tightening (AD-21, and AD-5):**
> The registry gains one per-entry property, `appendOnlyGuard: true`, independent of class. The trigger generator, the trigger test and the maintenance grant (`SELECT, DELETE`) key off it, and every `append-only` entry implies it. `identity_event` is `global` with the guard. AD-5's `seq` rule applies to tenant-owned append-only tables. Its sanctioned exceptions become three: the third is the user-deletion step of the lifecycle decision, on the maintenance path, recorded in `operator_audit`.

---

## F7 (MEDIUM): `db/auth`'s direct writes to Better Auth tables depend on Better Auth storage details the spine does not pin

**Unit A (slice 4):** `invalidateOtherResetTokens` deletes `verification` rows `WHERE value = userId AND identifier LIKE 'reset-password:%'`. `probe-tenants.ts:448–452` does the same.

**Unit B (a hardening change the security check sheet will naturally ask for):** Better Auth stores the identifier **in plaintext** unless `verification.storeIdentifier` is set (`verification-token-storage.mjs:8–12`; `auth.ts` does not set it). A live reset token therefore sits in `verification.identifier`, readable by the application role, backups and any SQL session.

The fix is `storeIdentifier: 'hashed'` (or an override for `reset-password:`). But the hash is taken over the *whole* identifier (`reset-password:<token>`), so the prefix disappears. `invalidateOtherResetTokens` then silently matches nothing, and a second outstanding link stays valid after the first is used. The probe cleanup leaks rows too.

Both units obey the spine: AD-1 lets `db/auth` "read and write the four Better Auth tables directly", and nothing pins the storage option.

**Evidence:**

- `auth.ts` (`invalidateOtherResetTokens`)
- `password.mjs:75–79`
- `internal-adapter.mjs:787–850` (the consume path, which is atomic, as the spine says)
- `verification-token-storage.mjs`

**Tightening (AD-1):**
> A direct Drizzle statement in `packages/db/auth` on a Better Auth table may depend only on columns and formats this AD pins. Today that is `verification.value` = user id for `reset-password:` rows, and identifiers stored `plain`, pinned by an `authOptions` test. Changing `verification.storeIdentifier` is an amendment to this AD, and it changes `invalidateOtherResetTokens` and the probe cleanup in the same change. Decide plain versus hashed reset tokens at rest with the NFR-S5 security sheet.

---

## F8 (MEDIUM): Epic 8 mail. "Send from a queue" would persist the token, and one SES quota serves both reset and FR-17

**Unit A (mailer-ses, inline):** the throttle bullet says timing leaks "once `mailer-ses` sends inline" and that "the throttle, or sending from a queue, closes both".

**Unit B (queued mail through `apps/worker`, which FR-17 and FR-36 need anyway):** a pg-boss job carries the rendered message or the link. The token is then stored in `pgboss.job` for the job's retention period and may appear in worker failure logs. That breaks AD-16's "A reset token appears only in the mail body and the page's hidden field".

**Also:**

- `requestPasswordReset` is unauthenticated and unthrottled, and it mails every known credential user. With SES in the sandbox (200 a day, per AD-18), anyone who knows or guesses member emails can exhaust the daily quota. That starves FR-17's bad-credential mail, which is an R0 requirement. The spine puts the throttle and `mailer-ses` in the same epic but does not order them.
- The timing leak already exists with the console mailer. A known email INSERTs a `verification` row and runs `hasCredentialAccount`; an unknown one runs a dummy SELECT (`password.mjs:60–79`). **[speculation: I did not measure whether the difference is observable]**

**Tightening (AD-18 and Deferred):**
> `mailer-ses` does not ship before the reset throttle. Reset mail is sent inline from the request, never through a job queue (a queued job would hold a live token at rest). FR-17 and FR-36 mail may be queued because it carries no credential. Reset mail and alert mail use separate send budgets, or the throttle's per-email and per-IP limits are sized so that reset traffic cannot exhaust the account quota.

---

## F9 (MEDIUM-LOW): the 1.9 renderer has no contract, so two mail renderers can diverge

**Unit A (story 1.9 moving reset copy out):** the spine says "the composition root hands `createAuth` a renderer in `auth_user.locale`" and then stops. The expiry text reads `RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS` inside `db/auth` (`reset.ts`), so the renderer needs the hours and the link as arguments. But nothing names the renderer's signature, its home (`packages/i18n` is a JSON catalog, and the composition root "wires; it never queries"), or its fallback when `locale` is missing or unknown.

**Unit B (worker mail, FR-17 and FR-36):** AD-23 says the worker renders "from `packages/i18n`" in `auth_user.locale`. The worker cannot build Better Auth, and it cannot read `auth_user` (round-1 F8, still open), so its renderer is a different function with a different locale source.

**How they diverge:** two mail renderers, two locale lookups and two fallbacks, and the reset mail's expiry copy can drift from the option again once it leaves `reset.ts`.

**Tightening (i18n convention):**
> Mail is rendered by one module, `packages/app/mail` (pure; imports `packages/i18n`): `render(kind, locale, vars) → { subject, text }`. An unknown locale falls back to `en`. `createAuth` receives `renderResetMail(locale, { link, expiresInHours })`, built from it by the composition root, and `expiresInHours` comes from `db/auth`'s constant. The worker's mail uses the same module.

---

## Lower-priority holes

- **The token in the URL reaches infrastructure logs (LOW-MEDIUM).** AD-16 governs the app's own logs. The reset link is a GET with `?token=`, and the reset server action POSTs back to the same URL (Next posts to the current path), so the token is in the request line twice. An ALB access log records the full request URL with its query string **[speculation: AWS behaviour, not verified here]**. The token lives an hour if the page is opened but not submitted. The Referer does *not* leak: the page links only to same-origin paths, and browsers default to `strict-origin-when-cross-origin` (no `Referrer-Policy` is set in `next.config`). *Tighten AD-16/AD-18:* ALB access logs, if enabled, drop query strings, or the page moves the token into an HttpOnly cookie on first GET and redirects to a bare `/reset-password`.
- **`identity_event.user_id` has no foreign key (LOW).** `schema.ts:170` has no FK. Rows outlive a deleted user, and a later FK with `ON DELETE CASCADE` would be refused by the owed trigger under the application role. Decide with the NFR-D1 question.
- **"Nothing computes from either" (AD-15) is a promise about future readers (LOW).** F5's 1.7 sort is the first counter-example. State it as "no reader orders or compares `identity_event.at` against Clock-stamped rows".
- **The `hasCredentialAccount` read and `sendResetPassword` ordering (LOW).** The verification row is written *before* the credential check. A credential-less user still gets an unmailed live token row until the sweep. This is harmless while nobody can read it, and it matters only together with F7's plaintext identifiers.
- **Round-1 F1 (magic link creates users) and F8 (worker identity reads) remain open** and are untouched by this amendment.

---

## Constructions tried that yielded nothing

- **The reset verifying the email creates a takeover by itself.** No: the attacker must already control the inbox, which is the capability the flag is meant to prove. The risks are F2 (persistence) and F4 (address change or pre-created invitee), not the flag itself.
- **Better Auth sets `email_verified` on link (`link-account.mjs:128`).** Unreachable: `requireLocalEmailVerified` already requires it true. `updateUserInfoOnLink` is off by default (`:314`), so a link writes no user fields.
- **Double-spend of a reset token.** `consumeVerificationValue`'s database path takes a lock and runs a transaction with `consumeOne` (`internal-adapter.mjs:815–846`). "Spent atomically" holds.
- **A short password burning the token.** The length checks run before consume (`password.mjs:154–158`), which `tests/password-reset.test.ts:375` pins.
- **Reaching the reset over HTTP.** `/request-password-reset` and `/reset-password` are in `DISABLED_PATHS`, and `/reset-password/:token` answers 404 (`tests/identity.test.ts:441–442`).
- **`onPasswordReset` throwing and skipping revocation.** Everything is inside one try/catch, and `tests/password-reset.test.ts:424` pins revocation when the event write fails.
- **The two auth instances disagreeing about the mailer, `now` or the writer.** `baseAuthOptions()` builds them once for both (`composition.ts:174–185`). A `MAILER=ses` misconfiguration takes down the middleware too (the comment at `:148–151`), which is loud rather than divergent.
- **Seed and probe tooling after the trigger lands.** Both open the maintenance setting before `TRUNCATE` and `DELETE` (`seed.ts:537–544`, `probe-tenants.ts:397–402`), so they keep working once F6 is resolved, provided the owner holds `momo_maintenance`, as it already must for the nine tables.
- **Story 1.5 (roles).** It touches only `tenant_membership` and `RequestContext`. No identity-event or `email_verified` interaction was found, other than F1's audit-sink question if role changes are ever made at acceptance time.

---

## Summary

| # | Sev | Units that collide | Incompatibility | Spine change |
|---|---|---|---|---|
| F1 | HIGH | invitation → `audit_log` vs. invitation → `identity_event` | AD-23 and the amended AD-14 mandate opposite sinks, and the gate exemption follows | AD-14: define identity events by subject; membership changes stay audited use cases |
| F2 | HIGH | slice 4 reset vs. slice 3 Google link | A reset ends sessions but not the link, and the link is unrecorded | AD-23: a reset removes provider links (or the Prevents line is corrected); link writes `identity_event` |
| F3 | HIGH | AD-16's guard vs. AD-17 and config default | `MAILER=console` is the silent default, and the guard does not exist | AD-17: no console outside loopback; recipient redacted |
| F4 | HIGH | reset vs. invitation vs. email change | `email_verified` has no meaning: invitee dead end or acceptance bypass; stale-token verification | AD-23: meaning plus closed writers; email change clears it |
| F5 | MED-HIGH | 1.7 reader vs. tenant-bearing identity events | Cross-tenant disclosure through a non-RLS table; two enums; revoked members vanish | AD-21/AD-14: no Tenant data in `identity_event`; 1.7 does not read it |
| F6 | MED | deferred trigger task vs. registry and tests | One-class model, trigger test and maintenance grant block "global + trigger"; AD-5 contradictions | AD-21: `appendOnlyGuard` flag; AD-5: `seq` scope and third exception |
| F7 | MED | direct `verification` writes vs. hashed identifiers | Invalidation silently no-ops; tokens plaintext at rest | AD-1: pin `storeIdentifier`, decide at-rest hashing |
| F8 | MED | inline vs. queued `mailer-ses`; reset vs. FR-17 | Queued token at rest; quota starvation; throttle ordering | AD-18: reset inline, throttle first, separate budget |
| F9 | MED-LOW | 1.9 reset renderer vs. worker renderer | No renderer contract, locale source or fallback | i18n: one `packages/app/mail` renderer |

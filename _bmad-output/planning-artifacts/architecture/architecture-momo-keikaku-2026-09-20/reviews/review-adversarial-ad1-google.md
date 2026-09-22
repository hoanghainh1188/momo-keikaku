# Adversarial review: AD-1, AD-17 and AD-23 amended for Google sign-in (2026-09-22)

**Target:** the uncommitted amendment on `docs/spine-ad1-google-auth` (`git diff main -- _bmad-output/planning-artifacts/architecture`). It covers:

- AD-1's Better Auth carve-out: `createAuth(… google?)`, the `googleSignIn` and `googleRegistered` bindings, and two lazy auth instances in the composition root.
- AD-17's `AUTH_GOOGLE` configuration and the fake OIDC provider.
- AD-23's "Google sign-in links, never creates".

The review also covers the matching `table-classes.ts` wording change.

**Method:** a construction attack. For each rule, I built two units one level down that obey every AD word for word and still build incompatibly. The candidate units are:

- story 1.4 slice 4 (password reset through `MailerPort`)
- FR-2 invitation
- R1 magic link and Microsoft sign-in
- an `apps/worker` that needs identity data
- account lifecycle and deletion (including `purgeTenant`)
- story 1.5's role model

I read the code in `packages/db/auth/src/*`, `apps/web/src/server/composition.ts`, `apps/web/src/middleware.ts` and `packages/app/src/config.ts`. I also read the installed Better Auth 1.7.5 sources (`plugins/magic-link`, `api/routes/password.mjs`, `db/revoke-unproven-account-access.mjs`, `oauth2/link-account.mjs`) to check which behaviours are library defaults and which are my speculation.

**Verdict:** The amendment is sound for Google alone. But it writes instance-wide identity rules (who may create a user, what "verified email" means, what lives in `verification`, how the two instances relate) as Google-specific clauses. As a result, the next three identity units (reset, invitation, R1 magic link and Microsoft) can each obey the spine and still create users, strip links, or open an account-takeover path. Six holes need a new or tightened AD before slice 4 starts. Four more are lower priority.

---

## F1: "Links, never creates" binds Google only. The next sign-in method is free to create users and to trust an unverified email. (CRITICAL)

**Unit A:** story 1.4 slice 3 (Google, as merged). It obeys AD-23: `disableSignUp`, `email_verified === true`, `requireLocalEmailVerified`, `trustedProviders: []`.

**Unit B1:** the R1 magic link. It adds Better Auth's `magicLink({ sendMagicLink })` plugin. Every AD rule names *Google*, so this unit obeys the spine. However, in Better Auth 1.7.5 `magicLink`'s `disableSignUp` **defaults to false**. On verify, an unknown email becomes a new `auth_user` with `emailVerified: true` (`plugins/magic-link/index.mjs`, around line 160). The product's premise, stated only for Google and for `emailAndPassword`, was that users are seeded or created by an audited use case. With this plugin, anyone who receives mail at any address can create a user.

**Unit B2:** R1 Microsoft sign-in, a second `genericOAuth` entry modelled on `google.ts`. Microsoft Entra id tokens carry no `email_verified` claim. The `email` claim of a multi-tenant app is set by the tenant admin, which is the "nOAuth" class of takeover. A builder who copies `verifiedGoogleIdentity` sees every sign-in refused. The builder then relaxes the check to "email present", and nothing in the spine says that is wrong, because the verified-email clause is Google's. Account linking then attaches a stranger's Entra identity to an existing user by email.

**Unit B3 (any second OAuth provider):** `onAPIError.errorURL` is an instance-wide option, and its value is `/sign-in?google=refused`. Every Microsoft refusal would land on a Google-named URL. So either Microsoft's refusal page is wrong, or Unit B3 changes the shared value and breaks Unit A's pinned test.

**Tightening (AD-23, restated instance-wide):**
> **No sign-in method creates a user.** Every method registered on any auth instance (password, each OIDC provider, magic link, and any later method) is registered with sign-up disabled. An unknown email is refused on one provider-neutral URL, `/sign-in?refused=1`. **An external identity links to an existing user only on a proof of email ownership named for that provider in this AD.** For Google, the proof is `email_verified === true` on a verified id token. A provider without such a proof (Microsoft: `xms_edov`, or a single-tenant issuer restriction) is not registered until the proof is written here. `trustedProviders` stays empty. A test enumerates the registered methods of the instance, and each one must refuse an unknown email and create no row.

---

## F2: `auth_user` creation and `email_verified` have no owner, but Google's security rests on `email_verified`. (HIGH)

**Unit A:** the Google linker. It reads `auth_user.email_verified` (`requireLocalEmailVerified: true`) as a precondition for linking.

**Unit B (FR-2 invitation):** AD-23 says invitation changes go "through `app` use cases … never through the Better Auth adapter". AD-23 also says the four Better Auth tables are "reached only through `packages/db/auth`". A new invitee needs an `auth_user` row, but no port creates one. `IdentityPort` has three members, and the spine forbids the Better Auth adapter path. The builder therefore has two options, both defensible under the letter of the spine:

- (i) add `createUser` to `packages/db/auth`, called from the use case;
- (ii) have the invitation's acceptance call Better Auth's own create path.

Neither option says what `email_verified` becomes:

- Set to **false**: the invitee can never link Google, because `/verify-email` is disabled and no path sets it true.
- Set to **true** at invite time: the product claims a proof it never obtained.

**Unit C (slice 4, password reset):** Better Auth's `resetPassword` proves control of the inbox, but it **does not set `emailVerified`** (`api/routes/password.mjs`, lines 150–172). It also *creates* a `credential` account when none exists. So a Google-only user gains a password through reset, and a user created unverified who resets still cannot link Google.

**Unit D (R1 magic link):** on verifying an *unverified* user, Better Auth runs `revokeUnprovenAccountAccess`. It **deletes every `account` row** (password and Google link) and every session of that user, then flips `emailVerified`. This is an unaudited bulk write on `account` and `session` by the library. It contradicts AD-23's premise that no identity mutation happens behind the audited use cases' back.

**Also:** Better Auth lowercases the email before every lookup (`sign-in.mjs:315`, `link-account.mjs:59`). No rule says `auth_user.email` is stored lowercased. An invitation that stores the email as the PM typed it (`Hoang@…`) is unreachable by both password and Google sign-in.

**Tightening (AD-23):**
> `auth_user` rows are created only by (a) the owner-role seed and (b) the invitation-acceptance path, through one named `packages/db/auth` function called by the audited invitation use case. No Better Auth create path is enabled (F1). **`email_verified` means that the product delivered a single-use token it issued to that address and the token was redeemed, or that the operator seeded the user.** Its only writers are the seed, invitation acceptance, and password reset (through an `onPasswordReset` hook that sets it). `auth_user.email` is stored lowercased and trimmed, enforced by a `CHECK (email = lower(email))`. A library path that deletes `account` or `session` rows in bulk (`revokeUnprovenAccountAccess`) is either kept unreachable (every user is verified at creation) or named here as an allowed writer.

---

## F3: No legal home for Tenant-less identity work, meaning reset mail, link audit, and invitation acceptance. (HIGH)

**Unit A (slice 4):** Better Auth sends reset mail through a `sendResetPassword(user, url)` callback on the instance. AD-23 requires mail in `auth_user.locale` rendered from `packages/i18n`. AD-18 requires it to go through `MailerPort`. Each candidate owner is blocked:

- `packages/db/auth` cannot import `packages/app`, `packages/adapters` or (per the diagram) `packages/i18n`, so it cannot render or send.
- The composition root "wires; it never queries". Rendering and sending there puts logic in the wiring file.
- A `packages/app` use case would be the natural owner, but every use case takes a `RequestContext`, which requires a resolved Tenant. A reset is by definition pre-session and pre-Tenant.

**Unit B (account lifecycle and audit of links):** AD-23 defers "auditing and unlinking" the Google link to account lifecycle. AD-14's `audit_log` is written inside `withTenant`. A link, a reset, an email change, and a magic-link cleanup all happen before any Tenant exists, and a user may belong to several Tenants. One builder audits into "the active Tenant's log", which is undefined at callback time. Another builder audits into `operator_audit`, which belongs to the maintenance role (AD-5). Both are consistent with the spine, and they produce incompatible audit trails.

**Tightening (AD-1 and AD-14):**
> Name a **pre-tenant identity use-case family** in `packages/app/identity`. It takes no `RequestContext`, never touches tenant data, and is injected into `createAuth` as plain callbacks built by the composition root (`sendResetPassword`, `onPasswordReset`, the account `create.after` hook). Its mail goes through `MailerPort` in `auth_user.locale`. Identity events (link, unlink, password set or reset, email verified, lifecycle cleanup) are appended to one **global, insert-only `identity_event` table**, added to AD-5's list and AD-21's registry. This table is their audit, not `audit_log` and not `operator_audit`.

---

## F4: The two instances have no "same except discovery" invariant, and the plugin set is open. (HIGH)

**Unit A:** the composition root as amended: `webAuth()` = base options plus `google`, and `sessionAuth()` = base options. Today the only difference is the `genericOAuth` plugin.

**Unit B:** any later unit that adds an option through the same pattern the amendment set, `createAuth({ ...base, google, <new> })` in `webAuth()` only. Three variants all obey AD-1, which says only that the middleware's instance is "without Google":

- Slice 4 adds `sendResetPassword` and `revokeSessionsOnPasswordReset` next to `google`.
- Account lifecycle adds Better Auth's `admin` plugin to ban users. Its session-create hook and `banned` field exist on `webAuth` but not on the middleware's `sessionAuth`, which keeps sliding a banned user's session.
- Story 1.5 adopts the `organization` plugin. It adds `member`, `invitation` and `organization` tables and `session.activeOrganizationId`, which gives a **second owner of membership and invitation** beside AD-23's one bridge.

**Tightening (AD-1):**
> The composition root builds its instances from **one options value**. The only permitted difference is that the middleware's instance omits the providers that fetch discovery. Every plugin, hook, field, session option and callback is present in both, and a test compares `authOptions(x)` with `authOptions({ ...x, google: null })`. **The Better Auth plugin set is closed:** `nextCookies` (last), `genericOAuth`, and R1's `magicLink` when it lands. A plugin that adds a table, a `user` or `session` field, or a membership, role or invitation concept (for example `organization`, `admin`, `multiSession` or `twoFactor`) needs an amendment to this AD first. A test pins both instances' plugin ids.

---

## F5: `verification` is shared by four features with no namespace, time or ownership rule. (MEDIUM-HIGH)

**Unit A:** Google (slice 3). The OAuth state is written with `storeStateStrategy: 'database'`, and its identifier is the random state value.

**Unit B:** slice 4 reset. Its identifier is `reset-password:<token>`, and its `expires_at` comes from Better Auth's `Date`.

**Unit C:** FR-2 invitation. `table-classes.ts` now describes `verification` as "Better Auth's one-time values … issued before any Tenant is known", which exactly describes an invitation token. So an invitation builder stores its token there, stamping `expires_at` from the **`Clock`**, as AD-15 requires for every product wall time. With `CLOCK_MODE=fixture` the Clock is weeks behind wall time. Any Better Auth or wall-clock comparison then treats every invitation as expired at birth. In the reverse case, an invitation stamped by `Date` breaks AD-15's fence. AD-15's named exception covers "session expiry", but not `verification.expires_at` (the ten-minute OAuth-state expiry is noted only in a code comment).

**Unit D:** R1 magic link. It also uses `verification` as a **lock table** (`revoke-unproven-account-access:<userId>`).

Nothing owns cleanup of expired rows. A worker job would need a Better Auth table, which AD-1 places out of the worker's reach.

**Tightening (AD-15, AD-21 and AD-23):**
> `verification` is Better Auth's alone. No product code writes or reads it, and its every timestamp is inside AD-15's Better Auth exception, which is widened from "session expiry" to "every timestamp on the four Better Auth tables". **Invitation tokens live in a tenant-owned `invitation` table** stamped by the `Clock`, written by the invitation use case under `withTenant`. Expired-row cleanup is one `packages/db/auth` function run by a named job, which reaches the worker only through the worker's future composition root.

Also correct `table-classes.ts`'s `why` text so it no longer invites Unit C.

---

## F6: "Google offered" and "Google callback served" are decided on different instances, in different bundles, and cached for each instance's life. (MEDIUM)

**Unit A:** the sign-in page and server action (page bundle). `googleEnabled()` and `googleSignIn()` use the page bundle's `webAuth()`.

**Unit B:** the route handler (a route bundle). The composition root says the route handlers are separate bundles with their own instances. `serveAllowlisted(webAuth())` serves `GET /callback/google` only if *its* instance registered Google.

Both obey AD-1 ("whether the button shows is the instance's registration"). Discovery is fetched per instance, and a fast failure "skips the provider for the life of the instance". A DNS blip at the route bundle's first use, with none at the page bundle's, produces this sequence:

1. The page bundle shows the button.
2. The user completes the flow at Google.
3. The route bundle's callback answers **404**, not the refusal URL.
4. This repeats until the process restarts.

The reverse (callback live, button hidden) is harmless but shows the same split. R1's Microsoft doubles the combinations.

**Tightening (AD-1 and AD-17):**
> The callback route of a *configured* provider is always allowlisted. If the instance handling it has not registered the provider, it answers the provider-neutral refusal URL, never 404. Registration failure is retried after a bounded delay rather than cached for the instance's life, and discovery has a timeout. This last point is also the deferred Epic 8 item.

---

## Lower-priority holes (recorded, not in the top six)

- **F7: the pattern for unauthenticated entry points is not fixed (MEDIUM).** Google starts from a server action through `auth.api` (bypassing Better Auth's HTTP rate limiter). `/sign-in/email` is served over HTTP *and* called from a server action. Slice 4 can follow either precedent for `/request-password-reset` and `/reset-password`, and the choice decides whether the limiter applies (see the deferred rate-limit item). **Tighten AD-1:** every unauthenticated entry point is either an allowlisted HTTP endpoint, rate-limited by Better Auth, or a server action with the product's own per-email and per-IP throttle. The allowlist is listed in the spine, not only in `bindings.ts`.
- **F8: `apps/worker` identity reads (MEDIUM).** FR-17 and FR-36 mail needs `{ email, locale }`, which lives in `auth_user`. The only sanctioned reader is `packages/db/auth`, and its port members hang off an instance. A worker composition root copying `webAuth()` builds a Google-carrying instance and fetches discovery in the worker. **Tighten AD-1:** `packages/db/auth` exports instance-free reads (the deferred `{ userId, email, locale }` lookup) for the worker, and the worker never builds a Better Auth instance.
- **F9: the user-deletion path has no legal writer (MEDIUM, made worse by this amendment).** AD-23 requires the Tenant purge to "decide what becomes of users left with none". The four tables' allowed callers are `packages/db/auth`, the seed and the probe Tenants, not the maintenance role. The amendment adds a third kind of row (a Google `account` link) that such a purge must also remove. **Tighten AD-23:** name the purge's identity step as a `packages/db/auth` function run on the maintenance path, recorded in `identity_event` or `operator_audit`.
- **F10: sessions survive a password reset (LOW-MEDIUM).** `revokeSessionsOnPasswordReset` defaults to false. AD-23's "no use case touches a session" can be read as forbidding it, which would leave an attacker's session alive after the owner resets. **Tighten AD-23:** a password reset ends all of the user's sessions. This is Better Auth's option, and it is not a use-case write.

---

## Summary

| # | Units that collide | Incompatibility | AD change |
|---|---|---|---|
| F1 | Google (slice 3) vs. R1 magic link, Microsoft | Magic link creates users by default; Microsoft's email is unverified; one Google-named error URL | AD-23: no method creates users; per-provider named email proof; neutral refusal URL; enumerating test |
| F2 | Google linker vs. invitation, reset, magic link | No owner of `auth_user` creation or `email_verified`; reset doesn't verify; magic link deletes links; email case | AD-23: named creators, meaning and writers of `email_verified`, lowercase CHECK |
| F3 | Slice 4 reset vs. account-lifecycle audit | No Tenant-less use case; no audit sink for identity events | AD-1/AD-14: pre-tenant identity use cases; global insert-only `identity_event` |
| F4 | Two instances vs. any added plugin (admin, organization) | Options drift between instances; second membership/invitation owner | AD-1: one options value; closed plugin list; test |
| F5 | OAuth state, reset, invitation, magic-link lock | Shared `verification`; Clock vs. `Date` expiry; fixture-mode dead invitations; no cleanup owner | AD-15/21/23: `verification` is Better Auth's alone; tenant `invitation` table |
| F6 | Page bundle vs. route bundle | Button shown, callback 404, cached per instance | AD-1/AD-17: configured callback always served; retry and timeout |

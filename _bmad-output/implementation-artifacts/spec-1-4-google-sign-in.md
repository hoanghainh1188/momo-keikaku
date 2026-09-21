---
title: 'Story 1.4 slice 3 — Google sign-in, against a fake OIDC provider locally and in CI'
type: 'feature'
created: '2026-09-21'
status: 'done'
baseline_commit: '980483ee386febc97bf04ffcc5821d9a083c6a37'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-identity-and-request-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** FR-3 makes R0 sign-in "email + password or Google", but only email + password
exists: `/sign-in/social` is disabled, the route allowlist 404s `/callback/google`, and there is no
Google button.

**Approach:** Add Google as one OIDC provider in `packages/db/auth`, driven by an issuer URL from
config: Google's issuer in production, a fake OIDC provider in local dev and CI (founder decision
2026-09-21, option (a)). The sign-in page gets a "Sign in with Google" button when the provider is
registered; a successful callback creates a Better Auth session and the existing
`resolveRequestContext` decides access exactly as it does for a password session.

Decided by the founder on 2026-09-21:
- **Who may sign in with Google: link by verified email to an existing user only.** A Google
  identity whose verified email equals an existing `auth_user.email` gets an `account` row
  (`providerId: 'google'`) on first sign-in and signs in; an unknown email is refused and no user
  is created (sign-up stays disabled). The seeded `linh`/`hoang` sign in through the fake.
- **The fake is a small in-repo one**: `tests/support/fake-oidc.ts` (Node `http` + `jose`) serving
  discovery, JWKS, authorize and token; tests start it in-process on a random port and script the
  identity it returns (email, verified flag, error, signing key); `pnpm fake-oidc` runs it on a
  fixed port for local dev with a one-field "sign in as" page. No CI service change.
- The spec was kept above the token target on purpose.

## Boundaries & Constraints

**Always:**
- Google is off unless configured (AD-17): `AUTH_GOOGLE` defaults to `off`; `on` requires client
  id, client secret and issuer URL, each named on a missing-key failure at first read. The issuer
  must be `https:` unless its host is loopback. `createAuth` takes the provider as an argument and
  reads no environment (AD-1).
- One code path for Google and the fake: Better Auth's `genericOAuth` plugin with `providerId:
  'google'`, `disableSignUp: true` on the provider, discovery from the issuer's
  `.well-known/openid-configuration` (no doubled slash), PKCE, scopes `openid email profile`,
  `requireIdTokenVerification: true`, `disableProviderLogout: true`. `nextCookies()` stays last.
- Every Google sign-in, first or later, requires a verified id token (signature, `iss`, `aud`,
  `exp`, nonce) whose `email_verified` is exactly `true`; a token response without an `id_token`
  is refused. `google` is NOT a trusted provider; the local user's `emailVerified` must be true.
- Provider tokens are not kept: `account.accessToken`, `refreshToken` and `idToken` are stored as
  null for `google` rows, on link and on every later sign-in.
- The HTTP allowlist grows by exactly `GET /callback/google`, and only when the provider is
  configured. The button posts a server action that calls `auth.api.signInSocial` server-side and
  redirects to the returned URL; `/sign-in/social` stays in `disabledPaths` and 404 over HTTP.
- After the callback the browser lands on `/`. Every refusal — including a forged, missing or
  expired `state` — lands on `/sign-in?google=refused` with one generic message; the page never
  renders Better Auth's `error`/`error_description` parameters.
- If discovery fails fast (refused, error status, no `jwks_uri`), the provider is not registered:
  the button is hidden, `GET /callback/google` answers 404, password sign-in keeps working, and
  Better Auth logs the failure. The middleware's session refresh uses an instance built without
  Google, so page requests never wait on discovery. (A discovery request that hangs is Epic 8's.)
- Session behaviour is unchanged: idle timeout, no cookie cache, revocation on the next request.
- The fake is test infrastructure only: never imported by `packages/*` or `apps/*` source.

**Never:**
- No password reset, mail, invitation, tenant switcher, Microsoft, magic link, or `hd` domain rule.
- No calls to Google APIs beyond discovery, JWKS and the token exchange.
- No change to `tenant_membership`, its writer, or the resolver.
- No real Google client id in the repository or in CI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Linked member | Verified `hoang`'s email (any letter case) | `google` account row (tokens null), session, lands on `/`, context `ok` | N/A |
| Returning member | Same `sub` again | Signs in; no second account row | N/A |
| Unknown email | Verified email with no `auth_user` | No user, no session | `?google=refused` |
| Unverified email | `email_verified: false` (or `"false"`), first or later sign-in | No session | `?google=refused` |
| Local email unverified | Matching user has `emailVerified = false` | No link, no session | `?google=refused` |
| `sub` already linked to A | Same `sub`, B's email | Signs in as A (the `sub` decides) | N/A |
| No id token / bad key / wrong `aud` / no nonce | Token response from the fake | No session, no userinfo call | `?google=refused` |
| State tampered | Forged or missing `state`; state cookie dropped; state row expired | No session | `?google=refused` |
| Token request rejected | Fake refuses the code exchange (bad verifier or code) | No session | `?google=refused` |
| IdP error | `error=access_denied` with a valid state | No session | `?google=refused` |
| No membership | Linked user without membership | Session created | `/no-access` (existing) |
| Revoked after Google sign-in | Membership deleted | Next request `signed_out`, session row gone | N/A |
| Discovery down at init | Fake not listening | No button; password sign-in works; `GET /callback/google` 404 | Logged by Better Auth |
| Google off | `AUTH_GOOGLE=off` | No button; `GET /callback/google` answers 404 | N/A |

</frozen-after-approval>

## Code Map

- `packages/db/auth/src/auth.ts:47-123` -- `DISABLED_PATHS` unchanged (`disabledPaths` gates
  the HTTP router only, `api/index.mjs:166-168`; `auth.api.signInSocial` works regardless); add
  optional `google: { clientId, clientSecret, issuer }` to `CreateAuthOptions`; `genericOAuth`
  (import `better-auth/plugins/generic-oauth`) before `nextCookies()`; `onAPIError.errorURL`
  `'/sign-in?google=refused'` — the only error redirect (no per-flow `errorCallbackURL`); a bad
  state would otherwise go to `/api/auth/error` (`oauth2/state.mjs:48-60`); it is read only on
  OAuth paths. `databaseHooks.account.create.before` nulling tokens for `google` rows, with
  `account.updateAccountOnSignIn: false` (a return sign-in then writes no tokens,
  `link-account.mjs:148-165`); pin `accountLinking.requireLocalEmailVerified: true` and no
  trusted providers. The provider's own `getUserInfo(tokens)` is the only refusal point: the
  plugin verifies the id token (signature, `iss`, `aud`, `exp`, nonce) BEFORE calling it when
  `tokens.idToken` is present; it returns `null` (→ refusal) when `idToken` is absent or the
  decoded `email_verified !== true`, else `{ id: sub, sub, email, emailVerified: true, name }`.
  This also keeps the userinfo endpoint uncalled. No `mapProfileToUser` (it cannot refuse; a
  throw is a 500, `callback.mjs:122-134`). Issuer: trailing slashes stripped before appending
  `/.well-known/openid-configuration`. Rewrite the module note.
- `packages/db/auth/src/auth.test.ts` -- pin the options without a DB.
- `packages/db/auth/src/bindings.ts:15-45,74-96` -- the allowlist becomes provider-aware (e.g.
  `servedEndpoints(auth)` / `serveAllowlisted(auth)` reading whether Google is registered from
  `(await auth.$context).socialProviders`); `googleSignIn(auth, headers)` returning `{ url,
  setCookies }` (`returnHeaders: true`) or `null`. In the server action `nextCookies()` already
  sets the signed `momo.state` cookie, so the action ignores `setCookies`; only tests forward
  them. `googleRegistered(auth)`.
- `packages/app/src/config.ts:44-158` -- `AUTH_GOOGLE` (`off`|`on`, default `off`), optional
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ISSUER_URL`; a `googleProvider()` accessor
  that returns `null` when off and otherwise requires and names each key (https/loopback rule);
  `parseConfig` gets the same rule via `superRefine`. Per-key getters stay; header updated.
- `apps/web/src/server/composition.ts:134-230` -- pass `googleProvider()` into `createAuth`; bind
  `googleSignIn()` and `googleEnabled()` (from registration, not config). `refreshSession`
  (`:206-208`, used by `middleware.ts`) gets its own lazily built instance with no `google`, so
  the middleware never fetches discovery.
- `apps/web/src/app/sign-in/*` -- button only when `googleEnabled()`; `signInWithGoogle` action
  (`redirect(url)`, or back to `?google=refused`); read `searchParams.google` (may be `string[]`);
  `actions.test.ts`, `tests/web-composition.test.ts`.
- `tests/support/fake-oidc.ts` (new) -- `startFakeOidc({ port, clock, ... })`: discovery (with
  `id_token_signing_alg_values_supported`, `jwks_uri`, `issuer`; failure modes to omit them),
  JWKS, authorize (checks `client_id`, `redirect_uri`, S256 challenge; echoes `state`, `nonce`),
  token (checks secret, verifier, one-time code). Scriptable per test: email, `email_verified`,
  `sub`, IdP error, omit id token, wrong key, wrong `aud`, drop nonce, reject the token request,
  discovery without `jwks_uri`. Inside the eslint fence (`eslint.config.js:52,245-247`): no
  `process.env`, no `Date.now()`/`new Date()` (times from the `clock` argument), no
  `JSON.stringify` (serialise through the `@momo/domain` codec). Tests pass `systemClock` —
  Better Auth checks `exp` and state expiry against real time; an expired token uses an offset.
- `scripts/fake-oidc.ts` (new) -- CLI: fixed port, system clock, "sign in as" page; root script
  `fake-oidc` = `tsx scripts/fake-oidc.ts`. Root devDependency `jose` (only transitive today).
- `tests/google-sign-in.test.ts` (new, Postgres) -- the matrix: fake in-process, `createAuth` on
  the restricted role, `googleSignIn` → follow the fake's redirect → callback through
  `serveAllowlisted` with the forwarded state cookie; assert `verification` row created then gone,
  `account` rows (tokens null), sessions, `resolveRequestContext`, sign-out; the fake's discovery
  `issuer` equals the configured one. Expired state: rewrite the `verification` row's expiry as
  the owner role. Uses its own users (a
  probe Tenant), not the seeded ones, and cleans up (`identity.test.ts:360` asserts `[credential]`).
- `tests/identity.test.ts:369-382` -- `GET /callback/google` 404 when off, served when on; add
  `POST /sign-in/social` → 404.
- `.dependency-cruiser.cjs` -- forbid `^(apps|packages)/` importing `^tests/support/`.
- `README-DEMO.md:27-33,187` -- local run with the fake.

## Tasks & Acceptance

**Execution:**
- [x] `packages/app/src/config.ts` + test -- keys and `googleProvider()` -- AD-17
- [x] `packages/db/auth/src/{auth,bindings,index}.ts`, `auth.test.ts` -- provider, hooks, error URL, provider-aware allowlist, `googleSignIn`
- [x] `tests/support/fake-oidc.ts`, `scripts/fake-oidc.ts`, root `package.json` -- the fake and its CLI
- [x] `apps/web/src/server/composition.ts`, `app/sign-in/*`, tests -- button, action, refusal message
- [x] `tests/google-sign-in.test.ts`, `tests/identity.test.ts` -- the matrix; allowlist assertions
- [x] `.dependency-cruiser.cjs`, `README-DEMO.md` -- fence; local instructions
- [x] `deferred-work.md`, `HANDOFF.md` -- mark slice 3; defer: spine AD-1 amendment (new `createAuth`
  argument, Google bindings, `verification` "why" in `table-classes.ts:134`) with its own review;
  Epic 8 checks against real Google (issuer spelling `accounts.google.com` vs `https://…`,
  discovery retry after a failure, a timeout for a hung discovery request); `verification` row growth with the sign-in rate limit

**Acceptance Criteria:**
- Given `AUTH_GOOGLE=on` without a client secret, when auth is first built, then it fails naming `GOOGLE_CLIENT_SECRET`.
- Given each sabotage, when CI runs, then a test fails: `disableSignUp` removed from the provider
  (unknown email); the `getUserInfo` override removed (unverified email on a return sign-in, and
  no id token); `requireIdTokenVerification` off with a discovery document lacking `jwks_uri`;
  the token-nulling hook removed; `onAPIError` removed (forged state); `/sign-in/social` both
  removed from `DISABLED_PATHS` and added to the allowlist; `refreshSession` given the Google
  instance (a middleware-path test with discovery down asserts no fetch to the fake).

## Design Notes

- **Why `genericOAuth`:** the built-in Google provider hardcodes the token endpoint and JWKS URL
  (`@better-auth/core/dist/social-providers/google.mjs:95,106,145`), so it cannot talk to a fake.
  `genericOAuth` with `providerId: 'google'` uses the core `/sign-in/social` and `/callback/:id`
  routes. It fetches discovery when the instance is created (no timeout); a fast failure skips
  the provider for the life of that instance.
- **Sign-up** on the OAuth callback reads only the provider's `disableSignUp`
  (`api/routes/callback.mjs:229`); `emailAndPassword.disableSignUp` does not cover it.
- **`sub` wins over email** for an already-linked account (looked up by account key first).

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm --filter @momo/web typecheck && pnpm depcruise` -- expected: clean
- `REQUIRE_DB=1 pnpm test` (after `pnpm db:policies && pnpm seed`) -- expected: all green
- The sabotages in the acceptance criteria, each watched to fail, then restored

**Manual checks:**
- `pnpm fake-oidc` + `pnpm dev` with `AUTH_GOOGLE=on` pointing at it: the button signs `hoang` in and lands on `/`.

## Spec Change Log

- 2026-09-22 — files the Tasks list did not name: `packages/db/auth/src/google.ts` (the provider,
  `verifiedGoogleIdentity`, `withoutProviderTokens`, `discoveryUrlOf`; keeps `auth.ts` small),
  `apps/web/src/app/sign-in/{google-sign-in.tsx,google-refusal.ts}` (the button, and the
  `searchParams.google` reader), `tests/web-google-discovery.test.ts` (the middleware-path test:
  the real `createAuth` behind the composition root, no database). `account.storeStateStrategy:
  'database'` is pinned rather than defaulted, so the `verification` row the matrix asserts is a
  decision, not an accident of the adapter.
- 2026-09-22 — expired state: Better Auth 1.7.5 reads the expiry from the `verification` row's
  VALUE (`expiresAt` in its JSON), not the `expires_at` column — a row expired by its column alone
  is still accepted (measured). The test moves both; recorded in `deferred-work.md`.
- 2026-09-22 — "discovery down" for the middleware-path test is the fake answering 500 (it still
  counts the request); the matrix's "fake not listening" row closes the fake before building.

## Verification Results (2026-09-22)

Against `postgres:18.6-alpine` on 55433, `REQUIRE_DB=1`, after `pnpm db:policies && pnpm seed`.

| Command | Result |
| --- | --- |
| `pnpm lint`, `pnpm typecheck`, `pnpm --filter @momo/web typecheck` | exit 0 |
| `pnpm depcruise` | exit 0 — 164 modules, 467 dependencies |
| `pnpm test` | **722 passed across 38 files** (678 across 36 before) |

**Sabotages — each watched to fail, then restored.**

| Sabotage | What caught it |
| --- | --- |
| `disableSignUp` removed | `auth.test.ts`; `google-sign-in.test.ts` (unknown email) |
| `getUserInfo` override removed | `auth.test.ts`; `google-sign-in.test.ts` (unverified on a return sign-in; no id token → userinfo called) |
| `requireIdTokenVerification: false` | `auth.test.ts`; `google-sign-in.test.ts` (discovery without `jwks_uri` registers the provider) |
| token-nulling hook removed | `auth.test.ts`; `google-sign-in.test.ts` (link and return rows carry tokens) |
| `onAPIError` removed | `auth.test.ts`; `google-sign-in.test.ts` (forged state and five other refusal rows land on `/api/auth/error`) |
| `/sign-in/social` out of `DISABLED_PATHS` and into the allowlist | `auth.test.ts`; `google-sign-in.test.ts`; `identity.test.ts` ×2 |
| `refreshSession` on the Google instance | `web-composition.test.ts`; `web-google-discovery.test.ts` (a discovery fetch from the middleware path) |
| `apps/`/`packages/` importing `tests/support/` | `pnpm depcruise` (`no-test-support-in-source`), from both trees |

**Manual (`next dev` on 3101 + `pnpm fake-oidc` on 4455, `AUTH_GOOGLE=on`).** `/sign-in` shows
"Sign in with Google"; the button went to the fake's "sign in as" page; `HOANG@momo-digital.example`
signed in and landed on `/` → the Review, chip "Tenant Admin"; the `google` account row had null
tokens. Signed out; an unknown email came back to `/sign-in?google=refused&error=signup_disabled`
showing only the generic message (checked at 375 px too). With `AUTH_GOOGLE` unset: no button,
`GET /api/auth/callback/google` and `POST /api/auth/sign-in/social` 404, `/get-session` 200. The
manual link row was deleted and the database re-seeded afterwards.

## Review Triage Log

Spec review round 1 (2026-09-21, adversarial, against `980483e`): 22 findings (4 high), all
accepted and patched — sign-up on the callback, forged-state error page, provider-aware allowlist,
a no-op sabotage, id-token and `email_verified` enforcement, token storage, the refusal URL key,
discovery failure, the fake's contract, test cookies and isolation, `jose`, the lint fence, config
accessor, https issuer, provider logout, deferrals, missing rows.

Spec review round 2 (2026-09-21, adversarial). All accepted and patched.

| # | Finding | Verdict | Change |
|---|---|---|---|
| 1 | `mapProfileToUser` cannot refuse; only `getUserInfo` returning `null` can | high | `getUserInfo` override only |
| 2 | Without it a missing id token calls the userinfo endpoint | medium | Same override; matrix note |
| 3 | A hung discovery blocks every auth call | medium | "Fails fast" wording; Epic 8 deferral |
| 4 | The middleware instance also fetches discovery | medium | Google-less instance for `refreshSession`; sabotage |
| 5 | Removing `/sign-in/social` from `disabledPaths` is needless and voids a sabotage | medium | Kept disabled; sabotage reworded |
| 6 | A fixed test clock makes every token expired | medium | `systemClock` in tests |
| 7 | Fence also bans `new Date()` and `JSON.stringify` | low | Codec, clock-only times |
| 8 | Wrong-verifier and expired-state rows not producible as written | low | Scripted token rejection; expiry via SQL |
| 9 | `errorCallbackURL` duplicates `onAPIError.errorURL` | low | One error URL |
| 10 | Update hook dead with `updateAccountOnSignIn: false` | low | Create hook only |
| 11 | Double `Set-Cookie` from the action | low | Action ignores `setCookies` |
| 12 | Configured vs discovered issuer never compared; doubled slash | low | Test asserts equality; slashes stripped |
| 13 | "Logged once" untrue | low | "Logged by Better Auth" |
| 14 | Discovery-down row said "refuses"; shadow warning never fires | low | 404; claim removed |

Code review round 1 (2026-09-22): Blind Hunter (B), Edge Case Hunter (E), Verification Gap (V).

| # | Finding | Verdict | Route | Evidence |
|---|---|---|---|---|
| B1, E1, E2 | A hung discovery blocks the page instance's every request, password sign-in and page renders included | medium | defer | Verified (`auth.$context` awaited by every call). The intent defers a hang to Epic 8; recorded with its whole-app blast radius and the cheap fix. |
| B2, E3 | A fast discovery failure hides Google until restart, with no alert | medium | reject | Already deferred by the intent and in `deferred-work.md` (Epic 8 retry). |
| B3 | Refusal banner says "try again" when the button is hidden; a crafted link shows it | low | reject | Only after a discovery failure or a hand-made URL; harmless text, fix needs a branch. |
| B4 | Regenerated `epic-1-context.md` is stale against this diff and dropped material | low | reject | It is compiled from the planning docs, which still read that way until the deferred AD-1 amendment; the size cut follows the compiler's budget. |
| B5 | `HANDOFF.md` first line names the wrong `main` commit | low | patch | Direct correction. |
| B6 | Google account links are unaudited, invisible, permanent | medium | defer | Not an access change (membership decides); recorded with account lifecycle. |
| B7 | `google-sign-in.test.ts` depends on test order | low | reject | Vitest runs a file's tests in declaration order, no shuffle configured — as slice 2's B7. |
| B8 | Tests leave `verification` rows behind | low | reject | Small rows in the dev/CI database, swept by Better Auth when expired; the product-side growth is already deferred. |
| B9 | README does not say the fake reads its own `BETTER_AUTH_URL`/`FAKE_OIDC_PORT` | low | patch | Doc correction. |
| B10 | `@momo/db-auth` barrel exports internals, incl. the unverified JWT decoder | low | patch | Direct deletion from the barrel. |
| B11, E6 | Issuer with a query/fragment/credentials passes config and breaks discovery silently | low | reject | Unlikely configuration; the fix adds guards. |
| B12 | Token-nulling keeps expiry and scope metadata | low | patch | Direct correction; assertion extended. |
| E4 | A misconfigured `AUTH_GOOGLE` makes `/sign-in` error | false | reject | By design: a bad key fails loudly at first read (AD-17), and every page's auth instance fails the same way. |
| E5 | A non-`APIError` from `signInSocial` escapes as an error page | low | reject | Same as password sign-in (a database error throws there too); rare. |
| E7 | Non-numeric `FAKE_OIDC_PORT` gives an unclear error | low | reject | Local dev tool; it fails loudly. |
| V1 | `/sign-in` page's Google wiring rendered by no test | medium | defer | Already recorded by the implementation (no render harness; Playwright pass). |
| V2 | `googleSignIn` refusal paths on a registered instance untested | low | defer | Recorded; no clean way to trigger with the real fake. |


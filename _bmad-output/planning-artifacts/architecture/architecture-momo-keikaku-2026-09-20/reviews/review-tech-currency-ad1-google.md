# Tech-currency review: AD-1 / AD-17 / AD-23 amendment (Google sign-in as one OIDC provider)

- Reviewed: 2026-09-22
- Scope: only the amendment in `git diff main -- _bmad-output/planning-artifacts/architecture` (ARCHITECTURE-SPINE.md, the AD-1 carve-out (1) and (2), the AD-17 Google sign-in bullet, the AD-23 linking bullet, and the matching memlog entries).
- Method: each named technology and behaviour was checked against the installed packages (`better-auth@1.7.5`, `@better-auth/core@1.7.5`, `jose@6.2.12`), the npm registry and GitHub releases, and Google's live discovery document. The shipped code (`packages/db/auth/src/{auth,google,bindings}.ts`, `tests/support/fake-oidc.ts`) was read only to see which claims it relies on.

## Verdict

The amendment is current and nearly every claim holds against the installed code and Google's live discovery. Three claims are looser than the code, and one Google behaviour was never tested against real Google. None of the four blocks the amendment. Each needs one sentence in the spine, or a follow-up.

## Currency check

| Claim | Evidence | Status |
|---|---|---|
| Better Auth 1.7.5 | `npm view better-auth dist-tags`: `latest: 1.7.5` (published 2026-09-14); nothing newer on any 1.x line (`release-1.6: 1.6.33`). v1.7.5 release notes list no change to generic OAuth, OAuth2 or linking. | Confirmed, current |
| `jose` | `jose@6.2.12` in root `package.json` = `npm view jose version` (6.2.12). `SignJWT`, `exportJWK`, `generateKeyPair` and `createRemoteJWKSet`/`jwtVerify` are all in the v6 API. | Confirmed, current |
| `genericOAuth` uses core `/sign-in/social` and `/callback/:id` (not the old `/oauth2/callback/:providerId`) | `plugins/generic-oauth/index.mjs`: providers are pushed into `context.socialProviders`. The comment says "no plugin-specific endpoints needed", and `api/routes/callback.mjs` defines `/callback/:id`. | Confirmed. The callback accepts **GET and POST**. The spine's allowlist, `GET /callback/google`, is enough because Google's default `response_mode` is `query`. |
| `auth.api.signInSocial` still reaches `/sign-in/social` while that path is in `disabledPaths` | `api/index.mjs:166-168`: `disabledPaths` is checked only in the router's `onRequest`, so the direct `auth.api.*` call skips it. | Confirmed |
| `disableSignUp` on the provider refuses an unknown email | `api/routes/callback.mjs:229` passes `provider.options?.disableSignUp`, and `oauth2/link-account.mjs:196` returns `"signup disabled"`. The generic plugin sets `options.disableSignUp`. `emailAndPassword.disableSignUp` is not read on this path. | Confirmed |
| Id token verified (signature, `iss`, `aud`, `exp`, nonce) at every sign-in | Core `oauth2/verify-id-token.mjs` runs `jwtVerify(token, jwks, {issuer, audience, algorithms})` and then checks the nonce. `requiresIdTokenNonce` is true once the config has an id token, and `callback.mjs:104` refuses a state that carries no nonce. `requireIdTokenVerification` skips the provider when discovery gives no `jwks_uri`. The project's `getUserInfo` returns `null` when there is no `id_token`, so the userinfo endpoint is never used. | Confirmed, with two caveats (F-1, F-4) |
| `email_verified === true`, the local email verified too, no trusted providers | Linking is refused unless `userInfo.emailVerified` is true (no trusted provider) and, when `requireLocalEmailVerified` is set, the local user's email is verified (`link-account.mjs`). That option exists in 1.7.5 and defaults to `true`, and the project pins it. The strict `=== true` check is the project's own `getUserInfo`. | Confirmed |
| An already-linked `sub` signs in as its own user | `findAccountOwnerByKey({providerId, accountId})` runs before any email match. `accountSubject` is `sub` when discovery has a non-empty `id_token_signing_alg_values_supported`, which Google's (`["RS256"]`) and the fake's both do. | Confirmed |
| A fast discovery failure leaves Google unregistered | `fetchDiscovery` returns `null` on an error or a bad issuer, so the provider is skipped (`authorizationUrl` is missing, or `requireIdTokenVerification` is set with no JWKS). The error is logged, not thrown. | Confirmed. `betterFetch` sets no timeout, so a hung fetch blocks `init`. The memlog already defers that to Epic 8. |
| Discovery "fetched when the Google-carrying instance is first used" | `auth/base.mjs`: `betterAuth()` calls `init(options)` **at construction**, not on the first request. The claim holds only because the composition root constructs lazily. | Confirmed, but the claim depends on the lazy construction (F-5) |
| Google issuer `https://accounts.google.com` | Live `https://accounts.google.com/.well-known/openid-configuration` (fetched 2026-09-22) returns `issuer: "https://accounts.google.com"`, `jwks_uri: https://www.googleapis.com/oauth2/v3/certs`, `id_token_signing_alg_values_supported: ["RS256"]`, `code_challenge_methods_supported` including `S256`, and `authorization_response_iss_parameter_supported: true`. | Confirmed for the discovery document. See F-1 for the id token's `iss`. |
| Provider tokens not stored | This is not a Better Auth feature: the project nulls them in `databaseHooks.account.create.before` and sets `updateAccountOnSignIn: false`. Both options exist in 1.7.5. | Confirmed (project mechanism) |

## Findings

### F-1 (medium, not confirmed against real Google): id tokens whose `iss` is `accounts.google.com` would be refused

- **Location:** AD-23's Google bullet ("an id token the provider verified (signature, `iss`, …)") and AD-17 ("issuer https://accounts.google.com").
- **Evidence:** the generic plugin pins `idToken.issuer` to the single string from discovery (`issuer: discovered.issuer`). Better Auth 1.7.5's **own built-in Google provider** (`@better-auth/core/dist/social-providers/google.mjs:28,111`) accepts `["https://accounts.google.com", "accounts.google.com"]`. Google's OpenID Connect documentation says a Google id token's `iss` is either value. For the web authorization-code flow Google issues the `https:` form in practice, so this is probably fine. It has not been tested: CI runs only the fake, which always sets `iss` equal to its discovery `issuer`.
- **Fix:** add one sentence to AD-17 or AD-23 saying the `iss` check is exact against the discovered issuer, unlike Better Auth's built-in Google provider, and that the first real-Google sign-in on a staging deployment must confirm it. Also add a fake-OIDC scenario that issues `iss: "accounts.google.com"` and expects a refusal, so the behaviour is pinned rather than accidental. If it fails on real Google, the fallback is an `idToken.verify` override through a custom provider, which is outside what `genericOAuth` exposes today.

### F-2 (medium): "one generic `/sign-in?google=refused`" is not literally true

- **Location:** AD-23 ("Every refusal lands on one generic `/sign-in?google=refused`"), and the memlog.
- **Evidence:** `callback.mjs` `redirectOnError` appends `error=<code>` (plus `error_description` for provider or `APIError` errors) to `onAPIError.errorURL`. So an unknown email lands on `/sign-in?google=refused&error=signup_disabled`, while an existing but unverified local user lands on `…&error=account_not_linked`. The page shows one message (`google-refusal.ts`), but the address bar tells the person signing in whether their email has a local account.
- **Fix:** either change the wording to "the same path; Better Auth appends an `error` code that the page never renders", or strip it. The sign-in page can redirect `?google=refused&error=…` to a bare `?google=refused`, or the refusal can be caught before the callback. Decide whether revealing that an account exists, to the owner of that Google account, is acceptable.

### F-3 (low): the discovered issuer is not compared with `GOOGLE_ISSUER_URL`

- **Location:** AD-17 ("an issuer that is `https:` unless its host is loopback").
- **Evidence:** `fetchDiscovery` checks only that `discovered.issuer` parses as a URL. It does not require it to equal the configured issuer, which OpenID Connect Discovery §4.3 requires. Tokens are then verified against whatever `issuer` the document declares, and the `https:` check applies only to the configured URL, not to the `jwks_uri` or `token_endpoint` from discovery.
- **Fix:** add a sentence saying that trust is in the host serving discovery, over TLS, and that the document's issuer, endpoints and JWKS are taken as served. Alternatively add a cheap check in `packages/db/auth` (fetch the document once and assert `issuer === configured issuer`) before registering the plugin.

### F-4 (low): `exp` is checked only when present

- **Location:** AD-23 ("signature, `iss`, `aud`, `exp`, nonce").
- **Evidence:** `jwtVerify` is called without `requiredClaims` or `maxTokenAge`, and `jose` rejects an expired `exp` but accepts a token that has no `exp`. Google always sends `exp`, so this is theoretical for Google. The fake decides for itself.
- **Fix:** write "`exp` when present (Google always sets it)", or have `verifiedGoogleIdentity` refuse a token without a numeric `exp`.

### F-5 (low): discovery timing depends on lazy construction

- **Location:** AD-1 carve-out (2) and AD-17 ("fetched when the Google-carrying auth instance is first used").
- **Evidence:** `createBetterAuth` starts `init` (and so the discovery fetch) synchronously inside `betterAuth()`. The claim is true only because `composition.ts` constructs lazily.
- **Fix:** state it explicitly: "`betterAuth()` starts discovery at construction, so the instance must be constructed lazily." That makes a future eager construction (for example at module scope in a test or worker) a visible spine violation, not a silent `next build` network call.

## Not flagged (checked, fine)

- The two-instance split (with and without Google) matches the library: plugins are per instance, and the instance without Google registers no social provider.
- `nextCookies()` stays last in the plugin list. That is unchanged from the prior spine and still how the 1.7.5 plugin works.
- `storeStateStrategy: 'database'` and the `momo.state` cookie are real 1.7.5 options. They are not named in the spine amendment, so they are out of scope.
- `pnpm fake-oidc` is a project script, not a third-party tool, so there is no currency question.

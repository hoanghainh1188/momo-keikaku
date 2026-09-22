---
title: 'Rubric review: AD-1 / AD-17 / AD-23 amendment (Google sign-in, story 1.4 slice 3)'
reviewed: 'ARCHITECTURE-SPINE.md working-tree diff against main (branch docs/spine-ad1-google-auth), plus packages/db/src/table-classes.ts'
date: 2026-09-22
lens: good-spine rubric (divergence points, enforceable rules, deferrals, ratifies the code, internal consistency)
code_checked: packages/db/auth/src/{auth,bindings,google,identity,index}.ts; apps/web/src/server/composition.ts; packages/app/src/config.ts; tests/support/fake-oidc.ts; scripts/fake-oidc.ts; package.json; .dependency-cruiser.cjs; better-auth 1.7.5 dist (generic-oauth init, oauth2/link-account); _bmad-output/implementation-artifacts/deferred-work.md
---

# Verdict

The amendment mostly describes the merged code accurately: the `createAuth` signature, the `googleProvider()` config rules, link-only sign-in, no stored tokens, the single refusal URL and the depcruise fence on `tests/support/` all match the code. It is not ready to finalize yet. One claim in AD-1 contradicts the code and the project's own deferred-work log. Two decisions from the memlog that could let units diverge never made it into the spine. The spine sections that describe the gate, the deferrals and AD-15 were not updated to cover the new code.

# Findings

## F1 (HIGH): AD-1 says pages never wait on discovery; in the code they do

**Location:** AD-1, carve-out (2), the sentence that ends "…so a page request never waits on the provider's discovery fetch". AD-17's Google bullet also says "password sign-in keeps working".

**What the code does:** `composition.ts` builds `resolverDeps()` with `identityOn(webAuth())`, and `webAuth()` is the instance that has Google. So `requestContext()`, which runs on every page render and every server action, calls `auth.api.getSession` on the Google instance. Password sign-in (`signInWithEmail`), sign-out and `handleAuthRequest` (which serves `/get-session`) all use `webAuth()` as well. Every `auth.api` call awaits `auth.$context`. In better-auth 1.7.5 the generic-oauth plugin fetches discovery inside its `init` (`plugins/generic-oauth/index.mjs:80-91`), with no timeout. Only the middleware's refresh (`sessionAuth()`) avoids that wait. `deferred-work.md` (entries at lines 648 and 664) already records, as verified, that "the page instance's first use waits on it". It also records that a hung discovery "blocks every request that instance serves… page renders… password sign-in… not only Google".

**Why it matters:** A future unit that trusts the spine could rely on pages being isolated from the identity provider. The spine would then sign off on a failure mode where the whole app goes down.

**Fix:** Change the sentence to say that only the middleware's session refresh never waits on discovery. Add that pages, server actions and the route handler use the Google instance, so they wait on its first discovery fetch, and that a discovery that hangs (no timeout today) blocks all of them, password sign-in included. In AD-17, state explicitly that "password sign-in keeps working" applies only to a *fast* discovery failure. Add a Deferred entry (see F4) that names the cheapest fix already recorded in deferred-work: move identity, password sign-in and the non-Google endpoints onto the Google-less instance, or put a timeout on discovery.

## F2 (HIGH): Two memlog decisions that prevent divergence are not in the spine

**Location:** AD-1 carve-out (1) and AD-23's "Google sign-in links, never creates" bullet. Compare with the memlog decisions dated 2026-09-22.

1. **One OIDC code path.** The memlog says Google is *one* `genericOAuth` provider (`providerId: 'google'`) discovered from its issuer, and that this "Prevents a second, provider-specific sign-in path that the fake cannot exercise". The spine only lists `issuer` among `createAuth`'s arguments. Nothing in it stops a later story from switching to Better Auth's built-in `socialProviders.google`, which hardcodes Google's endpoints. The comment in `google.ts` explains why that switch would make the whole CI matrix meaningless.
2. **The HTTP allowlist is provider-aware.** The memlog says `GET /callback/google` is served only while Google is *registered*, `/sign-in/social` is never served over HTTP (it stays in `disabledPaths`), and a sign-in starts only from the server action. This "Prevents an OAuth entry point reachable without the server action". The spine still says only "the allowlisted route handler", and it never lists what is on the allowlist, before or after this amendment. The code does it (`SERVED_AUTH_ENDPOINTS`, `GOOGLE_CALLBACK_ENDPOINT`/`servedEndpoints`, `DISABLED_PATHS` in `auth.ts`), but the spine does not require it.

**Fix:** Add to AD-1 carve-out (1) or to the AD-23 Google bullet: "Google is registered only as a `genericOAuth` provider with `providerId: 'google'`, discovered from `GOOGLE_ISSUER_URL`, never through `socialProviders`. The HTTP allowlist is exactly `GET /get-session`, `POST /sign-out`, `POST /sign-in/email`, plus `GET /callback/google` while Google is registered. `/sign-in/social` and `/link-social` are never served. A Google sign-in starts only through `googleSignIn` from a server action." Name the tests that pin this (`packages/db/auth/src/auth.test.ts`, `tests/google-sign-in.test.ts`) so the rule can be checked.

## F3 (MEDIUM): The gate description leaves out the new rule and now contradicts itself

**Location:** AD-1, "What the `dependency-cruiser` gate enforces today", "What it does not enforce yet", and the bullet "`tests/` sits outside this graph… Nothing outside `tests/` imports from it."

- `.dependency-cruiser.cjs` now has `no-test-support-in-source` (`^(apps|packages)/` → `^tests/support/`). The enforced list does not include it, even though the AD-17 bullet cites the rule.
- "What it does not enforce yet" still lists "nothing outside `tests/` importing from it" as fully unenforced. It is now partly enforced: `apps/` and `packages/` are blocked from importing `tests/support/`, but not from importing other parts of `tests/`.
- "Nothing outside `tests/` imports from it" is now false. `scripts/fake-oidc.ts:22` imports `../tests/support/fake-oidc.js`, and `package.json` runs it as `pnpm fake-oidc`. The rule's own comment calls this "the one non-test importer".

**Fix:** Add an enforced bullet: "any file under `apps/` or `packages/` importing `tests/support/` (`no-test-support-in-source`)". Narrow the unenforced item to "`apps/` or `packages/` importing `tests/` outside `tests/support/`". Reword the `tests/` bullet: "Nothing outside `tests/` imports from it except operator tooling: `scripts/fake-oidc.ts` runs the fake OIDC provider for local dev (not cruised)."

## F4 (MEDIUM): The new deferrals are not in the spine's Deferred section

**Location:** The `## Deferred` section. It has a "Rate-limiting sign-in" bullet but nothing for Google.

The memlog says "A hung discovery still blocks the Google instance — deferred to Epic 8 (deferred-work.md)". `deferred-work.md` also defers these to Epic 8: checking against real Google (`iss` spelled `accounts.google.com` vs `https://accounts.google.com`), retrying discovery after a fast failure (today one failed fetch disables Google until the process restarts), a timeout on discovery, and throttling `googleSignIn`, where every start writes a `verification` row and Better Auth's limiter never sees the call. The spine carries none of these. So a story planned from the spine alone would ship Google to production with a boot-time failure that turns Google off until restart and a start action with no throttle.

**Fix:** Extend the "Rate-limiting sign-in" bullet to cover the Google start action and the `verification` rows it creates. Add a Deferred bullet: "Google sign-in against real Google (Epic 8 deployment blocker): the issuer spelling in `iss`, a timeout and retry for discovery, and moving identity and password sign-in off the Google instance (F1)."

## F5 (MEDIUM): AD-15's Better Auth `Date` exception now covers too little

**Location:** AD-15, "Named exception: Better Auth's own `Date`". The exception lists session expiry, `created_at`/`updated_at` and the refresh decision.

Slice 3 adds two more wall-clock decisions that the product does not own: the OAuth state's ten-minute expiry (the `verification` row, which Better Auth decides from the value it stores, per deferred-work line 656), and the id-token `exp`/`iat` check made during verification. The comment in `auth.ts` already says "The OAuth state's ten-minute expiry is its too". `tests/support/fake-oidc.ts` says tests pass `systemClock` "because Better Auth checks `exp` and the state's expiry against real time". So with `CLOCK_MODE=fixture` the fake must still sign tokens with wall time. The spine does not say so, and a later unit could wire the fixture clock into the fake.

**Fix:** Add to the named exception: "…and, for Google sign-in, the OAuth state's expiry and the id token's `exp`/`iat` check. The fake OIDC provider therefore signs with wall time (`systemClock`) even in fixture mode."

## F6 (LOW): AD-23 wording and its Prevents list, AD-16 redaction, and the frontmatter date

- **AD-23 Google bullet wording:** "an id token the provider verified (signature, `iss`, `aud`, `exp`, nonce)". The *provider* (Google) issues the token. Better Auth's generic-oauth plugin verifies it against the discovered JWKS (`requireIdTokenVerification: true`). Reword to "an id token Better Auth verifies (signature against the issuer's JWKS, `iss`, `aud`, `exp`, nonce) before `getUserInfo` runs". Also add that `getUserInfo` never calls the userinfo endpoint and refuses when there is no id token, because that is where the rule is actually enforced.
- **AD-23 Prevents:** The list gained no entry, although the new bullet prevents a specific failure. Add "a federated identity creating a user, or taking over one whose local email is unverified".
- **AD-16:** Slice 3 adds a new secret, `GOOGLE_CLIENT_SECRET`, and transient provider tokens, but the `pino` redaction list (`*.apiKey`, `*.token`, `*.password`, `authorization`) does not cover `*.clientSecret`, `*.idToken` or `*.code`. Add them, or say why they cannot reach a log.
- **Frontmatter `updated`:** The value still starts with `'2026-09-21 (`, but its last clause records a 2026-09-22 change. Every other amendment moved the leading date. Change it to `'2026-09-22 (…)'` and keep the per-amendment dates inside the parentheses.

# Other notes (not in the top findings)

- **Production issuer is not pinned.** AD-17 accepts any `https:` issuer. Any OIDC issuer an operator configures is then trusted as "google" for email-matched linking into existing users. Consider requiring `GOOGLE_ISSUER_URL=https://accounts.google.com` outside development, or record that it is held by the deploy checklist. (There is already an Epic 8 item to check the real `iss` spelling.)
- **AD-17 wording:** The existing sentence "a missing required key fails at boot" sits next to the new "each named when missing, at first read". Both match the code, which uses per-key getters and `googleProvider()` at first use of the Google instance. The earlier sentence could say "at boot or at first read" so the two statements agree.
- **Link auditing:** AD-23 says auditing and unlinking a Google link "belong with the account-lifecycle and invitation decisions". That is consistent with AD-14, whose scope is the NFR-A1 list. A matching one-line Deferred entry would make it discoverable.
- **Checked and consistent:** `createAuth`'s argument list and the `google` shape (`auth.ts`, `google.ts`, `config.ts` `GoogleProviderConfig`); `disableSignUp`, `requireLocalEmailVerified: true` (Better Auth defaults this to true, and the spine pins it explicitly, `oauth2/link-account.mjs:78`), `trustedProviders: []`; `withoutProviderTokens` and `updateAccountOnSignIn: false`; `onAPIError.errorURL = /sign-in?google=refused`; the issuer rule (`https:`, or `http:` only on `localhost`/`127.0.0.1`/`[::1]`); `AUTH_GOOGLE` defaulting to `off`; the composition root's exports (no instance leaks: `googleEnabled`, `googleSignIn`, `refreshSession`, `handleAuthRequest`); `packages/db/auth` still imports neither `@momo/app` nor `@momo/adapters`; the `table-classes.ts` "why" text for `account` and `verification` matches `storeStateStrategy: 'database'` and the null-token hook. AD-2 ("no other stateful service") still holds because OAuth state lives in Postgres.

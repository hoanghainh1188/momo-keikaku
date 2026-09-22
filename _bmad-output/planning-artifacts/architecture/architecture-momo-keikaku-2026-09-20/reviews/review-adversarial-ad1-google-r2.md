# Adversarial review, round 2: AD-1 / AD-15 / AD-16 / AD-17 / AD-23 amended for Google sign-in (2026-09-22)

**Target:** the working tree on `docs/spine-ad1-google-auth`, compared with `main` (`ARCHITECTURE-SPINE.md`, `.memlog.md`, `packages/db/src/table-classes.ts`), after round 1's resolution. Round 1's reports are `review-{rubric,tech-currency,adversarial}-ad1-google.md`, and its resolution is the last memlog entries.

**Method:**

1. I re-checked every round-1 fix against the code: `packages/db/auth/src/{auth,bindings,google,index}.ts`, `apps/web/src/server/composition.ts`, `apps/web/src/middleware.ts`, `packages/app/src/config.ts`, `.dependency-cruiser.cjs`, `scripts/fake-oidc.ts`, `tests/support/fake-oidc.ts`, `tests/{web-composition,web-google-discovery,google-sign-in}.test.ts`, `packages/db/auth/src/auth.test.ts`, and `jose@6.2.12`'s claim checks.
2. I looked for text elsewhere in the spine that the fixes made stale.
3. I tried to build pairs of units that obey the amended text and still build incompatibly today.

I did not re-raise the items round 1 moved to Deferred: who creates users and who sets `email_verified`, a provider-neutral refusal URL, the identity audit sink, discovery retry and timeout, the per-bundle registration split, the sign-in throttle, and `verification` cleanup.

**Verdict:** Every round-1 fix landed and is true against the code. I found no remaining pair of units that diverges on Google sign-in today. Six small defects remain before the amendment is final:

- AD-17 contradicts itself about when configuration fails. A misconfigured Google setup takes down every page, password sign-in included, and the spine implies the opposite.
- One new redaction path over-redacts error codes and misses the real leak.
- The "cannot drift" and "never `socialProviders`" rules are stated as structural, but they are only partly pinned.
- The code comments still assert the round-1 falsehood.
- Stale surfaces remain in the seed, the frontmatter and the Stack table.
- Three wording slips.

---

## Round-1 fixes: landed and true?

| Round-1 item | Spine now | Against the code |
|---|---|---|
| Rubric F1: pages wait on discovery | AD-1 (2): "Only the middleware is isolated … blocks every call on the Google instance … password sign-in" | True. `resolverDeps()` uses `identityOn(webAuth())`; `signInWithEmail`, `signOut` and `handleAuthRequest` use `webAuth()`; only `refreshSession` uses `sessionAuth()`. **The code comments were not corrected** (F4). |
| Rubric F2: one OIDC path, the allowlist | AD-1 (1): `genericOAuth`, `providerId: 'google'`, never `socialProviders.google`; allowlist listed | True. `SERVED_AUTH_ENDPOINTS` and `GOOGLE_CALLBACK_ENDPOINT` match; `/sign-in/social` and `/link-social` are in `DISABLED_PATHS`. The claim that the tests pin both is only partly true (F3). |
| Rubric F3: gate lists | `no-test-support-in-source` enforced; the `tests/` bullet names `scripts/fake-oidc.ts` | True. The rule is at `.dependency-cruiser.cjs:146`. `scripts/fake-oidc.ts:22` is the only non-test importer of `tests/`. |
| Rubric F4: Deferred | Real Google, discovery hang and failure, the `error` code, the Google start under the throttle | Present. `deferred-work.md` lines 648–664 agree. |
| Rubric F5: AD-15 exception widened | OAuth state and id-token checks; the fake signs on wall time | True. `scripts/fake-oidc.ts` passes `systemClock`. "`iat`" is inaccurate (F6). |
| Rubric F6 and tech F-2, F-4: AD-23 wording, Prevents, AD-16, frontmatter | Done | The AD-23 text matches `auth.ts`/`google.ts`. The AD-16 addition `*.code` is harmful (F2). The frontmatter is half-done (F5). |
| Tech F-3: discovered issuer | AD-17: "trusted as that host's" | True as stated. |
| Tech F-5: construction starts discovery | AD-1 (2): "Better Auth starts that fetch when an instance is constructed, which is why construction stays lazy" | True. `web-composition.test.ts` pins zero builds at import. |
| Adversarial F4: one options value | AD-1 (2): "one options value that differs only in the providers that need a discovery fetch … so the two cannot drift" | True of today's code. The prose claims more enforcement than exists (F3). |
| Adversarial F5 (part): invitation not in `verification` | AD-15: "A value the product must expire on the `Clock` … does not go in `verification`"; `table-classes.ts` `why` updated | True. |

---

## F1 (MEDIUM): AD-17 says configuration fails at boot and at first read. A Google misconfiguration takes the whole web app down, which the spine implies it does not.

**Location:** AD-17. The existing bullet says "All configuration is parsed once by a zod schema in `packages/app/config`, and a missing required key fails at boot." The new Google bullet says "each named when missing, at first read … a fast failure … leaves Google unregistered … while password sign-in keeps working".

**Against the code:** `config.ts` lines 28–35 say "EACH KEY IS PARSED WHEN IT IS FIRST READ, not all of them at boot". `parseConfig` (the whole-schema parse) is called only by its tests. So the older sentence is false, and the amendment put a contradicting sentence in the same AD. Round 1's rubric noted this but left it unfixed.

**The divergence it hides:** consider `AUTH_GOOGLE=on` with `GOOGLE_ISSUER_URL` missing, or set to a non-loopback `http:` URL.

- The process starts: nothing reads the key at boot.
- The middleware answers normally: `sessionAuth()` never calls `googleProvider()`.
- The first page render calls `webAuth()`, whose `googleProvider()` throws. `authInstance` is never set, so every later render throws again.
- Every page, every server action, `/api/auth/*` and **password sign-in** fail until the configuration is fixed.

An operator who reads AD-17 sees two Google failure modes, both degrading to "no button". The third mode, a configuration error, is the one that takes down the whole bundle. It is proved: `tests/web-google-discovery.test.ts` ("fails naming GOOGLE_CLIENT_SECRET when the auth instance is first built"). Epic 8 needs this distinction to decide whether a deploy can go green with a broken Google configuration.

**Fix:**

- Reword the first AD-17 bullet: "…parsed by one zod schema in `packages/app/config`; each key is validated when it is first read (per-key getters), so a process fails naming the key it lacks at first use, not at boot; the whole-schema parse is test-only."
- Add to the Google bullet: "A configuration error (a missing Google key, or an issuer that is not `https:`) is not a discovery failure: it throws when the Google instance is first built, so every page, action, route-handler call and password sign-in in that bundle fails until it is fixed; only the middleware keeps answering."
- Optionally, if the founder prefers failing at start-up, have the composition root's first use (or a start-up probe) read `googleProvider()` eagerly.

---

## F2 (MEDIUM): AD-16's new `*.code` redaction erases diagnostic error codes and misses the OAuth code's real path into a log.

**Location:** AD-16, the `pino` redaction list, which gained `*.clientSecret`, `*.idToken` and `*.code`.

**Problem:** A pino path `*.code` masks the `code` property of every top-level object in a log call. The shapes this codebase logs are:

- `err.code`: Postgres SQLSTATE values (`40P01` deadlock, `23505`, `42501`) and Node's `ECONNREFUSED`. AD-23's lock discipline and AD-19's alerting need exactly these.
- `body.code`: Better Auth's `APIError` code. `bindings.ts` logs it on purpose ("Status and code only: never the email or the password"), and the migration to `pino` would lose it.

The OAuth authorization code never travels as an object property this product logs. It arrives in the callback URL's query string (`/api/auth/callback/google?code=…&state=…`) and is posted form-encoded by Better Auth to the token endpoint. A logged `url` or `req.url` string is not touched by `*.code`, and the `state` next to it is just as sensitive.

So the new path redacts what operators need and does not redact what it was added for. No `pino` code exists yet (a grep of `apps/`, `packages/` and `scripts/` finds none), so this is the moment to state the rule correctly.

**Fix:** Drop `*.code`. Add: "request URLs are logged without their query string (or with `code` and `state` masked); `/api/auth/callback/*` in particular is never logged with its query." Keep `*.clientSecret` and `*.idToken`.

---

## F3 (MEDIUM): "The two cannot drift" and "never `socialProviders.google`" are stated as structural and cited as pinned, but the tests pin less.

**Location:** AD-1 (2): "both from one options value that differs only in the providers that need a discovery fetch (today, `google`), so the two cannot drift in any other setting or plugin". AD-1 (1): "never Better Auth's built-in `socialProviders.google` … `auth.test.ts` and `tests/google-sign-in.test.ts` pin both."

**Against the code:**

- `composition.ts` does share `baseAuthOptions()`, so today's code complies.
- The only check is `web-composition.test.ts` ("refreshes the middleware's session on an instance of its own"). It asserts that the middleware's build has no `google` key and matches `{ db, secret, idleHours }`. It does not compare `baseURL` or `generateId`, and it does not compare the two builds with each other.
- Nothing asserts that `authOptions(…)` has no `socialProviders`. Adding `socialProviders: { google }` beside the plugin keeps every test in `auth.test.ts` green (the plugin-id list is unchanged). It also keeps `google-sign-in.test.ts` line 257 green, because that test finds a provider with id `google` in `socialProviders` either way.

**Pair that builds incompatibly and stays green:**

- *Unit A:* slice 4 adds a session-affecting option to `CreateAuthOptions`, for example `revokeSessionsOnPasswordReset`, a session `freshAge`, or a hook on `session.create`. It passes the option in `webAuth()` only, next to `google`, because reset starts from a page action.
- *Unit B:* the middleware's `sessionAuth()`, unchanged, keeps sliding sessions under the old options.

The spine forbids this, but the claim "cannot drift" tells a reviewer that a gate already catches it, and none does.

**Fix (either one):**

- (a) Make it true. `baseAuthOptions()` returns every `CreateAuthOptions` field but the discovery providers. A named `DISCOVERY_PROVIDER_KEYS = ['google']` is the only difference. `web-composition.test.ts` deep-equals the two build arguments minus those keys. `auth.test.ts` asserts `authOptions(…).socialProviders` is `undefined` with and without Google.
- (b) Reword to "…must not drift in any other setting or plugin; held by review, with `web-composition.test.ts` checking the middleware's build has no provider", and drop "pin both" for the `socialProviders` ban.

---

## F4 (LOW–MEDIUM): Round 1's central correction landed in the spine but not in the code comments, which still say pages never wait on discovery.

**Location, in the code:**

- `apps/web/src/server/composition.ts` header, lines 38–42: "The middleware's session refresh gets an instance of its own built WITHOUT Google, **so a page request never waits on discovery**." Lines 31–32 of the same header: "One Better Auth instance per server bundle".
- `packages/db/auth/src/auth.ts` module note: "one WITHOUT Google for the middleware's session refresh, **so a page request never waits on discovery**."
- `packages/db/auth/src/google.ts`: "`iss`, `aud`, `exp`", stated as unconditional. The spine now correctly says "`exp` when present".
- The `tests/web-composition.test.ts` test title "builds the one auth instance lazily".

**Why it matters:** Round 1's rubric F1 was that this exact sentence is false and could lead a later unit to rely on page isolation. The spine is now right, but the next builder reads these comments first. The comments sit in the two files that AD-1 names as the carve-outs.

**Fix:** Correct the comments in this branch, which already edits `table-classes.ts` for the same kind of wording. Use the spine's sentence: "only the middleware's refresh is isolated; a hung discovery blocks pages, actions, the route handler and password sign-in until Epic 8 bounds it." Change "one instance" to "two instances" in the header and the test title, and write "`exp` when present" in `google.ts`.

---

## F5 (LOW): Stale surfaces elsewhere in the spine

- **Structural Seed:**
  - The `composition.ts` comment still says "builds the auth instance" (singular).
  - `tests/` is described only as the cross-tenant harness. AD-1 and AD-17 now name `tests/support/fake-oidc.ts` as test infrastructure that `depcruise` fences.
  - `scripts/` is missing, although AD-1 now names `scripts/fake-oidc.ts` (and already named `scripts/seed.ts`).

  Fix: say "builds its two auth instances", add `tests/support/  # the fake OIDC provider (AD-17); no apps/ or packages/ import`, and add a `scripts/` line.
- **Frontmatter `updated`:**
  - It repeats the date (`'2026-09-22 (… ; 2026-09-22 AD-1/AD-17/AD-23: …)'`).
  - It names AD-1, AD-17 and AD-23, while the summary paragraph says AD-1, AD-15, AD-16, AD-17 and AD-23.

  Fix: `…; AD-1/AD-15/AD-16/AD-17/AD-23: Google sign-in as one OIDC provider, two auth instances, the fake provider)`.
- **`reviews_applied`:** It does not list `reviews/review-adversarial-ad1-google.md`, although every earlier amendment added its adversarial review (for example `review-adversarial-ad23-membership-writer.md`), and the summary paragraph cites this one. Add it, and this round-2 file, at finalization.
- **Stack table:** `jose` 6.2.12 is missing. It is an exact-pinned root dev dependency, the fake provider signs every CI id token with it, and Better Auth verifies with it. The table already lists test and tool pins (vitest, playwright, dependency-cruiser, tsx). Add `| jose | 6.2.12 (the fake OIDC provider's signer; dev only) |`.

---

## F6 (LOW): Three wording slips

1. **AD-1 (2), sentence structure.** The discovery warning is nested inside a dash pair ("— a discovery fetch that hangs blocks every call … until Epic 8 bounds it (Deferred) — and resolves the `RequestContext` per request"), which grammatically attaches "resolves the `RequestContext`" to the hang. Fix: end the instance sentence after "(Deferred)." and start a new one: "It resolves the `RequestContext` per request through `resolveRequestContext` (AD-23), at most once per render."
2. **AD-15, "the id token's `exp`/`iat` check".** Better Auth calls `jwtVerify` with no `maxTokenAge`, so `jose` 6.2.12 compares `exp` and `nbf` against wall time. It never checks `iat`'s age (`jwt_claims_set.js` lines 80–91: `iat` is only type-checked unless `maxTokenAge` is set). Fix: write "`exp`/`nbf`".
3. **AD-1 (1), "A new endpoint joins the list by a spine-reviewed change, as slice 4's reset endpoints will."** The clause after the comma decides slice 4's transport now, as HTTP endpoints rather than server actions like the Google start. That choice decides whether Better Auth's rate limiter applies, which the Deferred throttle item leaves open. It also promises something the allowlist cannot express yet: Better Auth's reset link is the parametrised `GET /reset-password/:token`, while `serveAllowlisted` matches exact `method + path` pairs and deliberately 404s parametrised routes (`bindings.ts`). Fix: delete ", as slice 4's reset endpoints will". The rule stands without it, and slice 4 decides its transport under review.

---

## Constructions tried that did not yield a live divergence

- **Page bundle and route bundle registering Google differently:** already in AD-17 and Deferred (round-1 F6). Not re-raised.
- **The middleware instance and the Google instance reading one session table:** the options are identical apart from the plugin (`auth.test.ts` shows `account`, `session`, `onAPIError` and `disabledPaths` are the same for both), so their session decisions agree today. Only future drift threatens that (F3).
- **The `/api/auth/callback/google` request passing through the middleware:** it does not. The matcher excludes `api/auth(?:/|$)`.
- **A fixture-mode `Clock` reaching the fake provider:** `scripts/fake-oidc.ts` and every test pass `systemClock`, and AD-15 now requires it.
- **An invitation token placed in `verification`:** AD-15 and the updated `table-classes.ts` `why` now both exclude it.
- **`apps/` or `packages/` importing the fake:** gated by `no-test-support-in-source`. `depcruise apps packages` follows edges into `tests/` (only `node_modules` is not followed), so the rule can fire.

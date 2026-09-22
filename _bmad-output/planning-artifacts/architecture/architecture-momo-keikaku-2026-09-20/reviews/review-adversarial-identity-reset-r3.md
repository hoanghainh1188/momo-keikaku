# Adversarial review, round 3: password reset, MailerPort and `identity_event` (2026-09-22)

**Target:** `git diff main -- _bmad-output/planning-artifacts/architecture _bmad-output/implementation-artifacts/deferred-work.md` on `docs/spine-identity-event-reset` (uncommitted), after round 2's fixes. Decisions: `.memlog.md` lines 138-141 (round 2 event, the two founder decisions, the autofix rule). Round 2's report: `review-adversarial-identity-reset-r2.md`.

**Method:**

1. I checked each round-2 finding against the spine text and, where the spine says code is owed, against `deferred-work.md`.
2. I attacked only the text round 2 rewrote. I built pairs of units that both obey the spine and still build incompatibly.
3. I checked every Better Auth claim against the installed 1.7.5 sources. `BA/` below means `node_modules/.pnpm/better-auth@1.7.5_…/node_modules/better-auth/dist`.
4. I checked the code: `packages/app/src/config.ts`, `packages/db/auth/src/{auth,google}.ts`, `packages/db/src/{table-classes,seed}.ts`, `packages/i18n/*`, `scripts/demo.ts`, `vitest.config.ts`, `.github/workflows/ci.yml`, `.dependency-cruiser.cjs`.

Anything I could not verify is marked **[speculation]**. I did not re-argue founder decisions. I attacked only how they are worded and whether they agree with the rest of the spine.

**Verdict:** Round 2's fixes landed. The new text is mostly sound, but it has three real contradictions:

- AD-17's `DEPLOYMENT` rule contradicts two older sentences about fixture mode.
- AD-14 lists identity events that nothing records, including one the founder has now accepted.
- AD-3's `system` path already lets the worker read the tables that the new Open Question says the worker cannot reach.

All three are wording fixes. **Ready to finalize after one more edit pass. No round 4 is needed if the fixes below are applied as written.**

---

## Round-2 findings: landed?

| R2 | Spine now | Status |
|---|---|---|
| F1 invitation acceptance: three writers | AD-14 now leaves the acceptance shape to that story's amendment, keeping "one writer, one clock" as the fixed rule. R2's "one completed change records one row" rule is not adopted, and the reset already breaks it (new F2) | Landed (partly carried into F2) |
| F2 `appendOnlyGuard` maintenance grant | AD-21 says `SELECT, UPDATE, DELETE` through one function. The `deferred-work.md` entry names the grant, `removeExtras` and the three code comments | Landed |
| F3 `email_verified` writers | Better Auth's `link-account` write is accepted and listed. R1 magic link is named. The lowercase `CHECK` is in Deferred. The one-sentence definition still says "only when the product delivered a token … or the operator seeded" (F2) | **Partial** |
| F4 renderer graph edge | `renderMail` is in `packages/i18n`, so no new edge | Landed (new issue F5) |
| F5 worker reach | Open Question "How `apps/worker` reaches identity data". The AD-19 Mail bullet says it is open | Landed (new issue F3) |
| F6 loopback test | `DEPLOYMENT` key in AD-17. AD-18: no staging web bundle before `mailer-ses`. Recorded in `deferred-work.md` with the deadline "before Epic 8's first staging deploy" | Landed (new issue F1) |
| F7 "pads or queues" | AD-23 now reads "pads it, or sends after the response in-process — never through a job". AD-18 counts `backgroundTasks` as inline once hooks cannot throw. **Verified:** `BA/context/create-context.mjs:212-224`; `BA/api/routes/password.mjs:82` wraps `sendResetPassword` in `runInBackgroundOrAwait`, and `:170` awaits `onPasswordReset` directly | Landed |
| F8 user deletion | Removed from AD-14's list. AD-5's third exception says which role runs it is decided later | Landed |
| F9 Prevents / deadline | Prevents narrowed to "password session". The `deferred-work.md` entry says "a deployment blocker for Epic 8's first deployment with real users" | Landed |
| F10 stale surfaces | Frontmatter includes AD-19. The capability map's NFR-A1, NFR-S5 and FR-1–3 rows are updated. AD-21's classification includes `identity_event`. AD-23's reset bullet says "(code owed, AD-1)". The present tense is fixed in AD-16 and AD-21. The code comments are recorded. Deferred "Who creates users" still says "the two things that set `email_verified`" (F7) | **Partial** |
| F11 dropped items | The ALB access log is in Deferred (`:816`). The FK and lowercase `CHECK` are in Deferred (`:815`) | Landed |

**Tally:** 11 items. 9 landed, 2 partial, 0 missing.

---

## F1 (MEDIUM): `DEPLOYMENT` refuses fixture mode everywhere except `local`, but two older sentences allow it everywhere except production, and "supplied by `pnpm dev` and the test runners" leaves the supplier unnamed

**Evidence:**

- **AD-17 (`:344`):** "Outside `local`, `MAILER=console`, `CLOCK_MODE=fixture` and `TRACKER_ADAPTER_OVERRIDE=fixture` are each refused."
- **Connector bullet (`:183`):** "`TRACKER_ADAPTER_OVERRIDE=fixture` forces fixture replay everywhere outside production."
- **AD-15 (`:316`):** "`CLOCK_MODE=fixture` (never in production)."
- **AD-18 (`:358`):** staging is "optional, same template".
- **Who supplies `local`:**
  - `vitest.config.ts` has no `test.env`.
  - The `ci.yml` job `env` (`:281-301`) has no `DEPLOYMENT`.
  - `pnpm dev` is `next dev -p 3101` (`apps/web/package.json:7`).
  - `pnpm demo`, the documented demo path, does not go through `pnpm dev`. It spawns `pnpm --filter @momo/web exec next dev` directly (`scripts/demo.ts:101`).
- **Two more readers of `CLOCK_MODE`** are not "both roles". AD-15 has `db/seed` build the Baseline through the fixture clock. No code reads `CLOCK_MODE` yet (a grep finds nothing), so this is not yet implemented.

**Constructions:**

1. **A staging demo against fixture data.** One builder plans it from `:183` and `:316` (allowed). Another implements AD-17 (refused at first read). One key, two rules.
2. **Where the default lives.** Builder A prefixes the `dev` script with `DEPLOYMENT=local`, so `pnpm demo` then dies at first read. Builder B adds `apps/web/.env.development`, which Next loads for any `next dev`, so the demo works. That file is invisible to vitest, so Builder B also adds `test.env` in `vitest.config.ts`. Builder C sets it in the `ci.yml` job env. Then a laptop `pnpm test` differs from CI, and `tests/web-composition.test.ts`-style tests pass in CI and fail locally.
3. **Declaring yourself local.** Nothing says the deployment template pins `DEPLOYMENT` to the environment's name. A staging operator blocked by "no staging web bundle before `mailer-ses`" sets `DEPLOYMENT=local` to get a bundle up, and the spine does not forbid it.
4. **The seed's clock.** The seed reads `CLOCK_MODE` but is neither role. Run against staging with `CLOCK_MODE=fixture`, it seeds fixture-time rows that no guard refuses.

**Fix:**

- Change `:183` and `:316` to "outside `DEPLOYMENT=local`".
- In AD-17, name the one supplier of `local`: for example, `apps/web/.env.development` and `vitest.config.ts` `test.env`, and never the `ci.yml` job env or a script prefix.
- State that the deployment template sets `DEPLOYMENT` to its environment's name and never to `local`.
- State that `scripts/seed.ts` applies the same refusal to `CLOCK_MODE`.

## F2 (MEDIUM): AD-14 defines identity events that nothing records, and AD-23's one-sentence definition excludes the Better Auth write it now accepts

**Evidence:**

- **AD-14 (`:307`):** identity events include "a provider link or unlink, an email verified, a user created", and "They write to `identity_event` … through its one writer". It also says "Each later hook-driven event (a link, an unlink) is named here … before it lands".
- **Four writers, all landed or accepted, record nothing:**
  1. The Google link. Story 1.4 slice 3 landed it. AD-23 says "recording a link lands with account lifecycle".
  2. The seed, which creates users and sets the flag. `packages/db/src/seed.ts` writes no `identity_event`.
  3. Better Auth's accepted `link-account` write (`BA/oauth2/link-account.mjs:176`). No product hook runs there.
  4. The reset's own flag flip. The reset records one `password.reset` row, not an email-verified row.
- **AD-23 (`:475`)** opens: "`true` **only** when the product delivered a single-use token … or the operator seeded the user". Three sentences later it accepts a write where the product delivered nothing. The claim that this "matches the meaning above" is false by the definition's own wording.

**Construction:** Account lifecycle adds `databaseHooks.user.update.after` to record "an email verified", because AD-14 says to. It then double-records every reset (the `password.reset` row plus an email-verified row) and records Better Auth's `link-account` write. A second builder reads AD-14's list as satisfied by `password.reset` alone. The two builds disagree on the row count for the same change, and an operator investigating a takeover cannot tell which convention produced a given history.

**Fix:**

- **AD-14:** add "One completed change records one row naming its primary action (a reset that verifies the email records `password.reset` only)." Then name the unrecorded writers as exceptions until account lifecycle: the seed (operator tooling), the Google link, and Better Auth's `link-account` verification.
- **AD-23:** make the definition's first sentence a three-way "or": "…, or the operator seeded the user, or an already-linked provider asserted that exact address as verified".

## F3 (MEDIUM): AD-3's `system` path may read any `global` table, which already gives the worker the identity reads that the new Open Question says it lacks

**Evidence:**

- **AD-3:** "a separate `system` path. That path may read only tables of class `global` or `operational`". It excludes the membership bridge by name, and nothing else.
- **AD-21:** `auth_user`, `session`, `account`, `verification` and `identity_event` are all `global`.
- **Open Question (`:835`):** "AD-23 lets only `packages/db/auth` and the seed reach those tables."
- **AD-21 (`:434`):** `identity_event` is "read through the operator or maintenance path".
- The Open Question's list also omits the probe Tenants, which AD-21's table (`:432`) includes.

**Construction:** The worker's composition-root builder needs FR-17's recipient. They read AD-3 and add a `system`-path reader of `auth_user.email` and `locale` in `packages/db`. That is legal by class. A second builder follows `:835` and adds a `packages/db/auth` export. Operator metrics on the `system` path can also read `identity_event` and `verification` (live reset tokens in plain text, AD-1), and no rule says otherwise. So the "open" question is already half-answered in a direction nobody chose.

**Fix:** In AD-3, extend the `system` path's exclusion: "The tenant-membership bridge, the four Better Auth tables and `identity_event` are not on that path." In `:835`, list the probe Tenants alongside `db/auth` and the seed.

## F4 (LOW): `appendOnlyGuard` gives the maintenance role `UPDATE` on `identity_event`, which no sanctioned exception uses, and AD-5 says maintenance acts in "three exceptions … and nothing else"

**Evidence:**

- `MAINTENANCE_PRIVILEGES['append-only']` is `SELECT, UPDATE, DELETE` (`table-classes.ts:275-281`). The spine now extends that grant to `identity_event`, justified by "AD-19's backfills and AD-5's retention".
- AD-5 (`:160`) lists three maintenance exceptions. The only one touching `identity_event` is a `DELETE` (user deletion). AD-19's backfills already sit outside AD-5's "nothing else", which predates this round.
- `identity_event` has no RLS, so the grant alone decides what maintenance can do. That matches the generator: the bypass policy is only needed on tenant tables.

**Construction:** A backfill of `identity_event.payload` (Deferred `:815`, forensic fields) runs as maintenance under AD-19. AD-5's reviewer calls it an unsanctioned fourth exception. Both readings are defensible.

**Fix:** In AD-5, change "Three sanctioned exceptions" to cover them all: "three sanctioned deletions, plus AD-19's expand/contract backfills, all through the `maintenance` role".

## F5 (LOW): `renderMail` in `packages/i18n` does not say whether it uses next-intl's message format

**Evidence:**

- `packages/i18n` has no dependencies (`package.json`), and the spine says it "depends on nothing" (`:58`).
- The i18n convention (`:615`) says all mail text goes "via `next-intl`", and `next-intl` 4.14.5 is `apps/web`'s dependency.
- The reset mail's `expiresInHours` needs a plural ("1 hour" / "N hours"), which next-intl's ICU syntax expresses in the shared catalog.
- Seed `:665` still describes `i18n/` as "en.json, ja.json", and the diagram's node (`:68`) says "en/ja catalogs".

**Construction:** Builder A hand-rolls `{var}` substitution in `renderMail`. The ICU plural that the reset pages render correctly through next-intl then prints raw in the mail. Builder B imports `use-intl/core`'s `createTranslator`, which is next-intl's framework-free core **[speculation: not checked against 4.14.5's exports]**. That breaks "depends on nothing" and pulls the package into the worker.

**Fix:** In AD-1 or the i18n row, state that `renderMail` formats with the same ICU engine next-intl uses (name the package, and allow it as `packages/i18n`'s one runtime dependency). Update the Seed line and the diagram node to "catalogs + `renderMail`".

## F6 (LOW): the Google provider has a configuration flag, `overrideUserInfo`, that rewrites `auth_user.email` and `email_verified` behind AD-23's email-change rule

**Evidence:** In `BA/oauth2/link-account.mjs:178-186`, with `overrideUserInfo` (the generic-oauth option `overrideUserInfo` → `overrideUserInfoOnSignIn`, `BA/plugins/generic-oauth/index.mjs:264`), an already-linked sign-in writes `email: userInfo.email` and sets `emailVerified` from the provider. It neither deletes `reset-password:` tokens nor sets the flag `false`, which AD-23 requires of "any change to `auth_user.email`". Today `google.ts` does not set it (it is off).

**Construction:** Account lifecycle wants the display name kept in sync and turns the flag on. The first Google sign-in with a changed Google address silently changes the product's login email and keeps it verified.

**Fix:** In AD-23, add after "Better Auth also writes it": "`overrideUserInfo` and `updateUserInfoOnLink` stay off. Turning either on is an amendment here."

## F7 (LOW): smaller stale surfaces

- **Deferred "Who creates users" (`:814`):** "the seed and a completed password reset … are the two things that set `email_verified`". Better Auth's `link-account` write is now a third. It is unreachable today only because no path changes an email.
- **AD-19 Mail bullet (`:404`) and Open Question (`:835`):** `:404` says where the sweep runs is open. `:835` files the sweep under "How `apps/worker` reaches identity data", which presumes it is the worker's. Say "whichever unit runs it".
- **Deferred Google entry (`:813`):** it is keyed to "the first staging sign-in with real Google". Staging is optional (`:358`) and now cannot run before `mailer-ses`. Add "or the first production sign-in, if there is no staging".

**Fix:** Correct the three sentences as described.

---

## Constructions that yielded nothing

- **`backgroundTasks` exists in 1.7.5.** `advanced.backgroundTasks.handler` is at `BA/context/create-context.mjs:212-224`. It is instance-wide: it also moves the rate limiter's cleanup (`BA/api/rate-limiter/index.mjs:173`) and any verification mail to the background. With this config none of those change behaviour, because verification mail is disabled.
- **Other writers of `emailVerified` reachable with this config.** None beyond `link-account.mjs:176`:
  - `:128` and the implicit-link branch are unreachable, because `requireLocalEmailVerified` is `true`.
  - `/verify-email`, `/change-email`, `/update-user`, `/sign-up/email` and `/link-social` are in `DISABLED_PATHS` (`auth.ts:82-106`).
  - The enabled plugins are `generic-oauth` and `next-cookies` only (`auth.test.ts:107`).
  - `sign-in.mjs:187` (id-token social sign-in) creates users only through `handleOAuthUserInfo`, where `disableSignUp` holds.
- **The `appendOnlyGuard` grant against today's generator.** `identity_event` has no RLS, so the grant alone is enough. The seed and probe Tenants already open `app.maintenance`. The owed entry covers `removeExtras`.
- **The AD-14 pull-back against the rest of the spine.** AD-23's invitation bullet (`:476`) fixes only the membership INSERT's writer and grant. AD-23's `:475` fixes acceptance as a flag writer, which is an invariant, not a shape. Deferred `:834` defers user deletion to AD-5. Nothing else pre-draws acceptance's transaction shape.
- **`DEPLOYMENT` in CI.** No gate step reads config at build time (`web-composition.test.ts:206`, and the `ci.yml` build step's comment), so CI breaks only through F1's supplier question, not through the build.
- **`MAILER=ses` in the worker.** The worker has no composition root yet, and AD-17's rule only binds once it has one.

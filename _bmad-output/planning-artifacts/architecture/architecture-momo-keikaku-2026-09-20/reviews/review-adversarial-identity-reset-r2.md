# Adversarial review, round 2: password reset, MailerPort and `identity_event` (2026-09-22)

**Target:** `git diff main -- _bmad-output/planning-artifacts/architecture _bmad-output/implementation-artifacts/deferred-work.md` on `docs/spine-identity-event-reset` (uncommitted), after round 1's fixes. The decisions are the `.memlog.md` entries from "Update started (founder, 2026-09-22)" on, including the seven round-1 decisions. Round 1's reports are `review-{rubric,tech-currency,adversarial}-identity-reset.md`.

**Method:**

1. I re-checked every round-1 finding against the amended spine and the code on `main` (`dcd7da9`, equal to `origin/main`): `packages/db/auth/src/{auth,reset}.ts`, `packages/db/src/{table-classes,repo-identity-event,schema,probe-tenants,seed,registry.test,rls.test,source-discipline.test}.ts`, `packages/db/src/sql/generate.ts`, `packages/db/sql/{grants,triggers}.sql`, `packages/app/src/config.ts`, `apps/web/src/server/composition.ts`, `apps/web/src/app/forgot-password/reset-link-hours.ts`, `apps/worker/src/*`, `tests/password-reset.test.ts`, `.github/workflows/ci.yml`, and `deferred-work.md`.
2. I checked the Better Auth claims against the installed 1.7.5 sources (`BA/` below = `node_modules/.pnpm/better-auth@1.7.5_…/node_modules/better-auth/dist`): `api/routes/password.mjs`, `oauth2/link-account.mjs`, `plugins/magic-link/index.mjs`, `db/revoke-unproven-account-access.mjs`, `context/create-context.mjs`.
3. I attacked the new text with constructions: two units one level down (invitation, account lifecycle, story 1.9, `apps/worker` mail and sweep, Epic 8 staging and `mailer-ses`, R1 magic link) that obey every AD and still build incompatibly.

Claims I could not verify are marked **[speculation]**.

**Verdict:** Most round-1 fixes landed, and the code-owed ones are recorded in `deferred-work.md`. But the fixes created new contradictions, and two are serious:

- AD-14's redefinition makes invitation acceptance write three rows in up to three transactions, with a writer `packages/app` cannot reach.
- The new `appendOnlyGuard` names a maintenance grant (`SELECT, DELETE`) that would strip `UPDATE` from every append-only table and break AD-19's backfills.

Beyond those, the closed `email_verified` writer list is false against Better Auth itself; the 1.9 renderer adds an import edge AD-1's graph forbids; worker mail and the sweep cannot reach the tables they need; the loopback rule for `MAILER` blocks non-loopback dev and any staging before `mailer-ses`; and AD-23 still says the throttle may "queue" reset mail. **Not ready to finalize.**

---

## Round-1 fixes: landed and true?

| Round-1 item | Spine now | Against the code | Status |
|---|---|---|---|
| Rubric F1: `MAILER=console` unguarded, the default | AD-17 refuses `console` unless `BETTER_AUTH_URL` is loopback; code owed | `config.ts:171-173` still `.default('console')`, no cross-key rule. `deferred-work.md` records it. The spine does not claim it exists, except AD-16's present-tense "AD-17 refuses" | Landed (new issue F6) |
| Rubric F2: reset guarantees best-effort | AD-1: each step best-effort on its own; code owed | `auth.ts:229-243` still one `try`. Recorded in `deferred-work.md`. AD-23's reset bullet still states invalidation and verification without qualification (F10) | Landed |
| Rubric F3: composition root export list | AD-1 (2) lists "requesting and completing a password reset" | True (`composition.ts` exports both) | Landed |
| Rubric F4: trigger present tense, registry flag, AD-5 count | `appendOnlyGuard`, three exceptions, owed | Registry has no flag. `triggers.sql` has no `identity_event` trigger. Recorded | Landed (new issue F2) |
| Rubric F5: invitation's two sinks | AD-14 defines identity events by subject | Text consistent. New issue F1 | Landed (new issue F1) |
| Rubric F6: nobody fences readers | AD-21: no Tenant-scoped surface reads `identity_event`; payload has no Tenant data | App role still has `SELECT` (`grants.sql:31`). Narrowing deferred (Deferred bullet, `deferred-work.md:751`) | Landed |
| Rubric F7: token location, plaintext, hashing | AD-16 names mail, URL, hidden field, `verification` in plaintext. AD-1 pins `value` = user id and plain identifiers | True (`password.mjs:74-78`, no `storeIdentifier` in `auth.ts`). A switch to hashed is caught behaviourally by `tests/password-reset.test.ts:391` | Landed |
| Rubric F8: mail operations, `MAILER=ses` blast radius, worker mailer | AD-19 Mail bullet; AD-17 says the whole bundle goes down | True (`composition.ts:140-160`, `baseAuthOptions()` shared by both instances) | Landed |
| Rubric F9: SES production access in the R1 set | Removed from R1 | True | Landed |
| Rubric F10: sweep site, i18n places, writer wording | AD-19 names the worker; i18n row names three places; "the writer `identityEventWriterOn` builds" | `reset-link-hours.ts` exists as described. The sweep sentence contradicts itself, and the worker cannot reach `verification` (F5) | Landed (new issue F5) |
| Tech F1: timing | AD-23 "the reply only"; Deferred widened | True of `password.mjs:59-86`. AD-23 now says the throttle "pads or queues it" (F7) | Landed (new issue F7) |
| Tech F2: "by trigger" present tense | AD-5 says owed. AD-21 says "(owed in code)" and then "makes it insert-only by grant and by trigger" | Still present tense in the same bullet | **Partial** |
| Tech F3: SES sandbox | Verified recipients, per region, bounce handling in AD-19 | Matches AWS docs as cited in round 1 | Landed |
| Tech F4: `hasCredentialAccount` outside `try` | AD-1: hooks never throw; owed | `auth.ts:206` unchanged. Recorded | Landed |
| Tech F5: plaintext tokens | AD-16 and AD-1 | True | Landed |
| Tech F6: TRUNCATE | AD-5 and the deferred entry name the TRUNCATE guard | True; the guard pair exists for the nine tables (`triggers.sql`) | Landed |
| Adv F1: invitation sinks | AD-14 by subject | See F1 | Landed (new issue F1) |
| Adv F2: a Google link survives a reset | Founder: links kept, limit stated in AD-23 | AD-23's Prevents line still claims "a reset that leaves an attacker's session alive". The "before Epic 8's first real-user deployment" deadline is not in `deferred-work.md` (`:669` has no deadline) | **Partial** (F9) |
| Adv F3: `MAILER` default | As rubric F1. Recipient redaction in `mailer-console` not adopted; covered by the loopback rule | — | Landed |
| Adv F4: `email_verified` meaning | AD-23 meaning, closed writers, email-change rule | The closed list is false against Better Auth (F3). The lowercase-email `CHECK` was dropped with no memlog entry | **Partial** (F3) |
| Adv F5: 1.7 as reader | Removed; AD-21 fences readers | True | Landed |
| Adv F6: registry cannot express "global + trigger" | `appendOnlyGuard` | See F2 | Landed (new issue F2) |
| Adv F7: `storeIdentifier` unpinned | AD-1 pins formats in prose | Behaviourally pinned (`password-reset.test.ts:391`) | Landed |
| Adv F8: queue, quota, throttle order | AD-18: inline, never queued; `mailer-ses` after the throttle | AD-23 contradicts (F7) | Landed (new issue F7) |
| Adv F9: renderer contract | AD-1 and i18n row: `render(kind, locale, vars)` in `packages/app` | The `packages/app → packages/i18n` edge is not in AD-1's graph (F4) | **Partial** (F4) |
| Adv lower: token in URL reaches ALB logs | AD-16 covers app logs only | Not addressed, not deferred | **Missing** |
| Adv lower: `identity_event.user_id` has no FK | — | `schema.ts:166-175`; not addressed, not deferred | **Missing** |
| Adv lower: AD-15 "nothing computes from either" | AD-21 fences Tenant readers | The promise stands; an operator reader could still sort both. Also see F1's mixed clocks | **Partial** |
| Adv carried: magic link creates users; worker identity reads | — | Still open; F3 and F5 make both concrete | **Missing** |

**Tally:** 29 items. 21 landed, 5 partial, 3 missing. Every "code owed" statement I checked has a `deferred-work.md` entry except two: F2's test cleanup and F9's deadline.

---

## F1 (HIGH): invitation acceptance must write `audit_log`, user rows and `identity_event` across three transactions, and the one writer cannot be reached from `packages/app`

**Unit A (FR-2 acceptance, as AD-14 now reads):** acceptance is "a tenant-scoped audited use case that writes `audit_log` in its `withTenant` transaction … its user-side effects (a user created, an email verified) may add `identity_event` rows beside it". AD-23 makes acceptance a closed writer of `email_verified`.

**Unit B (the plumbing as AD-1, AD-21 and AD-23 fix it):**

- The Better Auth tables (`auth_user`, `account`) are "reached only through `packages/db/auth`" (AD-23). So creating the invitee and setting `email_verified` happens on Better Auth's connection, not inside `withTenant`.
- `identity_event` is "written on the application role only through `packages/db`'s `identityEventWriterOn`, handed to `db/auth`" (AD-21). That writer takes a `Db` handle and opens its **own** transaction (`repo-identity-event.ts:35-46`). `source-discipline.test.ts:204-217` pins its namers to the repo module, the barrel and the composition root. `packages/app` declares no port for it; the only interface is `db/auth`'s `IdentityEventWriter`, whose `action` is `'password.reset'` only (`reset.ts:32-42`).
- AD-14's best-effort exception "names `onPasswordReset` only". Everything else must meet "same transaction".

**How they diverge:**

- One builder writes the membership and `audit_log` in `withTenant`, then calls `db/auth` to create the user, then records `identity_event`. A crash between steps leaves an audited membership for a user who does not exist, or a verified user with no membership. Neither order is atomic.
- A second builder threads the tenant `tx` into a new identity-event writer so the event joins the audit transaction. That writer is a second writer, and the discipline test fails.
- A third reads "may" and writes no `identity_event` at all.
- **Two clocks.** AD-15 fixes `identity_event.at` as wall time only through `createAuth`'s `now`. A use case in `packages/app` stamps with the `Clock` port, so acceptance rows are fixture-time and reset rows are wall-time in the same table.
- **Vocabulary.** AD-14 counts "an email verified" as an identity event. A reset that flips the flag records only `password.reset`. An acceptance builder may record `email.verified` as well. The two will not agree on how many rows one completed change produces.

**Fix:** In AD-14, state acceptance's shape: which unit owns the user-side rows (a `packages/app` port satisfied by the same writer, which accepts the tenant `tx`); the order of user creation and membership, and what a crash between them leaves; whether the user-side `identity_event` must be written (not "may"), and in which transaction; which clock stamps `identity_event.at` for every writer; and "one completed change records one row naming its primary action".

## F2 (HIGH): `appendOnlyGuard`'s maintenance grant (`SELECT, DELETE`) contradicts the append-only class's `SELECT, UPDATE, DELETE`, which AD-19's backfills and AD-5's `schedule_run` output drop need

**Evidence:**

- AD-21 now reads: "the trigger generator, the append-only trigger test and the maintenance grant (`SELECT, DELETE`) key off it, every `append_only` entry implies it". The deferred entry (`deferred-work.md:822`) repeats "the maintenance `SELECT, DELETE` grant".
- Today `MAINTENANCE_PRIVILEGES['append-only']` is `['SELECT', 'UPDATE', 'DELETE']` (`table-classes.ts:282-288`). `grants.sql:47-88` grants all three on the nine tables, and `registry.test.ts:122` pins that.
- AD-19 requires "Backfills run through the `maintenance` path (AD-5) so append-only triggers are satisfied explicitly". An expand/contract backfill on an append-only table is an `UPDATE`.
- AD-5: "A run's `outputs` may be dropped earlier" on `schedule_run` (append-only) is an `UPDATE`.

**Construction:** The owed task lands "before any second identity action". Its builder keys the maintenance grant off `appendOnlyGuard`, as AD-21 says, and "fixes" `registry.test.ts` to match the spine. Every append-only table loses maintenance `UPDATE`. The first expand/contract migration, and the `schedule_run` output drop, then fail under the trigger with no grant. A second builder keeps the class grant and adds `SELECT, DELETE` on `identity_event` only. The two builders ship different grants.

**Also:**

- AD-21's "the generator and the catalog assertion both read the grant through one function" covers only the app grant (`appPrivilegesOf`). `generate.ts:172` reads `MAINTENANCE_PRIVILEGES[entry.class]` directly, so the new guard-keyed grant has no single function.
- Once the trigger lands, `tests/password-reset.test.ts:189-196` (`removeExtras`) deletes `identity_event` rows as the owner **without** opening `app.maintenance`, so it will fail. The deferred entry does not mention it. (`probe-tenants.ts:397-447` does open the setting.)

**Fix:** In AD-21 and in the deferred entry, write "the maintenance grant of the append-only class (`SELECT, UPDATE, DELETE`)". Name one `maintenancePrivilegesOf(entry)` that the generator and the catalog assertion both read. Add `removeExtras`'s maintenance setting to the owed task.

## F3 (MEDIUM): the "closed" `email_verified` writer list is false against Better Auth 1.7.5

AD-23 now says: "Its writers are closed: the seed, a completed reset, and invitation acceptance". Better Auth writes the flag itself in two paths the spine reaches:

1. **An already-linked OAuth sign-in** (`BA/oauth2/link-account.mjs:176`): `if (userInfo.emailVerified && !dbUser.user.emailVerified && userInfo.email.toLowerCase() === dbUser.user.email) updateUser(…, { emailVerified: true })`. The project's `getUserInfo` always returns `emailVerified: true` (`google.ts:86-87`).
   - **Construction:** account lifecycle obeys AD-23's new rule, "any change to `auth_user.email` sets it `false`", on a user who has a Google link (links survive; AD-23 says an already-linked `sub` signs in "whatever email it now carries"). On the next Google sign-in whose Google email equals the new address, Better Auth sets it back to `true`. The product delivered no token, which breaks AD-23's stated meaning, and the user is now linkable to any further provider.
   - The link branch (`:128`) stays unreachable because `requireLocalEmailVerified` is `true`, as round 1 found.
2. **R1 magic link** (`BA/plugins/magic-link/index.mjs:176-180` → `db/revoke-unproven-account-access.mjs:33-55`): verifying a link for an unverified user deletes **every** `account` row (credential included) and every session, then sets `emailVerified: true`. No product hook runs.
   - **Construction:** FR-2 pre-creates an invitee unverified ("nothing sets it at invitation time, so an unaccepted invitee is not linkable"). R1 magic link, obeying AD-23's "a new sign-in method … redeems a token of this kind", verifies that invitee without acceptance, making them linkable. It also silently deletes credentials and links, which AD-14 now defines as identity events, and records no `identity_event`.
   - AD-23's two sentences ("closed" list vs "a new sign-in method either redeems a token of this kind or does not set the flag") already disagree about whether R1 may add a writer.

**Fix:** In AD-23, list Better Auth's own writers (the already-linked OAuth branch; magic-link or OTP promotion when enabled). Either block them with a `databaseHooks.user.update.before` that drops `emailVerified` outside the product's writers, or accept them and say so. Require the R1 magic-link amendment to record the accounts `revokeUnprovenAccountAccess` deletes as identity events, and to decide whether it may promote an unaccepted invitee. Record the dropped lowercase-email `CHECK` as a decision or a deferral.

## F4 (MEDIUM): the story 1.9 renderer puts a `packages/app → packages/i18n` edge into a graph that AD-1 says is "exactly" the diagram

**Evidence:**

- AD-1 bullet 1: "The import graph is exactly the one in the diagram above plus the two carve-outs." The diagram's only `I18N` edges are `WEB --> I18N` and `WRK --> I18N`. `APP` reaches only `DOM`.
- The amendment (AD-1 (1), i18n row, memlog) places `render(kind, locale, vars)` in "one pure module in `packages/app` that imports `packages/i18n`".
- The gate does not check `packages/app`'s other edges today ("every other edge of the diagram" is unenforced), so nothing fails. The spine contradicts itself, and the next person to extend the depcruise config will write the diagram's rule and break 1.9.

The rest of the construction works:

- The composition root can build `renderResetMail` because it imports `packages/app`.
- `db/auth` receives it as an argument, as it does `mailer`.
- `sendResetPassword`'s `user` comes from `findUserByEmail`, which includes the additional field `locale`.

**Fix:** Add `APP --> I18N` to the diagram and to AD-1's text ("`packages/app` may import `packages/i18n` for mail rendering only"), or place the renderer in `packages/i18n` itself as a pure function over its own catalogs.

## F5 (MEDIUM): worker mail and the `verification` sweep are assigned to `apps/worker`, which cannot reach `auth_user` or `verification`

**Evidence:**

- The amendment says "the worker's mail uses the same module" (renderer), "`apps/worker`'s mailer (FR-17, FR-36) follows the same `MAILER` switch", and (AD-19) "the owned sweep of expired `verification` rows … runs in `apps/worker` once it has a composition root".
- FR-17 mail needs the PM's address and locale, and FR-36 needs the recipient's. Both are `auth_user` columns. AD-23 (line 468): the Better Auth tables "are reached only through `packages/db/auth` … and by the owner-role seed and the … probe Tenants". AD-1: "In `apps/web` only the composition root imports it". Depcruise fails "any other app importing `packages/db` at all, `packages/db/auth` included". The worker today reads only `APP_DATABASE_URL` (`apps/worker/src/index.ts:15`).

**Construction:** The worker composition root's builder must either:

- add a `packages/db` repository that reads `auth_user.email` and `locale`, or deletes `verification` rows, which AD-23 forbids;
- build a whole `createAuth` in the worker (it needs `secret`, `baseURL`, `mailer`, `identityEvents`), which no carve-out names; or
- extend `IdentityPort` with a recipient lookup, which nothing mentions.

Three builders, three shapes.

The AD-19 sentence also contradicts itself: "runs in `apps/worker` once it has a composition root; until then it is undecided".

**Fix:** In AD-23, name the path by which the worker reads a recipient (address and locale) and deletes expired `verification` rows: a named `packages/db/auth` export the worker's composition root may import, or a pinned `packages/db` reader added to AD-23's "reached only through" list. Rewrite the AD-19 sentence as a decision or an open question, not both.

## F6 (MEDIUM): "loopback `BETTER_AUTH_URL`" as the deployment test blocks legitimate non-loopback dev, blocks any staging before `mailer-ses`, and does not reach the worker

**Evidence:** `LOOPBACK_HOSTS` is exactly `localhost`, `127.0.0.1`, `[::1]` (`config.ts:59`). Node parses `http://127.0.0.2`, `http://app.localhost` and a LAN IP as non-loopback (checked with `new URL(...).hostname`). CI uses `http://localhost:3101` (`ci.yml:301`), so CI is unaffected.

**Constructions:**

- **Phone or LAN testing, a dev container with a forwarded host, a remote dev box.** Better Auth's `trustedOrigins` is `[baseURL]` (`auth.ts:178`), so sign-in from another device needs `BETTER_AUTH_URL` set to that host. Then `MAILER=console` is refused and `MAILER=ses` throws. Because `webMailer()` runs inside `baseAuthOptions()`, which the middleware shares (`composition.ts:140-185`), no request succeeds. There is no third transport.
- **Epic 8 staging.** Staging has a non-loopback URL. Until `mailer-ses` exists, the web bundle cannot serve a single request. AD-18 forbids `mailer-ses` before the throttle. So "the first staging sign-in with real Google" (Deferred) waits on the throttle and `mailer-ses`, an ordering chain the spine never states. A builder planning Epic 8 in the order Deferred implies (IaC and first staging deploy first) hits a dead bundle, and the likely workaround is loosening the guard.
- **The worker.** AD-17 says the worker's mailer "follows the same `MAILER` switch". The worker reads no `BETTER_AUTH_URL`. It either gains a key it does not otherwise need, or runs `console` unguarded in production and prints PM addresses (FR-17) to CloudWatch.

**Fix:** Replace the host heuristic with an explicit profile key (for example `DEPLOYMENT=local|staging|production`, required, no default outside `pnpm dev`) that both roles read, and that `CLOCK_MODE` and `TRACKER_ADAPTER_OVERRIDE` reuse, as the spine already suggests. Or add an explicit opt-in (`MAILER=console-unsafe`) for non-loopback dev. State in AD-18 that no staging web bundle runs before `mailer-ses` and the throttle.

## F7 (MEDIUM): AD-23 says the throttle "pads or queues" the reset; AD-18 and Deferred say never queue. The allowed non-blocking shape is unnamed

**Evidence:**

- AD-23 reset bullet: "timing can tell them apart until the throttle work (Deferred) pads or queues it".
- AD-18: "Reset mail is sent inline from the request, never through a job". Deferred: "never by queueing the reset mail, which would hold a live token at rest".
- Better Auth has a third shape: `advanced.backgroundTasks.handler`. It is set once per instance, and `runInBackgroundOrAwait` hands the hook's promise to it instead of awaiting (`BA/context/create-context.mjs:215-224`). With Next's `after()` that sends the mail after the response, holds the token only in memory, and removes the timing gap without padding. Padding an inline SES send instead means every request waits for SES's slowest send. **[speculation: SES latency not measured]**

**Construction:** Epic 8's throttle builder reads AD-23 and queues. A reviewer holding AD-18 rejects it. A second builder uses `backgroundTasks`. That is neither "inline" nor "a job", and it routes hook failures to Better Auth's `logger.error` with the whole error, message included (`create-context.mjs:219-222`), unless the owed never-throw fix has landed. That breaks AD-16's name-only rule.

**Fix:** In AD-23, change "pads or queues it" to "pads it, or sends after the response in-process (Better Auth's `backgroundTasks`); never through a job". Say in AD-18 whether `backgroundTasks` counts as inline, and that it is only allowed after the never-throw fix.

## F8 (MEDIUM): user deletion has two sinks, and the step needs grants no role holds

**Evidence:**

- AD-14 counts "a user created or deleted" as an identity event that writes `identity_event`.
- AD-5's third exception is "the user-deletion step that removes a user's `identity_event` rows", and "each writes to a non-tenant `operator_audit` table".
- Open Questions: that user's rows go "through AD-5's third `maintenance` exception".
- The maintenance role holds nothing on `global` tables (`table-classes.ts:282-288`, `registry.test.ts:123-126`). The application role has no `DELETE` on `identity_event`.

**Construction:**

- **Unit A (lifecycle builder, AD-14):** records `user.deleted` in `identity_event`. That row, keyed by the deleted user id, is either deleted by the same step (so the event never persists) or left behind (NFR-D1 residue).
- **Unit B (AD-5):** records the deletion in `operator_audit` only.
- **Roles:** whichever unit is built, deleting `auth_user`, `account` and `session` needs the application role (or `db/auth`), and deleting `identity_event` needs `maintenance`. Two connections, not atomic.

**Fix:** In AD-14, exclude user deletion from identity events: it is a maintenance action recorded in `operator_audit`. In AD-5, state which role deletes the Better Auth rows in the same step, or that the step runs as the owner with the maintenance setting on.

## F9 (MEDIUM): AD-23's Prevents line still claims what the founder's "links survive a reset" decision gives up, and the deadline is unrecorded

**Evidence:**

- AD-23 Prevents: "…a reset that leaves an attacker's session alive". The rule now says "A reset keeps the user's provider links … it does not end access through a linked Google identity". An attacker holding the victim's linked Google account mints a new session the moment the reset ends the old one (`password.mjs:170-171` deletes sessions only; `link-account.mjs` signs an already-linked `sub` in).
- Round 1 asked for exactly this Prevents correction if links were kept.
- "Unlinking, and recording a link, land with account lifecycle before Epic 8's first deployment with real users": `deferred-work.md:669` has the gap but no deadline, and it is not on the Epic 8 deployment-blocker list next to the throttle. So nothing will hold the deploy for it.

**Fix:** Change the Prevents clause to "a reset that leaves an attacker's password session alive (a linked provider still signs in until account lifecycle; AD-23)". Add the deadline to the `deferred-work.md:669` entry, worded as the throttle's is ("a deployment blocker for Epic 8").

## F10 (LOW): stale surfaces and present-tense slips

- **Frontmatter `updated`** lists AD-1, 5, 14, 15, 16, 17, 18, 21, 23. It omits AD-19 (new Mail bullet) and the i18n convention.
- **AD-1 diagram:** no `APP → I18N` edge (F4).
- **Capability map:**
  - "NFR-A1 audit | `app/audit`, `operator_audit`" omits `identity_event`.
  - "NFR-S5 (document-only) … no separate mechanism in v1" is stale now that AD-23 carries NFR-S5's generic reply and the throttle.
  - No row names `MailerPort` or `mailer-*` (FR-3 reset, FR-17).
- **AD-21 classification bullet:** "Better Auth tables and `tenant_membership` → `global`" omits `identity_event`.
- **AD-23:** "mail sent outside a request (FR-17, FR-36) is rendered in that locale from `packages/i18n`" now contradicts "through `packages/app`'s renderer".
- **AD-23 reset bullet:** states invalidation and `email_verified` as guarantees, but AD-1 says the code owes the per-step `try`. Add "(code owed, AD-1)".
- **AD-21 per-entry bullet:** "makes it insert-only by grant and by trigger" (present). **AD-16:** "AD-17 refuses `MAILER=console`" (present). Both describe owed code as existing.
- **Deferred, "Who creates users":** still frames what proves ownership for magic link and Microsoft as open, while AD-23 now decides it ("redeems a token of this kind or does not set the flag").
- **Code comments that contradict the new AD-14 and are not in `deferred-work.md`:**
  - `table-classes.ts:31` "TWO PER-ENTRY EXCEPTIONS"
  - `identity_event`'s `why` ("happen before any Tenant exists", "an invitation acceptance later")
  - `repo-identity-event.ts:6-9` ("invitation acceptance records here too, never in `audit_log`")

**Fix:** Correct each sentence. Add one `deferred-work.md` line for the three code comments, to be fixed with the `appendOnlyGuard` task.

## F11 (LOW): round-1 lower-priority items dropped with no record

- The ALB access log and the token in `/reset-password?token=` (round-1 adversarial, lower-priority). AD-16's URL rule covers `pino` only.
- `identity_event.user_id` has no FK (`schema.ts:166-175`).

Neither appears in the memlog, Deferred or `deferred-work.md`.

**Fix:** Add both to Deferred, with Epic 8 (ALB logging config) and account lifecycle (FK with the NFR-D1 decision).

---

## Constructions tried that did not yield a live divergence

- **Story 1.5 roles.** It touches `tenant_membership` and `RequestContext` only. No interaction with `identity_event`, `email_verified` or mail.
- **Story 1.7's reader joining `identity_event`.** Fenced now: AD-21 forbids any Tenant-scoped reader, and the payload carries no Tenant data.
- **The composition root building the 1.9 renderer, and `db/auth` calling it.** Both are possible: the root imports `packages/app`, and `db/auth` takes the renderer as an argument. `user.locale` reaches both hooks (`findUserByEmail` and `findUserById` return additional fields). The only defect is the graph edge (F4).
- **Better Auth's reset route setting `emailVerified` itself.** It does not (`password.mjs:150-172`). Only the product's `onPasswordReset` does. Sign-up (`sign-up.mjs:172`, `emailVerified: false`), `/verify-email`, `/change-email` and `/update-user` are all in `DISABLED_PATHS` (`auth.ts:82-106`).
- **The OAuth link branch setting `emailVerified`** (`link-account.mjs:128`). Unreachable while `requireLocalEmailVerified: true`.
- **A hashed `storeIdentifier` silently breaking invalidation.** `tests/password-reset.test.ts:391` fails, because the first link would still work.
- **The loopback rule in CI.** `ci.yml:301` uses `http://localhost:3101`. `[::1]` parses to the set's `'[::1]'`.
- **Two auth instances drifting on the mailer, `now` or the writer.** `baseAuthOptions()` builds one value for both. `MAILER=ses` fails loudly in both.
- **Seed and probe Tenants after the trigger lands.** Both open `app.maintenance` before `TRUNCATE` or `DELETE` (`seed.ts:540-544`, `probe-tenants.ts:397-402`). Only `tests/password-reset.test.ts`'s `removeExtras` does not (F2).
- **The TRUNCATE guard for `identity_event`.** The generator already pairs row and statement guards. Keying `APPEND_ONLY`'s consumers (`generate.ts:272`, `registry.test.ts:257`, `rls.test.ts:476-483`) off the flag carries the pair over, apart from F2's grant.
- **`mailer-ses` changing `createAuth`'s signature.** `ResetMailer` is `send({to, subject, text})`, the same shape as `MailerPort` (`reset.ts:23-25`). An SES adapter fits it unchanged.

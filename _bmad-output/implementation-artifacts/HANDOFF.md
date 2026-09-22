# Handoff — 2026-09-22 (story 1.7 ready for review)

**Latest (2026-09-22): story 1.7 (The Tenant Admin can read the audit log) is implemented
on branch `story/1-7-the-tenant-admin-can-read-the-audit-log` — status `review`.** `listAuditLog`
is the first Tenant-Admin-only read (`projectScoped: false`); refusal is `not_found`. Payload
decode schemas live in `packages/app/src/audit/payloads.ts` (write harness imports them).
`IdentityPort.lookupUser` resolves actors and the top-bar chip (name or email · role); user menu
links Admins to `/admin/audit`. `audit_log` left `UNREACHED_TENANT_OWNED_TABLES`. Shared
`createLogger` (pino 10.3.1, AD-16 redact paths) in `packages/app`; ESLint bans
`dangerouslySetInnerHTML`. Probe suite `tests/audit-log.test.ts` (base ≥ 850_000_000). Deferred
L268 (`audit_log` reach), L427–430 / L489–491 (payload schemas, map partial), L590 (identity
lookup) recorded resolved / partial in `deferred-work.md`.

**Earlier (2026-09-22): story 1.6 merged via PR #40.** `project_default_rate_entry` is registered
append-only (24 tables / 17 tenant-owned); seed and `createProject` dual-write the first row at
yen 0 with `project.default_rate_jpy` as the live cache; `appendProjectDefaultRate` updates both.
`createResource` (`tenant_admin` | `pm`), `appendResourceRate` and `appendProjectDefaultRate`
(`tenant_admin` only) are audited use cases with role declarations (third shape: Admin|PM, no
Project). Domain `rateOnDate` / attribution accept optional `rate_seq_max` /
`project_default_rate_seq_max` pins; live unpinned default still reads the column. No Resources &
Rates UI. Probe suite `tests/resources-rates.test.ts` (base ≥ 830_000_000). Deferred L512–513 Rate
half resolved; `demo_anchor` remains for 1.8.

**Earlier (2026-09-22): story 1.5 (roles decide what each person can reach) is implemented and
reviewed.** Declared-roles helper in `packages/app/src/authz/authorize.ts` (`authorize` /
`reachesProject`): every use-case export declares roles; membership and Organisation writes are
`tenant_admin` only (role check before parse); Project reads and Plan/Mapping writes are
`tenant_admin` | `pm` plus Project reach (a Tenant Admin's `projectIds` are never a limit). Refusal
is always `not_found`. Mechanical gate: `tests/role-declarations.test.ts` — enumeration of
`USE_CASE_ROLES` (pinned by an inline snapshot) plus a behavioural check that every export, called
as a viewer with throwing deps and malformed input, answers `not_found` without touching a port, and
that every export not declared for `pm` refuses a PM the same way. Two code reviews applied (spec
"Review Findings" and "second pass"). Open from the review: project writes can name another
Project's Tickets or WPs (`deferred-work.md`); `/` still redirects to `prj-ec2`, which a PM not
assigned it now meets as `not_found`; AD-23's "until story 1.5 … check `tenant_admin` themselves" and
the matching `epic-1-context.md` line are stale and need a spine amendment.

**Earlier (2026-09-22): story 1.4 slice 4 (password reset) is implemented.** A new `MailerPort`
(`packages/app/src/ports/mailer.ts`), satisfied by `mailerConsoleOn` (`packages/adapters`,
`MAILER=console` by default; `ses` is accepted in config but fails at the composition root until
Epic 8) and handed to `createAuth` as an argument, exactly as `google` is. `packages/db/auth`
gained `reset.ts` (the pure link and mail-copy builder) and two callbacks on `emailAndPassword`
(`sendResetPassword`, `onPasswordReset`) plus two pinned settings (`resetPasswordTokenExpiresIn:
3600`, `revokeSessionsOnPasswordReset: true`) and two bindings (`requestPasswordReset`,
`resetPassword`), both server actions only — `/request-password-reset` and `/reset-password` stay
in `DISABLED_PATHS` and 404 over HTTP, unchanged. A new global, insert-only `identity_event` table
(`packages/db/src/schema.ts`, `table-classes.ts` — 23 tables now) records a completed reset (never
a request, to avoid a write amplifier on an unauthenticated, enumerable endpoint); a Google-only
user gets no mail and no account row. `apps/web` gained `/forgot-password` and `/reset-password`
(public, server actions, one generic answer/refusal each — NFR-S5), and a "Forgot your password?"
link from `/sign-in`. One generic answer covers a known email, an unknown one and a Google-only
account alike; a mailer failure is logged without the address and the request still answers as on
success. The suite is **758 tests across 43 files** (verified locally in this session against a
native Postgres 16, since Docker was unavailable in the sandbox — CI's `postgres:18.6-alpine`
service should be re-verified once a session has Docker again). Two of the acceptance criteria's
six sabotages were caught as real pass→fail transitions: `revokeSessionsOnPasswordReset` removed
(a session survives the reset) and `identity_event` granted UPDATE (caught by both the registry
assertion and the SQL-drift check). **Correction (post-implementation review, 2026-09-22): the
other four were mis-modelled or already true regardless.** `resetPasswordTokenExpiresIn` removed
changes no behaviour (Better Auth's own default is already 3600 s); `/reset-password` added to
`SERVED_AUTH_ENDPOINTS` alone still 404s (`DISABLED_PATHS` blocks it independently); "the generic
sentence replaced by a distinguishable one" is asserted by no test today. Most notably: **the
boundary's lowercasing is NOT load-bearing** — Better Auth lowercases the address itself inside
`findUserByEmail`, and the integration test hands the binding an upper-cased email and still
expects mail. Removing `.toLowerCase()` from the `forgot-password` action changes no observable
system behaviour; only `.trim()` matters, and the one test that fails on its removal
(`forgot-password/actions.test.ts`) is pinning the call shape, not a real security boundary. See
the spec's own Spec Change Log and Review Triage Log for the full accounting; do not read the
sabotage table above as six independently-verified guarantees. `next build` succeeds and both
routes compile and render as dynamic routes. Manual browser verification of `/forgot-password`
and `/reset-password` under `next dev` was completed 2026-09-22: sign-in → forgot link → submit →
console mail → reset with token → sign-in with the new password landed on `/p/prj-ec2/review`.
Re-seed after that check to restore the demo password.

**Earlier (2026-09-22): story 1.4 slice 3 (Google sign-in) is merged (PR #32)**
(`spec-1-4-google-sign-in.md`, `done`: two adversarial spec rounds, one code review), and the
spine is amended to match it (two adversarial rounds, rubric and tech-currency reviews).
Google is one OIDC provider discovered from an issuer URL — a fake in-repo provider
(`tests/support/fake-oidc.ts`, `pnpm fake-oidc`) locally and in CI — off unless
`AUTH_GOOGLE=on`, linking by verified email to existing users only. The suite is
**722 tests across 38 files** (678 across 36 before); the seven sabotages in the spec's acceptance criteria were
each watched to fail. What remains for story 1.4 is slice 4 (password reset), then the
whole-story code review.

**Earlier (2026-09-21, fourth session): story 1.4 slice 2 is merged.** A Tenant
Admin can revoke a membership, change its role, and assign or unassign a PM's
Projects — four audited use cases; a revoked user is signed out on their next
request. The suite is **678 tests across 36 files**. Story 1.4 stays
`in-progress` — slices 3 (Google) and 4 (password reset) remain. **The next
session builds slice 4, or slice 3 once the founder decides on OAuth
credentials** — see "Next, in order".

**Earlier the same day (third session): story 1.4 slice 1 was merged.** People sign
in with email + password; every request resolves a `RequestContext` from its
session and the `tenant_membership` bridge, and the audit actor is the signed-in
user. The suite is **570 tests across 34 files**. Story 1.4 is still
`in-progress` — slices 2–4 remain. **The next session builds story 1.4 slice 2**
— see "Next, in order".

Two earlier sessions are covered below. **2026-09-20** took the project from "planning
finished, no CI, 46 tests" to "three build slices merged, six CI gates, 123
tests, tenant isolation enforced in the database". **2026-09-21** added the
cross-tenant harness — **NFR-S1 is discharged** — finished every unblocked
slice of story 1.2 (reads and writes onto `packages/app` use cases,
**dependency-cruiser on**, exact arithmetic and one codec, the `apps/web →
domain/present` edge decided), and then built **story 1.3 end to end**: the
audit mechanism (PR #23), the organisation hierarchy (PR #24), and a four-layer
code review whose nine fixes are PR #25. **Story 1.3 is `done`.** The suite is
**510 tests across 29 files**. Story 1.2 is left with only its blocked watermark
slice. **The next session starts story 1.4** — see "Next, in order".

---

## Where the plan stands

**Planning is closed.** OQ-10, OQ-11 and OQ-12 are all resolved in the PRD.

- R0 is sized at **1,180 h across 70 stories**, range 826–1,652.
- The date for §8.1 is **2027-04-14**, range 2027-02-12 … 2027-07-06, at a
  founder capacity of **40 h/week**.
- The frozen 36-FR list was **re-affirmed in full** — the founder raised
  capacity rather than cut, because the entire §8.3 cut order is worth 9 % of
  R0 and doubling capacity is worth 50 %.
- **R1's Q1 2027 date is withdrawn** and carries no replacement. The §8.1 gate
  needs four consecutive weekly Reviews *after* R0 is in use, so the earliest
  gate pass is 2027-05-12 — already Q2 — and R1 has never been sized.

### The date-slip rule, which someone must actually run

PRD §6 replaced the old cut trigger. The measured quantity is **`E` = estimated
hours closed per week**. The plan needs `E` = 40; the 2027-07-06 upper bound
needs `E` ≥ **28.6**.

- **First checkpoint: Epic 1 closing, or 2026-11-15, whichever comes first.**
  At plan velocity Epic 1 (156 h) closes 2026-10-17. If `E` < 28.6, re-derive
  the R0 date and bring it back to §8.1 **before story 2.1's migration is
  written** — 2.1 spends the expand/contract exemption once.
- **Monthly from 2026-11-01**: append one line to PRD §13 with the stories
  closed and hours worked. Any two consecutive months both below 28.6 fire the
  §8.3 cut order at item 0.

**Caveat on the first reading.** Story 1.1 slice A took about two hours against
a 24 h estimate for the whole story, but do not read that as velocity: most of
the work was investigation and review rather than typing, and all three
breakages were things the plan had not anticipated. Slice B1 and B2 were closer
to their share. Track upgrade-style work separately from feature work.

---

## What is built

| PR | What |
|---|---|
| #5 | Sprint planning: OQ-12 closed, `sprint-status.yaml` generated |
| #6 | CI created from nothing |
| #7 | Story 1.1 slice A — toolchain to the decided stack |
| #8 | Persistence round-trip test |
| #9 | Story 1.1 slice B1 — workspace skeleton, config port, clock fence |
| #10 | Story 1.1 slice B2 — pg-boss on separated database roles |
| #11 | `.nvmrc`, plus two decisions recorded where they bind |
| #12 | Story 1.2 slice 1 — table-class registry, RLS, `withTenant` |
| #13 | Handoff for the next session |
| #14 | Story 1.2 slice 2 — the cross-tenant harness; **NFR-S1 discharged** |
| #15 | Sprint-status correction and handoff |
| #16 | Story 1.2 slice 3 — the seven read call sites onto `packages/app` use cases |
| #17 | Slice 3's AC-2/AC-5 wording; AD-1's composition-root carve-out |
| #18 | Story 1.2 slice 4 — the five writes onto use cases; **dependency-cruiser on** |
| #19 | AD-1 states what the gate enforces and what it does not; rules narrowed to the carve-outs |
| #20 | Story 1.2 slice 5 — exact arithmetic (`bigint`, `Ratio`, `compareRatio`) and the one jsonb codec |
| #21 | `apps/web` imports `domain/present` only; Client View and Mapping reads; AD-1/AD-4/AD-12 amended |
| #22 | Handoff |
| #23 | Story 1.3 slice 1 — the audit mechanism: one tenant transaction per write, `audit.record`, closed `AUDIT_ACTIONS`, the audited-use-case gate |
| #24 | Story 1.3 slice 2 — `program`, eight audited org writes (`before`/`after`), `Clock` and UUIDv7 id ports; AD-1: the composition root may import `packages/adapters` |
| #25 | Story 1.3 code review — nine fixes (monotonic UUIDv7, seed truncate gate, whole-Tenant write checks, full `project.create` audit, indexes); this handoff |
| #26 | Story 1.4 slice 1 spec |
| #27 | Story 1.4 slice 1 — Better Auth tables + `tenant_membership`, `@momo/db-auth`, `RequestContext`/`resolveRequestContext`, email + password sign-in, Node middleware; AD-1/AD-15 amended |
| #28 | Handoff after story 1.4 slice 1 |
| #29 | Story 1.4 slice 2 — revoke, change role, assign/unassign a PM's Project as audited use cases; one writer of `tenant_membership` with one ordered lock; the last Tenant Admin protected |
| #30 | Handoff after story 1.4 slice 2 |
| #31 | AD-21/AD-23 — the membership bridge's one writer (spine) |
| #32 | Story 1.4 slice 3 — Google sign-in: one `genericOAuth` provider from an issuer URL, off unless `AUTH_GOOGLE=on`, link-never-create by verified email, provider-aware allowlist, two auth instances, the in-repo fake OIDC provider (`pnpm fake-oidc`) |
| #33 | AD-1/AD-15/AD-16/AD-17/AD-23 spine amendment for Google sign-in; `epic-1-context.md` regenerated; handoff |
| #34 | Story 1.4 slice 4 — password reset: `MailerPort`/`mailer-console`, global insert-only `identity_event`, `sendResetPassword`/`onPasswordReset`, `/forgot-password` + `/reset-password`; whole-story review of 1.4 (five passes); 1.4 `done` |
| (next) | AD-1/5/14/15/16/17/18/19/21/23 spine amendment for password reset and `identity_event`; `epic-1-context.md` regenerated; this handoff |

**CI has ten steps**, all watched to fail before being trusted: lint (the
clock/env fence, the tenant bans, and AD-4's arithmetic fences — rounding only
in `domain/present`, `JSON.stringify` only in the codec), three typechecks,
**dependency-cruiser** (no database), a Postgres 18.6-alpine service, a prepare
step (schema → pgboss roles → RLS/grants/triggers → seed), and the suite.
**722 tests across 38 files**, up from 46 across 3. The gates report and do not
block (no branch protection on a private free-plan repo).

**The import direction is gated.** `.dependency-cruiser.cjs` fails on: Drizzle
in any `apps/*` file; `packages/db` from `apps/web` except the composition root
(`apps/web/src/server/composition.ts`) and `packages/db/auth`; `packages/db`
from any other app; `packages/adapters` from any `apps/*` file but the composition
root, and from `packages/app|domain|db` at all; `better-auth` anywhere but
`packages/db/auth`, and `packages/db/auth` from any `apps/web` file but the
composition root; `apps/web` importing any `packages/domain` module but
`present/index.ts`; `tests/support/` from `apps/` or `packages/`; the AD-1 scheduling edges (forward-looking); and any import
it cannot resolve. What it does not enforce yet is listed in AD-1 and tracked in
`deferred-work.md` — the worker's `pg-boss`/`pg`, package-to-package
directions, raw `pg` in `apps/web`, and pages' own `bigint` arithmetic.

**Numbers are exact until presentation (AD-4).** `Mh`/`Jpy` are `bigint` from
the row to `domain/present`; every ratio is an unreduced `Ratio`, compared to a
threshold only through `compareRatio`; `domain/present/codec` is the one path
for `jsonb`. `tests/lint-fences.test.ts` proves the lint fences still fire.

**Every audited change is recorded in its own transaction (AD-14).** A write use
case opens exactly one tenant transaction through `TenantTransaction`
(`packages/app/src/ports/tenant-transaction.ts`, satisfied by `packages/db`'s
`inTenantTransaction`); the change and `audit.record(scope, stamp, action,
target, payload)` run in that scope, so a rolled-back change leaves no audit
row. `AUDIT_ACTIONS` (`packages/app/src/audit`) is closed — six Disposition/
Mapping actions, then eight org actions — and refused on every path.
`tests/audited-use-cases.test.ts` enumerates the use-case surface with no
database; Postgres rollback tests prove the rule for real. Org writes stamp
`at` from the `Clock` port; project writes still use the Project's
`demoAnchor` (tracked).

**Tenant isolation is real**, verified directly in SQL: as the application role
with no tenant set a read returns 0 rows, with the right tenant 1, with a wrong
tenant 0. `FORCE ROW LEVEL SECURITY` is on for the 16 tenant-owned tables.

**And it is now proved at the use-case level, not only the table level.**
`tests/cross-tenant.test.ts` seeds two probe Tenants — each a
bijectively relabelled copy of the demo dataset — and
drives every read use case against both as the restricted role. The covered set
is read off the read surface's module namespace, so an exported read with no
registry entry fails **with no database at all**, naming it. Reach is measured
with a query logger: 14 of the 16 tenant-owned tables; `program` and
`audit_log` are declared unreached with reasons, and either direction of change
fails the build.

**Every request is signed in (story 1.4 slice 1).** The four Better Auth tables
(`auth_user`, `session`, `account`, `verification`) and `tenant_membership` are
`global`, with no RLS; the registry flags `tenant_membership` as the one table
carrying `tenant_id` without a policy, and gives the app role DML on the four
Better Auth tables only. `resolveRequestContext` (`packages/app/src/authz`)
reads the session through `IdentityPort` and the bridge through its one reader
(`membershipsOf`, pinned by `source-discipline.test.ts`), deletes a session
whose active Tenant has no membership, picks and persists a single membership,
and answers `no_access` for zero or several. The composition root resolves it
once per render (React `cache()`); a server action resolves once and passes it
down; there is no constant Tenant or actor left in `apps/web` (a text-scan test
pins that). A Node-runtime `middleware.ts` slides the session (8 h idle,
`updateAge` 5 min, cookie cache off) and redirects to `/sign-in`. The route
handler serves `/get-session`, `/sign-out`, `/sign-in/email` and 404s the rest.
Demo users `linh` (PM) and `hoang` (Tenant Admin) are seeded with fixed UUIDv7
ids and the password from `SEED_DEMO_PASSWORD`. Verified in a real browser
against `next start`, including `next build`.

**Access can be taken away (story 1.4 slice 2).** `revokeMembership`,
`changeMemberRole`, `assignMemberProject` and `unassignMemberProject`
(`packages/app/src/use-cases/membership-writes.ts`) each require `tenant_admin`
in the context — checked before any parse, answering `not_found` — and run
through `runAuditedWrite` with four new `AUDIT_ACTIONS` (`membership.*`,
target = the member's user id, previous value recorded). The one writer,
`packages/db/src/repo-membership-write.ts` (the `membership` family of the write
scope), filters every statement by `tenant_id` itself (the bridge has no RLS)
and takes **one ordered `FOR UPDATE` statement** — the Tenant's admin rows plus
caller and target, by `user_id` — so concurrent writes queue instead of
deadlocking. Inside it the caller must still be an admin (a context resolved
once per action can be stale), the target must exist, and the last Tenant
Admin can be neither revoked nor demoted (`last_tenant_admin`). Revocation
deletes the row; the resolver then ends the session on the next request (a
session with no active Tenant yet answers `no_access` instead). The app role
holds SELECT, UPDATE, DELETE on the bridge — no INSERT: adding someone is
invitation work. No screen yet; four bindings wait in the composition root.
Story 1.5 replaced the local `tenant_admin` pre-check with the declared-roles
helper; the in-transaction lock re-check stays.

---

## The pattern that mattered most, and should continue

Four times across two sessions a gate looked green and proved nothing. **Reading
the diff never found one of them. Deliberate sabotage found every one.**

| Slice | What passed that should not have |
|---|---|
| B1 | The ESLint fence had four holes: `Date()` without `new`, `process` aliasing, `.js`/`.mjs` files entirely, and warnings that could never fail CI |
| B2 | Changing the worker to connect as the **superuser** passed typecheck and all 56 tests — the composition root was never executed |
| 1.2 | Setting the ledger's policy to `USING (true)`, leaking every tenant's money, left **all 96 tests passing** |
| 1.2 s2 | `USING (true)` on `baseline_wp` leaked every Tenant's rows into the process and **all twenty** harness assertions stayed green |
| 1.4 s2 | The revoked-member cleanup could be deleted with every test green: `beforeEach` restored the memberships before cleanup ran; and a PM-context harness made the cross-tenant write check pass on the role refusal alone. Both found by review, not by sabotage of the code under test |
| 1.4 s1 | depcruise's `exclude: dist` dropped every edge into `better-auth`'s `dist/`, so `better-auth-only-in-db-auth` could **never** fire; found by the adversarial review of the spine amendment, fixed by narrowing `exclude` to our own build output |

**So: after adding any gate, break the thing it guards and watch it fail.** The
CI header and each spec's Verification section record the probes that have been
run; keep adding to them rather than trusting a green check.

**And one sharper rule, learned on 2026-09-21 at the cost of a real finding:
when a gate covers a CLASS of things, sabotage every member, not a
representative.** Four reads in `repo.ts` carry no `WHERE` at all. Sabotaging
one of them (`actuals_ledger_entry`) failed six assertions and looked like
proof for all four. It was not: `baseline_wp` and `rate_entry` are re-filtered
in memory by a key that differs per Tenant, so a wide-open policy on either
left every assertion green. That is why the harness now also asserts isolation
at the table level, over the set the query logger **measures** the use cases
reading.

---

## Next, in order

### 1. Story 1.4 is `done`; its spine amendment has landed

PR #34 carried slice 4 and the whole-story review (five passes, ~53 patches); `sprint-status.yaml`
has 1.4 `done`. The deferred spine amendment then landed (docs PR `docs/spine-identity-event-reset`):
AD-1/5/14/15/16/17/18/19/21/23 and the i18n convention now describe `MailerPort`, `createAuth`'s
`mailer`/`now`/`identityEvents`, password reset, and the global insert-only `identity_event`, after a
rubric, a tech-currency and three adversarial rounds (`reviews/review-*-identity-reset*.md`).
`epic-1-context.md` was regenerated from it. Founder decisions taken in that update (memlog):
`identity_event` gets AD-5's guard through a new per-entry `appendOnlyGuard`; its event is a named
best-effort exception to AD-14 (`onPasswordReset` only); identity events are defined by subject, and a
membership change (invitation acceptance included) is an audited use case writing `audit_log`;
`packages/db/auth` owns Better Auth's hooks, English mail until 1.9 moves rendering to `renderMail`
in `packages/i18n`; a required `DEPLOYMENT=local|staging|production` refuses console mail and
fixture modes outside `local`; a reset keeps provider links (unlink before Epic 8's real users);
`email_verified` has a written meaning and a named writer list.

**Small code debt the amendment recorded** (`deferred-work.md`, "Deferred from: spine amendment for
story 1.4 slice 4"): `appendOnlyGuard` on `identity_event` and the per-step `try` in the reset hooks
landed 2026-09-22 (see that file's `resolved` lines). Still open: the `DEPLOYMENT` key (before
Epic 8's first staging deploy); mail logging through `pino` goes with `mailer-ses`.

### 1b. Story 1.5 — roles decide what each person can reach — DONE

Merged 2026-09-22 (PR #37 helper/gate; PR #38 spine; PR #39 wpId + reach gate). See "Latest"
history above for what it does.

Deferred from slice 1 still open: `/` redirects everyone to
`/p/prj-ec2/review`; the middleware may answer an expired session's
server-action POST with a 307 (unverified); the sign-in action has no rate
limit; the top bar shows the role, not the user's name (1.7).

### 2. Story 1.2's watermark slice — blocked

Advisory locks before `seq` allocation. Needs Epic 2 and Epic 5's writers.

### 3. Story 1.1 slice B3

`pnpm dev` in one command. Blocked on **story 2.1's migration**.

### 4. Then the rest of Epic 1

Stories 1.7 through 1.9 (1.6 is `done` on `main`). Epic 1 is 156 h and is the calibration point for the
whole estimate — its closing is the first date-slip checkpoint (above).

What story 1.3 left, in `deferred-work.md` (**148 entries** now): the
Program-within-Department rule is held by use cases and row locks, with no
foreign key and no concurrency test; `audit_log.at` mixes fixture and wall time;
the audited-use-case gate trusts declarations rather than NFR-A1's list;
`apps/worker` has no composition root yet (it needs one for story 1.8's fixture
clock); CI never runs `next build` (it passed locally for story 1.4 slice 1).

---

## Standing decisions

- **Node**: `.nvmrc` = 24.21.0, CI reads it via `node-version-file`. No
  `engines` — an exact pin would refuse to install on the founder's 24.13.0.
- **Branch protection**: off. GitHub refuses it on a private repo on a free
  plan, so the nine gates **report and do not block**. Revisit when a second
  person can merge. Recorded in the CI header.
- **The hardcoded DSN fallback**: removed in story 1.2, as decided.
- **Connector order after R0**: Jira first, Redmine after. Revisit 2027-01-01.
- **A second AD-1 carve-out**, decided 2026-09-21 and written into
  ARCHITECTURE-SPINE's AD-1 the same day (after an adversarial review that
  narrowed a first draft): `apps/web/src/server/composition.ts` is the only
  file under `apps/web` permitted to import `packages/db`, it exports use-case
  bindings only, `apps/worker` has no such file, and `tests/` sits outside the
  AD-1 graph. The dependency-cruiser rule names that exact path. Amending the
  spine makes the cached `epic-1-context.md` stale, so the next `/bmad-build`
  recompiles it.
- **`apps/web → packages/domain` is allowed for `domain/present`'s entry
  module only**, decided by the founder 2026-09-21 and recorded in AD-1: pages
  import formatters and presentation types, never computation; figures needing
  domain rules arrive from a use case. `present/index.ts`'s export list is
  pinned by a test.
- **The dependency-cruiser gate takes AC-6's wording, not full AD-1.** It bans
  `apps/*` importing a repository or Drizzle. Full AD-1 would also flag
  `apps/worker`'s `pg-boss` and `pg` and drag the queue-adapter move into
  `packages/adapters` with it — the day-one-red the epic warns about. The
  uncovered half is recorded in `deferred-work.md`.
- **`sprint-status.yaml` records a story `in-progress` until every slice of it
  is done**, corrected 2026-09-21. Build's own step-05 marks a story `review`
  when a slice finishes, which for a multi-slice story is wrong and made the
  status view recommend a code review of unfinished work. Stories 1.1 and 1.2
  were both showing `review` with slices outstanding.
- **All three constraint types stay in R0**; the critical path is the
  minimum-Float chain.
- **The composition root may also import `packages/adapters`** (founder,
  2026-09-21, AD-1 amended after two adversarial rounds) to wire the `Clock`
  and the UUIDv7 id generator; ids take their millisecond from the Clock and
  keep a monotonic counter. `apps/worker` gets its own named composition root
  the day it first needs an adapter.
- **Story 1.3 decisions (founder, 2026-09-21)**: no Organisation UI until
  sign-in and roles exist; PM assignment belongs to 1.4/1.5; no deleting or
  archiving org units, no name-uniqueness rule; new Projects take documented
  defaults (`NEW_PROJECT_DEFAULTS`) for columns later stories own, including a
  default Rate dual-writes `project_default_rate_entry` (story 1.6).
- **Story 1.4 decisions (founder, 2026-09-21)**: split into four slices (1
  identity + context + email/password, 2 revocation and membership writes, 3
  Google, 4 password reset); the seed creates `linh` (PM) and `hoang` (Tenant
  Admin) with the password from a required `SEED_DEMO_PASSWORD`, and there is no
  provisioning script yet; a user with zero or several memberships signs in but
  sees "no access" until a tenant switcher exists; every route but `/sign-in`,
  `/no-access` and `/api/auth/*` requires sign-in, `/c/` included (a PM/Admin
  preview until OQ-8); `@momo/db-auth` exports a factory and the composition
  root builds the one instance lazily; Better Auth's own `Date` is a named AD-15
  exception; the sign-in rate limit is deferred on purpose.
- **Story 1.4 slice 2 decisions (founder, 2026-09-21)**: the membership use
  cases require `tenant_admin` (a local check ahead of 1.5, `not_found`
  otherwise — replaced by 1.5's declared-roles helper); the last Tenant Admin cannot be revoked or demoted; adding a user
  to a Tenant is invitation work, so no INSERT grant; no Users screen yet.
- **Story 1.4 slice 4 decisions (founder, 2026-09-22)**: identity events that happen before any
  Tenant exists (a password reset today; later a link, an unlink, an invitation acceptance) land
  in one new global, insert-only `identity_event` table, never in `audit_log` or an
  `operator_audit`; a completed reset sets `email_verified` (redeeming a mailed token is what
  proves the address), written from `onPasswordReset` before session revocation; the sign-in
  throttle stays deferred to Epic 8, so R0 runs unthrottled locally; `mailer-console` is the only
  mailer this release ships, with `mailer-ses` moving to Epic 8 where the AWS account exists to
  test it against.

---

## Open, and genuinely waiting

- **OQ-2** — do the five target Backlog spaces expose actual hours? The note
  said "check the 5 spaces this week", written 2026-09-20. Epic 5's fixtures
  should be re-recorded once known. Does not block.
- **OQ-3** — which client specifically. Contract type decided (準委任/labo).
- **OQ-4** pricing, **OQ-5** AI provider, **OQ-7** competitive watch (re-check
  2026-12-01), **OQ-8** client sign-in, **D2** the 30 UX assumptions.
- **Google refusal URL disclosure** — Better Auth appends `error=signup_disabled`
  vs `error=account_not_linked` to `/sign-in?google=refused`, which tells a visitor
  whether an email has an account. Decide with the NFR-S5 check sheet (Epic 8).

---

## Environment notes

- Postgres `18.6-alpine` runs in `infra/docker-compose.yml` on host port
  **55433**; volume `infra_momo-pgdata` persists.
- Local commands need both variables — there is no fallback any more:
  ```
  export DATABASE_URL='postgres://momo:momo@localhost:55433/momo_keikaku'
  export APP_DATABASE_URL='postgres://momo_app:momo_app@localhost:55433/momo_keikaku'
  ```
  `REQUIRE_DB=1` additionally turns an unreachable database into a failure
  rather than a skip, which is what CI sets.
- Since story 1.4 the seed also needs `SEED_DEMO_PASSWORD` (8+ characters), and
  the web process `BETTER_AUTH_SECRET` (32+) and `BETTER_AUTH_URL`
  (`http://localhost:3101`); `SESSION_IDLE_TIMEOUT_HOURS` is optional (default
  8). A shell without `apps/web/.env.local` sourced runs the DB suites as
  file-level failures, not skips, under `REQUIRE_DB=1` — `set -a; .
  apps/web/.env.local; set +a` first. The tests that build an auth instance take their own values. The local
  seed password in use is `momo-demo-2026`; sign in as
  `linh@momo-digital.example` or `hoang@momo-digital.example`. Re-seeding
  truncates `session`, so everyone is signed out.
- A database created before story 1.4 needs `DROP TABLE IF EXISTS app_user`
  before `drizzle-kit push`, which otherwise stops on an interactive rename
  prompt. README-DEMO.md has the full steps.
- `.claude/launch.json` starts the web app on 3101 for the agent harness. It
  reads `apps/web/.env.local` (gitignored) for the database URLs and the Better
  Auth pair; create it if it is missing.
- The agent does not type passwords into a browser: a real-browser sign-in
  check needs the founder at the keyboard for that one step.
- A shell without `pnpm` needs `corepack enable` once; `packageManager` pins
  pnpm 12.4.2.
- If Postgres is not answering on 55433, Docker Desktop may be stopped: start it,
  then `pnpm db:up`. After a schema change, re-run the prepare steps
  (`drizzle-kit push --force`, `pnpm db:policies`, `pnpm seed`).
- A PreToolUse hook blocks `git commit` in any Bash command that also contains
  an `-n` flag (it reads it as `--no-verify`); run `grep -n`/`sed -n` separately.
- **The local clone goes stale**: work lands via PRs merged from other
  sessions. `git fetch` before measuring anything, or a stale ref reads exactly
  like a missing artifact.

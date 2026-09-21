# Handoff — 2026-09-21 (updated at the end of the 2026-09-21 session)

State at `main` = the merge of PR #25 (story 1.3's code-review fixes), on top of `625d2c5`.

Two sessions are covered. **2026-09-20** took the project from "planning
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

**CI has ten steps**, all watched to fail before being trusted: lint (the
clock/env fence, the tenant bans, and AD-4's arithmetic fences — rounding only
in `domain/present`, `JSON.stringify` only in the codec), three typechecks,
**dependency-cruiser** (no database), a Postgres 18.6-alpine service, a prepare
step (schema → pgboss roles → RLS/grants/triggers → seed), and the suite.
**510 tests across 29 files**, up from 46 across 3. The gates report and do not
block (no branch protection on a private free-plan repo).

**The import direction is gated.** `.dependency-cruiser.cjs` fails on: Drizzle
in any `apps/*` file; `packages/db` from `apps/web` except the composition root
(`apps/web/src/server/composition.ts`) and `packages/db/auth`; `packages/db`
from any other app; `packages/adapters` from any `apps/*` file but the composition
root, and from `packages/app|domain|db` at all; `apps/web` importing any `packages/domain` module but
`present/index.ts`; the AD-1 scheduling edges (forward-looking); and any import
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
with a query logger: 14 of the 16 tenant-owned tables; `app_user` and
`audit_log` are declared unreached with reasons, and either direction of change
fails the build.

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

### 1. Story 1.4 — sign in, and be revoked (start here, in a new session)

Run `/bmad-build story 1.4 — Sign in, and be revoked`. The story is at
`epics.md:575`; its estimate and dependencies are in
`oq12-sprint-planning-2026-09-20.md`. `epic-1-context.md` is current as of
PR #24 (the spine has not changed since), so Build should load it rather than
recompile — check the freshness rule anyway.

What it has to deliver (AC summary): Better Auth's `user`, `session`,
`account`, `verification` tables as class `global` (exempt from FORCE-RLS),
reached only through `IdentityPort` implemented by `packages/db/auth` (AD-1
carve-out 1, today an empty skeleton `@momo/db-auth`); `tenant_membership` as
the one non-RLS bridge, read only by `resolveRequestContext`, which validates
the session's explicit `activeTenantId` **on every request**; idle timeout
(default 8 h) with the Better Auth cookie cache **disabled**, so revocation and
expiry bite on the very next request; revocation as an audited `app` use case,
never a write through the auth adapter; email + password and Google only;
password reset through a mail port (console mailer locally).

What exists that it builds on, and what it replaces:
- **`UseCaseContext` is `{ tenantId }`** (`packages/app/src/use-cases/context.ts`),
  built once in `composition.ts` from `DEMO_TENANT_ID`; the audit actor is
  `WEB_ACTOR = 'user:linh'` beside it. `RequestContext { tenantId, userId, roles,
  projectIds, locale }` (spine AD-12) replaces both — every use case and both
  harnesses construct a context today, so budget for that ripple.
- **The legacy `app_user` table** (seeded `user-linh` pm, `user-hoang`
  tenant_admin) is declared unreached in the harness; 1.4 replaces it with the
  identity tables plus `tenant_membership`, and the reach entry must come out.
- **PM assignment moved here from 1.3** (founder decision 2026-09-21):
  `tenant_membership.project_ids` is its home; role reach itself is 1.5's. It
  is audited ("role changes" on NFR-A1) — add its action to `AUDIT_ACTIONS`.
- **The audit mechanism, `Clock` and id ports are ready**: new audited writes
  (revocation, membership changes) go through `runAuditedWrite`; add a scope
  family to `inTenantTransaction` for identity/membership repositories.
- **Local-run traps already decided** (epic context): configure Better Auth's
  Next cookies plugin or session cookies are silently never set; export
  next-intl middleware from `proxy.ts`.

Expect Build's gates to ask the founder: how to slice it (identity tables +
`resolveRequestContext` first, then sign-in methods, then revocation/reset is a
natural split); Google OAuth credentials for local and CI (a test double, or
real client ids?); and whether the mail port lands here or with Epic 8's SES.

### 2. Story 1.2's watermark slice — blocked

Advisory locks before `seq` allocation. Needs Epic 2 and Epic 5's writers.

### 3. Story 1.1 slice B3

`pnpm dev` in one command. Blocked on **story 2.1's migration**.

### 4. Then the rest of Epic 1

Stories 1.5 through 1.9. Epic 1 is 156 h and is the calibration point for the
whole estimate — its closing is the first date-slip checkpoint (above).

What story 1.3 left, in `deferred-work.md` (**130 entries**): the
Program-within-Department rule is held by use cases and row locks, with no
foreign key and no concurrency test; `audit_log.at` mixes fixture and wall time;
the audited-use-case gate trusts declarations rather than NFR-A1's list;
`apps/worker` has no composition root yet (it needs one for story 1.8's fixture
clock); CI never runs `next build`.

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
  default Rate of 0 until story 1.6.

---

## Open, and genuinely waiting

- **OQ-2** — do the five target Backlog spaces expose actual hours? The note
  said "check the 5 spaces this week", written 2026-09-20. Epic 5's fixtures
  should be re-recorded once known. Does not block.
- **OQ-3** — which client specifically. Contract type decided (準委任/labo).
- **OQ-4** pricing, **OQ-5** AI provider, **OQ-7** competitive watch (re-check
  2026-12-01), **OQ-8** client sign-in, **D2** the 30 UX assumptions.

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
- `.claude/launch.json` starts the web app on 3101 for the agent harness. It
  reads `apps/web/.env.local` (gitignored) for `DATABASE_URL` and
  `APP_DATABASE_URL`; create it with the two lines above if it is missing.
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

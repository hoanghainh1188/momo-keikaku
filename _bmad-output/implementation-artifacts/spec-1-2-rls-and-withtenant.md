---
title: 'Story 1.2 slice 1 — the table-class registry, RLS that actually applies, and withTenant'
type: 'feature'
created: '2026-09-20'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '4ca78781bc464c30b9f0144709f3e66f28d9b82d'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Tenant isolation is remembered in application code, so one missed `WHERE` clause shows another organisation's project. Nothing in the database prevents it.

**Approach:** Put the rule in the data layer and make it bite. A table-class registry is the single source from which the RLS, grants and trigger SQL are generated; every tenant-owned table gets `ENABLE` plus `FORCE ROW LEVEL SECURITY` and a policy on a transaction-scoped setting; and all tenant data access runs inside `withTenant`, which sets that value as a **bound** parameter.

**The connection moves with it.** Measured on 2026-09-20: `FORCE ROW LEVEL SECURITY` does nothing against a superuser — as `momo`, a table with FORCE and a policy still returns every row. Everything today connects as `momo`. So this slice also moves the application's connection to the non-superuser `momo_app` role and routes the existing reads through `withTenant`. Without that, the policies are inert and every later test passes while proving nothing.

## Boundaries & Constraints

**Always:**
- The registry is the **only** source: `rls.sql`, `grants.sql` and the trigger SQL are generated from it, never hand-edited per table.
- A migration that adds a table the registry does not name must **fail CI**.
- A tenant-owned table without FORCE or without a policy must **fail CI**, read from `pg_class.relforcerowsecurity` and `pg_policies` rather than assumed.
- `withTenant` binds the tenant id as a parameter — `set_config('app.tenant_id', $1, true)`. `SET LOCAL app.tenant_id = …` must be absent from the codebase: it cannot take a parameter and interpolating into `SET` is an injection foot-gun.
- **Prove isolation by sabotage, the way the last three slices were proved.** A query that forgets the tenant must return nothing, and a query under tenant A must not see tenant B. Watch each fail before trusting it.
- The application role stays a non-owner without `BYPASSRLS`, and story 1.1's pg-boss separation keeps working.

**Never:**
- **No cross-tenant harness enumerating every read use case** — that is the next slice, and NFR-S1 is not discharged until it lands, however green this one looks.
- **No rewiring of the eight `apps/web` files and no `dependency-cruiser`** — the slice after. The gate goes on only after that rewiring.
- **No arithmetic or codec rewrite** (bigint milli-hours, `{num, den}`, the jsonb codec) — its own slice; 13 domain modules and 32 pinned assertions.
- **No watermark advisory locks** — they need `seq` allocation that Epic 2 and Epic 5 write.
- No new tables, no schema shape changes beyond what RLS and the triggers require.

</frozen-after-approval>

## Code Map

- **17 tables; 16 carry `tenant_id`.** The registry must name all 17 — the one without it is not tenant-owned and needs a class anyway.
- **The five AD-21 classes** are append-only, mutable-audited, derived, global and operational. Nine tables are insert-only today: `baseline_version`, `baseline_wp`, `tracker_snapshot`, `ticket_observation`, `actuals_ledger_entry`, `mapping_event`, `rate_entry`, `disposition_event`, `audit_log`.
- `packages/db/src/schema.ts` — the Drizzle schema. Drizzle 0.45 **cannot emit `FORCE`**, which is why the SQL is generated separately and asserted in CI.
- `packages/db/src/repo.ts` — **15 `select` calls** across `loadProjectBundle` and `loadReview`. Every one returns nothing once RLS applies unless it runs inside `withTenant`.
- `packages/db/src/seed.ts` — **16 inserts**. It runs as the owner today; decide whether it keeps that role or moves, and say which in Implementation Notes.
- `packages/db/src/client.ts:18` and `drizzle.config.ts:8` — the hardcoded localhost DSN fallback. The founder decided on 2026-09-20 to remove it **here**, because this slice introduces `getDb(connectionString)`. Both must move together.
- `scripts/pgboss-migrate.ts` — already creates `momo_migrator` and `momo_app` idempotently and converges their attributes. Extend that path for the application tables' grants rather than inventing a second role mechanism.
- `.github/workflows/ci.yml` — six gates and a prepare step. The new CI assertions belong beside them; the prepare step must apply the generated SQL.
- `packages/db/src/db-round-trip.test.ts` and `apps/worker/src/worker-round-trip.test.ts` — both connect and read today. They are the first things that break when the connection moves, and the first evidence that it worked.
- `apps/web` still imports `@momo/db` directly in eight files. That is the next slice; this one must not break them.

## Tasks & Acceptance

**Execution:**
- [x] `packages/db/src/table-classes.ts` — every table assigned exactly one class.
- [x] Generate `rls.sql`, `grants.sql` and the trigger SQL from the registry.
- [x] `withTenant(tenantId, fn)` — opens a transaction, `set_config('app.tenant_id', $1, true)` with a bound uuid, runs `fn`.
- [x] `getDb(connectionString)` — remove the hardcoded fallback from `client.ts` and `drizzle.config.ts`; a missing key must fail naming it.
- [x] Route `repo.ts`'s reads and `seed.ts`'s writes through the tenant-scoped path.
- [x] Grant the application role what the registry says and nothing more; move the application connection to it.
- [x] Append-only: no `UPDATE`/`DELETE` grant plus a `BEFORE UPDATE OR DELETE` trigger, with the `maintenance` role and `app.maintenance = 'on'` as the only exception.
- [x] Lint rule and test banning the bare `db` handle on tenant-owned tables; ban `SET LOCAL app.tenant_id`.
- [x] CI: the unregistered-table assertion, the FORCE/policy assertion, and applying the generated SQL in the prepare step.

**Acceptance Criteria:**
- Given a table added without a registry entry, when CI runs, then it fails naming that table.
- Given any tenant-owned table stripped of FORCE or of its policy, when CI runs, then it fails naming that table.
- Given a read issued without a tenant set, when it runs as the application role, then it returns no rows.
- Given a read inside `withTenant(A)`, when tenant B's rows exist, then none of B's rows come back — and the same read inside `withTenant(B)` returns B's and not A's.
- Given the application role, when it attempts `UPDATE` or `DELETE` on an insert-only table, then both the grant and the trigger refuse it, and the `maintenance` role with the flag set succeeds.
- Given `DATABASE_URL` absent, when anything connects, then it fails naming the key rather than reaching a localhost default.
- Given the whole suite, when lint, the typechecks and the tests run, then all pass — the existing 72 tests included, now reading through `withTenant`.

## Implementation Notes

**The registry, and the three generated files.** `packages/db/src/table-classes.ts` names all
17 tables with exactly one class each and a second, independent axis — `tenantColumn`, which
is `null` only for `tenant` itself. `packages/db/src/sql/generate.ts` renders three strings
from it and nothing else (no database, no environment, no clock), which is why the same text
can be applied, written to disk and compared for drift. The checked-in rendering is
`packages/db/sql/{rls,grants,triggers}.sql`, refreshed with `pnpm db:sql`.
`scripts/db-policies.ts` (`pnpm db:policies`) **regenerates rather than reading those files**,
so a hand edit can never reach a database — it can only fail
`packages/db/src/registry.test.ts`. The nine append-only tables came out exactly as the spec's
Code Map predicted.

**`tenant` is `global`, and that is a decision with a cost.** It carries no `tenant_id`, so it
gets no policy; the only thing standing between the application role and another Tenant's
name is the grant, which is SELECT and nothing else (`APP_PRIVILEGES.global`). The
application role can therefore *read* the list of Tenant names. Recorded in deferred-work:
the next slice's cross-tenant harness is where that surfaces as a use-case-level question,
because the answer is a membership join in `resolveRequestContext` (story 1.4), not a policy.

**`withTenant(db, tenantId, fn)`, not `withTenant(tenantId, fn)`.** The spec's task list wrote
the two-argument form; the implemented signature takes the handle first, because there is no
ambient handle to take it from — `packages/db` may not read the environment and may not import
`@momo/app`. The tenant id is bound: `SELECT set_config('app.tenant_id', $1, true)` through
Drizzle's `sql` template. `is_local => true` is load-bearing twice over — it scopes the value
to the transaction, so a pooled connection cannot hand the next borrower a tenant it never
asked for, and `rls.test.ts` pins that by reading the same table on the bare handle
afterwards and getting nothing.

**The policy predicate is `tenant_id = current_setting('app.tenant_id', true)`.** `missing_ok
= true` is deliberate: with it, a read that skipped `withTenant` compares against NULL and
returns zero rows; without it the read would *raise*, which is louder but also catchable, and
the acceptance criterion asks for "returns no rows". `WITH CHECK` carries the same predicate,
which is what refuses a cross-tenant *write* — the quieter leak, and one `USING` alone would
not close.

**Tenant ids are `text`, not `uuid`.** The spec said "a bound uuid"; the columns are `text`
today (`ten-momo`) and the architecture moves them to app-generated UUIDv7 in a later story.
`set_config` takes text either way, and because the value is bound the type is not a safety
property. `withTenant` still pattern-checks the id — not against injection, but against the
empty string, which would set the setting to `''`, match no row, and look exactly like
correct isolation.

**The append-only trigger raises SQLSTATE `MOMO1`, not `42501`.** The two halves of the double
enforcement have to be distinguishable or a test that thinks it is watching the trigger is
really watching the missing grant. Sabotage 4 below is the proof: granting the application
role UPDATE on `audit_log` turns the refusal from `42501` into `MOMO1` and the assertion fails
naming both. The escape hatch is *both* halves at once — membership of `momo_maintenance` AND
`app.maintenance = 'on'` — because a role alone would make every maintenance connection
dangerous and a flag alone could be set by any role.

**`momo_maintenance` is NOLOGIN.** It is reached with `SET ROLE` from an owning connection,
exactly as `momo_migrator` is, so the hatch adds no credential anybody has to store. It is
created through `ensureRole`, which was extracted out of `scripts/pgboss-migrate.ts` and
exported — the spec said to extend that path rather than invent a second role mechanism, and
the part worth reusing is the attribute convergence (NOSUPERUSER NOCREATEDB NOCREATEROLE
**NOBYPASSRLS**, re-asserted on every run). The grants/RLS/trigger application itself lives in
its own script rather than inside `pgboss-migrate.ts`, because that file's subject is the
`pgboss` schema and this one's is the application tables.

**The seed keeps the owning role.** Decided, as the spec asked. Two reasons the restricted role
cannot satisfy: it TRUNCATEs (TRUNCATE is in no class's grant and must not be — an application
role that can empty `audit_log` makes the append-only argument false), and it writes the
`tenant` row, which is `global` and read-only for the application role. It nonetheless runs
every write inside `withTenant` on `tx`, so the seed exercises the same path the application
does. Its composition root moved to `scripts/seed.ts`; `pnpm seed` points there now, because
`packages/db/src/seed.ts` may not read the environment.

**`getDb(connectionString)` memoises per connection string** rather than in one module-level
slot. `rls.test.ts` holds the owner and the application role in one process; a single slot
would have silently handed one of them the other's pool.

**The eight `apps/web` files were touched, and this is not the banned rewiring.** The Never list
forbids moving them onto use cases and switching on dependency-cruiser; that is still the next
slice. But `getDb` now takes an argument and every read now needs a transaction, so the eight
could not keep working untouched. What changed is mechanical: a new composition root
`apps/web/src/server/db.ts` (the only place the web app decides which role it connects as),
one added import and one added argument per page, and `actions.ts`'s five actions wrapped in a
`run(...)` seam that is `withTenant(webDb(), TENANT, …)`. `WEB_TENANT_ID` is the single place
`resolveRequestContext` replaces in story 1.4 — one place instead of eight. `apps/web` gained
`@momo/app` as a dependency (an inbound adapter importing the application layer is the correct
direction) and a `paths` entry, and `@momo/app` joined `transpilePackages`.

**apps/web was verified by running it**, because nothing else covers it: `next dev` on 3199,
all six routes 200, and the Review page rendering the same golden figures the round-trip test
pins (2936.0 / 1661.5 / 0.91). `pg_stat_activity` showed `momo_app` connected. The write path
was exercised separately as `momo_app` inside `withTenant` — `mapping_event`,
`disposition_event`, `audit_log` and `work_package`, the four shapes `actions.ts` writes, all
accepted, then rolled back.

**The bare-handle ban is enforced as a naming convention**, deliberately. The ESLint rule flags
`select`/`insert`/`update`/`delete`/`execute`/`query` called on a variable named `db`; the
sanctioned handle is the `tx` that `withTenant` hands its callback. A convention makes the
violation visible in a diff and not only to the linter, and it is the only form an AST
selector can enforce without type information (the lint config is deliberately not
type-aware). `db.transaction(...)` stays legal — that is how `withTenant` works.

**The banned `SET` form appears nowhere in the repository at all, including in comments and in
the rule's own message.** The ESLint selectors match it with `\s+` between the words, so they
do not contain it. `packages/db/src/source-discipline.test.ts` scans every tracked file
(`git ls-files`, so ignored trees are out of scope by construction) and assembles the pattern
from parts so the test does not trip itself. `_bmad-output/` is excluded: the planning
artifacts are where the ban is *stated*, and a document that forbids a form has to be able to
name it. That test exists alongside the lint rule because the rule is a syntax selector — it
sees nothing in a `.sql` file, a workflow, or prose. Sabotage 11 below is that difference,
watched.

**CI prepare-step order changed, and the order is the point.** `drizzle-kit push` →
`pgboss:migrate` (twice) → `db:policies` (twice) → `seed`. Policies need the tables to exist
and need the application role to exist; the seed runs last because it is the first thing that
writes *under* the policies. Both role steps run twice because idempotence checked by hand
once is not a gate.

**Out of scope, as the spec required and confirmed here:** no cross-tenant harness enumerating
read use cases (NFR-S1 is NOT discharged by this slice), no dependency-cruiser, no arithmetic
or codec rewrite, no watermark advisory locks, no new tables and no schema shape change —
`packages/db/src/schema.ts` is untouched.

## Spec Change Log

- 2026-09-20 — `withTenant` implemented as `withTenant(db, tenantId, fn)` rather than the
  Tasks list's `withTenant(tenantId, fn)`. There is no ambient database handle to take, and
  creating one would mean `packages/db` reading the environment or importing `@momo/app`,
  both of which the architecture forbids. The binding requirement — the whole point of the
  task — is unchanged.
- 2026-09-20 — the bound tenant id is `text`, not `uuid`. The columns are `text` in this
  release; UUIDv7 arrives with the id change a later story owns. Because the value is bound,
  the type carries no safety property.
- 2026-09-20 — the grants/RLS/trigger application lives in a new `scripts/db-policies.ts`
  rather than inside `scripts/pgboss-migrate.ts`. The spec's Code Map said to extend that
  path rather than invent a second role mechanism; the role mechanism *is* reused — the
  extracted, exported `ensureRole` — while the SQL application is kept in a file named for
  what it does.
- 2026-09-20 — `pnpm seed` now runs `scripts/seed.ts`. Removing the environment read from
  `packages/db` left `packages/db/src/seed.ts` unable to be an entry point; the seeding
  itself is unchanged apart from taking a handle and running inside `withTenant`.
- 2026-09-20 — the eight `apps/web` files were edited mechanically (one import, one argument;
  `actions.ts` wrapped in a transaction seam). The Never list's ban is on rewiring them onto
  use cases and on dependency-cruiser, both of which remain untouched; keeping them *working*
  was an Always, and `getDb(connectionString)` plus RLS made a no-touch option impossible.
- 2026-09-20 (review round 1) — `packages/app/src/config.ts` now parses each key when it is
  first read rather than the whole schema at module load. Not in the spec's scope, taken here
  because this slice is what made it load-bearing: `apps/web` and `apps/worker` hold only the
  restricted credential, and an eager parse required the owner's connection string to be in
  their environment where they could read it, which gives the whole separation back. It also
  closes the eager-parse entries deferred from slices B1 and B2 in one place.
- 2026-09-20 (review round 1) — `mapping_event.seq` is allocated by a generated SECURITY
  DEFINER function rather than by `MAX(seq) + 1`. Moving that expression inside `withTenant`
  made it a cross-tenant primary-key collision: the maximum a caller can see is its own
  Tenant's, so a second Tenant computes 1 and collides with the seeded events. The registry
  gained a `clientAllocatedSeq` field naming the two tables whose `seq` the caller allocates.
  This is still NOT the watermark discipline (`pg_advisory_xact_lock` before allocation) a
  later slice owns.
- 2026-09-20 (review round 1) — the append-only guard gained a second, statement-level trigger
  for TRUNCATE, because a `FOR EACH ROW` trigger does not fire for that verb at all — leaving
  the grant as the only control on the one statement that empties a table. `seed.ts`'s
  TRUNCATE therefore now opens the maintenance hatch, which is honest: re-seeding is
  maintenance. Both guard functions pin `SET search_path = pg_catalog, pg_temp`.
- 2026-09-20 (review round 1) — every tenant-owned table gained a second policy,
  `maintenance_bypass`, granted to `momo_maintenance` alone. Without it the hatch was
  unusable: the tenant policy applies to PUBLIC, so a maintenance session that had not also
  set `app.tenant_id` matched zero rows and the hatch appeared to work while updating nothing.
- 2026-09-20 (review round 1) — `loadProjectBundle` and `loadReview` no longer default
  `tenantId`. In a story whose thesis is that the Tenant is never remembered in application
  code, a default meant a forgotten Tenant silently read `ten-momo`, and the positional pair
  meant `loadReview(db, projectId)` type-checked and returned nothing.
- 2026-09-20 (review round 1) — `pnpm db:reset` was removed from `package.json`. It pointed at
  `packages/db/src/reset.ts`, which has never existed; the adjacent `seed` script was rewritten
  in this slice, so leaving a broken neighbour beside it was not defensible.

## Review Triage Log

**Round 1, 2026-09-20 — 22 findings, all fixed.** The three that were real defects rather than
gaps in the evidence:

1. **The FORCE/policy assertion checked only that a policy by the right NAME existed.** The
   reviewer set `actuals_ledger_entry`'s policy to `USING (true)` — which leaks every Tenant's
   money rows — and all 96 tests passed. Fixed by reading `qual` and `with_check` out of
   `pg_policies` and comparing both against `tenantPredicate(entry)`, the generator's own
   function, after normalising the way Postgres re-renders a stored expression. Re-run against
   the same sabotage: two failures, the predicate assertion and the new behavioural read.
2. **Every behavioural isolation read targeted `department`, and tenant B had only a
   `department` row**, so no policy on any of the other fifteen tables could be demonstrated by
   a read. Fixed by giving tenant B a `connector` and an `actuals_ledger_entry` row — money,
   the thing a leak actually costs — and asserting tenant A sees none of it while tenant B sees
   all of it.
3. **`nextSeq` collided across Tenants.** See the Spec Change Log entry; this was introduced by
   this slice, not inherited.

The rest were evidence gaps in gates that happened to be passing (name-only policy check,
`role_table_grants` missing privileges reaching the role through PUBLIC, `relkind` filters
letting a view past unexamined, `tenantColumn` never compared to the catalog, an untested
`withTenant` guard, un-scoped `UPDATE`/`DELETE` probes that would have wiped the fixture the
day the grant regressed), correctness holes with no live symptom (`NULLIF` missing from the
predicate, unpinned `search_path`, `pg_has_role` raising 42704 on a missing role, a TRUNCATE
that no trigger saw, a seed that could empty another Tenant's rows, `db-policies.ts` applying
RLS on import), or documentation that had gone stale under the change (`config.ts`'s header,
`db-policies.ts`'s pointer, the ESLint coverage claim, `README-DEMO.md`'s quickstart, relative
imports where an alias exists).

Verdicts from my own probes, not the reviewers'.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | The policy assertion checks only that a policy **named** `tenant_isolation` exists; it never reads `pg_policies.qual` or `with_check` | **high** | **Sabotage-probed.** Setting `actuals_ledger_entry`'s policy to `USING (true)` — leaking every tenant's money rows — leaves all 96 tests passing. 15 of 16 tenant-owned tables could be wide open with CI green | patch |
| 2 | Behavioural isolation is exercised on `department` and nothing else | **high** | Confirmed: every `withTenant` read in the suite targets `s.department`. Tenant B is seeded with only a `tenant` and a `department` row, so no other table can show an over-permissive policy | patch |
| 3 | `nextSeq` runs `MAX(seq)+1` under RLS against a global PK with no identity | **high** | Confirmed: `mapping_event.seq` is `bigint(...).primaryKey()` with no `generatedAlwaysAsIdentity`. A second tenant sees only its own rows, computes 1, and collides with tenant A's seeded events. Introduced by this change — before RLS the MAX saw everything | patch |
| 4 | `seed.ts`'s TRUNCATE ignores RLS, so seeding one tenant destroys every other tenant's rows | high | TRUNCATE is exempt from row-level security by design in Postgres. The seed keeps the owning role, so nothing stops it | patch |
| 5 | `apps/web` must carry the owner DSN because config parses both keys eagerly | high | Confirmed: `config.ts` requires `DATABASE_URL` and `APP_DATABASE_URL` with no `.optional()`. The process whose point is the restricted role cannot boot without the owner's string in its environment, readable by it — undoing part of the separation. Same root cause as the B1/B2 eager-parse deferrals | patch |
| 6 | The policy drops `NULLIF(..., '')`, which the spec required, and the Change Log records only the uuid deviation | medium | **My own probe.** The database accepts a `tenant` row with an empty id — I inserted one. Nothing has an empty `tenant_id` today, so it is latent, but the omission is unrecorded | patch |
| 7 | The grants assertion queries `role_table_grants` by grantee, so privileges reaching the role via PUBLIC or membership are invisible | medium | Confirmed by reading it. `has_table_privilege` is the check that matches the "and nothing more" claim | patch |
| 8 | Views and matviews are outside every gate; a view over a tenant-owned table runs with the owner's permissions unless `security_invoker` is set | medium | Confirmed: the registry assertion filters `BASE TABLE` and `relkind='r'`. None exist today, so this is a hole rather than a leak | patch |
| 9 | Append-only has no TRUNCATE half, and the trigger function has no fixed `search_path` | medium | Row triggers do not fire for TRUNCATE, so for that verb the grant is the only control — the one the trigger exists to backstop | patch |
| 10 | `withTenant`'s id guard is untested, and `currentTenant` is exported and called nowhere | medium | Confirmed by grep. Removing the guard lets an empty id through, which reads as correct isolation — zero rows — and nothing fails | patch |
| 11 | `scripts/db-policies.ts` has no main-module guard, unlike its sibling | medium | Confirmed. Importing it to test the pure renderers applies RLS and re-grants against whatever `DATABASE_URL` names | patch |
| 12 | `loadProjectBundle`/`loadReview` default `tenantId` to the demo tenant | medium | Confirmed. In a story whose thesis is that the tenant is never remembered in application code, a forgotten tenant silently reads `ten-momo` instead of failing | patch |
| 13 | The registry's `tenantColumn` is hand-written and never compared to `information_schema.columns` | medium | Confirmed: an entry marked `tenantColumn: null` on a table that has the column yields no policy and a green suite | patch |
| 14 | Two unbounded destructive statements in `rls.test.ts` run inside a committing transaction | medium | `UPDATE audit_log SET actor='tampered'` and `DELETE FROM audit_log` with no WHERE. They pass only because the grant is absent; the day it regresses they wipe the seeded audit log for the rest of the run | patch |
| 15 | The maintenance escape hatch matches zero rows unless `app.tenant_id` is also set, and the trigger raises 42704 when the role is absent | medium | The `FOR ALL` policy still applies to the maintenance session, so the hatch opens onto nothing | patch |
| 16 | The tenant bans are not repository-wide although the comment says they are | medium | Confirmed: root configs and `infra/**` match no fence group, and the text backstop walks only three directories. The banned `SET` half *is* genuinely repo-wide | patch |
| 17 | `config.ts`'s header now contradicts the code — it says `APP_DATABASE_URL` holds pgboss DML only and that only the worker uses it | low | Confirmed: this slice pointed web, `peek-db` and both round-trip tests at it. The file is the one sanctioned env reader, so whoever adds the next key reads this first | patch |
| 18 | `db-policies.ts` points a hand edit at `generated-sql.test.ts`, which does not exist | low | Confirmed. The drift assertions are in `registry.test.ts` | patch |
| 19 | `package.json`'s `db:reset` runs a file that does not exist | low | Pre-existing, but the adjacent `seed` line was rewritten here and `db:reset` needs the same treatment | patch |
| 20 | The new web imports use deep relative paths although `@/*` is mapped and used in the same files | low | Confirmed. The next slice redoes these lines anyway | patch |
| 21 | `README-DEMO.md`'s quickstart relied on the removed localhost defaults | medium | Confirmed: `pnpm install && pnpm demo` now aborts on a clean machine with no documented fix | patch |
| 22 | `withTenant` is not re-entrant and nothing detects a nested call | low | No caller nests today; story 1.3 composes use cases | defer |
| 23 | `loadProjectBundle` now holds one transaction across 15 round trips | low | Better consistency, worse hold time. Matters at story 1.8's fixture, not before | defer |
| 24 | `seed.ts`'s `TRUNCATE_ORDER` is a second hand-maintained table list beside the registry | low | Real duplication; the registry could derive it | defer |
| 25 | The migration scripts still assume `DATABASE_URL` names a superuser | medium | Already recorded from slice B2; unchanged here | defer |
| 26 | `tenant` is `global`, so the app role can read every Tenant's name | medium | By design at this stage — the fix is the membership join in story 1.4, not a policy | defer |
| 27 | `apps/web` has no automated test, so its role move rests on a hand-run check | medium | Confirmed: `vitest.config.ts` collects nothing under `apps/web`. The next slice's rewiring is what makes it testable | defer |
| 28 | Percent-encoded role names would break the grants assertion's grantee comparison | low | Real but narrow; `parseAppRoleIdentity` decodes and this does not | defer |

## Verification

**Commands** — all run on 2026-09-20 against `postgres:18.6-alpine` on port 55433, with
`DATABASE_URL`, `APP_DATABASE_URL` and `REQUIRE_DB=1` exported:

| Command | Result |
| --- | --- |
| `pnpm lint` | exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm --filter @momo/web typecheck` | exit 0 |
| `pnpm --filter @momo/worker typecheck` | exit 0 |
| `pnpm test` | **123 passed across 11 files** (72 across 7 before this slice; 96 before review round 1) |
| `pnpm exec drizzle-kit push --force` | exit 0 |
| `pnpm pgboss:migrate` ×2 | exit 0 both times |
| `pnpm db:policies` ×2 | exit 0 both times — idempotent. Applies rls → triggers → grants, in that order, because the grants reference the allocator functions the triggers file creates |
| `pnpm seed` | 48 WPs, 41 baseline WPs, 6 snapshots, 144 ledger entries, 184 mapping events |
| `pnpm db:sql` | rewrites the three files; the drift test agrees with them |
| `grep -r "SET LOCAL app.tenant_id" apps packages scripts .github *.ts *.js *.json` | no hits (exit 1) |

The 51 new tests are: 19 in `packages/db/src/rls.test.ts` (database), 16 in
`packages/db/src/registry.test.ts` (pure), 14 in `packages/db/src/with-tenant.test.ts` (pure —
the tenant-id guard, against a handle that throws if it is reached, so a guard that let a bad
id through fails loudly instead of connecting), 2 in
`packages/db/src/source-discipline.test.ts` (pure). The 7 pre-existing round-trip assertions
now read as `momo_app` through `withTenant` and reproduce the identical figures.

**Sabotage — every gate watched to fail, then restored to green.**

| # | Sabotage | Gate that caught it, and how |
| --- | --- | --- |
| 1 | `ALTER TABLE work_package NO FORCE ROW LEVEL SECURITY` | `rls.test.ts`: *"these tenant-owned tables lack ENABLE or FORCE ROW LEVEL SECURITY: work_package"* — read from `pg_class.relforcerowsecurity` |
| 2 | `DROP POLICY tenant_isolation ON audit_log` | `rls.test.ts`: *"these tenant-owned tables have no 'tenant_isolation' policy: audit_log"* — read from `pg_policies` |
| 3 | `CREATE TABLE unregistered_probe (id text primary key)` | `rls.test.ts`: *"these tables exist but packages/db/src/table-classes.ts does not class them: unregistered_probe"* |
| 4 | `GRANT UPDATE ON audit_log TO momo_app` | **two** failures: the grant assertion (*"audit_log (append-only) holds the wrong grants: expected ['INSERT','SELECT','UPDATE'] to equal ['INSERT','SELECT']"*) and the refusal assertion, which reported `'MOMO1'` where `'42501'` was expected — i.e. the trigger caught what the grant no longer did. The two halves are genuinely distinguishable. |
| 5 | `DROP TRIGGER append_only_guard ON audit_log` | **two** failures: *"these append-only tables carry no 'append_only_guard' trigger: audit_log"*, and the maintenance-role assertion reporting `undefined` where `MOMO1` was expected — the UPDATE simply succeeded |
| 6 | Deleted the `set_config` call from `withTenant` (the binding itself) | `rls.test.ts`: both directional isolation tests fail — `withTenant(A)` and `withTenant(B)` each return nothing |
| 7 | Unset `DATABASE_URL` | `drizzle-kit push`: *"DATABASE_URL is required … There is no localhost default."* `pnpm seed`: *"Invalid configuration: DATABASE_URL is required …"* `getDb(undefined)`: *"A PostgreSQL connection string is required and none was given. There is no localhost default …"* — three separate paths, each naming the key |
| 8 | A probe file with `db.execute(...)`, `db.select()` and the banned `SET` form interpolating a tenant id | `pnpm exec eslint`: 3 errors — two bare-handle, one banned-form, each naming its rule |
| 9 | Appended `-- hand edit` to `packages/db/sql/rls.sql` | `registry.test.ts`: *"packages/db/sql/rls.sql has not drifted"* fails |
| 10 | Added a `probe_table` to `schema.ts` without a registry entry | `registry.test.ts`: *"names every table in schema.ts, exactly once, and no others"* fails — caught with no database at all |
| 11 | Put the banned `SET` form in `packages/db/sql/grants.sql` | ESLint sees nothing (it does not parse `.sql`); `source-discipline.test.ts` fails naming the file. This is why the test exists beside the rule. |
| 12 | A tracked `.ts` file calling `db.select()` | `source-discipline.test.ts` fails naming the file |
| 13 | Set `actuals_ledger_entry`'s policy to `USING (true) WITH CHECK (true)` — the reviewer's sabotage, which the name-only check passed | **two** failures: the predicate assertion (*"these policies do not carry the predicate packages/db/src/sql/generate.ts emits"*) and the behavioural money read (*"sees none of tenant B's money inside withTenant(A)"*) |
| 14 | `INSERT INTO tenant` a second Tenant, then `pnpm seed` | *"Refusing to seed: this database also holds 1 other Tenant(s) — ten-other. The seed TRUNCATEs, and TRUNCATE is exempt from row-level security…"* |
| 15 | `TRUNCATE audit_log` as the **owner**, no hatch open | *"table public.audit_log is append-only: TRUNCATE is refused"*, SQLSTATE MOMO1, from `momo_append_only_truncate_guard` — the verb a row trigger cannot see |

**Also verified after review round 1:** the worker and `apps/web` both boot and serve with
`APP_DATABASE_URL` alone and `DATABASE_URL` unset (`[worker] started …`; `/p/prj-ec2/review`
200) — which is the separation this slice claimed and could not previously demonstrate;
`momo_next_mapping_event_seq()` called as `momo_app` returns the maximum across Tenants (185
against the seeded database), so the allocation no longer depends on what the caller may see.

**Live application check** (nothing else covers `apps/web`): `next dev -p 3199` with both keys
exported — `/p/prj-ec2/review`, `/plan`, `/mapping`, `/baselines`, `/connectors` and
`/c/prj-ec2` all 200; the Review page renders `2936.0`, `1661.5` and `0.91`, matching the
round-trip test's pinned figures; `pg_stat_activity` shows `momo_app` connected. The write
path was exercised separately as `momo_app` inside `withTenant` across all four tables
`actions.ts` writes, then rolled back.

**Not verified, and deliberately so:** nothing here discharges NFR-S1. The cross-tenant
harness that enumerates every read use case is the next slice, and the isolation evidence
above is a targeted sabotage set rather than that enumeration.


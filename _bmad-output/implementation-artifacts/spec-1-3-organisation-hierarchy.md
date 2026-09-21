---
title: 'Story 1.3 slice 2 — the organisation hierarchy: Programs, and audited create/rename/reassign of Departments, Programs and Projects'
type: 'feature'
created: '2026-09-21'
status: 'done'
baseline_commit: '119ec431ba6c2990714345d8bc070e58a45e9d83'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-audit-mechanism.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** FR-1's hierarchy — Tenant › Department › Program › Project — cannot be built: there is
no `program` table, no Program on a Project, and no use case that creates, renames or reassigns any
org unit, so nothing a Tenant Admin changes about the organisation is on the record.

**Approach:** Add `program` (class `mutable_audited`) and an optional `program_id` on `project`, and
write the org changes as audited use cases on slice 1's mechanism, each recording the previous value.
Generalise slice 1's transaction port and audited-use-case gate so they are not project-shaped.

Decided by the founder on 2026-09-21: no Organisation UI and no PM assignment in 1.3; audit `at`
for org changes comes from a `Clock` port declared in `packages/app`, wired to `systemClock` by the
composition root — which AD-1 is amended (separately, reviewed) to let import `packages/adapters`.

## Boundaries & Constraints

**Always:**
- Use cases: create/rename Department; create/rename Program (in a Department); create Project (name,
  owning Department, optional Program, client name, contract type); rename Project; reassign a
  Project's Program (or clear it); reassign a Project's owning Department (its Program must be cleared
  or replaced by one of the new Department's in the same change). Each audited with a new enum member,
  in one transaction, payload carrying the previous value (`before`/`after`) where there is one.
- A Program is accepted on a Project only if it belongs to the Project's owning Department, checked
  inside the transaction; otherwise `invalid_input`. A Department, Program or Project the Tenant cannot
  see answers `not_found`, never `forbidden`.
- Moving a Project between Programs changes only its `program_id`: no Baseline, ledger, Mapping,
  snapshot or audit row changes, proved by a test.
- Ids are app-generated UUIDv7 (through an injectable id port). New Projects take documented
  defaults for the columns later stories own (tz, teirei, default rate, EAC method, calendars,
  `demo_anchor` from the Clock).
- The demo tenant's org is seeded with one Program; the six routes render identical HTML.
- Every new write is on the enumerated surface, classified by the audited-use-case gate, and driven
  by the cross-tenant write harness (foreign ids → `not_found`, nothing lands; own writes land exactly
  the expected rows). The gate and port are no longer tied to the project write scope.

**Never:**
- No UI, no read use case for the org, no PM assignment, no role checks (1.4/1.5).
- No deleting or archiving org units, no moving a Program between Departments, no name-uniqueness rule.
- No foreign keys (the schema's recorded demo deviation stands); no change to the five existing writes'
  rows or the existing enum members.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | On failure |
|---|---|---|---|
| Create Program | own Department | Program row + one audit row (`at` from Clock) | — |
| Program of another Department | assign Program of Dept X to a Project in Dept Y | `invalid_input`, nothing lands | — |
| Foreign ids | Tenant B names A's Department/Program/Project | `not_found`, nothing lands for either Tenant | name the use case |
| Rename | new name | row updated; audit payload `{ before, after }` | — |
| Move Project between Programs | Project with Baselines, ledger, Mappings | only `program_id` changes; every other table's rows unchanged | name the table |
| Department reassign keeping a now-foreign Program | Program not in the new Department, not cleared | `invalid_input`, nothing lands | — |
| Blank or NUL name | `''`, `'  '`, `'a\0'` | `invalid_input` | — |

</frozen-after-approval>

## Code Map

- `packages/app/src/ports/tenant-transaction.ts:20` — `TenantTransaction<Handle, Scope>` already
  generic. Project-shaped: `ProjectWriteScope`/`ProjectWriteDeps` (`ports/project-write.ts:106-119`,
  `WriteStamp` duplicating `AuditStamp`), `runProjectWrite` (`use-cases/project-write-input.ts:98`,
  `at` from `projectAnchor`, not-found via `isProjectNotFound`). `packages/db/src/repo-writes.ts:292`
  `inTenantTransaction` hard-wires `{ projectWrite, audit }`; `audit-sink.ts:33` is generic.
- `packages/app/src/audit/index.ts` — `AUDIT_ACTIONS` (:29, six members; new ones appended),
  `record`, `refusingNonMembers`, `AuditDeclaration`; `use-cases/audit-declarations.ts`.
- `packages/adapters/src/clock.ts:14` — `Clock { now(); nowMs() }`, `systemClock`; `@momo/adapters`
  is a workspace package nothing depends on, absent from `tsconfig.base.json` paths.
- `uuid` 11.1.1 (has `v7`) only in root `package.json`.
- `schema.ts` — `department` (:32, id/tenant_id/name), `project` (:46, 13 NOT NULL columns, no
  defaults); ids are readable text today; no FKs (`:16-19` "DEMO DEVIATION").
- Adding `program`: `schemaTables` (:239), `TABLE_REGISTRY` (`table-classes.ts`, after `department`,
  `mutable-audited`), `registry.test.ts:54-59` counts 17/16 → 18/17, `pnpm db:sql` + drift test,
  `seed.ts` `TRUNCATE_ORDER` (:44) and `writeTenantRows` (:132-180), `fixtures/demo/project.json` +
  `fixtures.ts:79-82`, `probe-tenants.ts` `demoMarkers` (:253), `UNREACHED_TENANT_OWNED_TABLES`
  (`tests/read-use-cases.ts:418`).
- Tests: `tests/audited-use-cases.test.ts` (`drive` :81-130 fakes a `ProjectWriteRepository`,
  `projectAnchor` :103), `tests/read-use-cases.ts` (`WriteTarget` :64, `invokeWrite` typed to
  `ProjectWriteDeps` :129), `tests/cross-tenant-writes.test.ts` (`targetOf` :108, `restrictedWriteDeps`
  :99, `landedRows` :340, `EXPECTED` :226), `tests/web-composition.test.ts` (spies, mocked
  `inTenantTransaction`).
- `apps/web/src/server/composition.ts:118-124` (`projectWriteDeps`, `WEB_ACTOR`); `.dependency-cruiser.cjs`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/app/src/ports/` -- `Clock` and id-generator ports; a generic audited-write runner and
      scope type the project writes and org writes both use (project writes' rows unchanged).
- [x] `packages/app/src/audit/index.ts` -- append the org actions to `AUDIT_ACTIONS`.
- [x] `packages/app/src/use-cases/` -- the org use cases (zod inputs, `not_found`/`invalid_input`,
      previous value), exported and declared audited; unit tests with fakes.
- [x] `packages/db` -- `program` table + `project.program_id`, registry, SQL regenerated, org
      repository functions, the transaction scope factory generalised, seed/fixtures/probe markers.
- [x] `apps/web/src/server/composition.ts` -- wire Clock (`systemClock` from `@momo/adapters`), ids and
      the org bindings (no page calls them yet); path/deps for `@momo/adapters`; a depcruise rule that
      only the composition root in `apps/web` may import `packages/adapters`.
- [x] Tests -- gate and write harness generalised and driving every org write; the "move between
      Programs changes nothing else" test; matrix rows covered.
- [x] `deferred-work.md` -- resolve slice 1's scope/gate entries and the split entry; record the rest.

**Acceptance Criteria:**
- Given the suite, when lint, the three typechecks, depcruise and tests run, then all pass and the
  harness still discharges NFR-S1.
- Given the six routes and the five existing forms, when compared with the baseline, then HTML and
  landed rows are identical.

### Review Findings

Code review of story 1.3 (PRs #23 and #24, `1fdb06d..625d2c5`), 2026-09-21 — blind-hunter,
edge-case-hunter, verification-gap, acceptance-auditor.

- [x] [Review][Patch] UUIDv7 ids minted in one Clock millisecond sort randomly; the composition root rebuilds the generator per call [packages/adapters/src/ids.ts:14]
- [x] [Review][Patch] `TRUNCATE_ORDER` is not checked against `TABLE_REGISTRY`; a reseed breaks silently if a table is missed [packages/db/src/seed.ts:44]
- [x] [Review][Patch] The own-Tenant write harness does not check that a write left every other table unchanged [tests/cross-tenant-writes.test.ts]
- [x] [Review][Patch] `project.create`'s audit payload omits the defaulted columns and `demoAnchor` it wrote [packages/app/src/use-cases/org-writes.ts]
- [x] [Review][Patch] `org-input.ts` claims the Never list excludes a length bound; it excludes only uniqueness [packages/app/src/use-cases/org-input.ts:22]
- [x] [Review][Patch] No index on `program.department_id` or `project.program_id` [packages/db/src/schema.ts:44]
- [x] [Review][Patch] Name trimming (stored and audited value) is untested [packages/app/src/use-cases/org-input.ts]
- [x] [Review][Patch] `details` carries a non-zod rule code (`program_not_in_department`) its doc does not allow [packages/app/src/result.ts]
- [x] [Review][Patch] The gate passes a create use case that stops returning `{ id }` [tests/audited-use-cases.test.ts]
- [x] [Review][Defer] `findDepartment`/`findProgram` row locks untested, like `findProject`'s [packages/db/src/repo-org.ts:76] — deferred: needs the two-connection barrier harness
- [x] [Review][Defer] AC3's Published Snapshots and Program roll-up cannot be tested yet [tests/org-writes.test.ts] — deferred: neither table nor read exists
- [x] [Review][Defer] The audited-use-case gate trusts each use case's own declaration, not NFR-A1's list [tests/audited-use-cases.test.ts] — deferred: needs NFR-A1 groups mapped to actions
- [x] [Review][Defer] `epic-1-context.md` still states the four-argument `audit.record(ctx, …)` form [_bmad-output/implementation-artifacts/epic-1-context.md] — deferred: compiled context, regenerated from planning docs

**Rejected**

- `FOR UPDATE` on existence checks serialises concurrent creates — low: single-user demo; fix needs per-call lock modes.
- A same-Department `reassignProjectDepartment` is recorded as a Department move — low: behaviour is consistent; a routing rule is added complexity.
- `WriteScope`/`WriteStamp`/row types exported under the same names by `@momo/db` and `@momo/app` — low: compiles; no file imports both names (carried from round 1).
- The spec's notes, round-1 triage row B1 and `status` drift from the code — fix edits the spec under review.
- `auditSinkOn(tx, tenantId)` takes two arguments where siblings take `Bound` — low: cosmetic.
- Zero-width-only names pass the blank check — low: unlikely; fix adds a guard.
- No-op rename/reassign records `before === after` — low: carried rejection from round 1.
- The harness never drives a real Department move — low: `tests/org-writes.test.ts` does, with `allRows`.
- Create writes carry no `before`/`after` keys, against the commit message — low: claim wording only.
- `demo.seed` is outside `AUDIT_ACTIONS` — low: the seed is tooling, exempted and documented.
- The story is marked `review` without PM assignment — false as a defect: moved to 1.4/1.5 by the founder's decision.

## Implementation Notes

**Ports (`packages/app/src/ports/`).** `clock.ts` (`Clock { now }` — `systemClock` satisfies it
structurally), `ids.ts` (`IdGenerator { next }`), `audited-write.ts` (`AuditedWriteDeps<Handle,
Scope>` — handle, actor, transaction — and `WriteStamp` as an alias of `AuditStamp`, removing the
duplicate), `org-write.ts` (`OrgRepository`, `OrgWriteScope`, `OrgWriteDeps` = audited deps + clock +
ids), `write-deps.ts` (`WriteScope` = project ∩ org scope, `WriteDeps` — what every composition root
builds once). `ProjectWriteDeps` is now `AuditedWriteDeps<Handle, ProjectWriteScope>`, same shape.

**Runner.** `use-cases/audited-write.ts`: `runAuditedWrite(schema, deps, ctx, input, plan, work)` —
the slice-1 contract (validate, one transaction, guarded sink, nothing else caught) with the
particulars in `plan` (`at`, `isNotFound`). A module-private `Refusal` thrown by `refuse(code)`
inside the work rolls the transaction back and answers the code. `runProjectWrite` is a wrapper
(anchor as `at`, `isProjectNotFound`), so the five writes' rows are unchanged.

**Org use cases** (`use-cases/org-writes.ts`, inputs in `org-input.ts`): `createDepartment`,
`renameDepartment`, `createProgram`, `renameProgram`, `createProject`, `renameProject`,
`reassignProjectProgram`, `reassignProjectDepartment`, with eight new enum members
(`department.create|rename`, `program.create|rename`, `project.create|rename|reassign_program|
reassign_department`). Names are trimmed, then refused when blank or NUL. An invisible row answers
`not_found` before any rule is checked, so a foreign Program is never `invalid_input`. Payloads:
`{ name }` / `{ departmentId, name }` / the new Project's placement on create, `{ before, after }` on
rename and Program reassignment, `{ before: {departmentId, programId}, after: {…} }` on Department
reassignment. `reassignProjectDepartment` requires `programId` (nullable) so "keeping" is never
implicit. `NEW_PROJECT_DEFAULTS`: tz 540 (JST), teirei 1 (Monday), default rate 0 (story 1.6 owns
it), EAC `typical`, calendars JP only; `demo_anchor` = the Clock's `now`.

**`packages/db`.** `program` table + nullable `project.program_id` (no FK, per the demo deviation);
registry entry (`mutable-audited`, 18/17); SQL regenerated. `repo-org.ts` (the org repository;
`findProject` locks the row `FOR UPDATE`; every UPDATE must touch exactly one row). The transaction
moved to `tenant-transaction.ts`: `inTenantTransaction` builds ONE scope with `projectWrite`, `org`
and `audit` on one `withTenant`. The barrel now exports it and the command/row TYPES only, not the
repository builders. Seed, `TRUNCATE_ORDER`, fixture (`program: prg-ec-platform "EC platform"`,
also in `gen-fixtures.ts`) and `demoMarkers` carry the Program.

**Web.** The composition root builds one `writeDeps()` (`satisfies WriteDeps<Db>`) with
`systemClock` and `uuidV7IdsOn(systemClock)` from `@momo/adapters` (new `ids.ts` there, on `uuid` 11.1.1 v7) and
exports the eight org bindings; no page calls them. `@momo/adapters` added to `apps/web`'s deps,
the tsconfig paths, the vitest alias and `transpilePackages`. New depcruise rule
`apps-adapters-only-from-composition-root`.

**Tests.** The gate (`tests/audited-use-cases.test.ts`) drives the whole `WriteScope`/`WriteDeps`
with one fake per repository family, and every input of an entry (`invokeWrite` + new
`moreWrites`), requiring every declared action to be seen. The registry (`tests/read-use-cases.ts`)
has the eight org writes, `WriteTarget` carries `departmentId`/`programId`, `program` is declared
unreached. The write harness's shared DB wiring moved to `tests/write-harness.ts` (fixed Clock,
predictable id port) and the own-Tenant expectations to `tests/write-expectations.ts`;
`createDepartment` (it names no existing row) is marked `namesNoExistingRow` and asserted to land
for the caller only. `tests/org-writes.test.ts` builds a second Department and Program through the
use cases and drives the matrix rows that need them, including the whole-Tenant row comparison for
a Program move. Unit tests: `packages/app/src/use-cases/org-writes.test.ts`,
`packages/adapters/src/ids.test.ts`. `tests/web-composition.test.ts` pins the org bindings with
`@momo/adapters` mocked.

**Not done here:** the AD-1 spine amendment for the composition root → `packages/adapters` edge
(the spec says it is made separately; recorded in deferred-work).

## Spec Change Log

- 2026-09-21 — files the Tasks list did not name: `ports/audited-write.ts`, `ports/write-deps.ts`,
  `use-cases/audited-write.ts`, `use-cases/org-input.ts`, `packages/db/src/bound.ts`,
  `packages/db/src/tenant-transaction.ts` (the generalised transaction, out of `repo-writes.ts`),
  `packages/adapters/src/ids.ts` (+ test), `tests/write-harness.ts` and `tests/write-expectations.ts`
  (split from `tests/cross-tenant-writes.test.ts`, which would otherwise pass 800 lines),
  `tests/org-writes.test.ts`, and a CI-header entry. `tests/write-harness.ts` takes its connection
  strings from the suites (`connectWriteHarness`) because the env lint fence covers non-test modules.
- 2026-09-21 — the gate's per-registry-entry "several inputs" (slice 1's E2) was resolved here with
  `moreWrites`, since `reassignProjectProgram` has two branches (into / out of a Program).

- 2026-09-21 (AD-1 review) — the adversarial review of the AD-1 adapters amendment found the id
  adapter read `uuid`'s own `Date.now()`; it is now `uuidV7IdsOn(clock)`, its millisecond from the
  Clock (AD-15), wired as `uuidV7IdsOn(systemClock)`, with a test. The spine amendment (AD-1 carve-out
  widened to `packages/adapters`, the diagram, the IDs convention, the structural seed) was made in the
  same branch after two rounds (`reviews/review-adversarial-ad1-adapters.md`).

## Review Triage Log

Round 1, 2026-09-21 — blind-hunter (B), edge-case-hunter (E), verification-gap (V).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| B1 | The diff omits the generated SQL (RLS, grants for `program`) | false | Excluded from the review diff as generated output; the registry drift test and `rls.test.ts` cover it | reject |
| B2 / E1 | `findDepartment`/`findProgram` take no lock; concurrent renames record the same `before` | medium | Only `findProject` uses `.for('update')` | patch |
| B3 / V1 | `findProject`'s lock (the only concurrent guard of the Program/Department rule) has no test | medium | Pre-verified; no suite runs two writes concurrently | defer |
| B4 | Create writes return `Result<void>`, so no caller learns the minted id | medium | Tests read the fake id port to work around it | patch |
| B5 / E6 | No test of an own Project given another Tenant's Program/Department id; unit `not_found` table misses `reassignProjectDepartment` rows | medium | The harness replays wholly foreign targets, so the Project lookup fails first | patch |
| B6 / E2 | No-op rename/reassign commits an update and an audit row with `before === after` | low | Behaviour is consistent and recorded honestly; refusing no-ops is a product rule the intent does not state | reject |
| B7 / E5 | The gate accepts either stamp for every write | medium | `expect([AT, NOW]).toContainEqual(...)` | patch |
| B8 | Audit `at` mixes fixture time (project writes) and wall time (org writes) in one Tenant | medium | Project writes stamp `demoAnchor`; org writes the Clock | defer |
| B9 | Nothing stops `packages/*` importing `packages/adapters` | medium | The only new rule starts from `^apps/` | patch |
| B10 | Contract-type literals written three times | low | Drift risk only; fix adds derivation | reject |
| B11 | The real Department move test is order-dependent and does not check other tables | medium | Depends on earlier tests' state; no `allRows` comparison | patch |
| B12 / E7 | Detached comment, over-width lines, stale `audit-sink.ts` pointer | low | Direct fixes | patch |
| E3 | Rollback tests compare row counts, blind to a committed UPDATE | high | Five org writes are update-only; a leaked update passes | patch |
| E4 | "Exactly one row" regex accepts `+11` | low | `/\+1$/`; direct fix | patch |
| V2 | The web app's new `@momo/adapters`/`uuid` build dependency is checked by typecheck only | medium | Pre-verified; CI never runs `next build` | defer |

## Verification

**Setup:** `pnpm db:up`; export `DATABASE_URL`, `APP_DATABASE_URL`, `REQUIRE_DB=1`; re-run the
prepare steps (`drizzle-kit push`, `pnpm db:policies`, `pnpm seed`) after the schema change.

**Commands:**
- `pnpm lint`, the three typechecks, `pnpm depcruise`, `pnpm test` -- all pass.
- Six routes on `next dev` identical to baseline; five forms land identical rows.

**Sabotage (each watched to fail, then restored):** an org write skipping `audit.record`; the
Program/Department check removed; a write ignoring `ctx.tenantId`; a Program move touching another
table; a page importing `@momo/adapters`.

### Results, 2026-09-21

Against `postgres:18.6-alpine` on 55433 with both keys and `REQUIRE_DB=1`; `drizzle-kit push`,
`pnpm db:policies`, `pnpm seed` re-run after the schema change.

| Command | Result |
| --- | --- |
| `pnpm lint`, `pnpm typecheck`, `pnpm --filter @momo/web typecheck`, `pnpm --filter @momo/worker typecheck` | all exit 0 |
| `pnpm depcruise` | exit 0 — 121 modules, 329 dependencies |
| `pnpm test` | **496 passed across 29 files** (382 across 26 before) |
| `pnpm vitest run tests/` with no database env | 88 passed, 91 skipped — the audit gate and both harness gates run |
| six routes (+ `/`) on `next dev`, captured on `119ec43` before any change vs this tree | script-stripped HTML identical for all seven |
| the five forms POSTed (Explain, CR candidate, Plan, Map, map-single, an unmap, a blank note, a foreign Project) on a `119ec43` worktree and on this tree, reseeded between | dumped `mapping_event` / `disposition_event` / `audit_log` / `work_package` rows identical (`diff` empty); 7 audit rows each side |
| `SELECT id FROM tenant` after the runs and sabotage | `ten-momo` alone, reseeded |

**Sabotage — each watched to fail, then restored.**

| # | Sabotage | What caught it |
| --- | --- | --- |
| 1 | `renameProgram` skips `audit.record` | 7 failures: the gate (one record; every declared action seen), both DB rollback tests and the own-Tenant rows, the composition test, the unit test |
| 2 | the Program/Department check removed from `programFor` | 5 failures: both matrix rows in `tests/org-writes.test.ts`, three unit tests |
| 3 | org writes run with `{ tenantId: 'ten-momo' }` instead of `ctx` | 24 failures across the write harness, the org suite and the unit tests (it also wrote into the demo Tenant — reseeded) |
| 4 | `setProjectProgram` also updates `connector` | `tests/org-writes.test.ts`: "moving a Project between Programs changed connector" (the harness's own-row check did not — recorded in deferred-work) |
| 5 | a file under `apps/web/src/components` importing `@momo/adapters`, then by relative path | `pnpm depcruise`: `apps-adapters-only-from-composition-root`, both forms |

---
title: 'Story 1.3 slice 1 — the audit mechanism: audit.record inside the use case''s transaction, a closed action enum, and the audited-use-case gate'
type: 'feature'
created: '2026-09-21'
status: 'done'
baseline_commit: '97e9fe1b343580b7778e06bb5cdbd81360afef88'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-2-web-write-use-cases.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** AD-14/AR-26 require every NFR-A1 use case to call `audit.record(ctx, action, target,
payload)` inside its own `withTenant` transaction, with `action` from a closed enum in
`packages/app/audit`, and a test that fails if an audited use case commits without its record. Today
`packages/db`'s write functions insert `audit_log` rows themselves with free-text actions, no enum
exists, and nothing proves an audited change cannot commit unrecorded. Stories 1.3's hierarchy,
1.4, 1.5, 1.6 and 1.7 all build on this mechanism.

**Approach:** Give `packages/app` a way to run a use case's work inside one tenant transaction it
controls (a port `packages/db` satisfies structurally), add `packages/app/audit` with the closed
action enum and `audit.record`, move the five existing audited writes (FR-29 Dispositions and FR-21
manual Mapping, both on NFR-A1) onto it, and add the gate that enumerates audited use cases.

Decided by the founder on 2026-09-21: story 1.3 is split — this slice is the mechanism; the
organisation hierarchy (`program`, create/rename/reassign) is slice 2, written on it. No Organisation
UI in 1.3. PM assignment moves to 1.4/1.5.

## Boundaries & Constraints

**Always:**
- The five writes land **byte-identical rows** to today's (ids, `at`, actor, action strings,
  payloads), verified by the write harness; the six routes still render identically.
- `audit.record` runs in the same transaction as the change: a change that rolls back leaves no audit
  row, and an audited use case that commits without one is impossible to ship unnoticed.
- `action` is a member of a closed enum declared once in `packages/app/audit`; today's six strings
  (`disposition.map|plan|explain|cr_candidate`, `mapping.map|unmap`) are its first members. A later
  story adds a member, never a free string.
- Direction holds: `packages/app` never imports `@momo/db`; the transaction port and its scoped
  repositories are satisfied structurally at the composition roots. Payloads go through the codec.
- The gate enumerates audited use cases mechanically from the use-case surface (like the harness),
  so a new audited use case is covered the day it is exported, and fails with no database naming a
  write use case that is neither audited nor declared unaudited with a reason.

**Never:**
- No `program` table, no organisation use cases, no UI, no PM assignment (slice 2 / 1.4 / 1.5).
- No `RequestContext`, users or roles; the actor stays the composition root's `user:linh`.
- No change to `audit_log`'s schema, grants or triggers; no database constraint on `action`.
- No Clock consumer yet: the writes keep the Project's `demoAnchor` as `at`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | On failure |
|---|---|---|---|
| Audited write commits | any of the five, own Project | the change and exactly one `audit_log` row, same transaction, rows as today | name the use case |
| Work fails after the audit call | the change throws after `audit.record` | nothing lands — no change, no audit row | name the use case |
| Audit insert fails | `audit_log` insert refused | the change rolls back too | — |
| Audited use case records nothing | a write that skips `audit.record` | the gate fails naming it | — |
| Unknown action | a string not in the enum | does not typecheck; refused at runtime if forced | — |
| New write, unclassified | exported, neither audited nor declared unaudited | gate fails with no database, naming it | — |

</frozen-after-approval>

## Code Map

- `packages/db/src/repo-writes.ts` — five functions, each `withTenant(db, tenantId, …)` via
  `inProject`; `recordDisposition` inserts `audit_log` (:157, `disposition.${kind}`),
  `recordManualMapping` (:296, `mapping.map|unmap`, payload `{ wpId }`); `at` = `demoAnchor`;
  payloads through `encode`. The audit inserts move out; the event inserts stay.
- `packages/db/src/with-tenant.ts:50` — `withTenant(db, tenantId, fn(tx))`, `Tx` type :11.
  `deferred-work.md` (~:199/:224) warns nested `withTenant` calls are separate transactions — the new
  port must be the only transaction boundary a use case opens.
- `packages/app/src/ports/project-write.ts` — `ProjectWritePort<Handle>` / `ProjectWriteDeps` (actor
  in deps, `kind` literals); `use-cases/project-writes.ts`, `project-write-input.ts`
  (`runProjectWrite`, `not_found` via `isProjectNotFound`).
- `apps/web/src/server/composition.ts` (`projectWriteDeps()`, `satisfies`, `WEB_ACTOR`) and the
  harness's own composition root in `tests/cross-tenant-writes.test.ts` (`restrictedWriteDeps`).
- `tests/read-use-cases.ts` (`kind: 'write'`, `invokeWrite`), `tests/cross-tenant-writes.test.ts`
  (`EXPECTED` rows incl. audits decoded through the codec), `tests/web-composition.test.ts` (spies per
  repository function — changes with the port shape).
- `audit_log` (`schema.ts:229`): append-only, app role SELECT/INSERT only; `seed.ts:381` writes
  `demo.seed` as `system:seed` — seed tooling, not a use case, stays as is.

## Tasks & Acceptance

**Execution:**
- [x] `packages/app/src/audit/` -- `AUDIT_ACTIONS` closed enum, `AuditAction`, `audit.record(scope,
      ctx, action, target, payload)` writing through the transaction scope's audit sink.
- [x] `packages/app/src/ports/` -- a tenant-transaction port whose scope exposes the project write
      repository and the audit sink bound to that one transaction; the write port reshaped onto it.
- [x] `packages/app/src/use-cases/project-writes.ts` -- each write runs its change and its
      `audit.record` inside one scope; declares its audit action for the gate.
- [x] `packages/db/src/repo-writes.ts` (+ an audit sink) -- event writes without audit inserts;
      `audit_log` insert as the sink, through the codec; the transaction port on `withTenant`.
- [x] Composition roots (`apps/web/src/server/composition.ts`, the harness) -- wire the new shape.
- [x] Gate test -- enumerate the use-case surface: every write is audited (drive it against a fake
      scope: exactly one record on commit, none when the work throws) or declared unaudited with a
      reason; pure, no database. The DB harness keeps asserting the real rows.
- [x] `deferred-work.md` -- resolve what this closes; record anything found.

**Acceptance Criteria:**
- Given the five writes on the running app for `prj-ec2`, when compared with the baseline, then the
  same rows land.
- Given the suite, when lint, the three typechecks, depcruise and tests run, then all pass, the harness
  still discharges NFR-S1, and each gate row of the matrix has been watched to fail.

## Implementation Notes

**What landed.** `packages/app/src/audit/index.ts`: `AUDIT_ACTIONS` (the six existing strings, in a
closed `as const` tuple), `AuditAction`, `isAuditAction`, the `AuditSink`/`AuditScope`/`AuditEntry`
types, `AuditDeclaration`, and `audit.record(scope, ctx, action, target, payload)` — `ctx` is the
`{ actor, at }` stamp; it refuses a non-member at run time before the sink is called.
`ports/tenant-transaction.ts`: `TenantTransaction<Handle, Scope>` = `<T>(handle, tenantId, work(scope))`.
`ports/project-write.ts` is reshaped: `ProjectWriteDeps` = `{ handle, actor, transaction }`; the
scope is `{ projectWrite: ProjectWriteRepository, audit: AuditSink }`; repository members are
`(stamp, command)` bound to the transaction (no handle, no Tenant), plus `projectAnchor(projectId)`
which rejects with the not-found wording. `runProjectWrite` validates, opens ONE transaction for
`ctx.tenantId`, reads the anchor, and hands each use case `(scope, stamp, command)`; each use case
makes its change then calls `audit.record` on the same scope with exactly the payload `packages/db`
used to build. Plan's repository member returns `{ wpId }` so the audit payload records the created
Work Package id without the id scheme moving into `packages/app`.

`packages/db`: `audit-sink.ts` (`auditSinkOn(tx, tenantId)`, the one `audit_log` insert, payload
through `encode`) and `repo-writes.ts`'s `inTenantTransaction(db, tenantId, work)` — one `withTenant`,
scope built on its `tx`. The five `record*` functions are now scope members, no longer exported;
`grep auditLog packages/db/src/repo-writes.ts` is empty. Both composition roots wire
`transaction: inTenantTransaction` under `satisfies ProjectWriteDeps<Db>`.

**The declaration and the gate.** Each write module exports its declaration beside the use cases
(`PROJECT_WRITE_AUDIT` in `project-writes.ts`, not on the enumerated surface);
`use-cases/audit-declarations.ts` spreads them into `USE_CASE_AUDIT`. `tests/audited-use-cases.test.ts`
(pure) requires every export of the surface that is not a registered read to be declared, every
declaration to name an exported write with real enum members or a reason, and drives each audited
one through its registry `invokeWrite` against a fake transaction that commits on resolve and
discards on throw: one transaction, exactly one committed record of a declared action in the same
transaction as the change; none when a repository member throws; none when the transaction fails
after the work. `invokeWrite` became generic in the handle so the gate and the harness share it.

**The DB half.** `tests/cross-tenant-writes.test.ts` adds, per write, two rollback proofs through the
real `inTenantTransaction`: the work resolving (audit appended — counted) and the transaction then
throwing before COMMIT lands nothing; the sink handed a NUL target — a real Postgres refusal — rolls
the change back. The existing own-Tenant `EXPECTED` rows (audit action, payload, `at`, actor) are
unchanged and pass.

## Spec Change Log

- 2026-09-21 — files the Tasks list did not name: `ports/tenant-transaction.ts` (the port on its own),
  `use-cases/audit-declarations.ts` (the one table the gate reads, off the enumerated surface),
  `packages/db/src/audit-sink.ts` (the sink as its own module, so the grep in Verification returns
  nothing for `repo-writes.ts`), `packages/app/src/audit/audit.test.ts`, and a CI-header entry for the
  gate (it runs inside `pnpm test`; no new step). `tests/read-use-cases.ts`'s `invokeWrite` is now
  generic in the handle.
- 2026-09-21 — "the work throwing after the audit call" was sabotaged as a use case that records first
  and then swallows its change's failure (the gate's "no record when the change throws" and the unit
  test fail); the DB-level form of the same risk — the sink on its own transaction — is caught by the
  harness's rollback tests.

## Review Triage Log

Round 1, 2026-09-21 — blind-hunter (B), edge-case-hunter (E), verification-gap (V).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| B1 | A write can call `scope.audit.append` directly and skip `record`'s runtime enum refusal | medium | The work receives the raw sink; the db sink takes `action: string` and the column has no constraint | patch |
| B2 | The payload type is not tied to the action | medium | `record(..., payload: unknown)`; per-action schemas live only in the harness | defer |
| B3 | Unmap/remap records no previous Work Package | low | The approved intent requires byte-identical rows (`{ wpId: '' }` today) | reject |
| B4 | CI header claims the no-database gate caught the second-transaction sink sabotage | low | `deferred-work.md` says only the Postgres rollback tests caught it | patch |
| B5 | The gate and transaction port are hard-wired to project writes; slice 2's scopes are not provided for | medium | `drive()` builds a `ProjectWriteScope`; `inTenantTransaction` builds only that scope | defer |
| B6 | The gate checks count/action/stamp, not target or payload | low | Per-case unit tests and the DB harness pin payloads; a generic payload check needs per-action schemas (B2) | reject |
| B7 | The Postgres-refusal rollback test asserts only that an error occurred | low | `outcome.error` defined; direct fix | patch |
| B8 | `AUDIT_ACTIONS` test compares the whole array, so a later member fails it | low | `toEqual` on the list; direct fix | patch |
| B9 | Audit order unrecoverable because `at` is the fixed demo anchor | false | `audit_log.seq` is an identity column; insertion order is recoverable | reject |
| B10 | The gate never drives the not-found or refused-append paths | low | Covered by `project-writes.test.ts` and the DB rollback tests | reject |
| B11 | `AuditStamp`/`WriteStamp` duplicate; db restatements exported under the same names as app's | low | Compiles today; no file imports both names | reject |
| B12 | Spec missing from the diff | false | Deliberately withheld from the blind layer | reject |
| B13 | Split entries have `source_spec: none`; two partial re-entrancy entries overlap | low | `none` is the split format; the overlap is cosmetic | reject |
| E1 | An export named like an `Object.prototype` key counts as declared | low | Plain-object lookup; direct fix | patch |
| E2 | The gate never drives `mapTicket`'s unmap branch | medium | One input per use case; the unit test and harness cover unmap | defer |
| V1 | "no record when the transaction fails after its work" can never fail | low | Redundant with the one-transaction assertion and the DB tests; harmless | reject |

## Verification

**Setup:** `pnpm db:up`; export `DATABASE_URL`, `APP_DATABASE_URL`, `REQUIRE_DB=1`.

**Commands:**
- `pnpm lint`, the three typechecks, `pnpm depcruise`, `pnpm test` -- all pass.
- `grep -rn "auditLog" packages/db/src/repo-writes.ts` -- only inside the audit sink.
- Six routes on `next dev` identical to baseline; the five forms submitted on baseline and new
  worktrees (reseeding between) land identical rows.

**Sabotage (each watched to fail, then restored):** a write skipping `audit.record`; `audit.record`
called outside the scope (its own transaction); the work throwing after the audit call; an action
string outside the enum; a new write exported unclassified.

### Results, 2026-09-21

Against `postgres:18.6-alpine` on 55433 with both keys and `REQUIRE_DB=1` exported.

| Command | Result |
| --- | --- |
| `pnpm lint`, `pnpm typecheck`, `pnpm --filter @momo/web typecheck`, `pnpm --filter @momo/worker typecheck` | all exit 0 |
| `pnpm depcruise` | exit 0 — 107 modules, 275 dependencies |
| `pnpm test` | **380 passed across 26 files** (338 across 24 before) |
| `pnpm vitest run tests/` with no database env | 43 passed, 55 skipped — the audit gate and both harness gates run |
| `grep -rn "auditLog" packages/db/src/repo-writes.ts` | nothing; the one insert is `packages/db/src/audit-sink.ts` |
| six routes on `next dev`, baseline worktree (`97e9fe1`) vs this tree, before submitting | normalised HTML identical for all six |
| the five forms POSTed (Explain, CR candidate, Plan, Map, map-single, an unmap, two refusals) on each side, reseeded between | dumped `mapping_event` / `disposition_event` / `audit_log` / `work_package` rows **identical** (`diff` empty); 7 audit rows each side |
| `SELECT id FROM tenant` after runs and sabotage | `ten-momo` alone, reseeded |

**Sabotage — each watched to fail, then restored.**

| # | Sabotage | What caught it |
| --- | --- | --- |
| 1 | `explainTickets` skips `audit.record` | 8 failures: the gate (*committed 0 audit records*), both DB rollback tests and the own-Tenant rows for Explain, the composition test, three unit tests |
| 2a | `explainTickets` records on a second `deps.transaction` | 4 failures: the gate (*opened 2 transactions*), the composition test, two unit tests |
| 2b | `packages/db`'s sink appending on its own `withTenant` | 5 failures: every write's *work failing after audit.record lands neither* (the audit row survived); the pure gate cannot see it — recorded in deferred-work |
| 3 | `mapTicket` records first, then swallows its change's failure | the gate (*commits no record when its change throws*) and the unit rethrow test |
| 4 | `'disposition.forged'` as Explain's action | TS2345 at `project-writes.ts`; forced `as never`: 10 test failures, `audit.record` refusing it |
| 5a | `mapTicketsAgain` exported, unregistered | with no database: the audit gate names it, and the harness gate |
| 5b | the same, registered `kind: 'write'` but undeclared | the audit gate names it (and the write harness's EXPECTED check) |

---
title: 'Story 1.4 slice 2 — revocation and membership changes as audited use cases'
type: 'feature'
created: '2026-09-21'
status: 'done'
baseline_commit: '8a8eded5394be50103a4390a112d7f106239c066'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-identity-and-request-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Access cannot be taken away or changed. `tenant_membership` is SELECT-only for the app
role, so a user keeps their role and Projects until someone edits the database by hand, and no
audit row records who changed it.

**Approach:** Add audited `packages/app` use cases that revoke a membership, change its role, and
assign or unassign a PM's Project in `project_ids`, written through a new `membership` write-scope
family in `packages/db`. Revocation deletes the row. Slice 1's resolver already refuses the next
request of a user whose active Tenant has no membership, and ends that session.

Decided by the founder on 2026-09-21: every use case in this slice requires `tenant_admin` in
`ctx.roles` and answers `not_found` otherwise (a local check ahead of story 1.5); revoking or
demoting the Tenant's last `tenant_admin` is refused (`invalid_input`, rule code
`last_tenant_admin`); adding a user to a Tenant is out of scope (invitation work, after slice 4's
mailer), so the app role gets SELECT, UPDATE and DELETE on the bridge but no INSERT; no screen —
use cases, composition-root bindings and tests only, as story 1.3's organisation writes shipped.
The spec was kept above the token target on purpose.

## Boundaries & Constraints

**Always:**
- Every membership write runs in `runAuditedWrite` inside `inTenantTransaction(ctx.tenantId)` and
  writes its audit row in that transaction, with the previous value. New closed actions:
  `membership.revoke`, `membership.change_role`, `membership.assign_project`,
  `membership.unassign_project`. The audit target is the member's user id.
- The table has no RLS, so every writer query filters by the bound `tenantId` explicitly. The
  target is found with a row lock (`FOR UPDATE`). A user without a membership in this Tenant
  answers `not_found`.
- The role check runs before `runAuditedWrite` (no parse, no transaction), so a non-admin gets
  `not_found` even for malformed input.
- Inside the transaction, all four use cases take their locks in ONE ordered statement:
  `WHERE tenant_id = $t AND (role = 'tenant_admin' OR user_id IN ($caller, $target)) ORDER BY
  user_id FOR UPDATE` — never `FOR UPDATE` on an aggregate, never a second membership lock. Then,
  in TypeScript and in this order: the caller must be among the rows with role `tenant_admin`, else
  `not_found` (a context resolved once per server action may be stale); the target must be among
  them, else `not_found`; for revoke and change role, the last-admin count.
- Audit payloads: revoke `{ before: { role, projectIds } }`; change role `{ before: role, after:
  role }`; assign and unassign `{ before: string[], after: string[] }`.
- The new role may only be `tenant_admin` or `pm`. A target whose current role is anything else
  (unknown string included) may still be revoked, re-roled, assigned or unassigned. `client_viewer` and `internal_viewer` answer
  `invalid_input`. A Project id must name a Project of this Tenant, or the answer is `not_found` — for assign only; unassign removes a
  stale id whose Project no longer exists. Assign and unassign work on either role, and a
  promotion to `tenant_admin` keeps `projectIds` (so a demotion restores them).
- The app role gets SELECT, UPDATE and DELETE (no INSERT) on `tenant_membership` through the
  registry's `appPrivileges` override.
  The `tenantBridge` flag and the no-RLS assertion stay. The SQL is regenerated.
- The single-reader rule stays. The writer is a new module added to the source test's allowed
  importers. `membershipsOf` stays pinned to its five files.

**Never:**
- No write through `packages/db/auth` or Better Auth. The use cases never delete sessions; the
  resolver ends them on the next request.
- No invitation, no creating users, no mail, no Google, no tenant switcher, and no role checks on
  any other use case (story 1.5).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Revoke | `linh` has a membership, session with `activeTenantId` set | Row deleted; audit `membership.revoke` with `{ before: { role, projectIds } }`; `linh`'s next request resolves `signed_out`, session row gone | N/A |
| Change role | `pm` → `tenant_admin` | Role updated, `projectIds` kept; audit `{ before, after }` | Same role → no-op, no audit row |
| Assign Project | PM, Project of this Tenant | Id appended once; audit with previous list | Already assigned → no-op, no audit row |
| Unassign Project | Id present | Id removed; audit with previous list | Not present → no-op, no audit row |
| Revoke before first page | Session has no `activeTenantId` yet | Next request resolves `no_access`; session kept | N/A |
| Unknown member | User with no membership in this Tenant (or only in another Tenant) | — | `not_found`, nothing written |
| Foreign Project | Project id of another Tenant | — | `not_found`, nothing written |
| Unassignable role | `client_viewer` | — | `invalid_input` |
| Not an admin | Caller's roles lack `tenant_admin` | — | `not_found`, nothing written |
| Last admin | Revoke or demote the only `tenant_admin` (the caller included) | — | `invalid_input` `last_tenant_admin`, nothing written |
| Concurrent self-demotions | The only two admins each demote themselves at once | One `ok`, one `last_tenant_admin` | No deadlock |
| Concurrent cross-demotions | Two admins demote each other at once | One `ok`, one `not_found` (the loser is no longer an admin) | No deadlock |
| Concurrent cross-assigns | Two admins assign Projects to each other at once | Both `ok` | No deadlock |
| Self-revoke | Caller revokes themself, another admin remains | `ok`; the caller's next request resolves `signed_out` | N/A |
| Stale caller | Caller demoted after its context was resolved | — | `not_found`, nothing written |

</frozen-after-approval>

## Code Map

- `packages/app/src/use-cases/audited-write.ts:71-96` -- `runAuditedWrite(schema, deps, ctx, input,
  plan, work)`; `refuse(code, details)` rolls back. Reuse as-is.
- `packages/app/src/use-cases/org-writes.ts` -- the pattern to copy: `runOrgWrite` (`:90-98`, `at =
  deps.clock.now()`), `visibleX` lookups (`:100-110`), rule codes as `refuse('invalid_input',
  { field: [CODE] })` (`:116,132`), `ORG_WRITE_AUDIT` (`:316-325`), input schemas in `org-input.ts`.
  `findProject` in the org scope serves the Project existence check.
- `packages/app/src/ports/org-write.ts:93-106`, `ports/write-deps.ts:18-23` -- add a
  `MembershipWriteScope` family to `WriteScope`; the comment there says so.
- `packages/app/src/audit/index.ts:29-46` -- `AUDIT_ACTIONS`; comment `:36-37` anticipates PM
  assignment. `audit_log.action` is text with no DB CHECK.
- `packages/app/src/use-cases/audit-declarations.ts:14`, `use-cases/index.ts` -- spread a
  `MEMBERSHIP_WRITE_AUDIT`, export the use cases.
- `packages/app/src/authz/request-context.ts:14-15,34` -- `ROLES`, `isRole`; no role check exists anywhere yet. `ports/membership.ts`
  says writes are slice 2's; update the comment.
- `packages/app/src/authz/resolve-request-context.ts:77-83` -- already ends the session and returns
  `signed_out` when the active Tenant has no membership. No change.
- `packages/db/src/tenant-transaction.ts:32-49` -- `writeScopeOn(bound)`; add `membership:
  membershipWriterOn(bound)`.
- `packages/db/src/repo-org.ts:68-105` -- `exactlyOne`, `.for('update')` finds: the shape for the
  new `packages/db/src/repo-membership-write.ts`.
- `packages/db/src/schema-membership.ts:22-33` -- PK `(user_id, tenant_id)`, `role` text,
  `project_ids text[]`, no FKs. Not re-exported by the barrel.
- `packages/db/src/table-classes.ts:136-142,244-252,304` -- add `appPrivileges` to the entry; fix
  the header prose (`:33-35`) and `why`. `registry.test.ts:127-147` pins the overridden set (four
  Better Auth tables) and `['SELECT']` for the bridge. `rls.test.ts:486-530` follows the registry.
  Then `pnpm db:sql` (rewrites `packages/db/sql/grants.sql:27-28`) and `pnpm db:policies`.
- `packages/db/src/source-discipline.test.ts:129` -- add the writer to `ALLOWED_IMPORTERS`; `:160`
  (FROM/JOIN ban) and `:168-183` (five `membershipsOf` files) stay.
- `tests/audited-use-cases.test.ts` -- add a fake `membership` family to `FAKE_FAMILIES`
  (`:120-144`, typed so it will not compile without one), `WORLD`/`TARGET` data, and the stamp
  mapping in `expectedStamp` (~`:268`).
- `tests/read-use-cases.ts:72-82,264`, `tests/write-expectations.ts:146`,
  `tests/cross-tenant-writes.test.ts:93-104`, `tests/write-harness.ts:253-291` -- register each
  write (`kind: 'write'`, `invokeWrite`, `moreWrites`). `landedRows` reads through `withTenant` and
  has no membership table, so add one read filtered by `tenant_id`. `tests/request-context.ts:14`
  hard-codes `roles: ['pm']`; add an admin context for the new writes (and a PM one proving `not_found`).
- `apps/web/src/server/composition.ts:273-280,316-362` -- add bindings in the org-write shape
  (`(input, ctx?)`); `tests/web-composition.test.ts` lists them (`ORG_CASES`, `:266+`).
- `packages/db/src/demo-identities.ts`, `seed.ts:437-483` -- `linh` (PM, `['prj-ec2']`) and `hoang`
  (Tenant Admin, `[]`); probe Tenants create members too.

## Tasks & Acceptance

**Execution:**
- [x] `packages/db/src/table-classes.ts`, `registry.test.ts`, `packages/db/sql/*.sql` -- grant SELECT, UPDATE, DELETE on `tenant_membership` via `appPrivileges`, update the pins and prose, regenerate -- the app role must write the bridge
- [x] `packages/db/src/repo-membership-write.ts`, `tenant-transaction.ts`, `index.ts`, `source-discipline.test.ts` -- the writer (lock the admin rows ordered by user id, locked find, delete, set role, set Project ids), every query scoped by `tenantId`; wire it into the write scope; allow the importer and pin the files naming `membershipWriterOn` like `membershipsOf` (`:168-183`); reword "single reader"/"read-only" prose (`schema-membership.ts:12-18,29`, `repo-membership.ts:15-23`, `ports/membership.ts:6`, `registry.test.ts:128-131`) to "one reader for request resolution, one writer" -- one writer, pinned
- [x] `packages/app/src/ports/{membership-write,write-deps}.ts`, `audit/index.ts` -- the port family and the four actions -- closed enum
- [x] `packages/app/src/use-cases/{membership-writes,membership-input}.ts` + unit test, `audit-declarations.ts`, `index.ts` -- `revokeMembership`, `changeMemberRole`, `assignMemberProject`, `unassignMemberProject` per the matrix, each gated on `tenant_admin` -- the slice
- [x] `tests/**` -- enumeration stays complete; cross-tenant writes proven:
  - `request-context.ts`: `requestContextFor` takes roles; every registry entry for these writes uses an admin context (a PM context would make the foreign test vacuous);
  - `read-use-cases.ts`: `WriteTarget.memberUserId` from the probe PM; fixed order on the one probe — promote the PM, assign, unassign, revoke last (or a third probe member);
  - `write-harness.ts`: the bridge, filtered by `tenant_id`, in `rowCounts`, `allRows` and `landedRows`, with a `(user_id, tenant_id)`-keyed diff that reports removed rows; `LANDED_TABLE.memberships`; the three payload shapes in `auditPayloadJson`;
  - gate: a `membership` fake with two admins, `moreWrites` without the no-op branches, `MEMBERSHIP_WRITE_AUDIT` → `NOW` in `expectedStamp`;
  - the harness caller (`HARNESS_USER_ID`, `request-context.ts:11`) gets a `tenant_admin` membership in both probe Tenants and in the gate fake, or every write answers `not_found` at the caller check; the foreign test also runs each entry with a target absent from both Tenants, so the refusal is shown to come from the target lookup;
  - probe cleanup (`probe-tenants.ts:413-423`) also deletes the known probe user ids, because a revoked user has no membership left to find them by
- [x] `tests/membership.test.ts` (Postgres) -- the matrix end to end (resolve once before revoking so the active Tenant is persisted, as `identity.test.ts:170` does), the three concurrency rows, a user with memberships in both Tenants (act as one Tenant on that user, assert the other Tenant's bridge rows are unchanged through `allRows`; kept out of `WriteTarget.memberUserId`), and revocation refusing the next request through `resolveRequestContext` with the real `IdentityPort` -- FR-3
- [x] `apps/web/src/server/composition.ts`, `tests/web-composition.test.ts` -- four bindings -- reachable from a future server action
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- mark the slice 2 entry done; record anything deferred

**Acceptance Criteria:**
- Given a revoked user with a live session, when they make their next request, then it resolves `signed_out` and their session row is gone.
- Given any membership use case that throws after its write, when the transaction rolls back, then neither the membership change nor an audit row remains.
- Given the audited-use-case gate and the cross-tenant write harness, when CI runs, then each new use case is enumerated, audited with its declared action, and cannot touch another Tenant's membership.
- Given each of these sabotages, when CI runs, then a test fails: the `tenant_id` filter dropped from the locked find, and separately from the delete/update; the lock statement split into two (the concurrency tests); the audit call removed from one use case; `membershipWriterOn` named in a second module.

## Implementation Notes

- **Registry.** `tenant_membership` carries `appPrivileges: ['SELECT', 'UPDATE', 'DELETE']` beside
  `tenantBridge`; `pnpm db:sql` changed `grants.sql` only. `registry.test.ts` pins five overridden
  tables, the bridge's three verbs.
- **Writer.** `packages/db/src/repo-membership-write.ts` `membershipWriterOn(bound)`: `lockMembers`
  (the one ordered `FOR UPDATE` statement), `deleteMembership`, `setRole`, `setProjectIds`, each
  `tenant_id`-filtered and `exactlyOne`-checked. Composed as `membership` in `inTenantTransaction`;
  the barrel exports the `LockedMemberRow` type only. `source-discipline.test.ts` allows the writer
  as an importer and pins `membershipWriterOn` to it and `tenant-transaction.ts`.
- **App.** `ports/membership-write.ts` (`MembershipWriteRepository`, `MembershipWriteScope` =
  `membership` + `org.findProject` + `audit`, `MembershipWriteDeps`), joined into `WriteScope`.
  `use-cases/membership-{input,writes}.ts`: the admin gate before `runAuditedWrite`, then lock →
  caller → target → last admin (`LAST_TENANT_ADMIN`, under `details.userId`) → no-op → change →
  record. `ASSIGNABLE_ROLES = ['tenant_admin', 'pm']` via `z.enum`.
- **Harness.** `requestContextFor(tenantId, userId, roles)` and `adminContextFor`; `WriteTarget`
  gained `memberUserId` (the probe PM) and `staleProjectId`; `stageProbeMembers` gives the harness
  user a `tenant_admin` membership in each write probe and sets the PM's Projects to the stale id,
  so promote → assign → unassign (stale) → revoke each change something from the start state and
  from where the previous left it. `rowCounts`/`allRows` include the bridge by an explicit
  `tenant_id` filter; `landedRows.memberships`, `newSince` diffs it by `(user_id, tenant_id)` and
  reports `membershipsRemoved`.
- **Probe cleanup.** `removeProbeTenant(owner, probe)` now takes the probe and also deletes its
  known member ids (`probeMemberIds`); every caller passes the probe.

## Spec Change Log

- 2026-09-21 — files the Tasks list did not name: `tests/write-expectations.ts` (the four expected
  row sets), `tests/cross-tenant-writes.test.ts` (staging, the absent-ids run, removed-row tables),
  and the `removeProbeTenant` callers in `tests/{cross-tenant,identity,org-writes}.test.ts`.
- 2026-09-21 — the foreign test's "target absent from both Tenants" run is made as the OWN Tenant
  with every id absent (recorded in `deferred-work.md` with the reasoning).
- 2026-09-21 — the spine (AD-21, AD-23) and `epic-1-context.md` still describe the bridge as
  SELECT-only with one reader; left for an amendment with its own adversarial review (deferred-work).

## Verification Results (2026-09-21)

Against `postgres:18.6-alpine` on 55433, `REQUIRE_DB=1`, after `pnpm db:policies && pnpm seed`.

| Command | Result |
| --- | --- |
| `pnpm lint`, `pnpm typecheck`, `pnpm --filter @momo/web typecheck` | exit 0 |
| `pnpm depcruise` | exit 0 — 159 modules, 455 dependencies |
| `pnpm db:sql` | only `packages/db/sql/grants.sql` changes |
| `pnpm test` | **676 passed across 36 files** (570 across 34 before); run four times, stable |

**Sabotages — each watched to fail, then restored.**

| # | Sabotage | What caught it |
| --- | --- | --- |
| 1 | `tenant_id` dropped from `lockMembers` | 8 failures: the foreign replay of three membership writes (`cross-tenant-writes`), and `membership.test` (other-Tenant member ×2, other-Tenant admin, last admin, self-demotion race) |
| 2 | `tenant_id` dropped from the delete/update WHERE | `membership.test` — the user in both Tenants |
| 3 | the lock split in two (caller+target, then admins) | `membership.test` — self-demotion race; split per row instead: all three concurrency rows |
| 4 | `audit.record` removed from `unassignMemberProject` | 8 failures: the gate ×2, the unit test, own-Tenant rows and both rollback tests, `membership.test`, `web-composition` |
| 5 | `membershipWriterOn` re-exported from `repo-org.ts` | `source-discipline.test.ts` |

## Review Triage Log

Spec review round 1 (2026-09-21, adversarial, against `8a8eded`). All accepted and patched into the spec.

| # | Finding | Verdict | Change |
|---|---|---|---|
| 1 | "Count, locked" is illegal (`FOR UPDATE` on an aggregate) or deadlocks | high | Lock admin rows ordered by user id first; concurrency test |
| 2 | Harness helpers loop over `TENANT_OWNED`, never see the bridge; diff keyed by `id` misses deletes | high | Bridge in `rowCounts`/`allRows`/`landedRows`, keyed diff with removals |
| 3 | Two sabotage probes would not fail (importer test; per-Tenant probe user ids) | high | Pin `membershipWriterOn` files; a user in both probe Tenants |
| 4 | Registry contexts are PM, so the foreign test passes vacuously on `not_found` | high | Admin contexts for these entries |
| 5 | Own-Tenant writes share one probe; order matters | medium | Fixed target order, revoke last |
| 6 | New payloads fail the strict `auditPayloadJson` union | medium | Payloads fixed in Boundaries, added to the union |
| 7 | Revocation with no `activeTenantId` yields `no_access`, session kept | medium | Matrix row; test resolves first |
| 8 | Context resolved once per action can be stale after a demotion | medium | Caller's row locked and re-checked in the transaction |
| 9 | Parse before the role check leaks `invalid_input` to non-admins | medium | Role check before `runAuditedWrite` |
| 10 | Admin targets, same-role, stale unassign, `projectIds` on promotion undecided | medium | Decided in Boundaries and matrix |
| 11 | Gate fake needs two admins, no no-op `moreWrites`, stamp mapping | medium | Tests task |
| 12 | "Single reader"/"read-only" prose becomes false | low | Rewording task |
| 13 | Assign locks the Project row; scope typing | low | Design Notes |

Spec review round 2 (2026-09-21, adversarial). All accepted and patched.

| # | Finding | Verdict | Change |
|---|---|---|---|
| 1 | Cross-demotion answers `not_found` for the loser, not `last_tenant_admin`; check order unstated | high | Check order fixed; matrix split into self- and cross-demotion rows |
| 2 | Caller/target locks outside the admin-row order still deadlock (cross-assigns, revoke vs assign) | high | One ordered lock statement for all four use cases; cross-assign test |
| 3 | Harness caller has no membership, so every write is `not_found` | high | Admin membership for `HARNESS_USER_ID`; absent-target run in the foreign test |
| 4 | Shared-user probe cannot see a dropped update/delete filter | high | Dedicated test via `allRows` of the other Tenant |
| 5 | Revoked probe users leak past cleanup | medium | Cleanup deletes known probe user ids |
| 6 | "Assignable" ambiguous; targets with other roles; self-revoke | low | Reworded; decided; matrix row |

Code review round 1 (2026-09-21): Blind Hunter (B), Edge Case Hunter (E), Verification Gap (V).

| # | Finding | Verdict | Route | Evidence |
|---|---|---|---|---|
| B1 | `epic-1-context.md` restates "SELECT only" and "single reader", now false | low | defer | Compiled from the spine, whose amendment is already deferred (planning docs need an adversarial review); regenerate after it. |
| B2 | `raceBehindLock` releases the blocker mid-transaction on a timeout, so the file hangs | low | patch | Only on the failure path; `release(failed)` destroys the connection. |
| B3 | `waitForLockWaiters` counts waiters database-wide; parallel files could release the blocker early | low | patch | Vitest runs files in parallel; now counts backends queued behind the blocker's pid (recursive, since the second write waits on the first). |
| B4 | No test shows a role change reaching the next request | medium | patch | Only revocation went through the resolver; test added. |
| B5 | No race of revoke against assign on the same target | low | reject | One lock statement; the split-lock sabotage already fails three concurrency tests. |
| B6 | Tenant Admins can hold `projectIds`; story 1.5 is not told to ignore them for reach | low | defer | Deferred entry for 1.5. |
| B7 | The foreign replay depends on test order | low | reject | Vitest runs describes in declaration order; no shuffle configured. |
| B8 | Id inputs have no maximum length | low | reject | Same as `org-input.ts`; a long id is only a failed lookup. |
| B9 | A revoked user's account stays and can sign in to `no_access` | low | defer | By design (revocation removes access, not the user); recorded for account lifecycle. |
| B10, E3 | Deferred note says revocation always signs out; no-active-Tenant sessions resolve `no_access` | low | patch | Matches the spec's matrix; note corrected. |
| B11 | Unit tests do not pin "one lock, first" for change role and unassign | low | reject | The integration concurrency tests and the split-lock sabotage cover it. |
| B12 | Truncated prose in `composition.ts`, `audit/index.ts` | low | patch | Phrases completed. |
| E1 | A PM promoted concurrently is not counted, so a write can answer `last_tenant_admin` | low | reject | READ COMMITTED skips rows that newly match; the result is a safe refusal a retry clears, never a lost admin. |
| E2 | `removeProbeTenant` with an empty `idPrefix` would delete demo users | false | reject | Every caller passes a probe from `createProbeTenant`, whose prefix is `${token}-`; the demo options never reach it. |
| E4 | Membership entries have no `moreWrites`; demotion and admin revoke never reach the gate | medium | patch | Deviation from the tests task; `moreWrites` added with `WriteTarget.secondAdminUserId`. |
| V1 | Revoked-member cleanup in `removeProbeTenant` is exercised by no test | medium | patch | `beforeEach` restored memberships before cleanup; test added, watched to fail with `probeMemberIds` dropped. |

## Design Notes

- **Revocation is a delete.** The audit row keeps the previous role and Projects, so no
  `revoked_at` column or migration is needed, and the resolver needs no change: an active Tenant
  without a membership already ends the session and signs out.
- **Locks.** Assign takes `findProject`'s `FOR UPDATE` on the Project row (`repo-org.ts:94-105`),
  so it waits on a concurrent Project rename; acceptable. The use-case scope reaches `org` because
  `WriteScope` is the intersection of the families (`write-deps.ts:18`).
- **No-ops write nothing.** Assigning a Project already held, unassigning one not held, or setting the current role, returns
  success without a write or an audit row, so the log records only changes.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm depcruise` -- expected: clean
- `pnpm db:sql` -- expected: only `grants.sql` changes
- `REQUIRE_DB=1 pnpm test` (after `pnpm db:policies && pnpm seed`) -- expected: all green
- The sabotage probes in the acceptance criteria, each watched to fail, then restored

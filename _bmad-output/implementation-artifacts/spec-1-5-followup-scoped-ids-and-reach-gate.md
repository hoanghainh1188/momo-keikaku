---
title: 'Story 1.5 follow-up — a Work Package id belongs to the Project it is written under, and the role gate proves reach'
type: 'bugfix'
created: '2026-09-22'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-5-roles-decide-what-each-person-can-reach.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Two gaps story 1.5's review and the AD-12 amendment left open (`deferred-work.md`).
`mapTickets` and `mapTicket` authorise `command.projectId` but never check that the `wpId` they
write belongs to that Project, so a PM who reaches Project A can append permanent `mapping_event` /
`disposition_event` rows in A that name a Work Package of Project B (spine AD-12, "a project-scoped
call's other ids belong to its Project"). And `tests/role-declarations.test.ts` proves only the role
half of authorisation: a project-scoped runner that skips the reach check still passes CI.

**Approach:** Add a read to `ProjectWriteRepository` that answers whether a Work Package id is a
Work Package of a Project, implemented in `packages/db/src/repo-writes.ts` on the tenant
transaction; `mapTickets` and `mapTicket` call it before any write and `refuse('not_found')` on a
mismatch (a lookup, not a message match). An empty `wpId` (an unmap) is exempt; Ticket ownership
stays deferred to Epic 5. Add a third behavioural loop to the role gate: every `projectScoped`
entry, called as a PM whose `projectIds` omit the named Project, with well-formed input from a
per-export fixture map whose completeness the test asserts, and deps that throw, answers
`not_found` touching nothing. Decided by the founder on 2026-09-22 (AD-12 amendment, PR #38).

</frozen-after-approval>

## Implementation Notes

- `ProjectWriteRepository.workPackageInProject(projectId, wpId)` (port `packages/app/src/ports/project-write.ts`, implemented in `packages/db/src/repo-writes.ts`): one `SELECT … WHERE id AND project_id LIMIT 1` on the scope's transaction, so RLS still applies. A boolean lookup plus `refuse('not_found')` in the use case — no message match (`isProjectNotFound` is untouched).
- `mapTickets` and `mapTicket` (`packages/app/src/use-cases/project-writes.ts`) call `requireWorkPackageOf` before any repository write; `mapTicket`'s unmap (empty `wpId`) skips it. The module header no longer says ownership is unchecked; the Ticket half is named as Epic 5's.
- Fakes updated: `project-writes.test.ts` (records what was asked, `wpInProject` behaviour), `tests/audited-use-cases.test.ts`, `tests/web-composition.test.ts`.
- New Postgres suite `tests/project-scoped-ids.test.ts`: a second Project of the SAME probe Tenant, created through `createProject`, with a Work Package inserted as the owner — so the refusal cannot come from RLS. Covers `mapTickets` and `mapTicket` against it (as admin and as a PM assigned to the Project), an id that exists nowhere, and both writes against the Project's own Work Package. Surprise: its first probe `seq` base (760_000_000) collided with `tests/identity.test.ts`'s probe — `seq` is global, so bases must be disjoint across files; moved to 820_000_000.
- `tests/role-declarations.test.ts`: `WELL_FORMED_INPUT` (checked both ways against the `projectScoped` entries), a reach loop (unassigned PM → `not_found`, no deps touched) and its converse (assigned PM gets past authorisation, i.e. reaches its deps).
- Sabotage, each watched to fail, then restored: the `project_id` condition dropped from the repository query (both refusal cases in the Postgres suite failed); both `requireWorkPackageOf` calls removed (4 unit cases failed); the reach `authorize` removed from `runProjectWrite` (the reach loop failed naming all five project writes) and from `runProjectRead` (failed naming all four project reads).
- Verification: `pnpm lint`, `pnpm typecheck`, web and worker typechecks, `pnpm depcruise` clean; `REQUIRE_DB=1 pnpm test` against local Postgres 18.6: 834 of 835 — the one failure is `tests/identity.test.ts` "finds the demo seed's members", which needs the local database's `SEED_DEMO_PASSWORD` (environment; CI seeds its own).

## Review Triage Log

Blind layer, 8 findings:
- Summary / milestone / soft-deleted Work Package still accepted as a mapping target — `medium`, pre-existing (any id was accepted before) → deferred (`deferred-work.md`): a product rule for valid mapping targets, beyond ownership.
- No database constraint; other `mapping_event` writers (rule-driven, seed) skip the check — `medium`, pre-existing → deferred.
- Spec left as a shell — `low`, patched: these notes and this log.
- Reach loop cannot tell a correct runner from one that refuses every PM — `low`, patched: the assigned-PM converse.
- `WELL_FORMED_INPUT` completeness checked one way only — `low`, patched: checked both ways.
- Postgres suite gaps (id nowhere, the PM scenario, `mapTickets` success) — `low`, patched. A Work Package of another Tenant is not added: RLS already makes it invisible, and the cross-tenant harness covers that path.
- The resolved deferred entry still said "`wpId` half is owed now" — `low`, patched.
- Other writes' headers do not mention the Ticket half — `false`: the three other writes name no Work Package, and the module header names the Ticket half for all five.

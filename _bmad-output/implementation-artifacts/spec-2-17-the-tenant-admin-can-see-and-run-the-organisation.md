---
title: 'Story 2.17 — The Tenant Admin can see and run the organisation (hierarchy)'
type: 'feature'
created: '2026-09-27'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '4d6707a80c2f0170764b61e3c67e33ffa971fe52'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-momo-keikaku-2026-09-20/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 1 shipped audited organisation writes and no Organisation screens — a Tenant Admin still cannot stand up Departments, Programs or Projects from the product. EXPERIENCE places Admin: Organisation on the User menu; today that menu only links Audit log.

**Approach:** Add three Tenant-Admin admin pages — Departments, Programs, Projects — each with its own User-menu link and `/admin/...` route. Lists use new read use cases; mutations go only through existing `org-writes`. Resources & Rates, F21, and PM assignment stay deferred.

**Decisions (founder, 2026-09-27):**
- **Split** hierarchy first; Resources & Rates (+ F21) deferred to `deferred-work.md`.
- **Keep full spec** (~1680 tokens accepted).
- **Q1 → B.** Three User-menu items (Departments, Programs, Projects), each with its own `/admin/...` route — not a single Organisation hub.
- **Q2 → B.** PM assignment deferred (hierarchy-only this PR); use `assignMemberProject` / `unassignMemberProject` later with Admin: Users or a follow-up.

## Boundaries & Constraints

**Always:**
- Reuse `createDepartment` / `renameDepartment` / `createProgram` / `renameProgram` / `createProject` / `renameProject` / `reassignProjectProgram` / `reassignProjectDepartment` — no new write paths (FR-1, AD-14).
- New reads for Departments, Programs and Projects land on `packages/app`'s use-case surface, register in the cross-tenant harness (`tests/read-use-cases.ts`), and remove `program` from `UNREACHED_TENANT_OWNED_TABLES` in the same change (NFR-S1, AR-26).
- Role gate is `ADMIN_ONLY` / declared roles — a PM reaching these screens gets `not_found` / Next `notFound()`, never a page-local role check (AD-12, story 1.5).
- Three User-menu links for Tenant Admin: Departments → `/admin/departments`, Programs → `/admin/programs`, Projects → `/admin/projects` (Q1→B); reuse `/admin` layout chrome (no Project sidebar).
- Ledger-Paper lighter admin tables (hairline rules, no cards) matching `/admin/audit`; React text only (NFR-S8); new copy through i18n catalogs.
- Invitation / membership INSERT stays out of scope (R0 seed-only users).

**Never:**
- Resources & Rates screens, `appendResourceRate` / `appendProjectDefaultRate` UI, or F21 `loadProjectBundle` narrowing (deferred).
- PM-assignment UI / `assignMemberProject` / `unassignMemberProject` on these pages (Q2→B deferred).
- A single Organisation hub that collapses the three routes (Q1→B forbids it).
- Admin: Users invite/revoke screens; Client Viewer flows.
- New write use cases, delete/archive org units, moving a Program between Departments, inventing name-uniqueness rules the writes do not already enforce.
- Project sidebar / `SURFACES` changes in `shell.tsx`.
- Gantt, Plan surface edits, or scheduling fence kinds.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Admin lists org | Tenant Admin, seeded org | Lists show Departments / Programs / Projects with names and parent links needed to act | N/A |
| Admin creates Department | Valid name | New row via `createDepartment`; list refreshes; audit fires as today | invalid_input keeps form + message |
| Admin renames Program | Valid name | `renameProgram`; list shows new name | Same |
| Admin creates Project | Dept + optional Program | `createProject`; appears under that parent | Refuse shows message; no partial UI invent |
| Admin reassigns Project Program | Same-Dept Program or clear | `reassignProjectProgram` | Use-case refuse → inline |
| Admin reassigns Project Department | Other Dept; program null or in new Dept | `reassignProjectDepartment` | Use-case refuse → inline |
| PM opens any of the three admin URLs | `pm` session | `notFound()` — no data leak | not_found |
| Cross-tenant read | Harness foreign tenant | Own-tenant-ok pattern; `program` no longer unreached | Harness fails if skipped |

</frozen-after-approval>

## Code Map

- `packages/app/src/use-cases/org-writes.ts` — eight ADMIN_ONLY writes already composition-bound. **Reuse** only; do not add write kinds.
- `packages/app/src/use-cases/membership-writes.ts` — `assignMemberProject` / `unassignMemberProject`. **Do not touch** (Q2→B).
- `packages/app/src/use-cases/list-audit-log.ts` + `ports/audit-log-read.ts` + `packages/db/src/repo-audit.ts` — pattern for new list reads. **Mirror** for org lists (port + use case + `USE_CASE_ROLES` + `index.ts` export).
- `packages/db/src/repositories` / `repo-org.ts` — write-side `find*` FOR UPDATE. **Add** list SELECTs for department / program / project (tenant-scoped); do not overload FOR UPDATE finders for UI lists.
- `packages/db/src/schema.ts` — `department` (`id`, `name`), `program` (`id`, `departmentId`, `name`), `project` (`id`, `departmentId`, `programId?`, `name`, …). **Read** those columns for lists.
- `apps/web/src/server/composition.ts` — org writes already wired; audit read wired. **Add** org list read bindings + server-action wrappers for the eight writes only.
- `apps/web/src/app/admin/layout.tsx` + `admin/audit/page.tsx` — admin chrome + Ledger-Paper table. **Reuse** layout; add `/admin/departments`, `/admin/programs`, `/admin/projects`.
- `apps/web/src/components/user-chip-menu.ts` — Admin dropdown today only Audit log when `showAuditLog`. **Add** three menuitems (Departments, Programs, Projects) beside Audit log; keep flag = `tenant_admin` in layouts.
- `tests/read-use-cases.ts` — harness registry; `UNREACHED_TENANT_OWNED_TABLES` includes `program`. **Register** new reads; **remove** `program` from unreached.
- `tests/cross-tenant.test.ts` — asserts unreached set. **Expect** `program` gone.
- Continuity from 2.16 (done): Plan surface complete; do not edit Plan components. Continuity from 1.7: admin layout + UserChip pattern.
- UX: `EXPERIENCE.md` Admin: Organisation row — no HTML mockup; follow audit visual language; Q1→B expands the single IA row into three deep-linked pages.

## Tasks & Acceptance

**Execution:**
- [x] `packages/app` + `packages/db` — list read use cases (Departments, Programs, Projects) with ports/repo SELECT lists; `USE_CASE_ROLES` + exports; unit tests for admin-ok / pm-not_found.
- [x] `tests/read-use-cases.ts` + `tests/cross-tenant.test.ts` — register reads; drop `program` from `UNREACHED_TENANT_OWNED_TABLES`.
- [x] `apps/web` composition + server actions — bind list reads; wrap existing org writes (no new write logic).
- [x] `apps/web` three pages — `/admin/departments`, `/admin/programs`, `/admin/projects` with lists + create/rename/reassign forms; i18n; Ledger-Paper tables.
- [x] `apps/web` `user-chip-menu.ts` (+ layout flags) — three Admin menuitems; PM still sees no Admin links.
- [x] `deferred-work.md` — confirm PM-assignment deferral (Q2→B) is recorded.
- [x] Matrix unit coverage for refuse paths and list happy path; `pnpm lint` / `typecheck` / `depcruise` / `test` green.

**Acceptance Criteria:**
- Given a Tenant Admin, when they open Departments, Programs or Projects from the User menu, then each page lists that entity and create/rename/reassign runs through the existing org write use cases with no new write path.
- Given new org list reads, when the cross-tenant harness runs, then those reads are registered and `program` is no longer in `UNREACHED_TENANT_OWNED_TABLES`.
- Given a PM session, when they request `/admin/departments`, `/admin/programs` or `/admin/projects`, then the app answers `notFound()` with no org rows rendered.
- Given Resources & Rates / F21 / PM assignment / invitation, when scope is checked, then they remain out of this slice (deferred or R0 seed-only).
- Given `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm test`, when they run, then all exit 0.

## Implementation Notes

- 2026-09-27: Added `listDepartments` / `listPrograms` / `listProjects` (ADMIN_ONLY) with `ports/org-read` + `repo-org-list` SELECTs (not FOR UPDATE). Registered in harness; removed `program` from `UNREACHED_TENANT_OWNED_TABLES`. Wired composition bindings + server actions wrapping the eight existing org writes. Three `/admin/{departments,programs,projects}` pages with Ledger-Paper tables; User menu adds three links beside Audit log. PM assignment + Resources & Rates already recorded in deferred-work.md (Q2→B / Build split).
- Verified: `pnpm lint`, `pnpm typecheck`, `pnpm depcruise`, `pnpm test` (1454 passed with local Postgres).

## Spec Change Log

## Review Triage Log

## Design Notes

**Admin chrome, not Plan.** Organisation is Home/Admin (User menu), not a Project surface — keep `/admin` layout without the Plan sidebar.

**Writes already exist.** The story is primarily reads + UI + harness; inventing parallel write helpers would violate AD-14.

**Comfort.** Epics tag these screens Comfort for R0 demo-on-seed — still ship the hierarchy so Epic 1's narrative is fulfilled for Dept/Program/Project.

## Verification

**Commands:**
- `pnpm lint` — expected: exit 0
- `pnpm typecheck` — expected: exit 0
- `pnpm depcruise` — expected: exit 0
- `pnpm test` — expected: exit 0

**Manual checks (if no CLI):**
- Tenant Admin: User menu → Departments / Programs / Projects → create/rename/reassign on each page.
- PM: direct `/admin/departments` (and programs/projects) → 404.
- Confirm Resources & Rates and PM assignment stay absent from the menu.

---
title: 'Epic 2 retro F10 — register schedule/calendar in role + audit gates'
type: 'chore'
created: '2026-09-28'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '9b9832c9994887d3aad2891f4960602824cd1378'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `applyPlanChange` and calendar publish/write exports live on `@momo/app`'s package barrel but outside `use-cases/`, so Epic 1's role and audit enumeration gates (`tests/role-declarations.test.ts`, `tests/audited-use-cases.test.ts`) never see them. Runtime authorize + audit already run; the declaration/snapshot gates do not (Epic 2 retro F10).

**Approach:** Declare colocated `*_ROLES` / `*_AUDIT` for the schedule fence and calendar write modules, merge them into the Epic 1 hubs, and make the gate tests enumerate those writers — either by joining the `use-cases` barrel or by widening the gates to a second enumerated list (Open Question Q1). Close sprint action item `epic-2-retro-item-11-…`.

**Decisions (founder, 2026-09-28):**
- **Q1 → B.** Widen both role and audit gate tests to enumerate a second module list; keep schedule/calendar **outside** `use-cases/`. Do not pull the fence into the Epic 1 cross-tenant write registry for this change.

## Boundaries & Constraints

**Always:**
- Keep runtime authorize (`PROJECT_REACH_ROLES` / existing checks) and `runAuditedWrite` behaviour unchanged unless a gate forces a mechanical rename.
- Follow Epic 1 convention: colocated `*_ROLES` / `*_AUDIT` → spread into `use-cases/role-declarations.ts` and `use-cases/audit-declarations.ts`.
- Gate tests enumerate a **second module list** for schedule/calendar writers (Q1 → B); they must fail if a registered export loses its declaration.
- Keep schedule/calendar exports on the package barrel, **not** re-exported from `use-cases/index.ts`.

**Never:**
- No fence algorithm / calendar domain behaviour changes. No Plan UI. No Epic 3 import work.
- Do not reopen F21 pairing, F23 halt cells, or formatter collapse (F2/F5).
- Do not invent new audit action strings if `schedule.apply_plan_change` / `calendar.publish_version` already exist — reuse them.
- Do not join `use-cases` barrel or expand the Epic 1 cross-tenant write registry for these writers (Q1 → B).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|----------|---------------|----------|-------|
| Role gate | New schedule/calendar write export without `*_ROLES` merge | `role-declarations` test fails | N/A (test) |
| Audit gate | New schedule/calendar write export without `*_AUDIT` merge | `audited-use-cases` test fails | N/A (test) |
| Happy declare | Declarations present for fence + calendar writers | Both gates green; snapshots updated | N/A |
| Runtime unchanged | Existing fence/calendar calls | Still authorize + audit as today | N/A |
| Barrel stay out | `use-cases/index.ts` | No schedule/calendar re-exports added | N/A |

</frozen-after-approval>

## Code Map

- `packages/app/src/index.ts` (~L145–152, 222–230) — documents schedule/calendar “outside the use-cases barrel”.
- `packages/app/src/use-cases/index.ts` — Epic 1 families only today.
- `packages/app/src/use-cases/role-declarations.ts` / `audit-declarations.ts` — merge hubs (`USE_CASE_ROLES` / `USE_CASE_AUDIT`).
- `packages/app/src/schedule/apply-plan-change.ts` — `applyPlanChange`; inline authorize ~L572–585; add colocated `SCHEDULE_*` declarations.
- `packages/app/src/calendar/publish-calendar-version.ts` — publish + related calendar writes; add colocated `CALENDAR_*` declarations.
- Thin wrappers (`plan-edit.ts`, `apply-predecessor-set.ts`) — decide whether they need their own declarations or inherit via fence-only registration (prefer fence + calendar modules only unless gates require every re-export).
- `tests/role-declarations.test.ts` / `tests/audited-use-cases.test.ts` — surface via `readSurfaceFunctionNames()` today; extend per Q1.
- `tests/read-use-cases.ts` — write registry; touch only if Q1 → A.
- Precedent: `packages/app/src/use-cases/project-writes.ts` (colocated `*_ROLES` / `*_AUDIT`).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — mark item-11 `done` when verified.
- Do **not** touch: `authz/authorize.ts` role sets, depcruise fence, domain recalculate.

## Tasks & Acceptance

**Execution:**
- [x] Colocated `*_ROLES` / `*_AUDIT` on schedule fence + calendar write modules; merge into hubs.
- [x] Widen `tests/role-declarations.test.ts` and `tests/audited-use-cases.test.ts` to enumerate a second schedule/calendar module list (Q1 → B); do **not** re-export via `use-cases/index.ts`.
- [x] Update gate snapshots / expected stamps so CI asserts the new declarations.
- [x] `sprint-status.yaml` — item-11 → `done`; note in epic-2-retro remediation item 3.

**Acceptance Criteria:**
- Given the role and audit gate suites, when a schedule/calendar write export is registered without a declaration merge, then the corresponding gate fails.
- Given declarations are present, when `pnpm test` runs the role and audit gate files, then they pass.
- Given an existing `applyPlanChange` / calendar publish call path, when exercised, then authorize + audit behaviour is unchanged in intent (same roles / same audit action names).

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

Prefer registering the **two real writers** (`applyPlanChange`, calendar publish family) rather than every thin `plan-edit` wrapper, unless the chosen gate surface enumerates package-barrel exports by name and would otherwise miss them.

## Verification

**Commands:**
- `pnpm exec vitest run tests/role-declarations.test.ts tests/audited-use-cases.test.ts` — expected: green
- `pnpm typecheck` — expected: clean
- `pnpm depcruise` — expected: clean

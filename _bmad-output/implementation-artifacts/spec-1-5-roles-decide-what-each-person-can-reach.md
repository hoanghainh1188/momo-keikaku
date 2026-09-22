---
title: 'Story 1.5 — roles decide what each person can reach'
type: 'feature'
created: '2026-09-22'
status: 'done'
baseline_commit: 'e9940d13a70ddb8d5dc424d7dde1ce8474a395bf'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-revocation-and-membership.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every signed-in member of a Tenant can call every use case today. Roles and
`projectIds` sit on `RequestContext` unread (except four membership writes that hard-code
`tenant_admin`), so a PM reaches every Project and every Organisation write, and there is no one
place that declares who may call what.

**Approach:** Add one declared-roles mechanism in `packages/app/authz` that every use case runs
before its work: allowed roles plus, for project-scoped calls, a Project-reach check that never
limits a `tenant_admin`. Replace the membership writes' local pre-parse `tenant_admin` check with
that declaration; keep their in-transaction lock re-check. Refusal stays `not_found`. No invitation,
no Rates/Resources (1.6), no audit-log reader (1.7), no Client Viewer product path (R1).

Decided by the founder on 2026-09-22: no Users/members screen (use cases and gates only); Organisation
writes are `tenant_admin` only; Project reads use the same rule as Plan/Mappings (`tenant_admin` |
`pm` plus Project reach). Spec kept above the token target on purpose.

## Boundaries & Constraints

**Always:**
- One helper (or thin family of helpers) in `packages/app/src/authz/` authorises a call against
  `RequestContext`: the caller's roles must intersect the use case's declared set, and when the
  call names a Project the caller must reach it. A `tenant_admin` always reaches every Project of
  the Tenant; a non-admin reaches only ids in `ctx.projectIds` (empty ⇒ none). Failure is
  `not_found` before parse or transaction where that already hides input shape (membership writes),
  otherwise before the load/write work — never `forbidden`.
- Every export of `packages/app/src/use-cases/index.ts` declares its roles through that helper.
  The UI (`apps/web` pages, layouts, actions) never authorises; it only calls bindings.
- Membership writes (`revokeMembership`, `changeMemberRole`, `assignMemberProject`,
  `unassignMemberProject`) declare `tenant_admin` only. Their lock re-check against the caller's
  locked bridge row stays permanent (AD-23). `ASSIGNABLE_ROLES` stays `tenant_admin` | `pm`.
- Organisation writes (`create`/`rename`/`reassign` Department, Program, Project) declare
  `tenant_admin` only — no Project check.
- Project reads (`getProjectHeader`, `getProjectReview`, `getProjectMapping`, `getClientView`) and
  Plan/Mapping writes (`planTicketsAsWorkPackage`, `mapTickets`, `mapTicket`, plus
  `explainTickets`, `markChangeRequestCandidates`) declare `tenant_admin` | `pm` and require
  Project reach.
- Viewer roles stay in `ROLES` and stay unassignable. No R0 use case lists `client_viewer` or
  `internal_viewer`; a caller holding only those gets `not_found` everywhere this story wires.
- A mechanical gate fails CI when a use-case export has no role declaration (same spirit as the
  audited-use-case and cross-tenant enumerations).
- Harness contexts that drive role-gated writes carry a role and `projectIds` that pass the gate
  (membership and org writes use admin; project reads/writes need the probe Project id on a PM
  context, or an admin context). Foreign-Tenant assertions must not become vacuous at the role gate.

**Never:**
- Do not treat a Tenant Admin's `projectIds` as a limit.
- Do not drop the membership writers' in-transaction caller re-check.
- No Users/members screen, no invitation INSERT, no Rates/Resources, no audit-log UI, no `/c/...`
  Client Viewer routes; no spine amendment in this slice (AD-12/AD-23 already describe the model —
  only the "until 1.5" pre-parse sentence becomes false in code).
- No `forbidden` code; no authorising in React.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Admin reads any Project | `tenant_admin`, any `projectIds` (incl. empty / stale) | Read succeeds for an own-Tenant Project | Foreign Project → `not_found` (RLS) |
| PM reads assigned Project | `pm`, `projectIds` contains id | Read succeeds | — |
| PM reads unassigned Project | `pm`, id absent from `projectIds` | — | `not_found`, no load |
| PM edits Plan/Mapping on assigned | `pm`, id in `projectIds` | Write + audit as today | — |
| PM edits unassigned | `pm`, id absent | — | `not_found`, nothing written |
| Viewer calls any R0 use case | `client_viewer` or `internal_viewer` only | — | `not_found` |
| Non-admin membership write | `pm` calls `revokeMembership` | — | `not_found` before parse (unchanged shape) |
| Stale admin context | Context still has `tenant_admin`; lock finds caller demoted | — | `not_found` from lock re-check |
| Empty `projectIds` PM | `pm`, `projectIds: []` | Reaches no Project | every project-scoped call `not_found` |
| PM calls Organisation write | `pm` calls `createDepartment` (etc.) | — | `not_found` |

</frozen-after-approval>

## Code Map

- `packages/app/src/authz/request-context.ts` -- `ROLES`, `RequestContext`; comment L11–15 says roles
  unread except membership writes. Update when the helper lands.
- `packages/app/src/authz/resolve-request-context.ts` -- unchanged; still the one reader of the bridge
  for Tenant resolution.
- `packages/app/src/use-cases/membership-writes.ts:71-79,85-95` -- pre-parse `tenant_admin` gate to
  replace; `lockCallerAndTarget` re-check to keep. `membership-input.ts` `ASSIGNABLE_ROLES`.
- `packages/app/src/use-cases/{audited-write,project-input,project-write-input,org-writes}.ts` --
  family runners to call the helper (or accept a declaration) so each export does not re-implement.
- `packages/app/src/use-cases/{project-writes,get-project-*,get-client-view,org-writes,membership-writes}.ts`
  -- every surface export. `use-cases/index.ts` — enumeration surface for a new declaration gate.
- `packages/app/src/use-cases/membership-writes.test.ts` -- admin-gate suite; retarget to the helper.
- `tests/request-context.ts` -- harness contexts; project-write entries will need `projectIds`.
- `tests/read-use-cases.ts`, `tests/cross-tenant*.ts`, `tests/write-harness.ts`,
  `tests/membership.test.ts` -- role/project fixtures so foreign checks stay non-vacuous.
- `apps/web/src/app/p/[projectId]/layout.tsx` -- `roleLabel` display only; do not authorise here.
- `apps/web/src/server/composition.ts` -- bindings unchanged in shape; comments about local
  `tenant_admin` check update.
- Deferred anchors: `deferred-work.md` L618–620, L633–635; HANDOFF §1b; AD-12, AD-23
  (`ARCHITECTURE-SPINE.md`).

## Tasks & Acceptance

**Execution:**
- [x] `packages/app/src/authz/` -- add the declare-and-check helper(s); unit-test role miss, admin
  ignore of `projectIds`, PM hit/miss, empty `projectIds`, viewer refusal -- AD-12 / AD-23
- [x] `packages/app/src/use-cases/{membership-writes,project-write-input,project-input,org-writes}.ts`
  -- wire declarations (membership+org: `tenant_admin`; project read/write: `tenant_admin`|`pm` +
  reach); drop the local membership pre-check -- story AC
- [x] `packages/app` gate test -- every `use-cases/index.ts` export has a declaration -- "one rule"
- [x] `tests/{request-context,read-use-cases,cross-tenant*,membership,write-harness}.ts` + app unit
  tests -- non-vacuous harness contexts; I/O matrix cases -- FR-2
- [x] `apps/web` + comments/`HANDOFF.md`/`deferred-work.md` -- no UI authz; mark 1.5 deferreds
  resolved where this story closes them

**Acceptance Criteria:**
- Given any use-case export, when it runs, then it has gone through the declared-roles helper and the
  UI has not decided access.
- Given a caller outside the allowed set or outside Project reach, when they invoke a use case, then
  the answer is `not_found`.
- Given `ASSIGNABLE_ROLES`, when a role is set through `changeMemberRole`, then only `tenant_admin`
  and `pm` are accepted; viewers remain in the enum and unassignable.
- Given a Project Plan or Mapping write, when the caller is not that Project's PM and not a Tenant
  Admin, then `not_found`.
- Given a membership write, when the caller's locked bridge row is no longer `tenant_admin`, then
  `not_found` even if `ctx.roles` still says so.
- Given a Tenant Admin whose membership carries `projectIds`, when they call a project-scoped use
  case for another Project of the Tenant, then it is not refused for Project reach.

## Implementation Notes

- **Helper.** `packages/app/src/authz/authorize.ts`: `authorize(ctx, { roles, projectId? })` and
  `reachesProject` — `tenant_admin` ignores `projectIds`; refusal is always `not_found`.
- **Declarations.** `use-cases/role-declarations.ts` enumerates every export; gate in
  `tests/role-declarations.test.ts`. Family runners call the helper (membership/org before parse;
  project role before parse, reach after parse via `WritePlan.authorize`).
- **Harness.** `pmContextFor(tenantId, projectId)` for project reads/writes; `adminContextFor` for
  org and membership writes — foreign checks stay non-vacuous at the role gate.
- **Deferred.** L618–620 and L633–635 in `deferred-work.md` marked resolved; HANDOFF §1b done.
- **Role-before-parse pin.** Unit tests: a role-missed caller with malformed input answers
  `not_found` (not `invalid_input`) for project reads and writes — moving authorize after parse
  fails them.

## Spec Change Log


## Verification Results (2026-09-22)

| Command | Result |
| --- | --- |
| `pnpm exec vitest run packages/app tests/audited-use-cases.test.ts tests/role-declarations.test.ts tests/web-composition.test.ts` | **359 passed** across 12 files |
| `pnpm typecheck` | exit 0 |
| Sabotage: reach check stubbed to always ok | 5 project-write reach tests failed; restored |
| `REQUIRE_DB=1` Postgres: `tests/membership`, `cross-tenant*`, `org-writes` | **157 passed** when `DATABASE_URL` / `APP_DATABASE_URL` are set |

**After the review patches (2026-09-22, second pass):**

| Command | Result |
| --- | --- |
| `pnpm lint`, `pnpm typecheck`, `pnpm --filter @momo/web typecheck`, `pnpm --filter @momo/worker typecheck`, `pnpm depcruise` | all exit 0 |
| `pnpm exec vitest run packages/app tests/audited-use-cases.test.ts tests/role-declarations.test.ts tests/web-composition.test.ts` | **368 passed** across 12 files |
| `REQUIRE_DB=1 pnpm test` against the local `postgres:18.6` (compose, port 55433) | **826 passed, 1 failed** of 827 across 45 files — the one failure is `tests/identity.test.ts` "finds the demo seed's members", which needs the `SEED_DEMO_PASSWORD` the local database was seeded with; environment, not code (CI seeds its own) |
| Sabotage: the pre-parse `authorize` removed from `runOrgWrite` | both behavioural tests failed, naming every Organisation write (`invalid_input` instead of `not_found`); restored |
| Sabotage: `runOrgWrite` enforcing `['tenant_admin', 'pm']` instead of `TENANT_ADMIN_ROLES` | only the new PM loop failed, naming every Organisation write — the viewer loop stayed green, which is the gap the PM loop closes; restored |


## Review Triage Log

| Finding | Verdict | Evidence / route |
|---|---|---|
| Blind: sprint-status `in-progress` vs spec `in-review` | false | Sprint stays `in-progress` until step-05 marks `review` (HANDOFF standing rule for multi-slice / Build sync). |
| Blind: HANDOFF "Latest" still narrates 1.4 | low | Rejected — docs polish; unlikely to mislead implementers of 1.5; §1b already states 1.5 landed. |
| Blind: HANDOFF still says "Stories 1.5 through 1.9" | false | Accurate until 1.5 is fully closed after presentation. |
| Blind: `epic-1-context.md` still says membership checks `tenant_admin` until 1.5 | medium | Real stale compiled context; regenerating without a spine amendment would be overwritten. **defer** — amend AD-23 "until 1.5" then regenerate. |
| Blind: spine AD-23 still says "Until story 1.5…" | medium | Intent/Never exclude a spine amendment this slice. **defer**. |
| Blind: Code Map still future-tense | false | Rejected — fix would edit this build's spec; Code Map is planning artifact. |
| Blind: Spec Change Log / Triage Log empty at land | false | Triage filled this pass; Change Log only on bad_spec loopback. |
| Blind: Verification Results claimed Postgres unset | false | Suites ran green in step-03 with `apps/web/.env.local` (157); Results updated after patch. |
| Blind: checklist claims `membership.test` / `write-harness` untouched | false | Harness contexts live in `tests/request-context.ts` + `read-use-cases.ts`; membership suite passes without further edits. |
| Blind: deferred L477 still says reach is 1.5's | low | **patch** — appended `resolved:` for reach (done). |
| Blind: role-declarations gate does not prove runners call `authorize` | low | Rejected — family unit tests + sabotage already fail if runners skip the helper; everyday miss only when inventing a new family. |
| Blind: `PROJECT_SCOPED` duplicated vs `projectScoped` | low | Rejected — the 4th gate test pins the two together; duplication is the pin. |
| Blind: `projection-reads` missing reach cases | false | Same `runProjectRead` covered by `project-reads.test.ts` reach/admin/viewer cases. |
| Blind: Intent path `packages/app/authz` vs `src/authz` | false | Rejected — frozen Intent shorthand; fix would edit frozen block. |
| Edge Case Hunter | — | No findings (`[]`). |
| Verification Gap: project role-miss + malformed → may return `invalid_input` without a failing test | medium | Pre-verified. **patch** — added viewer+malformed → `not_found` in `project-reads.test.ts` and `project-writes.test.ts` (121 tests in those files green). |

## Design Notes

Authorisation sits in the use-case runners, not in repositories and not in pages. Membership writes
keep a second check against the locked row because `RequestContext` is resolved once per server
action; other families have no bridge lock today — stale demotion for them ends the session on the
next request via the resolver, which is the standing AD-23 rule for revocation.

`getClientView` in R0 is the PM/Admin live preview using `clientProjection`, not the R1
`packages/app/client-view` surface over `outputs_client`. This story does not introduce Client
Viewer reach.

## Verification

**Commands:**
- `pnpm --filter @momo/app test` -- authz helper + use-case unit suites green
- `pnpm test` (or the repo's usual vitest entry covering `tests/membership.test.ts` and cross-tenant
  suites) -- harness non-vacuous; I/O matrix covered
- Sabotage probe: temporarily allow a PM with empty `projectIds` through a project write, watch the
  new gate fail; restore -- HANDOFF sabotage rule

### Review Findings

Code review of `c43658c` against `e9940d1` (2026-09-22): four layers (blind, edge-case, verification-gap, acceptance auditor). No acceptance criterion violated. D1 resolved by the founder as a patch (behavioural gate).

- [x] [Review][Patch] The role gate proves a table, not enforcement — `tests/role-declarations.test.ts` checks `USE_CASE_ROLES` against its own copy (`PROJECT_SCOPED`), and no runner reads the table, so a new export with a correct entry that never calls `authorize` passes CI. Add a behavioural gate: every export of `use-cases/index.ts`, called with a viewer-only context and deps that throw, answers `not_found` with no port call; replace the copied expectation with a snapshot of `USE_CASE_ROLES` [tests/role-declarations.test.ts]
- [x] [Review][Patch] `HANDOFF.md` title and "State at `main`" preamble still describe PR #34 / story 1.4, and "Story 1.5 is `done` (sprint `review`)" contradicts itself [_bmad-output/implementation-artifacts/HANDOFF.md:1]
- [x] [Review][Patch] `membership-writes.ts` restates `'tenant_admin'` as a local constant beside the helper's `TENANT_ADMIN_ROLES` [packages/app/src/use-cases/membership-writes.ts:59]
- [x] [Review][Defer] Project writes check `command.projectId` but not that `ticketIds`/`wpId` belong to it [packages/app/src/use-cases/project-write-input.ts:98] — deferred: pre-existing. A PM reaching A can append `mapping_event`/`disposition_event` rows in A naming B's Tickets or WPs; B's figures are unaffected (mappings are read per `project_id`), but A carries permanent append-only junk and a misleading audit row. The `wpId` half is a `work_package.project_id` check; the Ticket half needs Ticket → Project ownership (Connector scope, FR-42, Epic 5).
- [x] [Review][Defer] `/` redirects everyone to `/p/prj-ec2/review`, so since 1.5 a PM not assigned `prj-ec2` lands on `not_found` [apps/web/src/app/page.tsx:4] — deferred: pre-existing (already in deferred-work); 1.5's reach check makes it bite for non-seed PMs. The seeded demo PM carries `prj-ec2`.
- [x] [Review][Defer] AD-23's "Until story 1.5's role model, these use cases also check `tenant_admin` … themselves" and the matching `epic-1-context.md` line are now untrue [ARCHITECTURE-SPINE.md AD-23] — deferred: needs a spine amendment (agent-context file), already tracked in deferred-work.

#### Rejected

- No Postgres test of a real PM refused an unassigned Project (blind, auditor) — `low`: the path is covered by parts (`resolve-request-context.test.ts` pins `projectIds`, unit suites pin refusal); a new suite is more than a correction.
- Composition tests only exercise the allowed case for org writes and project reads (blind) — `low`: every binding takes its context from the same resolver, and membership bindings already pin the refusal through it.
- `internal_viewer` never tested at use-case level (blind, auditor) — `low`: refused because it is in no role set; adding it would be a deliberate edit the new behavioural gate also catches.
- Tenant Admin with non-empty `projectIds` untested at use-case level (auditor) — `low`: runners call `reachesProject`, whose stale-ids case `authorize.test.ts` pins.
- Double role check / three runner wiring styles (blind) — `low`: a refactor with no demonstrated defect; the behavioural gate covers ordering drift.
- BOM removals in docs and the conditional verification record (blind) — `low` noise; the record's fix edits this spec.
- A dual-role admin skipping reach for a non-admin gate (edge-case) — `false`: a context carries exactly one role (`resolve-request-context.ts:62`, `roles: [membership.role]`; AD-23, one row per user and Tenant).
- A just-unassigned PM finishing a write on a stale context (edge-case) — `low`: the window is one server action; the next request's resolver refuses (AD-23). A re-read adds a lock path for no demonstrated harm.
- Spec `status: 'done'` versus sprint `review` — rejected by rule (its fix edits the spec under review); step 6 of this review sets the status.

### Review Findings — second pass

Code review of `d20f800..3896176` (the three first-pass patches), 2026-09-22: four layers. All three first-pass patches landed; no acceptance criterion violated. Four new patches, none deferred.

- [x] [Review][Patch] A UTF-8 byte-order mark was added to all seven files this pass touched — they are now the only files in the repo with one, and the spec's frontmatter and `sprint-status.yaml` no longer start with `---` / `#` at byte 0. Strip it (`sed -i '' '1s/^\xEF\xBB\xBF//' <file>`) [all 7 files:1]
- [x] [Review][Patch] The behavioural gate refuses only viewers, so it cannot tell whether a runner enforces the role set its table entry declares: an admin-only export whose runner passes `PROJECT_REACH_ROLES` stays green and a PM reaches an admin-only write. Add a loop: for every `USE_CASE_ROLES` entry whose `roles` exclude `'pm'`, call the export with a PM context, `throwingDeps()` and `{}`, and expect `not_found` with no deps touched [tests/role-declarations.test.ts:245]
- [x] [Review][Patch] `HANDOFF.md` still contradicts the new preamble below it: §1b is headed "— DONE" and says "Landed 2026-09-22"; §1b describes the gate as table-only; the future-tense "Story 1.5 replaces the local `tenant_admin` pre-check" (~:250) and "the membership use cases require `tenant_admin` now (a local check ahead of 1.5 …)" (~:397) describe deleted code; "Next, in order" §4 still lists 1.5. The open items from the first pass (AD-23 / `epic-1-context.md` stale sentence; project writes naming another Project's Tickets or WPs) belong beside the `/` → `prj-ec2` note [_bmad-output/implementation-artifacts/HANDOFF.md:308]
- [x] [Review][Patch] No sabotage probe is recorded for the new gate (HANDOFF's "break the thing it guards" rule): remove the pre-parse `authorize` from one runner, and for the PM loop swap one admin-only runner to `PROJECT_REACH_ROLES`; watch each fail naming the exports, restore, and record both in "Verification Results" [spec: Verification Results]

#### Rejected (second pass)

- The gate never checks Project reach (blind, edge-case) — `low`: reach needs well-formed input per use case (`runProjectRead` parses before reach), and every project runner's reach is pinned by `project-reads.test.ts` / `project-writes.test.ts`; more than a correction.
- The snapshot lost the old "projectScoped ⇔ reach roles" rule (blind) — `low`: with the PM loop, an entry's declared roles are enforced against its runner; a structural check adds little.
- The result check sits outside the `try`, and the deps Proxy traps only `get` (blind, edge-case) — `low`: a non-`Result` answer still fails the test loudly (TypeError), and no use case inspects deps with `in`/`Object.keys` before authorising.
- An empty-roles context is not exercised (edge-case) — `false` as a gap: `authorize` refuses unless some declared role is in `ctx.roles`, so `[]` is refused by construction; the viewer loop already proves the same path.
- `review_loop_iteration: 0` (blind) — rejected by rule (its fix edits the spec's frontmatter).

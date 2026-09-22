# Adversarial review, round 2: AD-12 / AD-23 roles amendment

- **Target:** the uncommitted diff on `docs/spine-ad23-roles-landed`: `ARCHITECTURE-SPINE.md` AD-12 (three bullets) and AD-23 (the pre-parse sentence and the job re-check), line 67 of `epic-1-context.md`, and the `deferred-work.md` entries. Decisions are in the `.memlog.md` tail. Round 1 is `review-adversarial-ad12-roles.md`.
- **Code checked (merged `3a2a1f5`):** `packages/app/src/authz/{authorize,request-context}.ts`; `use-cases/{index,project-input,project-write-input,audited-write,org-writes,membership-writes,role-declarations,get-client-view,get-project-header}.ts`; `ports/project-read.ts`; `packages/db/src/{schema,project-not-found}.ts`. Also checked: `sprint-status.yaml`, epics.md story 1.6, and PRD FR-6a, FR-12 and the import rule at prd.md:436.
- **Verdict:** **Nearly ready.** Every round-1 finding was addressed. The rewritten text matches the code. Two MEDIUM wording traps remain: a narrowing "from `ctx.projectIds`" can narrow a Tenant Admin, and the job's context "from the bridge, never from the payload" cannot be built as written. Both are one-sentence fixes, and a round 3 is not needed after them.

## Round-1 landing

| # | Sev | Status | Where / what remains |
|---|---|---|---|
| F1 | HIGH | **landed** | The role-gate bullet says it proves roles only, that `projectScoped` is read by nothing, and that reach is proved by per-runner cases. `deferred-work.md` has the reach-loop entry. The text does not describe the loop as existing. |
| F2 | HIGH | **partial** (deliberate) | FR-12 narrowing is now "a further check inside the use case … shape decided by the story (1.6)". This is acceptable under the memlog's rule, but its wording introduces N1. |
| F3 | MEDIUM | **partial** (deliberate) | The FR-2 PM-invite case is named as a post-parse narrowing. The advice to split a use case per role set, or to pass several Projects, was not adopted, and the helper still takes one `projectId`. That is left to the invitation story. |
| F4 | MEDIUM | **partial** | The precedence is stated: the ownership check runs before AD-25's `validate` and answers `not_found`. AD-25 itself is unamended; see N3. |
| F5 | MEDIUM | **landed** | Modules outside `index.ts` "join the gate's enumeration when it lands, with the gate's shape for it decided in that change". |
| F6 | MEDIUM | **landed** | The job sentence now covers reach. Its new wording is attacked in N2. |
| F7 | LOW | **landed** | "a PM unassigned mid-action finishes that one action". |
| F8 | LOW | **partial** | The parenthetical "data integrity on ids, not a role test" landed. "No role *or reach* test inside a repository" did not. The mechanism is overstated (N5). |
| F9 | LOW | **landed** | "at write time", an empty optional id is exempt, and Epic 5 decides FR-42 transfer. |
| F10 | LOW | **landed** | "Every use case checks its declared role set before parse". |
| F11 | LOW | **partial** | The slice is ordered "before story 1.6's writes", but `sprint-status.yaml` has no entry for it, and 1.6's writes do not depend on it (N4). |

**Tally: 11 — 6 landed, 5 partial, 0 missing.** No text describes owed code as existing. `deferred-work.md` holds the reach loop, the typed port failure and the updated `wpId`/Ticket entry.

## Findings

### N1 — MEDIUM — A narrowing "resolved from `ctx.projectIds`" narrows a Tenant Admin

AD-12's helper bullet says the FR-12 narrowing is "resolved from `ctx.projectIds`", and epic-1-context line 67 says the same. Line 1 of the same bullet, and AD-23, say `projectIds` never limit a `tenant_admin`. The seeded Tenant Admin's membership names no Projects (`request-context.ts` doc comment). A promoted admin keeps stale ids (AD-23).

Two units obey the words:
- Unit A filters Rates `WHERE project_id = ANY(ctx.projectIds)` for every caller, so the seeded admin sees no Rates.
- Unit B filters only when `reachesProject` would.

Only B is correct, and the narrowing sentence points implementers at A.

The same sentence frames narrowing as a "check" (a refusal), while a Rate list is a filter. The words also allow a hand-written `ctx.roles.includes('pm')` in a use-case body, which is a second role-test shape that the "no second authorisation shape" list does not exclude.

**Fix:** Replace "resolved from `ctx.projectIds`" with "resolved through the helper (`authorize` / `reachesProject`), so a `tenant_admin` is never narrowed". Make the same change in epic-1-context line 67.

### N2 — MEDIUM — The job's `RequestContext` cannot come wholly "from the bridge, never from the payload"

`RequestContext` is `{ tenantId, userId, roles, projectIds, locale }`. `tenantId` and `userId` can only come from the payload: AD-3 requires the payload to carry `tenant_id`, and the job acts for a user the payload names. `locale` comes from the session and `auth_user` (`resolve-request-context.ts:64`). AD-3 keeps the worker's system path off every identity table, and AD-23 leaves "how `apps/worker` reaches identity data" open. The bridge supplies only `roles` and `projectIds`. As worded, the sentence cannot be implemented, or it invites a worker read of `auth_user`.

The bridge-access half is consistent. AD-3 has the job read the bridge only after `withTenant`, through `packages/db`'s membership modules. AD-23 puts any tenant-scoped bridge use there. That module will need its own `source-discipline.test.ts` pin.

**Fix:** "…re-checks that user's membership, role and Project reach under `withTenant(payload.tenant_id)`, taking `roles` and `projectIds` from that user's bridge row at that moment (a `packages/db` membership module), never from the payload; `locale` follows the worker's identity path, decided by its amendment."

### N3 — LOW — Ownership-first makes AD-25's and the PRD's "cross-project link" reason unreachable, silently

The ownership bullet says `validate` "never meets another Project's Work Package". AD-25 still says `validate` returns "cross-project links", and that `MATCH FULL` is "how FR-6a's cross-project rejection is enforced". prd.md:436 lists "cross-project links" with their reasons in the Import Preview. After this amendment, a foreign WP id is `not_found` in a PM edit. In an import, a code that names another Project's WP resolves to "matching no WP". This half of round 1's F4 fix was not applied.

**Fix:** Add one clause to AD-25: in R0 the cross-project category is defence in depth and unreachable from the fence (AD-12's ownership check runs first). The import reports such a code as matching no WP.

### N4 — LOW — The "Project default Rate" example and "story 1.6 applies the rule" are vacuous, and the slice has no tracker entry

`project_default_rate_entry(project_id, effective_from, yen_per_hour, seq)` has no id of its own. A call names it only by the call's own `projectId`, and FR-12 makes its writes `tenant_admin`-only. Story 1.6's writes (Resource, Rate, Project default Rate) name no Work Package or Ticket. So there is nothing for 1.6 to "apply from the start", and "the `wpId` slice lands before 1.6's writes" is a date with no dependency behind it. The slice also has no line in `sprint-status.yaml`, so only review holds the ordering. That is round 1's F11, still open.

**Fix:** Drop "a Project default Rate" from the examples, or say it is reached through the call's own `projectId`, in both the spine and epic line 67. Replace "story 1.6 applies the rule from the start" with "every later project-scoped write applies it". Add the `wpId` slice to `sprint-status.yaml` as a 1.5 follow-up.

### N5 — LOW — "Needs a typed failure from the port" overstates the need

`audited-write.ts` already has `refuse('not_found')`, which rolls back and answers the code. `org-writes.ts`'s `visibleProject` pattern (a lookup returning `null` → `refuse`) maps a mismatch without touching `isProjectNotFound`, which is about the Project itself. `deferred-work.md`'s F8 entry already allows "or resolves `null`". So the spine and the deferred entry disagree.

**Fix:** "…through a typed failure or a `null` the work turns into `refuse('not_found')`; never a message match."

### N6 — LOW — "The repository checks it" excludes the fence's natural implementation

Under AD-25/AD-20, `applyPlanChange` loads the Project's Plan under the lock before calling `validate`. Checking a mutation's WP ids against that loaded set in `app/schedule` satisfies the invariant: it runs inside the transaction and before `validate`, and it answers `not_found`. But it is not "the repository". Two conforming implementations of story 2.x would differ only in where the check sits. Each is equally safe.

**Fix:** "checked inside the tenant transaction against the Project's own rows (by the repository, or against the Plan the fence loaded), before any other rule sees the id".

### N7 — LOW — Stale line in epic-1-context

Line 46 still says "Queued jobs acting for a user re-check membership when they run". AD-23 now says membership, role and Project reach.

**Fix:** Change that line to "…re-check membership, role and Project reach when they run (AD-23)".

## Constructions that yielded nothing

- **"Role set before parse for every use case" versus the merged runners.** There are four runners, and every export goes through one. `runProjectRead` (`project-input.ts`) calls `authorize` roles-only, then `safeParse`, then reach, then `load`; that covers `getProjectHeader`, `getProjectReview`, `getProjectMapping` and `getClientView`. `runProjectWrite` calls `authorize` before `runAuditedWrite`, whose `plan.authorize` checks reach after parse and before the transaction. `runOrgWrite` and `runMembershipWrite` call `authorize` before `runAuditedWrite`. No export calls `runAuditedWrite` directly. "Reach before any load or transaction" also holds: `plan.at` (`projectAnchor`) runs inside the transaction, after reach.
- **The ownership check versus AD-14.** A mismatch refused inside `work` rolls back with its audit row. Refusals before the transaction write nothing. There is no conflict.
- **The ownership check versus a `tenant_admin`.** `not_found` for data that the admin can reach is FR-2-consistent ("no answer names another Project's object"), and the Errors row does not forbid it.
- **"Tenant-wide objects are outside it" versus AD-10.** `rate_entry` is keyed by `resource_id`, and `work_package.assigned_resource_ids` gives 1.6 a Project → Resource → Rate path for FR-12 visibility. Tenant-wide ids named by a project-scoped call are correctly exempt. The only problem is the Project default Rate example (N4).
- **"No R0 use case lists the viewer roles".** FR-2 Client Viewer is R1 and FR-33 is Post-Q1 (epics.md release boundary). `getClientView` is a `tenant_admin | pm` preview in `index.ts`, which does not contradict R1's `app/client-view`.
- **AD-23's retired sentence.** It matches `membership-writes.ts`: `authorize` runs before parse, and `lockCallerAndTarget` re-checks the locked row.
- **epic-1-context line 67 versus the spine.** Every clause matches AD-12 and AD-23, apart from the N1 and N4 wording it copies.

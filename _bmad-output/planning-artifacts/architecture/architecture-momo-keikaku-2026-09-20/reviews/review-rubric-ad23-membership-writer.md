---
review: rubric
target: ARCHITECTURE-SPINE.md — uncommitted amendment to AD-21 and AD-23 (story 1.4 slice 2, the membership bridge's one writer)
source: _bmad-output/implementation-artifacts/spec-1-4-revocation-and-membership.md; code on main at 74090d0
date: 2026-09-21
---

# Rubric review: AD-21 / AD-23 membership-writer amendment

## Verdict

**Approve with changes. No high findings.** The amendment picks the right divergence points: one writer of a bridge with no RLS, a tenant filter on every statement, one ordered lock, revocation as row deletion (the resolver does the rest), the last-admin rule, and what `project_ids` means. Each of these is a place where story 1.5 (roles), invitation (FR-2) or a second author could otherwise go their own way. Every factual claim checked against the code holds except two: the "one module" writer claim, which leaves out the seed and the probe Tenants (F1), and the `no_access` parenthetical (F7). The main weaknesses:

- **Prevents/Binds were not updated** to cover what the new Rule text adds (F3).
- **Two rules are worded as temporary story detail**, though the invariant underneath has to outlive the story (F4, F5).
- **Several sentences are rationale or story-level mechanics** below spine altitude (F7).

Nothing was moved under Deferred.

Verified against the code:

- `packages/db/src/repo-membership-write.ts`: every statement filters by `tenant_id`, and `lockMembers` is one `SELECT … ORDER BY user_id FOR UPDATE` over the admin rows plus the caller and the target. No insert method.
- `packages/db/src/tenant-transaction.ts`: `membership: membershipWriterOn(bound)`.
- `packages/db/src/table-classes.ts`: `tenant_membership` has `appPrivileges: ['SELECT','UPDATE','DELETE']`.
- `packages/db/src/source-discipline.test.ts`: pins `membershipWriterOn` to the writer and the tenant transaction, and lists four allowed importers.
- `packages/app/src/use-cases/membership-writes.ts`: admin gate before parse, then a re-check against the locked caller row, then the target, then the last admin (`keepAnAdmin` on both revoke and demote). `project_ids` is kept on a role change.
- `packages/app/src/authz/resolve-request-context.ts`: `endSession` runs when the active Tenant has no usable membership.
- `tests/membership.test.ts`: the concurrency cases and the dropped-filter cases.

## Findings

### F1 — medium — "written by one module" contradicts the code (the seed and the probe Tenants write the bridge)

**Evidence.** AD-23 now says: "It is written by one module, `packages/db`'s `repo-membership-write.ts`." But `packages/db/src/seed.ts:475` inserts into `tenant_membership`, and `probe-tenants.ts:443` deletes from it. Both run on the owner role, and `source-discipline.test.ts` names both as allowed importers. The same AD-21 `global` row now contradicts itself: its RLS column says "written only through the `membership` write-scope family", while its Writes column still lists "the seed". A later reader applying the rule literally would either flag the seed or feel free to ignore the rule.

**Fix (AD-23, first bullet).** "It is written **on the application role** by one module, `packages/db`'s `repo-membership-write.ts` (`membershipWriterOn`) …; the owner-role seed and the test-only probe Tenants are the only other writers." In AD-21's `global` row, change "written only through the `membership` write-scope family (`membershipWriterOn`)" to "written by the application only through `membershipWriterOn`".

### F2 — medium — "reached only by the audited membership use cases" is stated without its enforcement, and the real boundary is weaker than the sentence implies

**Evidence.** `inTenantTransaction` hands the **whole** scope to every write use case (`packages/app/src/ports/write-deps.ts`: `WriteScope = ProjectWriteScope & OrgWriteScope & MembershipWriteScope`). So `scope.membership` is present at runtime in every audited write. What keeps other use cases out is:

- each use case's narrower port type (`OrgWriteScope` does not name `membership`);
- review.

What does exist:

- The source-discipline gate pins only the **constructor name** `membershipWriterOn`, not who calls `scope.membership`.
- `tests/membership.test.ts` and `tests/cross-tenant-writes.test.ts` prove the tenant filter and the lock order.
- `tests/audited-use-cases.test.ts` proves each membership write records its audit row.

The spine names none of these three. Elsewhere, AD-23 is honest in the same situation (Better Auth tables: "held by review, not by a gate").

**Fix.** Append to the first bullet: "Which use cases reach the `membership` family is held by their port types and by review. The tenant filter and the lock order are held by `tests/membership.test.ts` and the cross-tenant write harness, and the audit row by the audited-use-cases gate."

### F3 — medium — AD-23's Prevents (and Binds) do not cover what the new Rule text adds

**Evidence.** Prevents still lists only the three pre-amendment divergences. The amendment adds rules whose purpose is written nowhere except the memlog:

- a second writer that forgets the `tenant_id` filter, causing cross-Tenant writes through the no-RLS bridge;
- two concurrent membership writes that deadlock, or that both pass the last-admin check;
- a Tenant left with no Tenant Admin, which locks it out: nobody can invite, revoke or set Rates (FR-2);
- a revoked user whose session outlives the revocation (FR-3 "takes effect on the next request");
- `project_ids` read as a limit on a Tenant Admin.

Binds lacks NFR-A1. The Rule text states that role, membership and revocation changes are audited, and NFR-A1 lists "role changes" by name. AD-14 carries NFR-A1 too, but AD-23 is where the membership use cases are defined, and the frontmatter `binds` already has NFR-A1, so this is traceability only.

**Fix.**
- **Binds:** FR-1, FR-2, FR-3, FR-17, FR-36, FR-40, NFR-A1, NFR-S1
- **Prevents:** "…; a worker trusting a `tenantId` out of a job payload; a second writer of the no-RLS bridge, or one statement of the writer that forgets the Tenant filter; concurrent membership writes that deadlock or both pass the last-admin check; a Tenant with no Tenant Admin; a revoked session that survives its next request."

### F4 — medium — the stale-context re-check is worded as a stop-gap until story 1.5, but it is the durable invariant

**Evidence.** "Until story 1.5's role model, the membership use cases check `tenant_admin` themselves — before parsing, answering `not_found` — and re-check it against the caller's locked row, because a context resolved once per server action may be stale."

The upfront check (before parse, `not_found`) is temporary; story 1.5 replaces it with declared roles. The **re-check against the locked caller row** is not temporary. Without it, the spec's "Concurrent cross-demotions" case lets both admins demote each other and leaves the Tenant with no admin. Written as it is, the whole sentence reads as expiring with 1.5, and a 1.5 author who moves role checks into a generic declaration could drop the re-check. That is exactly a divergence the spine exists to prevent.

**Fix.** Split it. "A membership write authorises its caller against the caller's **locked** membership row, not only against `RequestContext`, and this holds after story 1.5's role model." Leave the before-parse `not_found` ordering to the spec, or keep it as "(until 1.5, the use cases also gate on `ctx.roles` themselves)".

### F5 — medium — invitation "decides its own grant" leaves the R0 invitation path open to a second writer

**Evidence.** AD-21: "adding a user to a Tenant is invitation work, which decides its own grant". FR-2 puts invitation of PMs by a Tenant Admin in **R0**, so this is not a far-future deferral. The sentence leaves open whether that INSERT goes through the one writer and its lock, or through a new module (Better Auth's organization plugin, a mailer-side callback, or a seed-like helper). The "one module" rule arguably closes this, but F1 shows that rule already has exceptions, and "decides its own grant" invites a reading that invitation decides its own path.

**Fix (AD-21).** "…and `tenant_membership` holds SELECT, UPDATE and DELETE; INSERT joins the grant when invitation does, as a method of the same one writer (AD-23)." Drop the story-1.4 rationale in parentheses.

### F6 — low — the `project_ids` rule does not reach AD-12, where story 1.5 will read it

**Evidence.** The memlog says this decision binds AD-12. The spine text sits only in AD-23. AD-12 says "every use case … checks project membership" against `RequestContext.projectIds`, and `contextOf` copies `projectIds` for a Tenant Admin too. So a 1.5 author reading AD-12 alone would check a Tenant Admin's `projectIds` and wrongly deny them. The parenthetical "(they are kept across a promotion, so a demotion restores them)" is rationale.

**Fix (AD-23).** "`project_ids` limits a PM's reach only: it never limits a `tenant_admin` (AD-12's project check passes a Tenant Admin whatever `projectIds` holds), and a role change leaves it unchanged." Optionally, add "(`projectIds` never limits a Tenant Admin, AD-23)" to AD-12's project-membership sentence.

### F7 — low — altitude: rationale and story mechanics in the Rule, one of them inaccurate

**Evidence**, sentence by sentence:

- "never `FOR UPDATE` on an aggregate": a Postgres fact (the database refuses it), not a decision. Drop it.
- "so concurrent membership writes queue instead of deadlocking": rationale. It belongs in Prevents (F3).
- "that writer also reads the rows it is about to change, under `FOR UPDATE`, but never to resolve a request": useful for scoping the one-reader rule, but it can be half as long.
- "(a session with no active Tenant yet answers `no_access`)": story detail, and **inaccurate**. A session with no active Tenant whose user has exactly one other usable membership is signed in to that Tenant, not refused (`resolve-request-context.ts`, the `memberships.length === 1` branch). The outcome is also not the writer's concern. Drop it.
- "because a context resolved once per server action may be stale": rationale. See F4.
- "whichever use case changes the role": keep. It is what binds story 1.5.
- "and pins `membershipsOf` and `membershipWriterOn` each to the files allowed to name them": acceptable as a named gate.

**Proposed terser AD-23 text** (replacing the amended sentences):

> - Exactly one non-RLS bridge exists: `tenant_membership(user_id, tenant_id, role, project_ids)`, class `global`. A request's Tenant is resolved from it only by `resolveRequestContext` (`packages/app/authz`), through the `MembershipReader` port and `packages/db`'s one reader, `membershipsOf`. On the application role it is written only by `packages/db`'s `membershipWriterOn` (`repo-membership-write.ts`), the `membership` family of the tenant transaction's write scope, called only by `packages/app`'s audited membership use cases. The owner-role seed and the test-only probe Tenants are the only other writers. Every writer statement names `tenant_id = <bound Tenant>` itself. Every membership write first takes **one** row-lock statement, ordered by `user_id`, over the Tenant's `tenant_admin` rows plus the caller's and the target's, and takes no other membership lock. Gates: `source-discipline.test.ts` (importers of the table, and the files naming `membershipsOf` / `membershipWriterOn`), `tests/membership.test.ts` and the cross-tenant write harness (tenant filter, lock order), the audited-use-cases gate. Which use cases reach the family is held by port types and review.
> - Role, membership, invitation and revocation changes go through `app` use cases and are audited (AD-14), never through the Better Auth adapter. Revocation deletes the membership row, and no use case touches a session: the resolver ends a session whose active Tenant has no membership. A Tenant's last `tenant_admin` can be neither revoked nor demoted, whichever use case changes the role. A membership write authorises its caller against the caller's locked row, not only `RequestContext`.
> - `project_ids` limits a PM's reach only: it never limits a `tenant_admin` (AD-12), and a role change leaves it unchanged.

### F8 — low — the grant is stated twice, with a grammar break in AD-23

**Evidence.** The `tenant_membership` grant appears in AD-21 (with story rationale) and in AD-23. Two statements of one registry fact can drift. The AD-23 sentence also lost a conjunction: "…DML on the four Better Auth tables (a per-entry grant override in the registry) SELECT only on `tenant`, and SELECT, UPDATE and DELETE — no INSERT — on `tenant_membership` (AD-21)."

**Fix.** Keep the grant in AD-21 (the registry's AD) and have AD-23 point to it: "The application role's grants on these tables are AD-21's per-entry overrides: DML on the four Better Auth tables, SELECT on `tenant`, and SELECT, UPDATE and DELETE on `tenant_membership`." At minimum, restore the missing "and" / comma before "SELECT only on `tenant`".

### F9 — low — `reviews_applied` names a review that does not exist yet

**Evidence.** The frontmatter and the intro paragraph cite `reviews/review-adversarial-ad23-membership-writer.md`, but that file is not in `reviews/` at the time of this review. Only this rubric review is being added now.

**Fix.** Land the adversarial review before the amendment is committed, or cite the files that actually exist. Add this rubric review to `reviews_applied` once its findings are resolved.

## Checklist summary

| Criterion | Result |
| --- | --- |
| Fixes the real divergence points for the level below, misses none | Mostly. It misses pinning the durable re-check (F4) and the invitation path (F5) |
| Every changed Rule is enforceable and prevents its stated divergence | Partly. Enforcement is unnamed for the writer's callers (F2), and Prevents/Binds are not updated (F3) |
| Ratifies rather than contradicts the codebase | Yes, except the "one module" claim (F1) and the `no_access` parenthetical (F7) |
| Nothing moved under Deferred lets two units diverge | Nothing was moved. Invitation's grant is left open inline instead (F5) |
| Spine altitude | Several rationale or story-level clauses. A terser text is proposed (F7) |

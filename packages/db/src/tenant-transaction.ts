import { auditSinkOn } from './audit-sink';
import type { Bound } from './bound';
import type { Db } from './client';
import { membershipWriterOn } from './repo-membership-write';
import { orgRepositoryOn } from './repo-org';
import { resourceWriteRepositoryOn } from './repo-resource';
import { connectorWriteRepositoryOn } from './repositories/connector';
import { ingestWriteRepositoryOn } from './repositories/ingest';
import { mappingRuleRepositoryOn } from './repo-mapping-rules';
import { projectWriteRepositoryOn } from './repo-writes';
import { withTenant } from './with-tenant';

/**
 * THE TENANT TRANSACTION every write use case runs in — `packages/app`'s `TenantTransaction`,
 * satisfied structurally (story 1.3 slice 1; generalised by slice 2).
 *
 * ONE `withTenant` transaction for `tenantId`, and ONE scope whose every member is bound to it:
 *
 *   * `projectWrite` — FR-29's Dispositions and FR-21's manual Mapping (`repo-writes.ts`);
 *   * `org` — FR-1's Departments, Programs and Projects (`repo-org.ts`);
 *   * `resources` — Resources and dated Rates (`repo-resource.ts`, story 1.6);
 *   * `membership` — the tenant-membership bridge's one writer (`repo-membership-write.ts`, story
 *     1.4 slice 2): revocation, role and Project changes. The bridge has no row-level security,
 *     so that writer filters by the bound Tenant itself;
 *   * `audit` — the one writer of `audit_log` (`audit-sink.ts`);
 *   * `bound` — the `{ tx, tenantId }` pair story 2.9's `app/schedule` hands to the scheduling
 *     repositories (which only it may import — AR-43). Composition never imports those repos.
 *
 * Slice 1 built a project-shaped scope here. Slice 2 composes every repository family into the
 * one scope instead of opening a transaction per family: a use case's port names only the members
 * it touches (`ProjectWriteScope`, `OrgWriteScope`), and a transaction handing the whole scope
 * satisfies each. Building a repository is a handful of closures over `tx` — no statement runs
 * until a member is called — so the families a use case does not touch cost nothing.
 *
 * Whatever `work` does commits together when it resolves and rolls back together when it throws —
 * the change and its audit record included (AD-14). No member opens a transaction of its own
 * (deferred-work: `withTenant` is not re-entrant, and a nested call is a second, independent
 * transaction whose rows would survive this one's rollback).
 *
 * A new repository family joins the scope here and `packages/app`'s `WriteScope`; the composition
 * roots' `satisfies WriteDeps<Db>` names whichever side is missing.
 */
function writeScopeOn(bound: Bound) {
  return {
    projectWrite: projectWriteRepositoryOn(bound),
    // Story 5.10: Mapping Rule create / edit / delete / reorder + re-evaluation under the lock.
    mappingRules: mappingRuleRepositoryOn(bound),
    org: orgRepositoryOn(bound),
    resources: resourceWriteRepositoryOn(bound),
    membership: membershipWriterOn(bound),
    connectorWrite: connectorWriteRepositoryOn(bound),
    ingestWrite: ingestWriteRepositoryOn(bound),
    audit: auditSinkOn(bound),
    bound,
  };
}

/** What `inTenantTransaction` hands the use case: `packages/app`'s `WriteScope`. */
export type WriteScope = ReturnType<typeof writeScopeOn>;

export function inTenantTransaction<T>(
  db: Db,
  tenantId: string,
  work: (scope: WriteScope) => Promise<T>,
): Promise<T> {
  return withTenant(db, tenantId, (tx) => work(writeScopeOn({ tx, tenantId })));
}

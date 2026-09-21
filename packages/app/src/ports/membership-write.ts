import type { AuditSink } from '../audit';
import type { AuditedWriteDeps } from './audited-write';
import type { Clock } from './clock';
import type { OrgRepository } from './org-write';

/**
 * THE PORT THE MEMBERSHIP WRITES DEPEND ON (story 1.4 slice 2): the tenant-membership bridge,
 * locked and changed — a membership revoked, its role changed, a Project assigned or unassigned.
 *
 * DECLARED HERE, SATISFIED STRUCTURALLY, like `OrgRepository`: `packages/db`'s
 * `repo-membership-write.ts` is shaped to match, and the composition roots' `satisfies` checks it.
 * Members are function-typed PROPERTIES so their parameters are checked strictly.
 *
 * BOUND TO ONE TRANSACTION AND ONE TENANT. The bridge has no row-level security, so the adapter
 * filters every statement by the bound Tenant itself; a user with no membership in that Tenant is
 * simply absent from what `lockMembers` answers, and the use case answers `not_found`.
 *
 * ONE LOCK, TAKEN FIRST. `lockMembers` locks, in one statement ordered by user id, the Tenant's
 * `tenant_admin` rows and the caller's and the target's. Every membership write calls it exactly
 * once, before anything else touches the bridge, and takes no other membership lock — so
 * concurrent writes queue in one order and never deadlock, and the admin count is stable until
 * commit. The rules (who may act, the last admin, which roles are assignable, the no-ops) are the
 * use cases' (`use-cases/membership-writes.ts`); the repository decides nothing.
 *
 * It cannot insert: adding a user to a Tenant is invitation work, not this slice's.
 */

/** One locked membership row. `role` is as stored — possibly a string this release does not know. */
export interface LockedMemberRow {
  readonly userId: string;
  readonly role: string;
  readonly projectIds: readonly string[];
}

export interface MembershipWriteRepository {
  /**
   * Locks and answers, ordered by user id, every `tenant_admin` membership of the bound Tenant
   * plus `callerId`'s and `targetId`'s (either absent when it has none in this Tenant).
   */
  readonly lockMembers: (ids: {
    readonly callerId: string;
    readonly targetId: string;
  }) => Promise<readonly LockedMemberRow[]>;
  /** Deletes `userId`'s membership in the bound Tenant — a revocation. */
  readonly deleteMembership: (userId: string) => Promise<void>;
  /** Changes the role and nothing else. */
  readonly setRole: (change: { readonly userId: string; readonly role: string }) => Promise<void>;
  /** Changes `project_ids` and nothing else. */
  readonly setProjectIds: (change: {
    readonly userId: string;
    readonly projectIds: readonly string[];
  }) => Promise<void>;
}

/**
 * What one membership write transaction hands its work: the bridge's writer, the audit sink — and
 * the org repository's `findProject`, which an assignment checks the Project against (the scope a
 * composition root builds carries every family, `ports/write-deps.ts`).
 */
export interface MembershipWriteScope {
  readonly membership: MembershipWriteRepository;
  readonly org: Pick<OrgRepository, 'findProject'>;
  readonly audit: AuditSink;
}

/** The generic audited-write deps over that scope, plus the `Clock` the audit `at` comes from. */
export type MembershipWriteDeps<Handle> = AuditedWriteDeps<Handle, MembershipWriteScope> & {
  readonly clock: Clock;
};

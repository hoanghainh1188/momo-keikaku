import { and, asc, eq, inArray, or } from 'drizzle-orm';
import type { Bound } from './bound';
import { tenantMembership } from './schema-membership';

/**
 * THE ONE WRITER OF `tenant_membership` (story 1.4 slice 2): the rows `packages/app`'s audited
 * membership use cases lock, revoke, re-role and re-assign.
 *
 * Satisfies `packages/app`'s `MembershipWriteRepository` STRUCTURALLY (this package may not import
 * `@momo/app`); the row type below restates the port's, and each composition root's `satisfies`
 * checks the match.
 *
 * BOUND TO ONE TRANSACTION AND ONE TENANT (`Bound`), like the org repository — built by
 * `inTenantTransaction`, every statement on its `tx`, none opening a transaction of its own. But
 * the bridge has NO ROW-LEVEL SECURITY (it is what a request's Tenant is resolved from), so the
 * Tenant is not the database's to enforce here: EVERY statement below names `tenant_id = <bound
 * Tenant>` itself. Drop that filter from any one of them and a write acting in one Tenant reaches
 * the same user's membership in another; `tests/membership.test.ts` and the cross-tenant write
 * harness fail when it is dropped.
 *
 * ONE LOCK STATEMENT. `lockMembers` is the only statement that takes membership row locks, and
 * every membership write takes it first and once: the Tenant's `tenant_admin` rows plus the
 * caller's and the target's, ORDERED BY `user_id`, `FOR UPDATE`. Every writer therefore locks the
 * rows it can meet in the same order, so two concurrent writes queue instead of deadlocking, and
 * the admin count a use case decides "last admin" from is over rows nobody else can change until
 * it commits. Never `FOR UPDATE` on an aggregate (Postgres refuses it), and never a second lock
 * statement — two statements lock in two orders.
 *
 * It decides nothing: which roles are assignable, the last-admin rule, the no-ops and the audit
 * are the use cases'. It never inserts: adding a user to a Tenant is invitation work, and the
 * application role holds no INSERT on the table. `source-discipline.test.ts` pins
 * `membershipWriterOn` to this module and the tenant transaction that composes it.
 */

/** One locked membership row, as the port declares it. */
export interface LockedMemberRow {
  readonly userId: string;
  /** As stored — an unknown string included; the use case decides what it may become. */
  readonly role: string;
  readonly projectIds: readonly string[];
}

/**
 * A DELETE or UPDATE must change exactly the one row the use case locked. Zero means it vanished
 * (it cannot, under the lock) or the Tenant filter matched nothing; more than one means the
 * statement reached another Tenant's row. Either is a bug, and it must not commit.
 */
function exactlyOne(what: string, userId: string, rowCount: number | null): void {
  if (rowCount !== 1) {
    throw new Error(
      `tenant_membership ${userId}: expected to ${what} exactly one row, touched ${rowCount ?? 0}`,
    );
  }
}

export function membershipWriterOn({ tx, tenantId }: Bound) {
  /** The one row of `userId` in the bound Tenant — the WHERE every change below uses. */
  const own = (userId: string) =>
    and(eq(tenantMembership.tenantId, tenantId), eq(tenantMembership.userId, userId));

  return {
    /**
     * Locks, in ONE ordered statement, every `tenant_admin` row of the bound Tenant and the
     * caller's and the target's rows, and answers them ordered by user id. A user with no
     * membership in this Tenant is simply absent from the answer.
     */
    lockMembers: async ({
      callerId,
      targetId,
    }: {
      readonly callerId: string;
      readonly targetId: string;
    }): Promise<LockedMemberRow[]> => {
      const rows = await tx
        .select({
          userId: tenantMembership.userId,
          role: tenantMembership.role,
          projectIds: tenantMembership.projectIds,
        })
        .from(tenantMembership)
        .where(
          and(
            eq(tenantMembership.tenantId, tenantId),
            or(
              eq(tenantMembership.role, 'tenant_admin'),
              inArray(tenantMembership.userId, [callerId, targetId]),
            ),
          ),
        )
        .orderBy(asc(tenantMembership.userId))
        .for('update');
      return rows.map((row) => ({ userId: row.userId, role: row.role, projectIds: row.projectIds }));
    },

    /** Revokes: deletes the user's membership in the bound Tenant, and only that row. */
    deleteMembership: async (userId: string): Promise<void> => {
      const res = await tx.delete(tenantMembership).where(own(userId));
      exactlyOne('delete', userId, res.rowCount);
    },

    /** Sets the role and nothing else. */
    setRole: async ({ userId, role }: { readonly userId: string; readonly role: string }): Promise<void> => {
      const res = await tx.update(tenantMembership).set({ role }).where(own(userId));
      exactlyOne('update', userId, res.rowCount);
    },

    /** Sets `project_ids` and nothing else. */
    setProjectIds: async ({
      userId,
      projectIds,
    }: {
      readonly userId: string;
      readonly projectIds: readonly string[];
    }): Promise<void> => {
      const res = await tx
        .update(tenantMembership)
        .set({ projectIds: [...projectIds] })
        .where(own(userId));
      exactlyOne('update', userId, res.rowCount);
    },
  };
}

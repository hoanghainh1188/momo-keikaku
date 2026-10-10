import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { tenantMembership } from './schema-membership';
/**
 * A DELETE or UPDATE must change exactly the one row the use case locked. Zero means it vanished
 * (it cannot, under the lock) or the Tenant filter matched nothing; more than one means the
 * statement reached another Tenant's row. Either is a bug, and it must not commit.
 */
function exactlyOne(what, userId, rowCount) {
    if (rowCount !== 1) {
        throw new Error(`tenant_membership ${userId}: expected to ${what} exactly one row, touched ${rowCount ?? 0}`);
    }
}
export function membershipWriterOn({ tx, tenantId }) {
    /** The one row of `userId` in the bound Tenant — the WHERE every change below uses. */
    const own = (userId) => and(eq(tenantMembership.tenantId, tenantId), eq(tenantMembership.userId, userId));
    return {
        /**
         * Locks, in ONE ordered statement, every `tenant_admin` row of the bound Tenant and the
         * caller's and the target's rows, and answers them ordered by user id. A user with no
         * membership in this Tenant is simply absent from the answer.
         */
        lockMembers: async ({ callerId, targetId, }) => {
            const rows = await tx
                .select({
                userId: tenantMembership.userId,
                role: tenantMembership.role,
                projectIds: tenantMembership.projectIds,
            })
                .from(tenantMembership)
                .where(and(eq(tenantMembership.tenantId, tenantId), or(eq(tenantMembership.role, 'tenant_admin'), inArray(tenantMembership.userId, [callerId, targetId]))))
                .orderBy(asc(tenantMembership.userId))
                .for('update');
            return rows.map((row) => ({ userId: row.userId, role: row.role, projectIds: row.projectIds }));
        },
        /** Revokes: deletes the user's membership in the bound Tenant, and only that row. */
        deleteMembership: async (userId) => {
            const res = await tx.delete(tenantMembership).where(own(userId));
            exactlyOne('delete', userId, res.rowCount);
        },
        /** Sets the role and nothing else. */
        setRole: async ({ userId, role }) => {
            const res = await tx.update(tenantMembership).set({ role }).where(own(userId));
            exactlyOne('update', userId, res.rowCount);
        },
        /** Sets `project_ids` and nothing else. */
        setProjectIds: async ({ userId, projectIds, }) => {
            const res = await tx
                .update(tenantMembership)
                .set({ projectIds: [...projectIds] })
                .where(own(userId));
            exactlyOne('update', userId, res.rowCount);
        },
    };
}

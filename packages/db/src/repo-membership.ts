import { asc, eq } from 'drizzle-orm';
import type { Db } from './client';
import { tenantMembership } from './schema-membership';

/**
 * One membership row, as `packages/app`'s `MembershipReader` port declares it (satisfied structurally at
 * the composition root, like every other port — `packages/db` may not import `@momo/app`).
 */
export interface MembershipRow {
  readonly tenantId: string;
  readonly role: string;
  readonly projectIds: readonly string[];
}

/**
 * THE ONE READER OF `tenant_membership` (story 1.4 slice 1): every Tenant `userId` belongs to,
 * with its role and Projects, ordered by Tenant id so "the single membership" and "several" are
 * decided on a stable answer.
 *
 * Called by `packages/app`'s `resolveRequestContext` — through the composition root — and by
 * nothing else; `source-discipline.test.ts` fails when another application module imports the
 * table or queries it. The table is `global` (no tenant policy: it is what the Tenant is resolved
 * from), so the read needs no `withTenant`; it still runs on a `tx`, per the bare-handle rule.
 */
export async function membershipsOf(db: Db, userId: string): Promise<MembershipRow[]> {
  const rows = await db.transaction((tx) =>
    tx
      .select({
        tenantId: tenantMembership.tenantId,
        role: tenantMembership.role,
        projectIds: tenantMembership.projectIds,
      })
      .from(tenantMembership)
      .where(eq(tenantMembership.userId, userId))
      .orderBy(asc(tenantMembership.tenantId)),
  );
  return rows.map((row) => ({ tenantId: row.tenantId, role: row.role, projectIds: row.projectIds }));
}

import { pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

/**
 * THE TENANT-MEMBERSHIP BRIDGE (story 1.4 slice 1, AR-40): which Tenants a user belongs to, as
 * which role, over which Projects.
 *
 * It is the one table that carries `tenant_id` WITHOUT row-level security, and it has to be: it
 * is read to decide which Tenant a request acts in, so it is read before any Tenant is known.
 * `table-classes.ts` marks it `global` and flags it as the bridge (`tenantBridge`), which is what
 * lets the catalog assertion accept a `tenant_id` column with no policy on exactly this table.
 *
 * ONE READER FOR REQUEST RESOLUTION, ONE WRITER. `repo-membership.ts`'s `membershipsOf`, called
 * by `packages/app`'s `resolveRequestContext` and by nothing else, is the only application code
 * that reads it to resolve a request; `repo-membership-write.ts`'s `membershipWriterOn`, composed
 * into the tenant transaction, is the only one that changes it — for story 1.4 slice 2's audited
 * revocation, role and Project changes, which lock and write only rows of the bound Tenant. That
 * is why this table lives in its own module, which the `@momo/db` barrel does NOT re-export: only
 * that reader, that writer, the seed and the probe Tenants import `tenantMembership`, and
 * `source-discipline.test.ts` fails when anything else does, or when any other application source
 * writes a query `FROM` or `JOIN` it. The application role holds SELECT, UPDATE and DELETE — no
 * INSERT: adding a user to a Tenant is invitation work, never a request's side effect.
 *
 * No foreign keys: it is a `global` bridge, outside AD-3's tenant-owned FK set (story 2.1).
 */
export const tenantMembership = pgTable(
  'tenant_membership',
  {
    userId: text('user_id').notNull(),
    tenantId: text('tenant_id').notNull(),
    /** `tenant_admin` | `pm` in this release (`client_viewer`/`internal_viewer` exist, unassignable). */
    role: text('role').notNull(),
    /**
     * The Projects a PM works on. Empty for a seeded Tenant Admin, who reaches every Project (1.5);
     * a PM promoted to Tenant Admin keeps theirs, so a later demotion restores them.
     */
    projectIds: text('project_ids').array().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.tenantId] }) }),
);

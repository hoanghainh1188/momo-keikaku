/**
 * The port the Tenant-Admin audit-log reader depends on (story 1.7).
 *
 * DECLARED HERE, SATISFIED STRUCTURALLY by `packages/db/src/repo-audit.ts` at the composition
 * root — same pattern as `project-read.ts`. The handle is a type parameter so this layer never
 * names Drizzle.
 */
import type { IdentityUser } from './identity';

/** One stored row, as the repository returns it (payload still encoded). */
export interface AuditLogRow {
  readonly seq: number;
  readonly actor: string;
  readonly action: string;
  readonly target: string;
  readonly payload: unknown;
  readonly at: Date;
}

/** Optional filters on the Tenant's log. Bounds on `at` are inclusive. */
export interface AuditLogFilters {
  readonly action?: string;
  readonly actor?: string;
  readonly from?: Date;
  readonly to?: Date;
}

export interface AuditLogReadPort<Handle> {
  readonly list: (
    handle: Handle,
    tenantId: string,
    filters: AuditLogFilters,
  ) => Promise<readonly AuditLogRow[]>;
}

/** What the audit-log read use case is given. */
export interface AuditLogReadDeps<Handle> {
  readonly handle: Handle;
  readonly auditLogRead: AuditLogReadPort<Handle>;
  /**
   * Identity lookup for actor display (AD-23). Only `lookupUser` is required — the session
   * members stay on the full `IdentityPort` for the resolver.
   */
  readonly lookupUser: (userId: string) => Promise<IdentityUser | null>;
}

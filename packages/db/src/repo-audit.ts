/**
 * THE AUDIT-LOG READER (story 1.7) — SELECT from `audit_log` inside `withTenant`. Append-only
 * grants stay SELECT+INSERT; this module never writes. The sink (`audit-sink.ts`) remains the
 * sole writer.
 */
import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import type { Db } from './client';
import * as schema from './schema';
import { withTenant } from './with-tenant';

export interface AuditLogListFilters {
  readonly action?: string;
  readonly actor?: string;
  readonly from?: Date;
  readonly to?: Date;
}

export interface AuditLogListedRow {
  readonly seq: number;
  readonly actor: string;
  readonly action: string;
  readonly target: string;
  readonly payload: unknown;
  readonly at: Date;
}

/**
 * Rows of the caller's Tenant, newest first by `seq` (insertion order). Filters are optional
 * and AND-combined; `from`/`to` are inclusive on `at`.
 */
export async function listAuditLog(
  db: Db,
  tenantId: string,
  filters: AuditLogListFilters = {},
): Promise<readonly AuditLogListedRow[]> {
  return withTenant(db, tenantId, async (tx) => {
    const conditions: SQL[] = [eq(schema.auditLog.tenantId, tenantId)];
    if (filters.action !== undefined) {
      conditions.push(eq(schema.auditLog.action, filters.action));
    }
    if (filters.actor !== undefined) {
      conditions.push(eq(schema.auditLog.actor, filters.actor));
    }
    if (filters.from !== undefined) {
      conditions.push(gte(schema.auditLog.at, filters.from));
    }
    if (filters.to !== undefined) {
      conditions.push(lte(schema.auditLog.at, filters.to));
    }

    const rows = await tx
      .select({
        seq: schema.auditLog.seq,
        actor: schema.auditLog.actor,
        action: schema.auditLog.action,
        target: schema.auditLog.target,
        payload: schema.auditLog.payload,
        at: schema.auditLog.at,
      })
      .from(schema.auditLog)
      .where(and(...conditions))
      // Newest first for the Admin surface; `seq` is the true insertion order (AD-14).
      .orderBy(desc(schema.auditLog.seq));

    return rows.map((row) => ({
      seq: row.seq,
      actor: row.actor,
      action: row.action,
      target: row.target,
      payload: row.payload,
      at: row.at,
    }));
  });
}

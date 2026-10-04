/**
 * Tenant fan-out for the snapshot tick (story 5.4 / AR-40).
 *
 * `tenant` has no RLS — the worker lists every Tenant id, then opens `withTenant` per id
 * to scan due Connectors. Not a product use case; composition roots only. Runs on a short
 * `db.transaction` (bare-handle rule — same pattern as `membershipsOf`).
 */
import type { Db } from './client';
import { tenant } from './schema';

export async function listTenantIds(db: Db): Promise<readonly string[]> {
  const rows = await db.transaction((tx) => tx.select({ id: tenant.id }).from(tenant));
  return rows.map((r) => r.id);
}

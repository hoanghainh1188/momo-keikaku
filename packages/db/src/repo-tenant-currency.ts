import { eq, sql } from 'drizzle-orm';
import type { Db } from './client';
import { projectDefaultRateEntry, rateEntry, tenant } from './schema';
import { withTenant } from './with-tenant';

/**
 * Tenant currency read/write (story 1.9). Runs on the application role; `tenant` is global.
 * The handle is not named `db`: the source-discipline gate reserves that name for opening
 * transactions, and queries go out on `tx` or on this handle.
 */
export function tenantCurrencyOn(handle: Db) {
  return {
    async hasAnyRate(tenantId: string): Promise<boolean> {
      return withTenant(handle, tenantId, async (tx) => {
        const [resourceRates, projectRates] = await Promise.all([
          tx
            .select({ n: sql<number>`count(*)::int` })
            .from(rateEntry)
            .where(eq(rateEntry.tenantId, tenantId)),
          tx
            .select({ n: sql<number>`count(*)::int` })
            .from(projectDefaultRateEntry)
            .where(eq(projectDefaultRateEntry.tenantId, tenantId)),
        ]);
        return (resourceRates[0]?.n ?? 0) + (projectRates[0]?.n ?? 0) > 0;
      });
    },

    async setCurrency(tenantId: string, currency: string): Promise<void> {
      const res = await handle.update(tenant).set({ currency }).where(eq(tenant.id, tenantId));
      if (res.rowCount !== 1) {
        throw new Error(`tenant ${tenantId}: expected to update exactly one row, updated ${res.rowCount ?? 0}`);
      }
    },

    async currencyOf(tenantId: string): Promise<string | null> {
      const rows = await handle
        .select({ currency: tenant.currency })
        .from(tenant)
        .where(eq(tenant.id, tenantId))
        .limit(1);
      return rows[0]?.currency ?? null;
    },
  };
}

import { tenant } from './schema';
export async function listTenantIds(db) {
    const rows = await db.transaction((tx) => tx.select({ id: tenant.id }).from(tenant));
    return rows.map((r) => r.id);
}

/**
 * Decision Q2-A's probe: `pnpm dev` seeds only a database that holds no Tenant yet.
 *
 * It connects as the OWNING role — the seed's own role, and one row-level security does not hide
 * rows from. A connection or query error is thrown, never read as "empty": reading it as empty
 * would run the seed, and the seed TRUNCATEs. `scripts/dev.ts` turns the error into the named
 * step failure.
 */
import pg from 'pg';
export async function databaseHoldsATenant(connectionString) {
    const client = new pg.Client({ connectionString, application_name: 'momo-dev-tenant-probe' });
    try {
        await client.connect();
        const { rowCount } = await client.query('select 1 from tenant limit 1');
        return (rowCount ?? 0) > 0;
    }
    finally {
        await client.end().catch(() => undefined);
    }
}

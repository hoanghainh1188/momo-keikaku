/**
 * A database of a test's own, created next to the one `DATABASE_URL` names and dropped afterwards,
 * so a test can migrate or write freely without touching the shared `momo_keikaku` data (which a
 * running `pnpm dev` may be serving). Test support only; not a script entry point.
 *
 * The owning role needs CREATEDB (the compose `momo` superuser and CI's owner both have it).
 */
import pg from 'pg';
async function asAdmin(ownerUrl, sql) {
    const client = new pg.Client({ connectionString: ownerUrl, application_name: 'momo-throwaway-db' });
    await client.connect();
    try {
        await client.query(sql);
    }
    finally {
        await client.end();
    }
}
/** `prefix` must be a plain lower-case identifier; the pid keeps parallel runs apart. */
export async function createThrowawayDatabase(ownerUrl, prefix) {
    if (!/^[a-z_][a-z0-9_]*$/.test(prefix))
        throw new Error(`not a plain identifier: ${prefix}`);
    const name = `${prefix}_${process.pid}`;
    await asAdmin(ownerUrl, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await asAdmin(ownerUrl, `CREATE DATABASE "${name}"`);
    const url = new URL(ownerUrl);
    url.pathname = `/${name}`;
    return {
        url: url.toString(),
        drop: () => asAdmin(ownerUrl, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`),
    };
}
/** Whether `url` accepts a connection. */
export async function reachable(url) {
    if (!url)
        return false;
    const client = new pg.Client({ connectionString: url, application_name: 'momo-throwaway-db' });
    try {
        await client.connect();
        return true;
    }
    catch {
        return false;
    }
    finally {
        await client.end().catch(() => undefined);
    }
}

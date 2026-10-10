/**
 * `pnpm db:migrate` — applies `packages/db/drizzle/` through `drizzle-kit migrate` (AD-19), after
 * refusing one database shape it cannot migrate.
 *
 * THE SHAPE. A database created before story 2.1 got its schema from `drizzle-kit push`. It has
 * tables in `public` but no `drizzle.__drizzle_migrations` journal. `drizzle-kit migrate` does not
 * detect that: it replays `0000_scheduling_schema.sql` from the top and stops halfway through on
 * "relation … already exists". The error names no cause and no fix. This guard names both before
 * anything runs. The fix is to recreate the database once. The AD-30 migration expects an empty
 * database, and a pre-2.1 schema is not one this migration can carry forward.
 *
 * It reads DATABASE_URL straight from the environment, as `drizzle.config.ts` does: this is
 * tooling that runs outside the application's environment fence, and drizzle-kit reads the same
 * key.
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
/** The recreate command from README-DEMO.md, for the local docker compose database. */
export const RECREATE_HINT = "docker exec momo-keikaku-postgres sh -c 'dropdb -U momo --force momo_keikaku && createdb -U momo momo_keikaku'";
/**
 * The refusal message for a database `drizzle-kit migrate` would half-apply, or `null` when the
 * database can be migrated: it is empty, or its schema was created by migrations.
 */
export function pushCreatedRefusal(state) {
    if (state.hasMigrationJournal || state.publicTables === 0)
        return null;
    return (`db:migrate: refused. The database has ${state.publicTables} table(s) in "public" but no ` +
        'drizzle.__drizzle_migrations journal, so its schema came from `drizzle-kit push` (before ' +
        'story 2.1). The AD-30 migration expects an empty database and cannot migrate this one. ' +
        `Recreate it once, then run the command again. For the local docker database: ${RECREATE_HINT}`);
}
async function readSchemaState(connectionString) {
    const client = new pg.Client({ connectionString, application_name: 'momo-db-migrate' });
    await client.connect();
    try {
        const { rows } = await client.query(`SELECT (SELECT count(*) FROM pg_catalog.pg_class c
                 JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relkind = 'r') AS public_tables,
              to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS has_journal`);
        const row = rows[0];
        return { publicTables: Number(row.public_tables), hasMigrationJournal: row.has_journal };
    }
    finally {
        await client.end();
    }
}
async function main() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new Error('DATABASE_URL is required — the PostgreSQL connection string for the owning role. ' +
            'There is no localhost default.');
    }
    const refusal = pushCreatedRefusal(await readSchemaState(url));
    if (refusal !== null) {
        console.error(refusal);
        process.exit(1);
    }
    const result = spawnSync('pnpm', ['exec', 'drizzle-kit', 'migrate'], { stdio: 'inherit' });
    process.exit(result.status ?? 1);
}
// Run only when this file IS the program, so a test can import the pure guard without touching
// whatever DATABASE_URL names (the same guard as `scripts/db-policies.ts`).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}

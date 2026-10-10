import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pushCreatedRefusal, RECREATE_HINT } from './db-migrate';
import { createThrowawayDatabase, reachable } from './throwaway-database';
/**
 * The `db:migrate` guard. No database: the decision is pure, and the query that feeds it is two
 * catalogue reads. What matters is which shapes are refused, and that the refusal names the fix.
 */
describe('pushCreatedRefusal', () => {
    it('lets an empty database through (the first migration creates everything)', () => {
        expect(pushCreatedRefusal({ publicTables: 0, hasMigrationJournal: false })).toBeNull();
    });
    it('lets a migration-created database through, however many tables it holds', () => {
        expect(pushCreatedRefusal({ publicTables: 29, hasMigrationJournal: true })).toBeNull();
    });
    it('refuses a push-created database: tables in public but no drizzle journal', () => {
        const refusal = pushCreatedRefusal({ publicTables: 24, hasMigrationJournal: false });
        expect(refusal).toContain('24 table(s)');
        expect(refusal).toContain('drizzle-kit push');
        expect(refusal, 'the refusal must name the fix, not only the cause').toContain(RECREATE_HINT);
    });
});
/**
 * Story 1.1 slice B3, I/O matrix row "Restart": a second `db:migrate` on a migrated database
 * applies nothing. drizzle-kit prints "migrations applied successfully" either way, so the proof is
 * the journal: after the second run it holds the same rows, one per migration file, and the schema
 * has the same tables.
 *
 * Runs the real script, in a throwaway database of its own — never the shared `momo_keikaku` one.
 * Skipped without a database, unless REQUIRE_DB=1.
 */
const REQUIRE_DB = process.env.REQUIRE_DB === '1';
const OWNER_DATABASE_URL = process.env.DATABASE_URL;
if (REQUIRE_DB && !OWNER_DATABASE_URL) {
    throw new Error('REQUIRE_DB=1 but DATABASE_URL is not set: the db:migrate no-op check must not be skipped.');
}
const dbReachable = await reachable(OWNER_DATABASE_URL);
if (REQUIRE_DB && !dbReachable) {
    throw new Error('REQUIRE_DB=1 but the database is not reachable. Run `pnpm db:up` first.');
}
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIGRATION_FILES = readdirSync(join(ROOT, 'packages/db/drizzle')).filter((f) => f.endsWith('.sql'));
describe.skipIf(!dbReachable)('db:migrate on an already-migrated database (story 1.1 "Restart")', () => {
    let db;
    beforeAll(async () => {
        db = await createThrowawayDatabase(OWNER_DATABASE_URL, 'momo_db_migrate_noop');
    });
    afterAll(async () => {
        await db?.drop();
    });
    function migrate() {
        const result = spawnSync('pnpm', ['exec', 'tsx', 'scripts/db-migrate.ts'], {
            cwd: ROOT,
            env: { ...process.env, DATABASE_URL: db.url },
            encoding: 'utf8',
        });
        expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    }
    async function state() {
        const client = new pg.Client({ connectionString: db.url });
        await client.connect();
        try {
            const journal = await client.query('SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY id');
            const tables = await client.query(`SELECT count(*) AS n FROM pg_catalog.pg_class c
           JOIN pg_catalog.pg_namespace ns ON ns.oid = c.relnamespace
          WHERE ns.nspname = 'public' AND c.relkind = 'r'`);
            return {
                journal: journal.rows.map((r) => `${r.created_at}:${r.hash}`),
                tables: Number(tables.rows[0].n),
            };
        }
        finally {
            await client.end();
        }
    }
    it('the second run applies nothing: same journal rows, same tables', async () => {
        migrate();
        const first = await state();
        expect(first.journal).toHaveLength(MIGRATION_FILES.length);
        expect(first.tables).toBeGreaterThan(0);
        migrate();
        expect(await state()).toEqual(first);
    }, 120_000);
});

/**
 * `pnpm db:policies` — applies the row-level security, grants and append-only triggers
 * that `packages/db/src/table-classes.ts` describes. `pnpm db:sql` rewrites the checked-in
 * rendering under `packages/db/sql/` instead of applying anything.
 *
 * It REGENERATES rather than reading `packages/db/sql/*.sql`, deliberately. A hand edit to
 * those files can therefore never reach a database; it can only make the drift assertions in
 * `packages/db/src/registry.test.ts` fail, which is where a hand edit should surface.
 *
 * Roles. The application role's name comes from APP_DATABASE_URL, parsed by the same
 * function `scripts/pgboss-migrate.ts` uses, so the role the web app and the worker log in
 * as and the role the grants name cannot disagree. The `maintenance` role is created
 * through that script's exported `ensureRole` — the one mechanism that decides what a momo
 * role may be — rather than a second, parallel one that could drift on NOBYPASSRLS.
 *
 * `momo_maintenance` is NOLOGIN. The escape hatch is reached with `SET ROLE` from an owning
 * connection, exactly as `momo_migrator` is: a hatch with its own password is a credential
 * somebody has to store, and the hatch is meant to be opened deliberately by whoever
 * already holds the database, not carried around.
 *
 * Idempotent, and re-run twice by CI for that reason. It drops and recreates policies and
 * triggers, and revokes before granting, so the applied state converges on the registry
 * instead of only ever growing.
 *
 * Why the owning connection: ENABLE/FORCE ROW LEVEL SECURITY, CREATE POLICY and
 * CREATE TRIGGER are owner privileges, and the tables are owned by the role
 * `pnpm db:migrate` created them as. Run it after `pnpm db:migrate` and after
 * `pnpm pgboss:migrate` (which creates the application role this grants to).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { config } from '../packages/app/src/config.js';
import { CANONICAL_APP_ROLE, CANONICAL_MAINTENANCE_ROLE, } from '../packages/db/src/table-classes.js';
import { generateAll } from '../packages/db/src/sql/generate.js';
import { assertSameDatabase, ensureRole, parseAppRoleIdentity } from './pgboss-migrate.js';
const SQL_DIR = fileURLToPath(new URL('../packages/db/sql/', import.meta.url));
/** `pnpm db:sql`. Writes the canonical rendering — the one the drift test compares against. */
function writeGeneratedFiles() {
    mkdirSync(SQL_DIR, { recursive: true });
    const files = generateAll(CANONICAL_APP_ROLE, CANONICAL_MAINTENANCE_ROLE);
    for (const [name, sql] of Object.entries(files)) {
        writeFileSync(`${SQL_DIR}${name}`, sql, 'utf8');
        console.log(`db:sql: wrote packages/db/sql/${name}`);
    }
}
async function apply() {
    assertSameDatabase(config.DATABASE_URL, config.APP_DATABASE_URL);
    const appRole = parseAppRoleIdentity(config.APP_DATABASE_URL);
    const client = new pg.Client({
        connectionString: config.DATABASE_URL,
        application_name: 'momo-db-policies',
    });
    await client.connect();
    try {
        await ensureRole(client, CANONICAL_MAINTENANCE_ROLE, { login: false });
        const files = generateAll(appRole.name, CANONICAL_MAINTENANCE_ROLE);
        // One transaction. A half-applied policy set is a database where some tables are
        // isolated and some are not, which is worse than one where none are: the gaps are
        // invisible until a read returns another Tenant's rows.
        await client.query('BEGIN');
        try {
            for (const [name, sql] of Object.entries(files)) {
                await client.query(sql);
                console.log(`db:policies: applied ${name}`);
            }
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        console.log(`db:policies: RLS + FORCE and the isolation policy on every tenant-owned table; ` +
            `grants for '${appRole.name}' and '${CANONICAL_MAINTENANCE_ROLE}'; append-only triggers installed`);
    }
    finally {
        await client.end();
    }
}
// Run only when this file IS the program, the same guard and for the same reason as
// `scripts/pgboss-migrate.ts`: importing it — which a test of the pure renderers would do —
// must not apply row-level security and re-issue every grant against whatever DATABASE_URL
// happens to name.
//
// The flag is read from `argv.slice(2)`, so `--write` counts only as an argument to this
// script. Scanning all of argv would let a `--write` anywhere on the command line — in a
// runner's own options, say — silently turn an apply into a file write.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.argv.slice(2).includes('--write')) {
        writeGeneratedFiles();
    }
    else {
        await apply();
    }
}

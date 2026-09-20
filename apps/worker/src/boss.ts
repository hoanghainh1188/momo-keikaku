// How `apps/worker` constructs pg-boss, kept apart from the entry point so a test can
// build the same runner without starting the process's signal handlers.
//
// The whole point of this module is what it switches OFF. pg-boss installs and migrates
// its own schema on `start()` by default; here both switches are false, so the worker's
// role never attempts DDL — and would be refused if it did, because the migrator step
// (`scripts/pgboss-migrate.ts`) grants it USAGE and DML and no CREATE.
import { PgBoss } from 'pg-boss';

/**
 * pg-boss's own default schema name, stated rather than inherited so the worker and
 * `scripts/pgboss-migrate.ts` can be read as naming the same schema. A disagreement is
 * loud: `start()` throws "pg-boss is not installed".
 */
export const PGBOSS_SCHEMA = 'pgboss';

/**
 * Builds the runner for the restricted application role.
 *
 * @param connectionString the `app` role's connection string — `config.APP_DATABASE_URL`.
 * @param schema which schema to run against. Defaults to the installed one; a test passes a
 *   schema holding no installation, because *refusing* there is the only behaviour that
 *   distinguishes `migrate: false` from `migrate: true` (against an already-current schema
 *   both perform no DDL, so the flag would otherwise be unobserved).
 */
export function createBoss(connectionString: string, schema: string = PGBOSS_SCHEMA): PgBoss {
  return new PgBoss({
    connectionString,
    schema,
    application_name: 'momo-worker',

    // The two this slice exists for. Without them pg-boss runs `CREATE SCHEMA` and the
    // construction/migration DDL on start, as the connected role.
    migrate: false,
    createSchema: false,

    // Maintenance rebuilds bloated job indexes with `REINDEX INDEX CONCURRENTLY`, which
    // only the owner of an index may run. pg-boss documents this exact case — "for
    // installations where pg-boss cannot run them itself — a role that doesn't own the
    // indexes" — and offers `getReindexCommands()` for an owner to run instead. Detection
    // and the `index_bloat` warning are unaffected. Supervision itself stays on: expiry,
    // retries and retention are DML, which the app role does hold.
    reindex: false,

    // No schedules exist in this slice (Epic 5's Connector brings the first), and the
    // timekeeper would create its own internal queue and poll for cron work that can
    // never arrive.
    schedule: false,

    // The third DDL-bearing option: with stats persistence on, the supervisor CREATEs and
    // DROPs daily `queue_stats` partitions, which the app role may not do. Off is pg-boss's
    // default; it is stated here so the set of options this role must never enable is
    // readable in one place.
    persistQueueStats: false,
  });
}

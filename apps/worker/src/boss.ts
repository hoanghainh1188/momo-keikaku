// Thin re-export of the shared pg-boss factory (story 5.4 review): one createBoss in
// `@momo/adapters` so web and worker cannot drift. Kept as its own module so
// `worker-round-trip.test.ts` can build the runner without starting signal handlers.
import { createBoss as createBossOn, PGBOSS_SCHEMA } from '@momo/adapters';
import type { PgBoss } from 'pg-boss';

export { PGBOSS_SCHEMA };

/**
 * Builds the runner for the restricted application role (`schedule: true` for snapshot-tick).
 *
 * @param connectionString the `app` role's connection string — `config.APP_DATABASE_URL`.
 * @param schema which schema to run against. Defaults to the installed one; a test passes a
 *   schema holding no installation, because *refusing* there is the only behaviour that
 *   distinguishes `migrate: false` from `migrate: true`.
 */
export function createBoss(connectionString: string, schema: string = PGBOSS_SCHEMA): PgBoss {
  return createBossOn(connectionString, { schema, schedule: true });
}

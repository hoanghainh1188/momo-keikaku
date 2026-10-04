/**
 * Shared pg-boss construction for web (send) and worker (run) composition roots (story 5.4).
 *
 * Migrate/DDL flags stay off — the migrator role owns schema install (`scripts/pgboss-migrate.ts`).
 */
import { PgBoss } from 'pg-boss';

export const PGBOSS_SCHEMA = 'pgboss';

export function createBoss(
  connectionString: string,
  options?: {
    readonly schema?: string;
    /** Worker enables the timekeeper for `snapshot-tick`; web send-only leaves it off. */
    readonly schedule?: boolean;
  },
): PgBoss {
  return new PgBoss({
    connectionString,
    schema: options?.schema ?? PGBOSS_SCHEMA,
    application_name: options?.schedule ? 'momo-worker' : 'momo-web-queue',
    migrate: false,
    createSchema: false,
    reindex: false,
    schedule: options?.schedule ?? false,
    persistQueueStats: false,
  });
}

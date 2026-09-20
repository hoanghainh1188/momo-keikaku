import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

// The one sanctioned exception to the process.env fence outside packages/app/src/config.ts,
// and it is temporary. The correct end state is `getDb(connectionString)` taking the value
// from the parsed config, because `packages/db` implements ports that `packages/app`
// declares: importing `@momo/app` from here would invert the architecture's import
// direction, which dependency-cruiser will enforce as soon as story 1.2 turns AD-1 on.
//
// Threading the connection string through instead means changing every caller — the eight
// `apps/web` files that reach `@momo/db` directly, the seed, the scripts and the tests —
// and those eight files are exactly what story 1.2 rewires onto use cases. Doing it here
// would mean editing code that is already scheduled to be rewritten. Recorded in
// deferred-work.md; the disable is one line wide so it cannot silently spread.
// The hardcoded fallback below is a KNOWN CONTRADICTION with the fail-boot promise in
// packages/app/src/config.ts: a missing DATABASE_URL connects to a local dev database
// instead of failing and naming the key — and on a machine where that database exists it
// connects *successfully, to the wrong place*. drizzle.config.ts carries the identical
// default and must move with it.
//
// Founder decision, 2026-09-20: fold the removal into story 1.2 rather than doing it now.
// 1.2 already replaces this with `getDb(connectionString)` and rewires the eight apps/web
// files that reach @momo/db directly, so it touches exactly this line; removing the
// fallback separately would mean editing code that is about to be rewritten, and it would
// break `pnpm demo`, which relies on the default rather than exporting the variable.
export const DATABASE_URL =
  // eslint-disable-next-line no-restricted-properties -- see above; removed by story 1.2
  process.env.DATABASE_URL ?? 'postgres://momo:momo@localhost:55433/momo_keikaku';

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) pool = new pg.Pool({ connectionString: DATABASE_URL, max: 8 });
  return pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export type Db = ReturnType<typeof getDb>;
export { schema };

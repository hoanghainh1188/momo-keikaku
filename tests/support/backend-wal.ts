/**
 * WAL bytes written by ONE session, not by the cluster.
 *
 * `pg_current_wal_lsn()` before and after a transaction measures every byte any backend wrote in
 * between. vitest runs ~150 files in parallel against one Postgres, so on a 12-core laptop the
 * AR-50 measure in `tests/schedule/fence.test.ts` counted other suites' WAL and failed 5/5
 * (e.g. 266 640 bytes against a 194 560 budget). CI passed it only because a 4-vCPU runner
 * starts fewer workers, so less foreign WAL happened to land in the window.
 *
 * Postgres 18 keeps WAL statistics per backend (`pg_stat_get_backend_wal(pid)`), which counts
 * this session's records — including its COMMIT record and any full-page images it caused — and
 * nothing else. The counters are published when the backend goes idle, and only once per
 * second unless forced, so every read is preceded by `pg_stat_force_next_flush()` in its own
 * statement: the flush happens on the idle transition after that statement, before the read.
 *
 * The work runs on a one-connection pool so every statement — the reads and the transaction —
 * is issued by the same backend. A shared pool would spread them across sessions and the
 * difference would mean nothing.
 */
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Db } from '../../packages/db/src/client';
import * as schema from '../../packages/db/src/schema';

// Issued on the raw pool, not the drizzle handle: these touch no tenant table, and the pool's
// single connection is the same backend the drizzle handle uses.
async function backendWalBytes(pool: pg.Pool): Promise<number> {
  await pool.query('SELECT pg_stat_force_next_flush()');
  const res = await pool.query<{ bytes: string }>(
    'SELECT wal_bytes::text AS bytes FROM pg_stat_get_backend_wal(pg_backend_pid())',
  );
  const bytes = Number(res.rows[0]?.bytes);
  if (!Number.isFinite(bytes)) {
    throw new Error('pg_stat_get_backend_wal returned no wal_bytes for this backend');
  }
  return bytes;
}

/**
 * Runs `fn` on a dedicated single-session handle and returns its result together with the WAL
 * bytes that session wrote while `fn` ran. `fn` must commit whatever it measures before it
 * returns; uncommitted work has no COMMIT record yet.
 */
export async function measureBackendWal<T>(
  connectionString: string,
  fn: (db: Db) => Promise<T>,
): Promise<{ result: T; walBytes: number }> {
  const pool = new pg.Pool({ connectionString, max: 1, idleTimeoutMillis: 0 });
  try {
    const db: Db = drizzle(pool, { schema });
    const before = await backendWalBytes(pool);
    const result = await fn(db);
    const after = await backendWalBytes(pool);
    return { result, walBytes: after - before };
  } finally {
    await pool.end();
  }
}

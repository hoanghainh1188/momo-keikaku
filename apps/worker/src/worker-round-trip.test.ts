import { spawn } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import type { Job } from 'pg-boss';
import { createBoss, PGBOSS_SCHEMA } from './boss';

/**
 * The worker round trip, on the restricted role.
 *
 * Five things are asserted here and nowhere else:
 *
 *   1. The real entry point — `index.ts`, spawned as a process — connects as the `app` role.
 *      Nothing else observes that: with only the unit-level assertions below, swapping
 *      `config.APP_DATABASE_URL` for `config.DATABASE_URL` typechecks and passes, and the
 *      worker ships connecting as the owner.
 *   2. `migrate: false` *refuses* rather than installs. Against an already-current schema
 *      both flag values perform no DDL, so the flag is only observable against a schema that
 *      holds no installation.
 *   3. pg-boss enqueues and consumes a job while connected as the `app` role.
 *   4. The role is genuinely restricted: `CREATE TABLE` in the `pgboss` schema is refused.
 *   5. Neither new role carries SUPERUSER, BYPASSRLS, CREATEDB or CREATEROLE. The DDL probe
 *      cannot see BYPASSRLS, and an app role holding it would pass every other gate here
 *      while silently defeating story 1.2's isolation argument.
 *
 * Requires a database prepared by `pnpm pgboss:migrate` (CI's prepare step runs it) and both
 * connection strings in the environment — APP_DATABASE_URL for everything below, and
 * DATABASE_URL because the spawned entry point parses the whole config. Set REQUIRE_DB=1 (CI
 * does) to turn a missing key or an unreachable database into a failure instead of a skip, so
 * this can never pass by not running — the same contract as
 * `packages/db/src/db-round-trip.test.ts`.
 */

const REQUIRE_DB = process.env.REQUIRE_DB === '1';
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;
const OWNER_DATABASE_URL = process.env.DATABASE_URL;

/** One queue, named for what it is. Created here because creating a queue is DML. */
const PROBE_QUEUE = 'momo_worker_probe';

/** A schema that holds no pg-boss installation, so `migrate: false` has to refuse. */
const UNINSTALLED_SCHEMA = 'pgboss_not_installed';

/** The owner role `scripts/pgboss-migrate.ts` declares. */
const MIGRATOR_ROLE = 'momo_migrator';

/** `application_name` on the worker's pool, which is how its backend is found. */
const WORKER_APPLICATION_NAME = 'momo-worker';

/**
 * Must match `DEMO_LATEST_OBSERVED_OFFSET_MS` in `@momo/adapters` — this test file cannot
 * import adapters (depcruise: apps-adapters-only-from-composition-root).
 */
const DEMO_LATEST_OBSERVED_OFFSET_MS = -2 * 3_600_000;

const POLL_INTERVAL_MS = 100;
/** Ceiling on every wait below. */
const JOB_TIMEOUT_MS = 20_000;
/**
 * vitest's default per-test timeout is 5s, which would fire long before JOB_TIMEOUT_MS and
 * make every diagnostic below dead code. The two are derived from one number so they cannot
 * drift apart again; the margin is what lets the specific message win the race.
 */
const TEST_TIMEOUT_MS = JOB_TIMEOUT_MS + 5_000;

function appClient(applicationName: string): pg.Client {
  return new pg.Client({ connectionString: APP_DATABASE_URL, application_name: applicationName });
}

async function pgbossReachableAsAppRole(connectionString: string): Promise<boolean> {
  const client = new pg.Client({ connectionString, application_name: 'momo-worker-test' });
  try {
    await client.connect();
  } catch {
    return false;
  }
  try {
    // Reachable is not enough: the schema has to be installed, or every assertion below
    // fails for a reason that has nothing to do with what is being tested.
    const { rows } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = $1 AND tablename = 'version'
       ) AS exists`,
      [PGBOSS_SCHEMA],
    );
    return rows[0]?.exists === true;
  } catch {
    return false;
  } finally {
    await client.end();
  }
}

if (REQUIRE_DB && !(APP_DATABASE_URL && OWNER_DATABASE_URL)) {
  throw new Error(
    'REQUIRE_DB=1 but DATABASE_URL and APP_DATABASE_URL are not both set. APP_DATABASE_URL names ' +
      'the restricted application role that `pnpm pgboss:migrate` creates, and the spawned entry ' +
      'point parses both keys. This is the only gate on the role split, so it must not be skipped here.',
  );
}

const reachable =
  APP_DATABASE_URL && OWNER_DATABASE_URL ? await pgbossReachableAsAppRole(APP_DATABASE_URL) : false;

if (REQUIRE_DB && !reachable) {
  throw new Error(
    `REQUIRE_DB=1 but the '${PGBOSS_SCHEMA}' schema is not reachable as the application role. ` +
      'Run `pnpm pgboss:migrate` first; this is the only gate on the role split, so it must not ' +
      'be skipped here.',
  );
}

const boss = reachable ? createBoss(APP_DATABASE_URL!) : null;

// pg-boss reports background failures as events, not rejected promises. Without a listener an
// EventEmitter 'error' takes the whole run down with no context, which is exactly why the
// entry point registers one — so the test that stands in for the entry point registers one too.
const backgroundErrors: unknown[] = [];
boss?.on('error', (error) => {
  backgroundErrors.push(error);
  console.error('[worker-test] pg-boss background error', error);
});

afterAll(async () => {
  if (boss) await boss.stop({ graceful: false, close: true });
});

describe.skipIf(!reachable)('the worker runs pg-boss as the restricted application role', () => {
  it('starts without attempting DDL and without error', async () => {
    // `migrate: false` makes pg-boss *check* the installed schema version instead of
    // installing or migrating it. Resolving here is the assertion: a role that had to
    // create the schema would have failed, and a schema at the wrong version throws
    // "pg-boss database requires migrations".
    await expect(boss!.start()).resolves.toBeDefined();
  });

  it('refuses, rather than installs, when the schema holds no pg-boss installation', async () => {
    // The one observable difference between `migrate: false` and `migrate: true`. With
    // `migrate: true` this same call would run `CREATE SCHEMA` and the whole construction
    // plan; here it has to refuse instead.
    const uninstalled = createBoss(APP_DATABASE_URL!, UNINSTALLED_SCHEMA);
    uninstalled.on('error', () => {});
    try {
      await expect(uninstalled.start()).rejects.toThrow(/not installed/i);
    } finally {
      await uninstalled.stop({ graceful: false, close: true }).catch(() => {});
    }

    // …and it did not quietly create it on the way past.
    const client = appClient('momo-worker-test-schema-probe');
    await client.connect();
    try {
      const { rows } = await client.query<{ exists: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = $1) AS exists',
        [UNINSTALLED_SCHEMA],
      );
      expect(rows[0]?.exists).toBe(false);
    } finally {
      await client.end();
    }
  });

  it('refuses DDL in the pgboss schema — the restriction, proved', async () => {
    const client = appClient('momo-worker-test-ddl-probe');
    await client.connect();
    try {
      // 42501 is insufficient_privilege. Asserting the SQLSTATE rather than the message
      // keeps this from passing on some other failure — a typo in the schema name would
      // raise 3F000 (invalid_schema_name) and read just as much like "it was refused".
      await expect(
        client.query(`CREATE TABLE ${PGBOSS_SCHEMA}.momo_ddl_probe (id int)`),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await client.end();
    }
  });

  it('holds neither SUPERUSER, BYPASSRLS, CREATEDB nor CREATEROLE, on either new role', async () => {
    // BYPASSRLS is the one that matters most and the one nothing else here can see: a role
    // that could bypass row-level security would pass every assertion above while making
    // story 1.2's isolation argument false.
    const client = appClient('momo-worker-test-role-probe');
    await client.connect();
    try {
      const { rows } = await client.query<{
        rolname: string;
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolbypassrls: boolean;
      }>(
        `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
           FROM pg_catalog.pg_roles WHERE rolname = ANY($1)`,
        [[MIGRATOR_ROLE, appRoleName()]],
      );
      expect(rows.map((row) => row.rolname).sort()).toEqual([MIGRATOR_ROLE, appRoleName()].sort());
      for (const row of rows) {
        expect(row, `${row.rolname} carries an attribute it must not`).toMatchObject({
          rolsuper: false,
          rolcreatedb: false,
          rolcreaterole: false,
          rolbypassrls: false,
        });
      }
    } finally {
      await client.end();
    }
  });

  it(
    'enqueues a job and consumes it, all on the application role connection',
    async () => {
      await boss!.start();
      // Creating a queue is an INSERT through pg-boss's own SECURITY INVOKER function, so
      // the app role's DML grant is what carries it. An unpartitioned queue performs no DDL;
      // a partitioned one would, and would be refused here.
      await boss!.createQueue(PROBE_QUEUE);

      // Sent BEFORE the handler is registered, so the handler can match on the id it is
      // waiting for. Resolving on the first batch that arrives would let a job left behind
      // by an earlier run satisfy the wait.
      const jobId = await boss!.send(PROBE_QUEUE, { probe: 'slice-b2' });
      expect(jobId).toBeTypeOf('string');

      const received: Job<{ probe: string }>[] = [];
      let resolveReceived!: () => void;
      const handled = new Promise<void>((resolve) => {
        resolveReceived = resolve;
      });

      await boss!.work<{ probe: string }>(
        PROBE_QUEUE,
        { pollingIntervalSeconds: 1 },
        async (jobs) => {
          received.push(...jobs);
          if (jobs.some((job) => job.id === jobId)) resolveReceived();
        },
      );

      await withTimeout(handled, 'the handler never received the job it was sent');

      const delivered = received.find((job) => job.id === jobId);
      expect(delivered?.data).toEqual({ probe: 'slice-b2' });

      // The handler returning is not the same as the job being completed: pg-boss writes the
      // terminal state afterwards, so the state is polled rather than read once.
      expect(await pollForState(jobId!, 'completed')).toBe('completed');

      await boss!.offWork(PROBE_QUEUE);
      // Leave the queue empty so a second run starts from the same place this one did.
      await boss!.deleteAllJobs(PROBE_QUEUE);
      expect(backgroundErrors).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'runs the real entry point as the app role and stops cleanly on SIGTERM',
    async () => {
      // The only assertion that covers `index.ts` itself. `tsx` is spawned directly rather
      // than through pnpm, because a package-manager wrapper takes the signal and orphans
      // the worker behind it.
      const FIXTURE_ANCHOR = '2026-09-16T09:00:00.000Z';
      const worker = spawn('node_modules/.bin/tsx', ['apps/worker/src/index.ts'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DEPLOYMENT: 'local',
          CLOCK_MODE: 'fixture',
          FIXTURE_TIME_ANCHOR: FIXTURE_ANCHOR,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      worker.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
      worker.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
      const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
        worker.on('exit', (code, signal) => resolve({ code, signal })),
      );

      try {
        await withTimeout(
          // Story 1.7 moved the entry point onto pino JSON (`createLogger`); the old
          // `[worker] started` console prefix is gone.
          pollUntil(() => output.includes('"msg":"started with migration disabled"')),
          `the worker never reported started. Output so far: ${output}`,
        );

        // Story 1.8: fixture Clock selected at boot — started JSON carries mode + now.
        const startedLine = output
          .split('\n')
          .find((line) => line.includes('"msg":"started with migration disabled"'));
        expect(startedLine, `started line missing. Output: ${output}`).toBeTruthy();
        const started = JSON.parse(startedLine!) as {
          clockMode: string;
          clockNow: string;
        };
        expect(started.clockMode).toBe('fixture');
        const anchorMs = Date.parse(FIXTURE_ANCHOR);
        expect(started.clockNow).toBe(
          new Date(Math.max(anchorMs + DEMO_LATEST_OBSERVED_OFFSET_MS, anchorMs)).toISOString(),
        );

        // Which role did it actually connect as? `usename` is readable for every backend, so
        // a worker that had been pointed at DATABASE_URL would be caught here by name.
        const client = appClient('momo-worker-test-identity-probe');
        await client.connect();
        try {
          const backends = await withTimeout(
            pollUntil(async () => {
              const { rows } = await client.query<{ usename: string }>(
                `SELECT usename FROM pg_catalog.pg_stat_activity
                   WHERE application_name = $1 AND datname = current_database()`,
                [WORKER_APPLICATION_NAME],
              );
              return rows.length > 0 ? rows : null;
            }),
            `no backend with application_name '${WORKER_APPLICATION_NAME}' appeared`,
          );
          expect(new Set(backends.map((row) => row.usename))).toEqual(new Set([appRoleName()]));
        } finally {
          await client.end();
        }
      } finally {
        worker.kill('SIGTERM');
      }

      const { code, signal } = await withTimeout(exited, 'the worker never exited after SIGTERM');
      expect({
        code,
        signal,
        stopped: output.includes('"msg":"stopped"'),
      }).toEqual({
        code: 0,
        signal: null,
        stopped: true,
      });
    },
    TEST_TIMEOUT_MS,
  );
});

/** The app role's name, as the connection string states it. */
function appRoleName(): string {
  return decodeURIComponent(new URL(APP_DATABASE_URL!).username);
}

/**
 * Polls until `read` returns something other than `null`/`false`, or the ceiling is reached.
 *
 * The ceiling is what keeps a lost race from leaving a loop running: without it the poller
 * outlives the assertion that was waiting on it and eventually rejects, after the pool has
 * closed, with nobody listening.
 */
async function pollUntil<T>(read: () => T | null | Promise<T | null>): Promise<T> {
  for (let attempt = 0; attempt < Math.ceil(JOB_TIMEOUT_MS / POLL_INTERVAL_MS); attempt += 1) {
    const value = await read();
    if (value !== null && value !== false) return value as T;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`gave up after ${JOB_TIMEOUT_MS}ms of polling`);
}

/** Polls the job's recorded state until it matches, without reading the wall clock. */
async function pollForState(jobId: string, want: string): Promise<string> {
  return pollUntil(async () => {
    const [job] = await boss!.findJobs(PROBE_QUEUE, { id: jobId });
    return job?.state === want ? job.state : null;
  });
}

/**
 * Bounds a wait without a clock read — `setTimeout` measures an interval, it does not ask
 * what time it is, so the fence's ban on `Date.now()`/`new Date()` is untouched.
 */
async function withTimeout<T>(work: Promise<T>, whatFailed: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${whatFailed} within ${JOB_TIMEOUT_MS}ms`)),
      JOB_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([work, expiry]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

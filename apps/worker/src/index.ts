// `apps/worker` is an inbound adapter: it may call use cases and the i18n catalogs and
// nothing else. Its job is to run the scheduler's queued work.
//
// This file is the worker's composition root, and that is all it is: read the parsed
// configuration, build the runner, start it, and shut it down cleanly on a signal. It
// registers no handlers — there is nothing to run yet. Job handlers, schedules and ingest
// arrive with the Connector in Epic 5; this slice proves the runner works, not what it
// runs.
//
// Story 1.8: first real `@momo/adapters` import — the product Clock (AD-15), selected the
// same way as the web composition root. Identity stays off this Clock.
//
// Importing this module starts a worker, which is why `createBoss` lives in `./boss.ts`:
// the test builds the same runner without any of the below.
import { fixtureClockOn, systemClock, type Clock } from '@momo/adapters';
import { config, createLogger } from '@momo/app';
import { createBoss, PGBOSS_SCHEMA } from './boss';

/** Demo last snapshot is 2h before the anchor — same offset as the web composition root. */
const DEMO_LATEST_OBSERVED_OFFSET_MS = -2 * 3_600_000;

function productClock(): Clock {
  switch (config.CLOCK_MODE) {
    case 'system':
      return systemClock;
    case 'fixture': {
      const anchorMs = Date.parse(config.FIXTURE_TIME_ANCHOR!);
      return fixtureClockOn({
        latestObservedAt: anchorMs + DEMO_LATEST_OBSERVED_OFFSET_MS,
        anchor: anchorMs,
      });
    }
  }
}

// Selected at boot so a misconfigured CLOCK_MODE / DEPLOYMENT fails before the runner starts.
const workerClock = productClock();

// Sync stdout so lifecycle lines survive process exit (SIGTERM round-trip + operators).
const log = createLogger({ name: 'worker', syncStdout: true });
const boss = createBoss(config.APP_DATABASE_URL);

// pg-boss reports background failures through events rather than a rejected promise, so an
// unhandled 'error' would otherwise take the process down with no context. Story 1.7 lands
// the shared pino logger (AD-16 redaction); a LoggerPort can wait until more call sites exist.
boss.on('error', (error) => {
  log.error({ err: error }, 'pg-boss error');
});
boss.on('warning', (warning) => {
  log.warn({ warning }, 'pg-boss warning');
});

/**
 * Stops the runner on the first signal; a second one forces the process down.
 *
 * `graceful` lets jobs in flight finish before the pool closes; `close` drains the pool, so
 * the process can exit on its own rather than being killed with connections open. A drain
 * can take as long as the longest job, so the second signal has to be an escape hatch
 * rather than a no-op — an operator who sends it twice is saying they will not wait.
 */
let stopping = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (stopping) {
    log.error({ signal }, 'received while already stopping — exiting now');
    process.exit(1);
  }
  stopping = true;
  log.info({ signal }, 'stopping');
  try {
    await boss.stop({ graceful: true, close: true });
    log.info('stopped');
  } catch (error) {
    log.error({ err: error }, 'failed to stop cleanly');
    process.exitCode = 1;
  }
}

process.on('SIGINT', (signal) => void shutdown(signal));
process.on('SIGTERM', (signal) => void shutdown(signal));

await boss.start();
// `stop()` waits for an in-flight `start()`, so a signal that arrived during startup leaves
// this resolving *after* shutdown began. Claiming a start then would be a lie in the log.
if (!stopping) {
  log.info(
    {
      schema: PGBOSS_SCHEMA,
      clockMode: config.CLOCK_MODE,
      clockNow: workerClock.now().toISOString(),
    },
    'started with migration disabled',
  );
}

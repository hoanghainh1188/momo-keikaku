// `apps/worker` is an inbound adapter: it may call use cases and the i18n catalogs and
// nothing else. Its job is to run the scheduler's queued work.
//
// This file is the worker's composition root, and that is all it is: read the parsed
// configuration, build the runner, start it, and shut it down cleanly on a signal. It
// registers no handlers — there is nothing to run yet. Job handlers, schedules and ingest
// arrive with the Connector in Epic 5; this slice proves the runner works, not what it
// runs.
//
// Importing this module starts a worker, which is why `createBoss` lives in `./boss.ts`:
// the test builds the same runner without any of the below.
import { config } from '@momo/app';
import { createBoss, PGBOSS_SCHEMA } from './boss';

const boss = createBoss(config.APP_DATABASE_URL);

// pg-boss reports background failures through events rather than a rejected promise, so an
// unhandled 'error' would otherwise take the process down with no context. There is no
// logger port yet (no story has declared one), so the console is the honest interface for
// an inbound adapter with no other output.
boss.on('error', (error) => {
  console.error('[worker] pg-boss error', error);
});
boss.on('warning', (warning) => {
  console.warn('[worker] pg-boss warning', warning);
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
    console.error(`[worker] ${signal} received while already stopping — exiting now`);
    process.exit(1);
  }
  stopping = true;
  console.log(`[worker] ${signal} received, stopping`);
  try {
    await boss.stop({ graceful: true, close: true });
    console.log('[worker] stopped');
  } catch (error) {
    console.error('[worker] failed to stop cleanly', error);
    process.exitCode = 1;
  }
}

process.on('SIGINT', (signal) => void shutdown(signal));
process.on('SIGTERM', (signal) => void shutdown(signal));

await boss.start();
// `stop()` waits for an in-flight `start()`, so a signal that arrived during startup leaves
// this resolving *after* shutdown began. Claiming a start then would be a lie in the log.
if (!stopping) {
  console.log(`[worker] started against schema '${PGBOSS_SCHEMA}' with migration disabled`);
}

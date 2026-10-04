// `apps/worker` is an inbound adapter: it may call use cases and the i18n catalogs and
// nothing else. Its job is to run the scheduler's queued work.
//
// Story 5.4/5.5: `ingest-snapshot` (stately) + hourly `snapshot-tick` (Asia/Tokyo, missed: skip).
// The durable Actuals Ledger writer runs inside `runIngestSnapshotJob` after admit.
import {
  backlogHttpOn,
  credentialsAesOn,
  fixtureReplayOn,
  mailerConsoleOn,
  productClockOn,
  uuidV7IdsOn,
} from '@momo/adapters';
import {
  INGEST_SNAPSHOT_QUEUE,
  INGEST_SNAPSHOT_QUEUE_OPTIONS,
  SNAPSHOT_TICK_CRON,
  SNAPSHOT_TICK_QUEUE,
  SNAPSHOT_TICK_SCHEDULE_OPTIONS,
  config,
  createLogger,
  dueWatermark,
  runIngestSnapshotJob,
  selectDueConnectors,
  snapshotScheduleCalendar,
  type FixtureCursorPort,
  type IngestSnapshotJobData,
  type IngestSnapshotQueuePort,
  type RequestContext,
  type TrackerConnectorConfig,
  type TrackerCredentials,
  type TrackerPort,
} from '@momo/app';
import {
  fixtureCursorPortOn,
  getDb,
  inTenantTransaction,
  listTenantIds,
  withTenant,
  type Db,
} from '@momo/db';
import { createBoss, PGBOSS_SCHEMA } from './boss';

const workerClock = productClockOn({
  mode: config.CLOCK_MODE,
  fixtureTimeAnchor: config.FIXTURE_TIME_ANCHOR,
});

const log = createLogger({ name: 'worker', syncStdout: true });
const boss = createBoss(config.APP_DATABASE_URL);
const db: Db = getDb(config.APP_DATABASE_URL);
const crypto = (() => {
  if (config.CREDENTIALS_CRYPTO !== 'local') {
    throw new Error(
      'CREDENTIALS_CRYPTO=kms is not implemented yet — credentials-kms lands in Epic 8. ' +
        'Set CREDENTIALS_CRYPTO=local for local/dev workers.',
    );
  }
  const key = config.CREDENTIALS_KEY;
  const keyId = config.CREDENTIALS_KEY_ID;
  if (key === undefined || keyId === undefined) {
    throw new Error(
      'Invalid configuration: CREDENTIALS_KEY and CREDENTIALS_KEY_ID are required when ' +
        'CREDENTIALS_CRYPTO=local',
    );
  }
  return credentialsAesOn({ keyBase64: key, keyId });
})();
const mailer = mailerConsoleOn((line) => log.info(line));

/** Service context so PROJECT_REACH gates reuse without a human session (story 5.4). */
function serviceContext(tenantId: string): RequestContext {
  return {
    tenantId,
    userId: 'service:snapshot-worker',
    roles: ['tenant_admin'],
    projectIds: [],
    locale: 'en',
  };
}

function dbFixtureCursor(tenantId: string): FixtureCursorPort {
  return {
    get: (connectorId) =>
      withTenant(db, tenantId, (tx) => fixtureCursorPortOn({ tx, tenantId }).get(connectorId)),
    set: (connectorId, nextPageIndex) =>
      withTenant(db, tenantId, (tx) =>
        fixtureCursorPortOn({ tx, tenantId }).set(connectorId, nextPageIndex),
      ),
  };
}

/**
 * AD-6 TrackerPort selection (story 5.1) — same rules as the web composition root.
 * Ingest handlers pass a db-backed `FixtureCursorPort` when the fixture override is on.
 */
export function trackerPortOn(deps: {
  readonly cursor: FixtureCursorPort;
  readonly timeAnchorIso: string;
}): TrackerPort {
  const fixture = fixtureReplayOn({ cursor: deps.cursor });
  const backlog = backlogHttpOn({ clock: workerClock });
  return {
    async readScope(connectorConfig: TrackerConnectorConfig, credentials: TrackerCredentials) {
      const kind = config.TRACKER_ADAPTER_OVERRIDE ?? connectorConfig.adapter;
      if (kind === 'fixture') {
        return fixture.readScope(
          {
            connectorId: connectorConfig.connectorId,
            site: connectorConfig.site,
            scenario: connectorConfig.scenario ?? connectorConfig.site,
            timeAnchorIso: deps.timeAnchorIso,
          },
          credentials,
        );
      }
      return backlog.readScope(
        {
          connectorId: connectorConfig.connectorId,
          site: connectorConfig.site,
          scope: connectorConfig.scope,
        },
        { apiKey: credentials.apiKey ?? '' },
      );
    },
  } satisfies TrackerPort;
}

void config.TRACKER_ADAPTER_OVERRIDE;

const ingestQueue: IngestSnapshotQueuePort = {
  async enqueue(input) {
    await boss.send(
      INGEST_SNAPSHOT_QUEUE,
      {
        tenantId: input.tenantId,
        projectId: input.projectId,
        connectorId: input.connectorId,
      } satisfies IngestSnapshotJobData,
      {
        singletonKey: input.connectorId,
        retryLimit: INGEST_SNAPSHOT_QUEUE_OPTIONS.retryLimit,
        retryDelay: INGEST_SNAPSHOT_QUEUE_OPTIONS.retryDelay,
        retryBackoff: INGEST_SNAPSHOT_QUEUE_OPTIONS.retryBackoff,
        retryDelayMax: INGEST_SNAPSHOT_QUEUE_OPTIONS.retryDelayMax,
        ...(input.startAfter ? { startAfter: input.startAfter } : {}),
      },
    );
  },
};

boss.on('error', (error) => {
  log.error({ err: error }, 'pg-boss error');
});
boss.on('warning', (warning) => {
  log.warn({ warning }, 'pg-boss warning');
});

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

await boss.createQueue(INGEST_SNAPSHOT_QUEUE, { ...INGEST_SNAPSHOT_QUEUE_OPTIONS });
await boss.createQueue(SNAPSHOT_TICK_QUEUE);

await boss.schedule(SNAPSHOT_TICK_QUEUE, SNAPSHOT_TICK_CRON, null, {
  ...SNAPSHOT_TICK_SCHEDULE_OPTIONS,
});

await boss.work(SNAPSHOT_TICK_QUEUE, async () => {
  const now = workerClock.now();
  const cal = snapshotScheduleCalendar();
  const tenantIds = await listTenantIds(db);
  let enqueued = 0;
  for (const tenantId of tenantIds) {
    try {
      const dueRows = await inTenantTransaction(db, tenantId, async (scope) => {
        const connectors = await scope.connectorWrite.listConnectors();
        const rows = [];
        for (const connector of connectors) {
          const snap = await scope.connectorWrite.latestSnapshot(connector.id);
          const attemptAt = await scope.connectorWrite.latestAttemptAt(connector.id);
          rows.push({
            connector,
            lastActivityAt: dueWatermark(snap?.observedAt ?? null, attemptAt),
            latestTicketCount: snap?.ticketCount ?? 0,
          });
        }
        return rows;
      });
      const due = selectDueConnectors(dueRows, { now, calendar: cal });
      for (const item of due) {
        await ingestQueue.enqueue({
          tenantId,
          projectId: item.connector.projectId,
          connectorId: item.connector.id,
          startAfter: item.startAfter ?? undefined,
        });
        enqueued += 1;
        if (item.searchBudgetSlowdown) {
          log.info(
            { connectorId: item.connector.id, tenantId },
            'snapshot schedule slowed for Search budget',
          );
        }
      }
    } catch (error) {
      log.error({ err: error, tenantId }, 'snapshot-tick tenant failed — continuing');
    }
  }
  log.info({ enqueued, at: now.toISOString() }, 'snapshot-tick complete');
});

await boss.work<IngestSnapshotJobData>(INGEST_SNAPSHOT_QUEUE, async (jobs) => {
  for (const job of jobs) {
    const data = job.data;
    const ctx = serviceContext(data.tenantId);
    const cursor = dbFixtureCursor(data.tenantId);
    const tracker = trackerPortOn({
      cursor,
      timeAnchorIso: workerClock.now().toISOString(),
    });
    const result = await runIngestSnapshotJob(
      {
        handle: db,
        clock: workerClock,
        ids: uuidV7IdsOn(workerClock),
        crypto,
        mailer,
        transaction: inTenantTransaction,
        queue: ingestQueue,
        tracker,
        loadCredentials: async (connectorId) => {
          const stored = await inTenantTransaction(db, data.tenantId, (scope) =>
            scope.connectorWrite.loadEncryptedCredentials(connectorId),
          );
          if (!stored) return null;
          try {
            return crypto.decrypt(stored);
          } catch {
            return null;
          }
        },
      },
      ctx,
      { projectId: data.projectId, connectorId: data.connectorId },
    );
    if (!result.ok) {
      if (result.error.code === 'not_found') {
        log.warn(
          {
            connectorId: data.connectorId,
            tenantId: data.tenantId,
            messageKey: result.error.messageKey,
          },
          'ingest-snapshot not_found — completing without retry',
        );
        continue;
      }
      throw new Error(`ingest-snapshot refused: ${result.error.messageKey}`);
    }
    log.info(
      {
        connectorId: data.connectorId,
        tenantId: data.tenantId,
        outcome: result.value,
      },
      'ingest-snapshot job finished',
    );
  }
});

if (!stopping) {
  log.info(
    {
      schema: PGBOSS_SCHEMA,
      clockMode: config.CLOCK_MODE,
      clockNow: workerClock.now().toISOString(),
      queues: [INGEST_SNAPSHOT_QUEUE, SNAPSHOT_TICK_QUEUE],
    },
    'started with schedule enabled',
  );
}

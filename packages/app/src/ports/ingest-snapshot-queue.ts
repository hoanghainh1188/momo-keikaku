/**
 * Outbound port for the `ingest-snapshot` pg-boss queue (story 5.4 / AD-7 / AR-16).
 *
 * Composition roots wire a `stately` queue; every send uses `singletonKey = connectorId`
 * so an on-demand Refresh coalesces behind an active job.
 */
export const INGEST_SNAPSHOT_QUEUE = 'ingest-snapshot' as const;
export const SNAPSHOT_TICK_QUEUE = 'snapshot-tick' as const;

/** `createQueue('ingest-snapshot', …)` options — `stately` is required (not `standard`). */
export const INGEST_SNAPSHOT_QUEUE_OPTIONS = {
  policy: 'stately',
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  /** Cap backoff so retries finish inside one snapshot interval (< 45 min). */
  retryDelayMax: 15 * 60,
} as const;

/** Hourly tick: Asia/Tokyo, `missed: 'skip'` so an outage does not replay a backlog. */
export const SNAPSHOT_TICK_CRON = '0 * * * *' as const;
export const SNAPSHOT_TICK_SCHEDULE_OPTIONS = {
  tz: 'Asia/Tokyo',
  missed: 'skip',
} as const;

export interface IngestSnapshotJobData {
  readonly tenantId: string;
  readonly projectId: string;
  readonly connectorId: string;
}

export interface EnqueueIngestSnapshotInput extends IngestSnapshotJobData {
  /** When set, the job is not fetchable until this instant (rate-limit pacing). */
  readonly startAfter?: Date;
}

export interface IngestSnapshotQueuePort {
  readonly enqueue: (input: EnqueueIngestSnapshotInput) => Promise<void>;
}

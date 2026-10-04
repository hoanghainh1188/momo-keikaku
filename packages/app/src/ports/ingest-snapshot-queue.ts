/**
 * Outbound port for the `ingest-snapshot` pg-boss queue (story 5.4 / AD-7 / AR-16).
 *
 * Composition roots wire a `stately` queue; every send uses `singletonKey = connectorId`
 * so an on-demand Refresh coalesces behind an active job.
 */
export const INGEST_SNAPSHOT_QUEUE = 'ingest-snapshot' as const;
export const SNAPSHOT_TICK_QUEUE = 'snapshot-tick' as const;

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

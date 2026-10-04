/**
 * Actuals Ledger ingest writer port (story 5.5 / AR-15).
 *
 * Only `writeIngestSnapshot` inserts snapshot / observation / ledger rows.
 */
import type { ScopeRead } from './tracker';

export type WriteIngestSnapshotResult =
  | { readonly kind: 'written'; readonly snapshotId: string }
  | { readonly kind: 'already_written'; readonly snapshotId: string };

export interface WriteIngestSnapshotInput {
  readonly projectId: string;
  readonly connectorId: string;
  readonly read: ScopeRead;
  readonly snapshotId: string;
  readonly nextId: () => string;
  readonly actor: string;
  readonly at: Date;
}

export interface IngestWriteRepository {
  readonly writeIngestSnapshot: (
    input: WriteIngestSnapshotInput,
  ) => Promise<WriteIngestSnapshotResult>;
}

export interface IngestWriteScope {
  readonly ingestWrite: IngestWriteRepository;
}

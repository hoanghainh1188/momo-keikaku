/**
 * Connector write/read port (story 5.2 / FR-17).
 *
 * Credentials are write-only through the use-case surface: list/get never return secrets.
 * Decrypt-for-adapter stays on the trusted ingest composition path.
 */
import type { AuditSink } from '../audit';
import type { CredentialsPlaintext, EncryptedCredentials } from './credentials-crypto';
import type { AuditedWriteDeps, WriteStamp } from './audited-write';
import type { IdGenerator } from './ids';
import type { Clock } from './clock';
import type { MailerPort } from './mailer';

export type { WriteStamp } from './audited-write';

/** Public Connector row — no ciphertext, nonce, or plaintext secrets. */
export interface ConnectorPublicRow {
  readonly id: string;
  readonly projectId: string;
  readonly adapter: string;
  readonly site: string;
  readonly scope: string;
  readonly spaceLabel: string;
  readonly approvalRecordedAt: Date | null;
  readonly approvalName: string | null;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
  readonly lastErrorAt: Date | null;
  /** True when ciphertext is present; never the secret itself. */
  readonly hasCredentials: boolean;
}

export interface InsertConnectorInput {
  readonly id: string;
  readonly projectId: string;
  readonly adapter: 'backlog';
  readonly site: string;
  readonly scope: string;
  readonly spaceLabel: string;
  readonly approvalRecordedAt: Date;
  readonly approvalName: string;
  readonly credentials: EncryptedCredentials;
}

export interface AppendScopeEventInput {
  readonly connectorId: string;
  readonly projectId: string;
  readonly scope: string;
  readonly actor: string;
  readonly at: Date;
}

export interface AppendSnapshotAttemptInput {
  readonly connectorId: string;
  readonly reasonCode: string;
  readonly message: string;
  readonly attemptedAt: Date;
}

export interface ConnectorWriteRepository {
  readonly projectAnchor: (projectId: string) => Promise<Date>;
  readonly findConnector: (connectorId: string) => Promise<ConnectorPublicRow | null>;
  readonly findConnectorForProject: (projectId: string) => Promise<ConnectorPublicRow | null>;
  readonly insertConnector: (input: InsertConnectorInput) => Promise<void>;
  readonly rotateCredentials: (
    connectorId: string,
    credentials: EncryptedCredentials,
  ) => Promise<void>;
  readonly updateScope: (connectorId: string, scope: string) => Promise<void>;
  readonly appendScopeEvent: (input: AppendScopeEventInput) => Promise<number>;
  readonly latestScopeSeq: (connectorId: string) => Promise<number | null>;
  readonly appendSnapshotAttempt: (input: AppendSnapshotAttemptInput) => Promise<void>;
  readonly setLastError: (
    connectorId: string,
    error: { code: string; message: string; at: Date } | null,
  ) => Promise<void>;
  /** Count mapping_event rows for a connector's project — rotation must not change this. */
  readonly countMappingEventsForProject: (projectId: string) => Promise<number>;
  /**
   * Decrypt boundary helper for trusted ingest only. Returns null when no ciphertext.
   * Never called from list/get use cases.
   */
  readonly loadEncryptedCredentials: (
    connectorId: string,
  ) => Promise<EncryptedCredentials | null>;
}

export interface ConnectorWriteScope {
  readonly connectorWrite: ConnectorWriteRepository;
  readonly audit: AuditSink;
}

export type ConnectorWriteDeps<Handle> = AuditedWriteDeps<Handle, ConnectorWriteScope> & {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly crypto: {
    encrypt(plaintext: CredentialsPlaintext): EncryptedCredentials;
    readonly keyId: string;
  };
  readonly mailer?: MailerPort;
  /** Resolve PM notify addresses for a Project (best-effort mail). */
  readonly notifyRecipients?: (projectId: string) => Promise<readonly string[]>;
};

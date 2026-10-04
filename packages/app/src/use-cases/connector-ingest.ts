/**
 * Ingest approval refuse + credential-failure notify (story 5.2 / FR-17), the incomplete-read
 * gate (story 5.3 / AR-13), and the durable Actuals Ledger writer job (story 5.5 / AR-15).
 *
 * Full-scope read happens outside the transaction; after `admitScopeRead`, one locked writer
 * transaction persists snapshot / observation / ledger. Failures keep existing attempt reasons;
 * success writes no attempt row (pin uses the snapshot).
 */
import {
  AdapterKindMismatchError,
  ApprovalRequiredError,
  LedgerInvariantError,
  requireConnectorApproval,
} from '@momo/domain';
import { PROJECT_REACH, PROJECT_REACH_ROLES, authorize, type RoleDeclaration } from '../authz/authorize';
import type { RequestContext } from '../authz/request-context';
import type { ConnectorWriteDeps } from '../ports/connector-write';
import type { MailerPort } from '../ports/mailer';
import type {
  ScopeRead,
  TrackerConnectorConfig,
  TrackerCredentials,
  TrackerPort,
} from '../ports/tracker';
import type { IngestSnapshotQueuePort } from '../ports/ingest-snapshot-queue';
import { fail, ok, type Result } from '../result';
import { refuse } from './audited-write';
import {
  RATE_LIMIT_PACED_MESSAGE,
  RATE_LIMIT_PACED_REASON,
  rateLimitStartAfter,
} from './connector-schedule';

export const APPROVAL_REQUIRED_REASON = 'approval_required' as const;
export const CREDENTIAL_AUTH_FAILED_REASON = 'credential_auth_failed' as const;
export const READ_INCOMPLETE_REASON = 'read_incomplete' as const;
export const OPERATOR_ALERT_REASON = 'operator_alert' as const;

/** PM-visible copy for a read that stayed incomplete after its one retry (story 5.3 / AR-13). */
export const READ_INCOMPLETE_MESSAGE =
  'The Backlog read was incomplete: Tickets changed while it was paging, and one retry did not ' +
  'settle it. Nothing was written; figures stay at the last good snapshot.';

/** PM-visible copy for a missing client approval (FR-17). */
export const APPROVAL_REQUIRED_MESSAGE =
  'Client approval is required before the first snapshot. Record who approved the connection and when.';

/**
 * Banner / mail copy for a revoked or invalid API key — figures frozen at last good snapshot.
 * `lastGoodLabel` is a pre-formatted instant (or "never" when none).
 */
export function credentialFailureMessage(lastGoodLabel: string): string {
  return `Backlog rejected the API key (revoked?). Figures are frozen at the last good snapshot, ${lastGoodLabel}.`;
}

export interface GateIngestApprovalInput {
  readonly projectId: string;
  readonly connectorId: string;
}

export interface NotifyCredentialFailureInput {
  readonly projectId: string;
  readonly connectorId: string;
  /** Pre-formatted last-good snapshot time for the banner/mail, or "never". */
  readonly lastGoodLabel: string;
  /** Optional PM email override for tests; otherwise `deps.notifyRecipients`. */
  readonly to?: readonly string[];
  /** Optional i18n mail subject; defaults to the English product copy. */
  readonly mailSubject?: string;
  /** Optional i18n mail body; defaults to `credentialFailureMessage(lastGoodLabel)`. */
  readonly mailBody?: string;
}

function isRefusal(error: unknown, code: string): boolean {
  return error instanceof Error && error.message === `refused: ${code}`;
}

/**
 * True for tracker auth failures (BacklogHttpError `kind: 'auth'` or HTTP 401/403).
 * Structural — packages/app must not import `@momo/adapters`. Other errors rethrow so
 * pg-boss `retryLimit` can run (story 5.4 review).
 */
function isCredentialAuthFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { readonly kind?: unknown; readonly status?: unknown };
  if (e.kind === 'auth') return true;
  return e.status === 401 || e.status === 403;
}

function isOperatorAlert(error: unknown): error is Error & { kind: 'operator-alert'; code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { kind?: unknown }).kind === 'operator-alert' &&
    error instanceof Error
  );
}

/** Best-effort operator mail for AR-36 ledger / adapter-kind alerts. Always records an attempt. */
async function notifyOperatorAlert<Handle>(
  deps: ConnectorWriteDeps<Handle> & { readonly mailer: MailerPort },
  ctx: RequestContext,
  input: {
    readonly projectId: string;
    readonly connectorId: string;
    readonly subject: string;
    readonly text: string;
    readonly code: string;
  },
): Promise<void> {
  try {
    await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
      const connector = await scope.connectorWrite.findConnector(input.connectorId);
      if (!connector || connector.projectId !== input.projectId) return;
      await scope.connectorWrite.appendSnapshotAttempt({
        connectorId: input.connectorId,
        reasonCode: OPERATOR_ALERT_REASON,
        message: input.text,
        attemptedAt: deps.clock.now(),
      });
    });
  } catch {
    // attempt is best-effort when the connector vanished mid-job
  }
  try {
    const recipients = deps.notifyRecipients ? await deps.notifyRecipients(input.projectId) : [];
    for (const to of recipients) {
      await deps.mailer.send({ to: to, subject: input.subject, text: input.text });
    }
  } catch {
    // mail is best-effort
  }
}

/**
 * App ingest gate: when approval is missing, append a failed attempt with a PM-visible
 * reason and answer `refused`. When present, answer `approved`.
 */
export async function gateIngestApproval<Handle>(
  deps: ConnectorWriteDeps<Handle>,
  ctx: RequestContext,
  input: GateIngestApprovalInput,
): Promise<Result<'approved' | 'refused'>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
  if (!roles.ok) return roles;

  try {
    const outcome = await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
      const connector = await scope.connectorWrite.findConnector(input.connectorId);
      if (!connector || connector.projectId !== input.projectId) refuse('not_found');

      if (connector.approvalRecordedAt == null) {
        // Domain gate — throw so the transaction rolls back; attempt is recorded below.
        requireConnectorApproval(connector.approvalRecordedAt);
      }
      return 'approved' as const;
    });
    return ok(outcome);
  } catch (error) {
    if (error instanceof ApprovalRequiredError) {
      // Persist the failed attempt after the refuse rolled back.
      try {
        await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
          const connector = await scope.connectorWrite.findConnector(input.connectorId);
          if (!connector || connector.projectId !== input.projectId) refuse('not_found');
          await scope.connectorWrite.appendSnapshotAttempt({
            connectorId: input.connectorId,
            reasonCode: APPROVAL_REQUIRED_REASON,
            message: APPROVAL_REQUIRED_MESSAGE,
            attemptedAt: deps.clock.now(),
          });
        });
      } catch (inner) {
        if (isRefusal(inner, 'not_found')) return fail('not_found');
        throw inner;
      }
      return ok('refused');
    }
    if (isRefusal(error, 'not_found')) return fail('not_found');
    throw error;
  }
}

/** Record credential auth failure: attempt row + last_error banner fields + best-effort mail. */
export async function notifyCredentialFailure<Handle>(
  deps: ConnectorWriteDeps<Handle> & { readonly mailer: MailerPort },
  ctx: RequestContext,
  input: NotifyCredentialFailureInput,
): Promise<Result<void>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
  if (!roles.ok) return roles;

  const message = input.mailBody ?? credentialFailureMessage(input.lastGoodLabel);
  const at = deps.clock.now();

  try {
    await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
      const connector = await scope.connectorWrite.findConnector(input.connectorId);
      if (!connector || connector.projectId !== input.projectId) refuse('not_found');

      await scope.connectorWrite.appendSnapshotAttempt({
        connectorId: input.connectorId,
        reasonCode: CREDENTIAL_AUTH_FAILED_REASON,
        message,
        attemptedAt: at,
      });
      await scope.connectorWrite.setLastError(input.connectorId, {
        code: CREDENTIAL_AUTH_FAILED_REASON,
        message,
        at,
      });
    });
  } catch (error) {
    if (isRefusal(error, 'not_found')) return fail('not_found');
    throw error;
  }

  // Mail is best-effort — error is already recorded.
  try {
    const recipients =
      input.to ??
      (deps.notifyRecipients ? await deps.notifyRecipients(input.projectId) : []);
    const subject =
      input.mailSubject ?? 'momo-keikaku: Backlog Connector credential error';
    for (const to of recipients) {
      await deps.mailer.send({
        to,
        subject,
        text: message,
      });
    }
  } catch {
    // best-effort
  }

  return ok(undefined);
}

export interface RecordIncompleteReadInput {
  readonly projectId: string;
  readonly connectorId: string;
}

export interface AdmitScopeReadInput extends RecordIncompleteReadInput {
  readonly read: Pick<ScopeRead, 'complete'>;
}

/**
 * Record an incomplete read (story 5.3 / AR-13): one `tracker_snapshot_attempt` row with reason
 * `read_incomplete`, and nothing else — no snapshot, observation or ledger row. The adapter has
 * already retried once; this is the "then writes nothing" half.
 */
export async function recordIncompleteRead<Handle>(
  deps: ConnectorWriteDeps<Handle>,
  ctx: RequestContext,
  input: RecordIncompleteReadInput,
): Promise<Result<void>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
  if (!roles.ok) return roles;

  try {
    await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
      const connector = await scope.connectorWrite.findConnector(input.connectorId);
      if (!connector || connector.projectId !== input.projectId) refuse('not_found');
      await scope.connectorWrite.appendSnapshotAttempt({
        connectorId: input.connectorId,
        reasonCode: READ_INCOMPLETE_REASON,
        message: READ_INCOMPLETE_MESSAGE,
        attemptedAt: deps.clock.now(),
      });
    });
  } catch (error) {
    if (isRefusal(error, 'not_found')) return fail('not_found');
    throw error;
  }
  return ok(undefined);
}

/**
 * The gate between `TrackerPort.readScope` and any writer (story 5.3). A complete read is
 * `admitted` without touching the database; an incomplete one is recorded through
 * `recordIncompleteRead` and answered `incomplete`, and the caller must write nothing else.
 */
export async function admitScopeRead<Handle>(
  deps: ConnectorWriteDeps<Handle>,
  ctx: RequestContext,
  input: AdmitScopeReadInput,
): Promise<Result<'admitted' | 'incomplete'>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
  if (!roles.ok) return roles;
  if (input.read.complete) return ok('admitted');

  const recorded = await recordIncompleteRead(deps, ctx, input);
  if (!recorded.ok) return recorded;
  return ok('incomplete');
}

export interface RunIngestSnapshotJobInput {
  readonly projectId: string;
  readonly connectorId: string;
}

export type IngestSnapshotJobDeps<Handle> = ConnectorWriteDeps<Handle> & {
  readonly tracker: TrackerPort;
  readonly queue: IngestSnapshotQueuePort;
  readonly mailer: MailerPort;
  /**
   * Build TrackerPort credentials from stored ciphertext. Composition decrypts;
   * the use case never sees the crypto port's key material beyond this callback.
   */
  readonly loadCredentials: (
    connectorId: string,
  ) => Promise<TrackerCredentials | null>;
};

export type IngestSnapshotJobOutcome =
  | 'approval_refused'
  | 'credential_failed'
  | 'read_incomplete'
  | 'rate_limit_paced'
  | 'snapshot_written'
  | 'already_written'
  | 'operator_alert';

/**
 * Ingest job body (story 5.5): gate approval → load creds → `readScope` → `admitScopeRead`
 * → durable `writeIngestSnapshot`. Success leaves no attempt row; unique `(connector, observedAt)`
 * replays as `already_written`. Operator-alert errors mail and return `operator_alert`.
 */
export async function runIngestSnapshotJob<Handle>(
  deps: IngestSnapshotJobDeps<Handle>,
  ctx: RequestContext,
  input: RunIngestSnapshotJobInput,
): Promise<Result<IngestSnapshotJobOutcome>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
  if (!roles.ok) return roles;

  const gated = await gateIngestApproval(deps, ctx, input);
  if (!gated.ok) return gated;
  if (gated.value === 'refused') return ok('approval_refused');

  let connectorConfig: TrackerConnectorConfig;
  let lastGoodLabel = 'never';
  try {
    const loaded = await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
      const connector = await scope.connectorWrite.findConnector(input.connectorId);
      if (!connector || connector.projectId !== input.projectId) refuse('not_found');
      const latest = await scope.connectorWrite.latestSnapshot(input.connectorId);
      return {
        config: {
          connectorId: connector.id,
          tenantId: ctx.tenantId,
          site: connector.site,
          scope: connector.scope,
          adapter: (connector.adapter === 'fixture' ? 'fixture' : 'backlog') as 'fixture' | 'backlog',
        } satisfies TrackerConnectorConfig,
        lastGoodLabel: latest ? latest.observedAt.toISOString() : 'never',
      };
    });
    connectorConfig = loaded.config;
    lastGoodLabel = loaded.lastGoodLabel;
  } catch (error) {
    if (isRefusal(error, 'not_found')) return fail('not_found');
    throw error;
  }

  const credentials = await deps.loadCredentials(input.connectorId);
  if (!credentials || (connectorConfig.adapter === 'backlog' && !credentials.apiKey)) {
    const notified = await notifyCredentialFailure(
      { ...deps, mailer: deps.mailer },
      ctx,
      {
        projectId: input.projectId,
        connectorId: input.connectorId,
        lastGoodLabel,
      },
    );
    if (!notified.ok) return notified;
    return ok('credential_failed');
  }

  let read: ScopeRead;
  try {
    read = await deps.tracker.readScope(connectorConfig, credentials);
  } catch (error) {
    if (!isCredentialAuthFailure(error)) throw error;
    const notified = await notifyCredentialFailure(
      { ...deps, mailer: deps.mailer },
      ctx,
      {
        projectId: input.projectId,
        connectorId: input.connectorId,
        lastGoodLabel,
      },
    );
    if (!notified.ok) return notified;
    return ok('credential_failed');
  }

  const admitted = await admitScopeRead(deps, ctx, {
    projectId: input.projectId,
    connectorId: input.connectorId,
    read,
  });
  if (!admitted.ok) return admitted;
  if (admitted.value === 'incomplete') return ok('read_incomplete');

  let writeKind: 'written' | 'already_written';
  try {
    const written = await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
      const connector = await scope.connectorWrite.findConnector(input.connectorId);
      if (!connector || connector.projectId !== input.projectId) refuse('not_found');
      return scope.ingestWrite.writeIngestSnapshot({
        projectId: input.projectId,
        connectorId: input.connectorId,
        read,
        snapshotId: deps.ids.next(),
        nextId: () => deps.ids.next(),
        actor: `user:${ctx.userId}`,
        at: deps.clock.now(),
      });
    });
    writeKind = written.kind;
  } catch (error) {
    if (isRefusal(error, 'not_found')) return fail('not_found');
    if (
      error instanceof AdapterKindMismatchError ||
      error instanceof LedgerInvariantError ||
      isOperatorAlert(error)
    ) {
      const code =
        error instanceof AdapterKindMismatchError
          ? error.code
          : error instanceof LedgerInvariantError
            ? error.code
            : (error as { code: string }).code;
      await notifyOperatorAlert(
        { ...deps, mailer: deps.mailer },
        ctx,
        {
          projectId: input.projectId,
          connectorId: input.connectorId,
          subject: `momo-keikaku: operator alert (${code})`,
          text: error.message,
          code,
        },
      );
      return ok('operator_alert');
    }
    throw error;
  }

  // Pace the *next* send when the just-finished read reports an exhausted bucket.
  const pacedUntil = rateLimitStartAfter(read.rateLimit, deps.clock.now());
  if (pacedUntil) {
    await deps.queue.enqueue({
      tenantId: ctx.tenantId,
      projectId: input.projectId,
      connectorId: input.connectorId,
      startAfter: pacedUntil,
    });
    try {
      await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
        const connector = await scope.connectorWrite.findConnector(input.connectorId);
        if (!connector || connector.projectId !== input.projectId) refuse('not_found');
        await scope.connectorWrite.appendSnapshotAttempt({
          connectorId: input.connectorId,
          reasonCode: RATE_LIMIT_PACED_REASON,
          message: RATE_LIMIT_PACED_MESSAGE,
          attemptedAt: deps.clock.now(),
        });
      });
    } catch (error) {
      if (isRefusal(error, 'not_found')) return fail('not_found');
      throw error;
    }
    return ok('rate_limit_paced');
  }

  return ok(writeKind === 'already_written' ? 'already_written' : 'snapshot_written');
}

export const CONNECTOR_INGEST_ROLES = {
  gateIngestApproval: PROJECT_REACH,
  notifyCredentialFailure: PROJECT_REACH,
  recordIncompleteRead: PROJECT_REACH,
  admitScopeRead: PROJECT_REACH,
  runIngestSnapshotJob: PROJECT_REACH,
} as const satisfies Readonly<Record<string, RoleDeclaration>>;

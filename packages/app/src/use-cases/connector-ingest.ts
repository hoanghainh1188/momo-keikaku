/**
 * Ingest approval refuse + credential-failure notify (story 5.2 / FR-17).
 *
 * Full snapshot writer is 5.5; this story records refusals/auth failures and fires the
 * banner + mail path. Scheduled interval delivery lands with 5.4.
 */
import { ApprovalRequiredError, requireConnectorApproval } from '@momo/domain';
import { PROJECT_REACH, PROJECT_REACH_ROLES, authorize, type RoleDeclaration } from '../authz/authorize';
import type { RequestContext } from '../authz/request-context';
import type { ConnectorWriteDeps } from '../ports/connector-write';
import type { MailerPort } from '../ports/mailer';
import { fail, ok, type Result } from '../result';
import { refuse } from './audited-write';

export const APPROVAL_REQUIRED_REASON = 'approval_required' as const;
export const CREDENTIAL_AUTH_FAILED_REASON = 'credential_auth_failed' as const;

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
 * App ingest gate: when approval is missing, append a failed attempt with a PM-visible
 * reason and answer `refused`. When present, answer `approved` (writer is 5.5).
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

export const CONNECTOR_INGEST_ROLES = {
  gateIngestApproval: PROJECT_REACH,
  notifyCredentialFailure: PROJECT_REACH,
} as const satisfies Readonly<Record<string, RoleDeclaration>>;

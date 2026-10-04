/**
 * PM ownership Keep / Transfer for Connector overlaps (story 5.6 / FR-42).
 *
 * Off the use-cases barrel (like ingest gates): composition + unit tests import it; the
 * cross-tenant write harness does not drive it.
 */
import { PROJECT_REACH, PROJECT_REACH_ROLES, authorize, type RoleDeclaration } from '../authz/authorize';
import { audit, type AuditDeclaration } from '../audit';
import type { RequestContext } from '../authz/request-context';
import { isProjectNotFound } from '../ports/project-read';
import type { ConnectorWriteDeps, ConnectorWriteScope } from '../ports/connector-write';
import type { Result } from '../result';
import { runAuditedWrite, refuse } from './audited-write';
import {
  confirmOwnershipInputSchema,
  type ConfirmOwnershipInput,
} from './connector-input';

export async function confirmConnectorOwnership<Handle>(
  deps: ConnectorWriteDeps<Handle>,
  ctx: RequestContext,
  input: ConfirmOwnershipInput,
): Promise<Result<void>> {
  return runAuditedWrite(
    confirmOwnershipInputSchema,
    deps,
    ctx,
    input,
    {
      at: (scope, command) => scope.connectorWrite.projectAnchor(command.projectId),
      isNotFound: (error, command) => isProjectNotFound(error, command.projectId),
      authorize: (caller, command) =>
        authorize(caller, { roles: PROJECT_REACH_ROLES, projectId: command.projectId }),
    },
    async (scope: ConnectorWriteScope, stamp, command) => {
      const overlaps = await scope.connectorWrite.listOpenOverlaps(command.projectId);
      const open = overlaps.find((o) => o.trackerIssueId === command.trackerIssueId);
      if (!open) refuse('not_found');

      // Keep affirms the current owner; Transfer always hands ownership to the claimer.
      const toConnectorId =
        command.resolution === 'keep' ? open.ownerConnectorId : open.claimerConnectorId;

      await scope.connectorWrite.confirmOwnership({
        projectId: command.projectId,
        trackerIssueId: command.trackerIssueId,
        resolution: command.resolution,
        toConnectorId,
        actor: stamp.actor,
        at: stamp.at,
      });
      await audit.record(scope, stamp, 'connector.confirm_ownership', command.trackerIssueId, {
        projectId: command.projectId,
        trackerIssueId: command.trackerIssueId,
        resolution: command.resolution,
        toConnectorId,
      });
    },
  );
}

export const CONNECTOR_OWNERSHIP_AUDIT = {
  confirmConnectorOwnership: { audited: ['connector.confirm_ownership'] },
} as const satisfies Readonly<Record<string, AuditDeclaration>>;

export const CONNECTOR_OWNERSHIP_ROLES = {
  confirmConnectorOwnership: PROJECT_REACH,
} as const satisfies Readonly<Record<string, RoleDeclaration>>;

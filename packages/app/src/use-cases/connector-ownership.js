/**
 * PM ownership Keep / Transfer for Connector overlaps (story 5.6 / FR-42).
 *
 * Off the use-cases barrel (like ingest gates): composition + unit tests import it; the
 * cross-tenant write harness does not drive it.
 */
import { PROJECT_REACH, PROJECT_REACH_ROLES, authorize } from '../authz/authorize';
import { audit } from '../audit';
import { isProjectNotFound } from '../ports/project-read';
import { runAuditedWrite, refuse } from './audited-write';
import { confirmOwnershipInputSchema, } from './connector-input';
export async function confirmConnectorOwnership(deps, ctx, input) {
    return runAuditedWrite(confirmOwnershipInputSchema, deps, ctx, input, {
        at: (scope, command) => scope.connectorWrite.projectAnchor(command.projectId),
        isNotFound: (error, command) => isProjectNotFound(error, command.projectId),
        authorize: (caller, command) => authorize(caller, { roles: PROJECT_REACH_ROLES, projectId: command.projectId }),
    }, async (scope, stamp, command) => {
        // Repo re-checks the open claim under the Project lock (Keep/Transfer race).
        try {
            await scope.connectorWrite.confirmOwnership({
                projectId: command.projectId,
                trackerIssueId: command.trackerIssueId,
                claimerConnectorId: command.claimerConnectorId,
                resolution: command.resolution,
                actor: stamp.actor,
                at: stamp.at,
            });
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('overlap')) {
                refuse('not_found');
            }
            throw error;
        }
        await audit.record(scope, stamp, 'connector.confirm_ownership', command.trackerIssueId, {
            projectId: command.projectId,
            trackerIssueId: command.trackerIssueId,
            claimerConnectorId: command.claimerConnectorId,
            resolution: command.resolution,
        });
    });
}
export const CONNECTOR_OWNERSHIP_AUDIT = {
    confirmConnectorOwnership: { audited: ['connector.confirm_ownership'] },
};
export const CONNECTOR_OWNERSHIP_ROLES = {
    confirmConnectorOwnership: PROJECT_REACH,
};

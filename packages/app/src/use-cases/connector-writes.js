/**
 * Connector set-up, credential rotation, and scope change (story 5.2 / FR-17).
 *
 * PROJECT_REACH + audited. Credentials are encrypted before insert; list/get never return
 * secrets. Rotation overwrites ciphertext only — Mapping history is untouched.
 */
import { PROJECT_REACH, PROJECT_REACH_ROLES, authorize } from '../authz/authorize';
import { audit } from '../audit';
import { isProjectNotFound } from '../ports/project-read';
import { fail } from '../result';
import { invalidInputDetails, runAuditedWrite, refuse } from './audited-write';
import { addConnectorInputSchema, appendResolvedStatusesInputSchema, changeScopeInputSchema, rotateCredentialsInputSchema, } from './connector-input';
async function runConnectorWrite(schema, deps, ctx, input, work) {
    const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES });
    if (!roles.ok)
        return roles;
    return runAuditedWrite(schema, deps, ctx, input, {
        at: (scope, command) => scope.connectorWrite.projectAnchor(command.projectId),
        isNotFound: (error, command) => isProjectNotFound(error, command.projectId),
        authorize: (caller, command) => authorize(caller, { roles: PROJECT_REACH_ROLES, projectId: command.projectId }),
    }, work);
}
/** `invalid_input` rule codes `addConnector` answers after asking Backlog (story 5.3 / AR-13). */
export const ADD_CONNECTOR_REFUSALS = {
    searchBudget: 'search_budget',
    credentialRejected: 'credential_rejected',
    projectNotFound: 'project_not_found',
    unreachable: 'backlog_unreachable',
};
function budgetRefusal(assessment) {
    if (assessment.kind === 'assessed')
        return { projectKey: [ADD_CONNECTOR_REFUSALS.searchBudget] };
    switch (assessment.reason) {
        case 'auth_failed':
            return { apiKey: [ADD_CONNECTOR_REFUSALS.credentialRejected] };
        case 'project_not_found':
            return { projectKey: [ADD_CONNECTOR_REFUSALS.projectNotFound] };
        case 'unreachable':
            return { spaceUrl: [ADD_CONNECTOR_REFUSALS.unreachable] };
    }
}
/**
 * FR-17: add a Backlog Connector with encrypted credentials and client approval.
 *
 * Story 5.3: before the insert, Get Rate Limit + Count Issues decide whether one full read fits
 * in 25% of the Search bucket; over budget (or Backlog refusing the key / project) refuses
 * `invalid_input` and writes nothing. The Search limit is stored on the Connector. The check runs
 * OUTSIDE the transaction so no database transaction waits on Backlog.
 */
export async function addConnector(deps, ctx, input) {
    // Gate and parse before any call leaves for Backlog: an outsider still answers `not_found`
    // and a malformed command `invalid_input`, exactly as `runAuditedWrite` would.
    const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES });
    if (!roles.ok)
        return roles;
    const parsed = addConnectorInputSchema.safeParse(input);
    if (!parsed.success)
        return fail('invalid_input', invalidInputDetails(parsed.error));
    const reach = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: parsed.data.projectId });
    if (!reach.ok)
        return reach;
    const assessment = await deps.searchBudget.assessSearchBudget({ site: parsed.data.site, scope: parsed.data.projectKey }, { apiKey: parsed.data.apiKey });
    if (assessment.kind !== 'assessed' || !assessment.withinBudget) {
        return fail('invalid_input', budgetRefusal(assessment));
    }
    const { searchLimit } = assessment;
    return runConnectorWrite(addConnectorInputSchema, deps, ctx, input, async (scope, stamp, command) => {
        const existing = await scope.connectorWrite.findConnectorForProject(command.projectId);
        if (existing)
            refuse('invalid_input', { projectId: ['connector_exists'] });
        const id = deps.ids.next();
        const credentials = deps.crypto.encrypt({ apiKey: command.apiKey });
        await scope.connectorWrite.insertConnector({
            id,
            projectId: command.projectId,
            adapter: 'backlog',
            site: command.site,
            scope: command.projectKey,
            spaceLabel: command.spaceLabel,
            approvalRecordedAt: command.approvalRecordedAt,
            approvalName: command.approvalName,
            credentials,
            searchLimit,
        });
        const scopeSeq = await scope.connectorWrite.appendScopeEvent({
            connectorId: id,
            projectId: command.projectId,
            scope: command.projectKey,
            actor: stamp.actor,
            at: stamp.at,
        });
        // Story 5.7: seed Resolved set `{Closed}`; missing basis head ≡ count until hours latch.
        const settingSeq = await scope.connectorWrite.appendSettingEvent({
            connectorId: id,
            projectId: command.projectId,
            resolvedStatusIds: ['Closed'],
            actor: stamp.actor,
            at: stamp.at,
        });
        await audit.record(scope, stamp, 'connector.add', id, {
            projectId: command.projectId,
            site: command.site,
            scope: command.projectKey,
            approvalName: command.approvalName,
            scopeSeq,
            settingSeq,
        });
        return { id };
    });
}
/** FR-17: rotate API key — ciphertext only; Mapping history unchanged. */
export async function rotateCredentials(deps, ctx, input) {
    return runConnectorWrite(rotateCredentialsInputSchema, deps, ctx, input, async (scope, stamp, command) => {
        const connector = await scope.connectorWrite.findConnector(command.connectorId);
        if (!connector || connector.projectId !== command.projectId)
            refuse('not_found');
        const mappingsBefore = await scope.connectorWrite.countMappingEventsForProject(command.projectId);
        const credentials = deps.crypto.encrypt({ apiKey: command.apiKey });
        await scope.connectorWrite.rotateCredentials(command.connectorId, credentials);
        const mappingsAfter = await scope.connectorWrite.countMappingEventsForProject(command.projectId);
        if (mappingsBefore !== mappingsAfter) {
            throw new Error('rotateCredentials must not change mapping_event rows');
        }
        await audit.record(scope, stamp, 'connector.rotate_credentials', command.connectorId, {
            projectId: command.projectId,
        });
    });
}
/** FR-17 / AR-19: change scope — append connector_scope_event and update connector.scope. */
export async function changeConnectorScope(deps, ctx, input) {
    return runConnectorWrite(changeScopeInputSchema, deps, ctx, input, async (scope, stamp, command) => {
        const connector = await scope.connectorWrite.findConnector(command.connectorId);
        if (!connector || connector.projectId !== command.projectId)
            refuse('not_found');
        const projectKey = command.projectKey.trim();
        await scope.connectorWrite.updateScope(command.connectorId, projectKey);
        const scopeSeq = await scope.connectorWrite.appendScopeEvent({
            connectorId: command.connectorId,
            projectId: command.projectId,
            scope: projectKey,
            actor: stamp.actor,
            at: stamp.at,
        });
        await audit.record(scope, stamp, 'connector.change_scope', command.connectorId, {
            projectId: command.projectId,
            before: connector.scope,
            after: projectKey,
        });
        void scopeSeq;
    });
}
/**
 * Story 5.7 RESOLVED_WRITE_SURFACE = B: append Resolved status set for tests/API only.
 * No PM edit UI this story — live Backlog numeric status ids stay wrong until a later story.
 */
export async function appendResolvedStatuses(deps, ctx, input) {
    return runConnectorWrite(appendResolvedStatusesInputSchema, deps, ctx, input, async (scope, stamp, command) => {
        const connector = await scope.connectorWrite.findConnector(command.connectorId);
        if (!connector || connector.projectId !== command.projectId)
            refuse('not_found');
        await scope.connectorWrite.appendSettingEvent({
            connectorId: command.connectorId,
            projectId: command.projectId,
            resolvedStatusIds: command.resolvedStatusIds,
            actor: stamp.actor,
            at: stamp.at,
        });
        await audit.record(scope, stamp, 'connector.append_resolved_statuses', command.connectorId, {
            projectId: command.projectId,
            resolvedStatusIds: command.resolvedStatusIds,
        });
    });
}
export const CONNECTOR_WRITE_AUDIT = {
    addConnector: { audited: ['connector.add'] },
    rotateCredentials: { audited: ['connector.rotate_credentials'] },
    changeConnectorScope: { audited: ['connector.change_scope'] },
    appendResolvedStatuses: { audited: ['connector.append_resolved_statuses'] },
};
export const CONNECTOR_WRITE_ROLES = {
    addConnector: PROJECT_REACH,
    rotateCredentials: PROJECT_REACH,
    changeConnectorScope: PROJECT_REACH,
    appendResolvedStatuses: PROJECT_REACH,
};

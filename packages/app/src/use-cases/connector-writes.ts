/**
 * Connector set-up, credential rotation, and scope change (story 5.2 / FR-17).
 *
 * PROJECT_REACH + audited. Credentials are encrypted before insert; list/get never return
 * secrets. Rotation overwrites ciphertext only — Mapping history is untouched.
 */
import { PROJECT_REACH, PROJECT_REACH_ROLES, authorize, type RoleDeclaration } from '../authz/authorize';
import { audit, type AuditDeclaration } from '../audit';
import type { RequestContext } from '../authz/request-context';
import { isProjectNotFound } from '../ports/project-read';
import type { ConnectorWriteDeps, ConnectorWriteScope } from '../ports/connector-write';
import type { Result } from '../result';
import { runAuditedWrite, refuse } from './audited-write';
import {
  addConnectorInputSchema,
  changeScopeInputSchema,
  rotateCredentialsInputSchema,
  type AddConnectorInput,
  type ChangeScopeInput,
  type RotateCredentialsInput,
} from './connector-input';

export interface CreatedConnector {
  readonly id: string;
}

async function runConnectorWrite<Handle, Command extends { readonly projectId: string }, Value>(
  schema: Parameters<typeof runAuditedWrite<Handle, ConnectorWriteScope, Command, Value>>[0],
  deps: ConnectorWriteDeps<Handle>,
  ctx: RequestContext,
  input: unknown,
  work: (
    scope: ConnectorWriteScope,
    stamp: { actor: string; at: Date },
    command: Command,
  ) => Promise<Value>,
): Promise<Result<Value>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES });
  if (!roles.ok) return roles;

  return runAuditedWrite(schema, deps, ctx, input, {
    at: (scope, command) => scope.connectorWrite.projectAnchor(command.projectId),
    isNotFound: (error, command) => isProjectNotFound(error, command.projectId),
    authorize: (caller, command) =>
      authorize(caller, { roles: PROJECT_REACH_ROLES, projectId: command.projectId }),
  }, work);
}

/** FR-17: add a Backlog Connector with encrypted credentials and client approval. */
export async function addConnector<Handle>(
  deps: ConnectorWriteDeps<Handle>,
  ctx: RequestContext,
  input: AddConnectorInput,
): Promise<Result<CreatedConnector>> {
  return runConnectorWrite(
    addConnectorInputSchema,
    deps,
    ctx,
    input,
    async (scope, stamp, command) => {
      const existing = await scope.connectorWrite.findConnectorForProject(command.projectId);
      if (existing) refuse('invalid_input', { projectId: ['connector_exists'] });

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
      });
      const scopeSeq = await scope.connectorWrite.appendScopeEvent({
        connectorId: id,
        projectId: command.projectId,
        scope: command.projectKey,
        actor: stamp.actor,
        at: stamp.at,
      });
      await audit.record(scope, stamp, 'connector.add', id, {
        projectId: command.projectId,
        site: command.site,
        scope: command.projectKey,
        approvalName: command.approvalName,
        scopeSeq,
      });
      return { id };
    },
  );
}

/** FR-17: rotate API key — ciphertext only; Mapping history unchanged. */
export async function rotateCredentials<Handle>(
  deps: ConnectorWriteDeps<Handle>,
  ctx: RequestContext,
  input: RotateCredentialsInput,
): Promise<Result<void>> {
  return runConnectorWrite(
    rotateCredentialsInputSchema,
    deps,
    ctx,
    input,
    async (scope, stamp, command) => {
      const connector = await scope.connectorWrite.findConnector(command.connectorId);
      if (!connector || connector.projectId !== command.projectId) refuse('not_found');

      const mappingsBefore = await scope.connectorWrite.countMappingEventsForProject(
        command.projectId,
      );
      const credentials = deps.crypto.encrypt({ apiKey: command.apiKey });
      await scope.connectorWrite.rotateCredentials(command.connectorId, credentials);
      const mappingsAfter = await scope.connectorWrite.countMappingEventsForProject(
        command.projectId,
      );
      if (mappingsBefore !== mappingsAfter) {
        throw new Error('rotateCredentials must not change mapping_event rows');
      }
      await audit.record(scope, stamp, 'connector.rotate_credentials', command.connectorId, {
        projectId: command.projectId,
      });
    },
  );
}

/** FR-17 / AR-19: change scope — append connector_scope_event and update connector.scope. */
export async function changeConnectorScope<Handle>(
  deps: ConnectorWriteDeps<Handle>,
  ctx: RequestContext,
  input: ChangeScopeInput,
): Promise<Result<void>> {
  return runConnectorWrite(
    changeScopeInputSchema,
    deps,
    ctx,
    input,
    async (scope, stamp, command) => {
      const connector = await scope.connectorWrite.findConnector(command.connectorId);
      if (!connector || connector.projectId !== command.projectId) refuse('not_found');

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
    },
  );
}

export const CONNECTOR_WRITE_AUDIT = {
  addConnector: { audited: ['connector.add'] },
  rotateCredentials: { audited: ['connector.rotate_credentials'] },
  changeConnectorScope: { audited: ['connector.change_scope'] },
} as const satisfies Readonly<Record<string, AuditDeclaration>>;

export const CONNECTOR_WRITE_ROLES = {
  addConnector: PROJECT_REACH,
  rotateCredentials: PROJECT_REACH,
  changeConnectorScope: PROJECT_REACH,
} as const satisfies Readonly<Record<string, RoleDeclaration>>;

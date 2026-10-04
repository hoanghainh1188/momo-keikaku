'use server';

/**
 * Connector set-up / rotation mutations (story 5.2 / FR-17). Thin wrappers over the
 * composition bindings — no write logic here.
 */
import { revalidatePath } from 'next/cache';
import { ADD_CONNECTOR_REFUSALS, type AppError } from '@momo/app';
import { t } from '@momo/i18n';
import {
  addConnector,
  requestContext,
  rotateCredentials,
} from '@/server/composition';
import { messageFromKey } from '@/server/error-message';
import { parseApprovalWhen } from './parse-approval-when';

export type ConnectorActionState = {
  readonly error: string | null;
  readonly resetKey: number;
};

export const INITIAL_CONNECTOR_ACTION: ConnectorActionState = { error: null, resetKey: 0 };

function refuse(
  prev: ConnectorActionState,
  messageKey: 'errors.not_found' | 'errors.invalid_input',
): ConnectorActionState {
  return { error: messageFromKey(messageKey), resetKey: prev.resetKey };
}

/** Story 5.3: set-up refusals that came from asking Backlog name their reason to the operator. */
const ADD_CONNECTOR_REFUSAL_KEYS: readonly (readonly [string, string])[] = [
  [ADD_CONNECTOR_REFUSALS.searchBudget, 'connectors.refused_search_budget'],
  [ADD_CONNECTOR_REFUSALS.credentialRejected, 'connectors.refused_credential_rejected'],
  [ADD_CONNECTOR_REFUSALS.projectNotFound, 'connectors.refused_project_not_found'],
  [ADD_CONNECTOR_REFUSALS.unreachable, 'connectors.refused_backlog_unreachable'],
];

function addConnectorRefusalMessage(error: AppError): string {
  const codes = Object.values(error.details ?? {}).flat();
  const match = ADD_CONNECTOR_REFUSAL_KEYS.find(([code]) => codes.includes(code));
  // R0 UI locale is always `en`, as in `messageFromKey`.
  const locale = 'en';
  return match ? t(locale, match[1]) : messageFromKey(error.messageKey);
}

function ok(prev: ConnectorActionState): ConnectorActionState {
  return { error: null, resetKey: prev.resetKey + 1 };
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export async function addConnectorAction(
  prev: ConnectorActionState,
  formData: FormData,
): Promise<ConnectorActionState> {
  const ctx = await requestContext();
  const projectId = field(formData, 'projectId');
  const approvalRecordedAt = parseApprovalWhen(field(formData, 'approvalRecordedAt'));
  if (approvalRecordedAt === null) return refuse(prev, 'errors.invalid_input');
  const result = await addConnector(
    {
      projectId,
      spaceUrl: field(formData, 'spaceUrl'),
      apiKey: field(formData, 'apiKey'),
      projectKey: field(formData, 'projectKey'),
      approvalName: field(formData, 'approvalName'),
      approvalRecordedAt,
    },
    ctx,
  );
  if (!result.ok) return { error: addConnectorRefusalMessage(result.error), resetKey: prev.resetKey };
  revalidatePath(`/p/${projectId}/connectors`);
  return ok(prev);
}

export async function rotateCredentialsAction(
  prev: ConnectorActionState,
  formData: FormData,
): Promise<ConnectorActionState> {
  const ctx = await requestContext();
  const projectId = field(formData, 'projectId');
  const result = await rotateCredentials(
    {
      projectId,
      connectorId: field(formData, 'connectorId'),
      apiKey: field(formData, 'apiKey'),
    },
    ctx,
  );
  if (!result.ok) return refuse(prev, result.error.messageKey);
  revalidatePath(`/p/${projectId}/connectors`);
  return ok(prev);
}

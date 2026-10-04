'use server';

/**
 * Connector set-up / rotation mutations (story 5.2 / FR-17). Thin wrappers over the
 * composition bindings — no write logic here.
 */
import { revalidatePath } from 'next/cache';
import {
  addConnector,
  requestContext,
  rotateCredentials,
} from '@/server/composition';
import { messageFromKey } from '@/server/error-message';

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

function ok(prev: ConnectorActionState): ConnectorActionState {
  return { error: null, resetKey: prev.resetKey + 1 };
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/**
 * `datetime-local` is wall time without a zone. Treat bare values as UTC by appending `Z`.
 * Returns ISO instant, or null when empty/invalid.
 */
export function parseApprovalWhen(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed) ? trimmed : `${trimmed}Z`;
  const when = new Date(withZone);
  if (Number.isNaN(when.getTime())) return null;
  return when.toISOString();
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
  if (!result.ok) return refuse(prev, result.error.messageKey);
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

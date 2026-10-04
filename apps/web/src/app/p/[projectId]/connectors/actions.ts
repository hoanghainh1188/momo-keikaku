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

export async function addConnectorAction(
  prev: ConnectorActionState,
  formData: FormData,
): Promise<ConnectorActionState> {
  const ctx = await requestContext();
  const projectId = field(formData, 'projectId');
  const whenRaw = field(formData, 'approvalRecordedAt');
  // `datetime-local` is wall-local without a zone; parse then re-emit ISO for the use case.
  const when = whenRaw ? new Date(whenRaw) : null;
  const result = await addConnector(
    {
      projectId,
      spaceUrl: field(formData, 'spaceUrl'),
      apiKey: field(formData, 'apiKey'),
      projectKey: field(formData, 'projectKey'),
      approvalName: field(formData, 'approvalName'),
      approvalRecordedAt:
        when && !Number.isNaN(when.getTime()) ? when.toISOString() : whenRaw,
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

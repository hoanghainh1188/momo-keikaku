'use server';

/**
 * Connector set-up / rotation mutations (story 5.2 / FR-17). Thin wrappers over the
 * composition bindings — no write logic here.
 */
import { revalidatePath } from 'next/cache';
import { ADD_CONNECTOR_REFUSALS, type AppError, type AppErrorMessageKey } from '@momo/app';
import { t } from '@momo/i18n';
import {
  addConnector,
  confirmConnectorOwnership,
  linkTrackerAccount,
  requestContext,
  rotateCredentials,
  unlinkTrackerAccount,
} from '@/server/composition';
import { messageFromKey } from '@/server/error-message';
import { parseApprovalWhen } from './parse-approval-when';

export type ConnectorActionState = {
  readonly error: string | null;
  readonly resetKey: number;
};

export type LinkActionState = {
  readonly error: string | null;
};

export const INITIAL_CONNECTOR_ACTION: ConnectorActionState = { error: null, resetKey: 0 };
export const INITIAL_LINK_ACTION: LinkActionState = { error: null };

function refuse(prev: ConnectorActionState, messageKey: AppErrorMessageKey): ConnectorActionState {
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

/** Story 5.6: Keep / Transfer ownership for an overlap claim. */
export async function confirmOwnershipAction(
  prev: ConnectorActionState,
  formData: FormData,
): Promise<ConnectorActionState> {
  const ctx = await requestContext();
  const projectId = field(formData, 'projectId');
  const resolution = field(formData, 'resolution');
  if (resolution !== 'keep' && resolution !== 'transfer') {
    return refuse(prev, 'errors.invalid_input');
  }
  const result = await confirmConnectorOwnership(
    {
      projectId,
      trackerIssueId: field(formData, 'trackerIssueId'),
      claimerConnectorId: field(formData, 'claimerConnectorId'),
      resolution,
    },
    ctx,
  );
  if (!result.ok) return refuse(prev, result.error.messageKey);
  revalidatePath(`/p/${projectId}/connectors`);
  revalidatePath(`/p/${projectId}/review`);
  return ok(prev);
}

function linkRefuse(prev: LinkActionState, messageKey: AppErrorMessageKey): LinkActionState {
  return { error: messageFromKey(messageKey) };
}

/** Story 5.8: link (or change) Tracker Account → Resource. */
export async function linkTrackerAccountAction(
  prev: LinkActionState,
  formData: FormData,
): Promise<LinkActionState> {
  const ctx = await requestContext();
  const projectId = field(formData, 'projectId');
  const result = await linkTrackerAccount(
    {
      projectId,
      trackerAccountId: field(formData, 'trackerAccountId'),
      resourceId: field(formData, 'resourceId'),
    },
    ctx,
  );
  if (!result.ok) return linkRefuse(prev, result.error.messageKey);
  revalidatePath(`/p/${projectId}/connectors`);
  revalidatePath(`/p/${projectId}/review`);
  return { error: null };
}

/** Story 5.8: unlink Tracker Account. */
export async function unlinkTrackerAccountAction(
  prev: LinkActionState,
  formData: FormData,
): Promise<LinkActionState> {
  const ctx = await requestContext();
  const projectId = field(formData, 'projectId');
  const result = await unlinkTrackerAccount(
    {
      projectId,
      trackerAccountId: field(formData, 'trackerAccountId'),
    },
    ctx,
  );
  if (!result.ok) return linkRefuse(prev, result.error.messageKey);
  revalidatePath(`/p/${projectId}/connectors`);
  revalidatePath(`/p/${projectId}/review`);
  return { error: null };
}

/** Story 5.8: accept all outstanding suggestions (first suggestion per account). */
export async function acceptLinkSuggestionAction(
  prev: LinkActionState,
  formData: FormData,
): Promise<LinkActionState> {
  const ctx = await requestContext();
  const projectId = field(formData, 'projectId');
  const pairs = formData.getAll('pair').filter((v): v is string => typeof v === 'string');
  for (const pair of pairs) {
    const [trackerAccountId, resourceId] = pair.split(':');
    if (!trackerAccountId || !resourceId) return linkRefuse(prev, 'errors.invalid_input');
    const result = await linkTrackerAccount({ projectId, trackerAccountId, resourceId }, ctx);
    if (!result.ok) return linkRefuse(prev, result.error.messageKey);
  }
  revalidatePath(`/p/${projectId}/connectors`);
  revalidatePath(`/p/${projectId}/review`);
  return { error: null };
}

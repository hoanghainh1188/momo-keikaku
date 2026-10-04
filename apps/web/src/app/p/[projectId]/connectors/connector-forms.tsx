'use client';

/**
 * Connector set-up and rotation forms (story 5.2 / FR-17).
 * Client so `useActionState` can show refuse messages without a full navigation.
 */
import { useTranslations } from 'next-intl';
import { useActionState, type ReactNode } from 'react';
import {
  addConnectorAction,
  INITIAL_CONNECTOR_ACTION,
  rotateCredentialsAction,
  type ConnectorActionState,
} from './actions';

function Refuse({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="org-form-error" role="alert" data-testid="connector-form-error">
      {error}
    </p>
  );
}

function ConnectorForm({
  action,
  children,
  testId,
  submitLabel,
  remountToken,
}: {
  action: (prev: ConnectorActionState, formData: FormData) => Promise<ConnectorActionState>;
  children: ReactNode;
  testId: string;
  submitLabel: string;
  remountToken?: string;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, INITIAL_CONNECTOR_ACTION);
  return (
    <form
      key={`${state.resetKey}-${remountToken ?? ''}`}
      action={formAction}
      className="org-form"
      data-testid={testId}
      noValidate
    >
      {children}
      <Refuse error={state.error} />
      <button type="submit" className="btn" disabled={pending}>
        {pending ? t('connectors.saving') : submitLabel}
      </button>
    </form>
  );
}

export function AddConnectorForm({ projectId }: { projectId: string }) {
  const t = useTranslations();
  return (
    <div className="org-create" data-testid="add-connector">
      <p className="org-form-hint">{t('connectors.bot_user_recommendation')}</p>
      <ConnectorForm
        action={addConnectorAction}
        testId="add-connector-form"
        submitLabel={t('connectors.add_connector')}
      >
        <input type="hidden" name="projectId" value={projectId} />
        <label>
          {t('connectors.space_url')}
          <input
            name="spaceUrl"
            type="url"
            required
            autoComplete="off"
            placeholder="https://example.backlog.jp/"
          />
        </label>
        <label>
          {t('connectors.api_key')}
          <input name="apiKey" type="password" required autoComplete="off" />
        </label>
        <label>
          {t('connectors.project_key')}
          <input name="projectKey" type="text" required autoComplete="off" />
        </label>
        <label>
          {t('connectors.approval_name')}
          <input name="approvalName" type="text" required autoComplete="off" />
        </label>
        <label>
          {t('connectors.approval_when')}
          <input
            name="approvalRecordedAt"
            type="datetime-local"
            required
            autoComplete="off"
          />
        </label>
      </ConnectorForm>
    </div>
  );
}

export function RotateCredentialsForm({
  projectId,
  connectorId,
}: {
  projectId: string;
  connectorId: string;
}) {
  const t = useTranslations();
  return (
    <div data-testid="rotate-credentials">
      <p className="org-form-hint">{t('connectors.rotate_keeps_mappings')}</p>
      <ConnectorForm
        action={rotateCredentialsAction}
        testId="rotate-credentials-form"
        submitLabel={t('connectors.rotate_credentials')}
        remountToken={connectorId}
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="connectorId" value={connectorId} />
        <label>
          {t('connectors.new_api_key')}
          <input name="apiKey" type="password" required autoComplete="off" />
        </label>
      </ConnectorForm>
    </div>
  );
}

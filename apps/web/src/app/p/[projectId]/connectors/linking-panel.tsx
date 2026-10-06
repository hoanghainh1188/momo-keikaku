'use client';

/**
 * Story 5.8 / FR-13: Tracker Account → Resource linking panel.
 * Accept / Link / Change / Unlink call server actions; form fields carry opaque ids only.
 */
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import {
  acceptLinkSuggestionAction,
  linkTrackerAccountAction,
  unlinkTrackerAccountAction,
  type LinkActionState,
  INITIAL_LINK_ACTION,
} from './actions';

export type LinkRow = {
  readonly trackerAccountId: string;
  readonly accountId: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly linkedResourceId: string | null;
  readonly suggestedResourceIds: readonly string[];
  readonly matchKind: 'email' | 'name' | 'none' | 'linked';
};

export type ResourceOption = {
  readonly id: string;
  readonly name: string;
};

function LinkError({ state }: { readonly state: LinkActionState }) {
  if (!state.error) return null;
  return (
    <p className="caption" role="alert" data-testid="link-action-error">
      {state.error}
    </p>
  );
}

export function TrackerAccountLinkingPanel({
  projectId,
  rows,
  resources,
}: {
  readonly projectId: string;
  readonly rows: readonly LinkRow[];
  readonly resources: readonly ResourceOption[];
}) {
  const t = useTranslations('connectors');
  const nameById = new Map(resources.map((r) => [r.id, r.name]));
  const outstanding = rows
    .filter((r) => r.linkedResourceId === null && r.suggestedResourceIds.length > 0)
    .map((r) => ({
      trackerAccountId: r.trackerAccountId,
      resourceId: r.suggestedResourceIds[0]!,
    }));

  return (
    <div data-testid="tracker-account-linking-panel">
      <p className="caption">{t('linking_intro')}</p>
      {outstanding.length > 0 ? (
        <AcceptAllForm projectId={projectId} pairs={outstanding} />
      ) : null}
      <table className="ledger" data-testid="tracker-account-link-table">
        <thead>
          <tr>
            <th className="label">{t('linking_account')}</th>
            <th className="label">{t('linking_resource')}</th>
            <th className="label">{t('linking_actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="caption">
                {t('linking_empty')}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.trackerAccountId} data-testid={`link-row-${row.accountId}`}>
                <td>
                  <div>{row.displayName}</div>
                  {row.email ? <div className="caption">{row.email}</div> : null}
                  {row.matchKind === 'email' || row.matchKind === 'name' ? (
                    <div className="caption">{t(`linking_match_${row.matchKind}`)}</div>
                  ) : null}
                </td>
                <td>
                  {row.linkedResourceId
                    ? (nameById.get(row.linkedResourceId) ?? row.linkedResourceId)
                    : row.suggestedResourceIds.length > 0
                      ? row.suggestedResourceIds.map((id) => nameById.get(id) ?? id).join(', ')
                      : t('linking_unlinked')}
                </td>
                <td>
                  {row.linkedResourceId ? (
                    <>
                      <ChangeForm
                        projectId={projectId}
                        trackerAccountId={row.trackerAccountId}
                        resources={resources}
                        currentResourceId={row.linkedResourceId}
                      />
                      <UnlinkForm projectId={projectId} trackerAccountId={row.trackerAccountId} />
                    </>
                  ) : (
                    <LinkForm
                      projectId={projectId}
                      trackerAccountId={row.trackerAccountId}
                      resources={resources}
                      defaultResourceId={row.suggestedResourceIds[0] ?? ''}
                    />
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function AcceptAllForm({
  projectId,
  pairs,
}: {
  readonly projectId: string;
  readonly pairs: readonly { trackerAccountId: string; resourceId: string }[];
}) {
  const t = useTranslations('connectors');
  const [state, action, pending] = useActionState(acceptLinkSuggestionAction, INITIAL_LINK_ACTION);
  return (
    <form action={action} style={{ marginBottom: 12 }}>
      <input type="hidden" name="projectId" value={projectId} />
      {pairs.map((p) => (
        <input
          key={p.trackerAccountId}
          type="hidden"
          name="pair"
          value={`${p.trackerAccountId}:${p.resourceId}`}
        />
      ))}
      <button type="submit" disabled={pending} data-testid="accept-all-suggestions">
        {pending ? t('saving') : t('linking_accept_all')}
      </button>
      <LinkError state={state} />
    </form>
  );
}

function LinkForm({
  projectId,
  trackerAccountId,
  resources,
  defaultResourceId,
}: {
  readonly projectId: string;
  readonly trackerAccountId: string;
  readonly resources: readonly ResourceOption[];
  readonly defaultResourceId: string;
}) {
  const t = useTranslations('connectors');
  const [state, action, pending] = useActionState(linkTrackerAccountAction, INITIAL_LINK_ACTION);
  return (
    <form action={action}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="trackerAccountId" value={trackerAccountId} />
      <select name="resourceId" defaultValue={defaultResourceId} required>
        <option value="" disabled>
          {t('linking_pick_resource')}
        </option>
        {resources.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>{' '}
      <button type="submit" disabled={pending} data-testid={`link-btn-${trackerAccountId}`}>
        {pending ? t('saving') : t('linking_link')}
      </button>
      <LinkError state={state} />
    </form>
  );
}

function ChangeForm({
  projectId,
  trackerAccountId,
  resources,
  currentResourceId,
}: {
  readonly projectId: string;
  readonly trackerAccountId: string;
  readonly resources: readonly ResourceOption[];
  readonly currentResourceId: string;
}) {
  const t = useTranslations('connectors');
  const [state, action, pending] = useActionState(linkTrackerAccountAction, INITIAL_LINK_ACTION);
  return (
    <form action={action} style={{ marginBottom: 4 }}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="trackerAccountId" value={trackerAccountId} />
      <select name="resourceId" defaultValue={currentResourceId} required>
        {resources.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>{' '}
      <button type="submit" disabled={pending} data-testid={`change-btn-${trackerAccountId}`}>
        {pending ? t('saving') : t('linking_change')}
      </button>
      <LinkError state={state} />
    </form>
  );
}

function UnlinkForm({
  projectId,
  trackerAccountId,
}: {
  readonly projectId: string;
  readonly trackerAccountId: string;
}) {
  const t = useTranslations('connectors');
  const [state, action, pending] = useActionState(unlinkTrackerAccountAction, INITIAL_LINK_ACTION);
  return (
    <form action={action}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="trackerAccountId" value={trackerAccountId} />
      <button type="submit" disabled={pending} data-testid={`unlink-btn-${trackerAccountId}`}>
        {pending ? t('saving') : t('linking_unlink')}
      </button>
      <LinkError state={state} />
    </form>
  );
}

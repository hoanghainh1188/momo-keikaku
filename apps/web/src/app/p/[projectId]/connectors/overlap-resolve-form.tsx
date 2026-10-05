'use client';

/**
 * Story 5.6: Keep / Transfer for one open connector_overlap row.
 * Client so refuse messages surface without a full navigation.
 */
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  confirmOwnershipAction,
  INITIAL_CONNECTOR_ACTION,
} from './actions';

export function OverlapResolveForm(props: {
  readonly projectId: string;
  readonly trackerIssueId: string;
  readonly claimerConnectorId: string;
  readonly ticketKey: string;
  readonly ownerLabel: string;
  readonly claimerLabel: string;
  readonly copyNamespace: 'connectors' | 'review';
}) {
  const t = useTranslations();
  const ns = props.copyNamespace;
  const [state, formAction, pending] = useActionState(
    confirmOwnershipAction,
    INITIAL_CONNECTOR_ACTION,
  );

  return (
    <li>
      <form action={formAction} style={{ display: 'inline' }}>
        <input type="hidden" name="projectId" value={props.projectId} />
        <input type="hidden" name="trackerIssueId" value={props.trackerIssueId} />
        <input type="hidden" name="claimerConnectorId" value={props.claimerConnectorId} />
        <span>
          {t(`${ns}.overlap_row`, {
            key: props.ticketKey,
            owner: props.ownerLabel,
            claimer: props.claimerLabel,
          })}
        </span>{' '}
        <button type="submit" name="resolution" value="keep" disabled={pending}>
          {t(`${ns}.overlap_keep`)}
        </button>{' '}
        <button type="submit" name="resolution" value="transfer" disabled={pending}>
          {t(`${ns}.overlap_transfer`)}
        </button>
        {state.error ? (
          <span className="org-form-error" role="alert" style={{ marginLeft: 8 }}>
            {state.error}
          </span>
        ) : null}
      </form>
    </li>
  );
}

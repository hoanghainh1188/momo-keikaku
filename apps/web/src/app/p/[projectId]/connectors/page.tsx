import { getTranslations } from 'next-intl/server';
import { getProjectReview } from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { hours } from '@momo/domain/present';
import { Section } from '@/components/ui';
import { AddConnectorForm, RotateCredentialsForm } from './connector-forms';
import { OverlapResolveForm } from './overlap-resolve-form';

export const dynamic = 'force-dynamic';

/** FR-17, FR-19, FR-42: Connector set-up, approval, credentials, snapshot history. */
export default async function ConnectorsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const t = await getTranslations();
  const { projectId } = await params;
  const { bundle, review } = valueOrNotFound(await getProjectReview({ projectId }));
  const c = bundle.meta.connector;
  const hasConnector = c.id.length > 0;
  const hasSnapshot = review.snapshot.id.length > 0;
  const overlaps = bundle.meta.overlaps;
  const leftScopeTickets = bundle.meta.leftScopeTickets;

  return (
    <div className="sheet">
      <h1 className="report-title">{t('connectors.connectors')}</h1>
      <div className="report-sub">{t('connectors.connectors_are_read_only_the_offshore_team_keeps')}</div>

      {c.lastErrorMessage ? (
        <div className="connector-error-banner" role="alert" data-testid="connector-error-banner">
          <strong>{t('connectors.credential_error_title')}</strong>
          <p>{c.lastErrorMessage}</p>
        </div>
      ) : null}

      {overlaps.length > 0 ? (
        <div className="connector-error-banner" role="alert" data-testid="connector-overlap-banner">
          <strong>{t('connectors.overlap_title')}</strong>
          <p>{t('connectors.overlap_intro')}</p>
          <ul>
            {overlaps.map((o) => (
              <OverlapResolveForm
                key={o.id}
                projectId={projectId}
                trackerIssueId={o.trackerIssueId}
                claimerConnectorId={o.claimerConnectorId}
                ticketKey={o.ticketKey}
                ownerLabel={o.ownerConnectorId}
                claimerLabel={o.claimerConnectorId}
                copyNamespace="connectors"
              />
            ))}
          </ul>
        </div>
      ) : null}

      {leftScopeTickets.length > 0 ? (
        <details data-testid="left-scope-list" style={{ marginBottom: 16 }}>
          <summary>
            <strong>{t('connectors.left_scope_title')}</strong>
            {' — '}
            {t('connectors.left_scope_intro')}
          </summary>
          <ul>
            {leftScopeTickets.map((row) => (
              <li key={row.trackerIssueId}>
                {t('connectors.left_scope_row', {
                  key: row.key,
                  hours: hours(row.hoursMh),
                })}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {!hasConnector ? (
        <Section title={t('connectors.add_backlog_connector')} id="add-connector">
          <AddConnectorForm projectId={projectId} />
        </Section>
      ) : (
        <Section title={t('connectors.backlog_connector')} id="connector">
          <table className="ledger">
            <tbody>
              <tr>
                <td className="label">{t('connectors.adapter')}</td>
                <td>
                  <code>{c.adapter}</code>
                  {c.adapter === 'fixture' ? (
                    <>
                      {t('connectors.adapter_replays')}
                      <code>{t('connectors.fixtures_backlog_ec_phase2')}</code>
                    </>
                  ) : null}
                </td>
              </tr>
              <tr>
                <td className="label">{t('connectors.space')}</td>
                <td>{c.spaceLabel}</td>
              </tr>
              <tr>
                <td className="label">{t('connectors.site')}</td>
                <td>{c.site}</td>
              </tr>
              <tr>
                <td className="label">{t('connectors.scope')}</td>
                <td>{c.scope}</td>
              </tr>
              <tr>
                <td className="label">{t('connectors.approval')}</td>
                <td>
                  {c.approvalRecordedAt
                    ? t('connectors.approval_row', {
                        name: c.approvalName ?? '—',
                        when: c.approvalRecordedAt,
                      })
                    : t('connectors.approval_missing')}
                </td>
              </tr>
              <tr>
                <td className="label">{t('connectors.credentials')}</td>
                <td>
                  {c.hasCredentials
                    ? t('connectors.credentials_stored_write_only')
                    : t('connectors.credentials_none')}
                </td>
              </tr>
              {hasSnapshot ? (
                <>
                  <tr>
                    <td className="label">{t('connectors.hours_detection')}</td>
                    <td>
                      {t('connectors.detected_from_the_data_never_from_the_plan_name_')}
                      <strong>{review.measurementBasis}</strong>
                      {review.measurementBasis === 'count' ? (
                        <p className="caption" style={{ margin: '6px 0 0' }} data-testid="ticket-count-mode">
                          {t('connectors.ticket_count_mode_notice')}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                  <tr>
                    <td className="label">{t('connectors.pinned_snapshot')}</td>
                    <td>
                      {t('connectors.snapshot_row', {
                        snapshotId: review.snapshot.id,
                        ticketCount: review.snapshot.ticketCount,
                        ageMinutes: bundle.meta.snapshotAgeMinutes,
                      })}
                    </td>
                  </tr>
                  <tr>
                    <td className="label">{t('connectors.opening_balance')}</td>
                    <td>
                      {t('connectors.opening_balance_row', {
                        hours: hours(review.openingBalanceMh),
                      })}
                    </td>
                  </tr>
                </>
              ) : null}
            </tbody>
          </table>

          {c.adapter !== 'fixture' || c.hasCredentials ? (
            <div style={{ marginTop: 16 }}>
              <RotateCredentialsForm projectId={projectId} connectorId={c.id} />
            </div>
          ) : (
            <p className="caption" style={{ marginTop: 12 }}>
              {t('connectors.fixture_no_live_key')}
            </p>
          )}

          <p className="caption" style={{ marginTop: 12 }}>
            {t('connectors.scheduled_job_later')}
          </p>
        </Section>
      )}
    </div>
  );
}

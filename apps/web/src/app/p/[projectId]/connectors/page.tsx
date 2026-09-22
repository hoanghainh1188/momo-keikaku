import { getTranslations } from 'next-intl/server';
import { getProjectReview } from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { hours } from '@momo/domain/present';
import { Section } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** FR-17, FR-19, FR-42: the fixture Connector and its snapshot history. */
export default async function ConnectorsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const t = await getTranslations();
  const { projectId } = await params;
  const { bundle, review } = valueOrNotFound(await getProjectReview({ projectId }));
  const c = bundle.meta.connector;
  return (
    <div className="sheet">
      <h1 className="report-title">{t('connectors.connectors')}</h1>
      <div className="report-sub">{t('connectors.connectors_are_read_only_the_offshore_team_keeps')}</div>
      <Section title={t('connectors.backlog_connector')} id="connector">
        <table className="ledger">
          <tbody>
            <tr>
              <td className="label">{t('connectors.adapter')}</td>
              <td>
                <code>{c.adapter}</code>
                {t('connectors.adapter_replays')}
                <code>{t('connectors.fixtures_backlog_ec_phase2')}</code>
              </td>
            </tr>
            <tr><td className="label">{t('connectors.space')}</td><td>{c.spaceLabel}</td></tr>
            <tr><td className="label">{t('connectors.scope')}</td><td>{c.scope}</td></tr>
            <tr><td className="label">{t('connectors.hours_detection')}</td><td>{t('connectors.detected_from_the_data_never_from_the_plan_name_')}<strong>{review.measurementBasis}</strong></td></tr>
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
                {t('connectors.opening_balance_row', { hours: hours(review.openingBalanceMh) })}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="caption" style={{ marginTop: 12 }}>{t('connectors.not_in_this_demo_credential_entry_and_rotation_t')}</p>
      </Section>
    </div>
  );
}

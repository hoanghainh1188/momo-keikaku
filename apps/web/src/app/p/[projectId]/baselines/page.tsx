import { getTranslations } from 'next-intl/server';
import { getProjectReview } from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { hours } from '@momo/domain/present';
import { Section } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** FR-15, FR-16: Baseline history. Re-baseline is not wired in the demo. */
export default async function BaselinesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const t = await getTranslations();
  const { projectId } = await params;
  const { bundle, review } = valueOrNotFound(await getProjectReview({ projectId }));
  return (
    <div className="sheet">
      <h1 className="report-title">{t('baselines.baselines')}</h1>
      <div className="report-sub">{t('baselines.a_baseline_is_never_edited_every_version_is_kept')}</div>
      <Section title={t('baselines.history')} id="baseline-history">
        <table className="ledger" data-testid="baseline-history">
          <thead>
            <tr>
              <th className="num">{t('baselines.seq')}</th>
              <th>{t('baselines.version')}</th>
              <th>{t('baselines.recorded')}</th>
              <th>{t('baselines.reason')}</th>
              <th className="num">{t('baselines.baselined_leaf_wps')}</th>
              <th className="num">{t('baselines.bac')}</th>
              <th>{t('baselines.active')}</th>
            </tr>
          </thead>
          <tbody>
            {bundle.input.baselineVersions.length === 0 ? (
              <tr data-testid="baseline-history-empty">
                <td colSpan={7} className="caption">{t('baselines.none_recorded')}</td>
              </tr>
            ) : null}
            {bundle.input.baselineVersions.map((b) => (
              <tr key={b.id}>
                <td className="num">{b.seq}</td>
                <td>{b.id}</td>
                <td>{b.recordedAt.slice(0, 10)}</td>
                <td>{b.reason}</td>
                <td className="num">{b.wps.filter((w) => w.baselineMh > 0n).length}</td>
                <td className="num">{hours(b.wps.reduce((total, w) => total + w.baselineMh, 0n))}h</td>
                <td>{b.seq === bundle.input.activeBaselineSeq ? <span className="tag done">{t('baselines.active_tag')}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="caption" style={{ marginTop: 12 }}>{t('baselines.whether_an_hour_counts_as_baselined_is_judged_ag')}</p>
        <p className="caption" data-testid="baselines-bac">
          {review.evm === null ? (
            <span className="tag">{t('review.no_baseline_yet')}</span>
          ) : (
            t('baselines.demo_not_wired', { bac: hours(review.evm.bacMh) })
          )}
        </p>
      </Section>
    </div>
  );
}

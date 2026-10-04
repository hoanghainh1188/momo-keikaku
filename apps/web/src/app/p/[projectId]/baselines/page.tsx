import { getTranslations } from 'next-intl/server';
import {
  baselineSetState,
  compareProjectBaselineVersions,
  getProjectReview,
  reBaselineState,
  requestContext,
} from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { hours } from '@momo/domain/present';
import { Section } from '@/components/ui';
import { SetBaselineButton } from '@/components/set-baseline-button';
import { ReBaselineControl } from '@/components/re-baseline-control';
import { BaselineComparePanel } from '@/components/baseline-compare';

export const dynamic = 'force-dynamic';

function parseVersionSeq(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** FR-15, FR-16: Baseline history with Set / Re-baseline / plan-level compare (story 4.4). */
export default async function BaselinesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ from?: string | string[]; to?: string | string[] }>;
}) {
  const t = await getTranslations();
  const { projectId } = await params;
  const query = await searchParams;
  const ctx = await requestContext();
  const [{ bundle, review }, baselineState, reState] = await Promise.all([
    getProjectReview({ projectId }, ctx).then(valueOrNotFound),
    baselineSetState(projectId, ctx).then(valueOrNotFound),
    reBaselineState(projectId, ctx).then(valueOrNotFound),
  ]);

  const versionSeqs = bundle.input.baselineVersions.map((b) => b.seq);
  const fromVersionSeq = parseVersionSeq(query.from);
  const toVersionSeq = parseVersionSeq(query.to);

  let compareResult = null;
  if (
    fromVersionSeq !== null &&
    toVersionSeq !== null &&
    fromVersionSeq !== toVersionSeq &&
    versionSeqs.includes(fromVersionSeq) &&
    versionSeqs.includes(toVersionSeq)
  ) {
    const compared = await compareProjectBaselineVersions(
      { projectId, fromVersionSeq, toVersionSeq },
      ctx,
    );
    if (compared.ok) compareResult = compared.value.compare;
  }

  return (
    <div className="sheet">
      <h1 className="report-title">{t('baselines.baselines')}</h1>
      <div className="report-sub">{t('baselines.a_baseline_is_never_edited_every_version_is_kept')}</div>
      <div style={{ marginTop: 12 }}>
        <SetBaselineButton
          projectId={projectId}
          canSet={baselineState.canSet}
          hasBaseline={baselineState.hasBaseline}
          notSchedulableCount={baselineState.notSchedulableCount}
          blockingWpIds={baselineState.blockingWpIds}
          exceptionsRailHref={baselineState.exceptionsRailHref}
          testId="baselines-set-baseline"
        />
        <ReBaselineControl
          testId="baselines-re-baseline"
          model={{
            projectId,
            canReBaseline: reState.canReBaseline,
            hasBaseline: reState.hasBaseline,
            notSchedulableCount: reState.notSchedulableCount,
            blockingWpIds: reState.blockingWpIds,
            exceptionsRailHref: reState.exceptionsRailHref,
            labels: {
              reBaseline: t('baselines.re_baseline'),
              reasonLabel: t('baselines.re_baseline_reason'),
              reasonPlaceholder: t('baselines.re_baseline_reason_placeholder'),
              reasonRequired: t('baselines.re_baseline_reason_required'),
              disabledTitle: t('baselines.re_baseline_disabled_title'),
              blocked: t('baselines.re_baseline_blocked'),
              notSchedulableLink: (count) => t('baselines.not_schedulable_link', { count }),
            },
          }}
        />
      </div>
      <Section title={t('baselines.history')} id="baseline-history">
        <table className="ledger" data-testid="baseline-history">
          <thead>
            <tr>
              <th className="num">{t('baselines.seq')}</th>
              <th>{t('baselines.version')}</th>
              <th>{t('baselines.author')}</th>
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
                <td colSpan={8} className="caption">{t('baselines.none_recorded')}</td>
              </tr>
            ) : null}
            {bundle.input.baselineVersions.map((b) => (
              <tr key={b.id} data-testid={`baseline-history-row-${b.seq}`}>
                <td className="num">{b.seq}</td>
                <td>{b.id}</td>
                <td data-testid={`baseline-history-author-${b.seq}`}>{b.actor}</td>
                <td>{b.recordedAt}</td>
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
            t('baselines.bac_with_active', { bac: hours(review.evm.bacMh) })
          )}
        </p>
      </Section>
      <BaselineComparePanel
        versionSeqs={versionSeqs}
        fromVersionSeq={fromVersionSeq}
        toVersionSeq={toVersionSeq}
        compare={compareResult}
        labels={{
          title: t('baselines.compare_title'),
          versionA: t('baselines.compare_version_a'),
          versionB: t('baselines.compare_version_b'),
          compare: t('baselines.compare_action'),
          needTwo: t('baselines.compare_need_two'),
          projectChanges: t('baselines.compare_project_changes'),
          noProjectChanges: t('baselines.compare_no_project_changes'),
          wpDates: t('baselines.compare_wp_dates'),
          noWpDates: t('baselines.compare_no_wp_dates'),
          wbs: t('baselines.compare_wbs'),
          wpId: t('baselines.compare_wp_id'),
          fromDates: t('baselines.compare_from_dates'),
          toDates: t('baselines.compare_to_dates'),
          accountedBy: t('baselines.compare_accounted_by'),
          unattributed: t('baselines.compare_unattributed'),
        }}
      />
    </div>
  );
}

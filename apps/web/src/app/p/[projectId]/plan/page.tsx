import { getTranslations } from 'next-intl/server';
import { getProjectReview } from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { hours, type Mh } from '@momo/domain/present';
import { Section } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * FR-5, FR-7: the Current Plan as a tree grid against the active Baseline.
 *
 * A Work Package carries no planned date (story 2.2): its dates here are the Baseline's and its
 * actual dates. The scheduler's derived dates, and the tree grid that shows them, arrive with
 * stories 2.5–2.13.
 */
export default async function PlanPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const t = await getTranslations();
  const em = t('common.em_dash');
  const { projectId } = await params;
  const { bundle, review: r } = valueOrNotFound(await getProjectReview({ projectId }));

  const baseline = bundle.baseline;
  const baselineByWp = new Map((baseline?.wps ?? []).map((b) => [b.wpId, b]));
  const acByWp = r.attribution.acByWp;

  // roll-ups (FR-5): summary WP effort comes from the children
  const children = new Map<string, typeof bundle.wps>();
  for (const w of bundle.wps) {
    if (!w.parentId) continue;
    children.set(w.parentId, [...(children.get(w.parentId) ?? []), w]);
  }
  const rollUp = (id: string): { mh: Mh; baselineMh: Mh; acMh: Mh } => {
    const kids = children.get(id) ?? [];
    let mh = 0n;
    let baselineMh = 0n;
    let acMh = 0n;
    for (const k of kids) {
      const sub = k.isLeaf
        ? {
            mh: k.plannedMh,
            baselineMh: baselineByWp.get(k.id)?.baselineMh ?? 0n,
            acMh: acByWp.get(k.id) ?? 0n,
          }
        : rollUp(k.id);
      mh += sub.mh;
      baselineMh += sub.baselineMh;
      acMh += sub.acMh;
    }
    return { mh, baselineMh, acMh };
  };

  const roots = bundle.wps.filter((w) => !w.parentId);

  return (
    <div className="sheet">
      <h1 className="report-title">{t('plan.plan_work_breakdown_structure')}</h1>
      <div className="report-sub">{t('plan.the_baseline_is_never_edited')}</div>
      <div className="report-sub" style={{ marginTop: 8 }} data-testid="active-baseline">
        {baseline === null || r.evm === null ? (
          <span className="tag">{t('review.no_baseline_yet')}</span>
        ) : (
          <>
            {t('plan.active_baseline')}
            <strong>{baseline.id}</strong>{' '}
            {t('plan.baseline_recorded', {
              date: bundle.meta.baselineRecordedAt.slice(0, 10),
              reason: bundle.meta.baselineReason,
              bac: hours(r.evm.bacMh),
              leafCount: baseline.wps.filter((b) => b.baselineMh > 0n).length,
            })}
          </>
        )}
      </div>

      <Section title={t('plan.tree_schedule')} id="wbs">
        <table className="ledger" data-testid="plan-tree">
          <thead>
            <tr>
              <th>{t('clientView.wbs')}</th>
              <th>{t('clientView.work_package')}</th>
              <th className="num">{t('plan.baseline_h')}</th>
              <th className="num">{t('plan.current_plan_h')}</th>
              <th className="num">{t('plan.actual_h')}</th>
              <th>{t('plan.baseline_dates')}</th>
              <th>{t('plan.actual_dates')}</th>
            </tr>
          </thead>
          <tbody>
            {roots.flatMap((root) => {
              const rows = [root, ...(children.get(root.id) ?? [])];
              return rows.map((w) => {
                const isSummary = !w.isLeaf;
                const b = baselineByWp.get(w.id);
                const agg = isSummary ? rollUp(w.id) : null;
                const baselineMh = agg ? agg.baselineMh : (b?.baselineMh ?? 0n);
                const plannedMh = agg ? agg.mh : w.plannedMh;
                const acMh = agg ? agg.acMh : (acByWp.get(w.id) ?? 0n);
                // A leaf's actual dates; a summary's would be a roll-up, which is the scheduler's.
                const actualStart = isSummary ? null : w.actualStart;
                const actualFinish = isSummary ? null : w.actualFinish;
                // Late: finished after the Baseline finish, or a milestone not reached by it.
                const late = Boolean(
                  b &&
                    ((actualFinish && actualFinish > b.finish) ||
                      (w.isMilestone && !actualFinish && bundle.input.asOf > b.finish)),
                );
                return (
                  <tr key={w.id} data-testid={`wp-${w.wbsCode}`}>
                    <td style={{ fontWeight: isSummary ? 600 : 400 }}>{w.wbsCode}</td>
                    <td
                      style={{
                        paddingLeft: isSummary ? 8 : 24,
                        fontWeight: isSummary ? 600 : 400,
                      }}
                    >
                      {w.name}
                      {w.isCatchAll ? <span className="tag">{t('plan.catch_all_loe')}</span> : null}
                      {w.isMilestone ? <span className="tag">{t('plan.milestone')}</span> : null}
                      {!b && w.isLeaf ? <span className="tag unplanned">{t('plan.non_baselined')}</span> : null}
                    </td>
                    <td className="num">{baselineMh !== 0n ? hours(baselineMh) : em}</td>
                    <td className="num">{plannedMh !== 0n ? hours(plannedMh) : em}</td>
                    <td className="num">{acMh !== 0n ? hours(acMh) : em}</td>
                    <td className="caption">
                      {b ? `${b.start} → ${b.finish}` : em}
                    </td>
                    <td className="caption" style={late ? { color: 'var(--health-amber)' } : undefined}>
                      {actualStart || actualFinish ? `${actualStart ?? em} → ${actualFinish ?? em}` : em}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
        <p className="caption" style={{ marginTop: 12 }}>{t('plan.summary_rows_roll_up_effort')}</p>
      </Section>
    </div>
  );
}

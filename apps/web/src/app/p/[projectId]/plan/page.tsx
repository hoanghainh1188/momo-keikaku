import { getTranslations } from 'next-intl/server';
import {
  NO_PROJECT_START_YET,
  baselineSetState,
  planGridState,
  proposedCompleteFinish,
  requestContext,
} from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { PlanTreeGrid } from '@/components/plan-tree-grid';
import { toPlanGridViewModel } from '@/lib/plan-grid-view';

export const dynamic = 'force-dynamic';

/**
 * FR-5, FR-7: Plan ARIA treegrid with Schedule / Progress presets (story 2.13).
 * Strip + What-moved (story 2.15). Exceptions rail (2.16). Set Baseline (4.1).
 */
export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations();
  const { projectId } = await params;
  const query = await searchParams;
  const exceptionsParam = query.exceptions;
  const openExceptions =
    exceptionsParam === 'not_schedulable' ||
    (Array.isArray(exceptionsParam) && exceptionsParam.includes('not_schedulable'));
  const ctx = await requestContext();
  const [grid, baselineState] = await Promise.all([
    planGridState(projectId, ctx).then(valueOrNotFound),
    baselineSetState(projectId, ctx).then(valueOrNotFound),
  ]);
  const proposedFinish = proposedCompleteFinish(grid.tzOffsetMinutes);
  const model = toPlanGridViewModel(grid, ctx.userId);

  return (
    <div className="sheet plan-sheet">
      <h1 className="report-title">{t('plan.plan_work_breakdown_structure')}</h1>
      <div className="report-sub">
        Current Plan schedule — derived dates, Float, Critical, and progress.
      </div>
      {grid.dataDate !== null ? (
        <div className="report-sub" style={{ marginTop: 8 }} data-testid="plan-data-date">
          Data Date {grid.dataDate}
          {grid.computedFinish ? ` · Computed finish ${grid.computedFinish}` : ''}
        </div>
      ) : null}
      {grid.projectStart === null ? (
        <span className="sr-only" aria-label={NO_PROJECT_START_YET}>
          {NO_PROJECT_START_YET}
        </span>
      ) : null}
      <PlanTreeGrid
        model={model}
        proposedFinish={proposedFinish}
        openExceptionsOnMount={openExceptions}
        setBaseline={{
          projectId,
          canSet: baselineState.canSet,
          hasBaseline: baselineState.hasBaseline,
          notSchedulableCount: baselineState.notSchedulableCount,
          blockingWpIds: baselineState.blockingWpIds,
          exceptionsRailHref: baselineState.exceptionsRailHref,
          labels: {
            setBaseline: t('baselines.set_baseline'),
            disabledTitle: t('baselines.set_disabled_title'),
            blocked: t('baselines.set_blocked'),
            notSchedulableLink: (count) =>
              t('baselines.not_schedulable_link', { count }),
          },
        }}
      />
    </div>
  );
}

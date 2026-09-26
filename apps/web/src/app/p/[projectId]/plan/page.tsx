import { getTranslations } from 'next-intl/server';
import {
  NO_PROJECT_START_YET,
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
 * Strip + What-moved (story 2.15). Exceptions rail → 2.16.
 */
export default async function PlanPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const t = await getTranslations();
  const { projectId } = await params;
  const ctx = await requestContext();
  const grid = valueOrNotFound(await planGridState(projectId, ctx));
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
      <PlanTreeGrid model={model} proposedFinish={proposedFinish} />
    </div>
  );
}

import { getTranslations } from 'next-intl/server';
import {
  planThinUiState,
  PROJECT_FINISH_TEACHING,
  proposedCompleteFinish,
} from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { ProjectScheduleSettingsForm } from '@/components/project-schedule-settings';

export const dynamic = 'force-dynamic';

/**
 * Story 2.11 (Q1→B) + 2.12 (Q2→A): Project settings for schedule fields and Holiday Calendar.
 * Layout matches Mapping / Connectors: one `.sheet`, report title, then `Section` blocks.
 */
export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const t = await getTranslations();
  const { projectId } = await params;
  const thin = valueOrNotFound(await planThinUiState(projectId));
  const proposedToday = proposedCompleteFinish(thin.tzOffsetMinutes);

  return (
    <div className="sheet">
      <h1 className="report-title">{t('shell.surfaces.settings.title')}</h1>
      <div className="report-sub">
        Project start, Project finish, Data Date, and Holiday Calendar for this Project.
      </div>
      <ProjectScheduleSettingsForm
        projectId={projectId}
        projectStart={thin.projectStart}
        projectFinish={thin.projectFinish}
        dataDate={thin.dataDate}
        calendarJp={thin.calendarJp}
        calendarVn={thin.calendarVn}
        projectNonWorkingDays={thin.projectNonWorkingDays}
        remainingLeafCount={thin.remainingLeafCount}
        finishTeaching={PROJECT_FINISH_TEACHING}
        proposedToday={proposedToday}
      />
    </div>
  );
}

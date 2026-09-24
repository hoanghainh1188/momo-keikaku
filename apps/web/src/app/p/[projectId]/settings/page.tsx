import { getTranslations } from 'next-intl/server';
import {
  getProjectHeader,
  planThinUiState,
  PROJECT_FINISH_TEACHING,
  proposedCompleteFinish,
} from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { Section } from '@/components/ui';
import { ProjectScheduleSettingsForm } from '@/components/project-schedule-settings';

export const dynamic = 'force-dynamic';

/**
 * Story 2.11 (Q1→B): Project settings for the three schedule fields.
 * Full schedule-strip chrome stays 2.15.
 */
export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const t = await getTranslations();
  const { projectId } = await params;
  const header = valueOrNotFound(await getProjectHeader({ projectId }));
  const thin = valueOrNotFound(await planThinUiState(projectId));
  const proposedToday = proposedCompleteFinish(thin.tzOffsetMinutes);

  return (
    <div className="sheet">
      <h1 className="report-title">{t('shell.surfaces.settings.label')}</h1>
      <div className="report-sub">
        {header.project.name} — Project start, Project finish, Data Date
      </div>
      <Section title="Schedule settings" id="schedule-settings">
        <ProjectScheduleSettingsForm
          projectId={projectId}
          projectStart={thin.projectStart}
          projectFinish={thin.projectFinish}
          dataDate={thin.dataDate}
          remainingLeafCount={thin.remainingLeafCount}
          finishTeaching={PROJECT_FINISH_TEACHING}
          proposedToday={proposedToday}
        />
      </Section>
    </div>
  );
}

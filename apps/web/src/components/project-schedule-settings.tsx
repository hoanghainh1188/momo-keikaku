'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  clearProjectStartAction,
  patchDataDateAction,
  patchProjectFinishAction,
  setProjectStartAction,
  type SettingsWriteOutcome,
} from '@/app/p/[projectId]/settings/actions';

function refuseMessage(outcome: Extract<SettingsWriteOutcome, { ok: false }>): string {
  if (outcome.details !== undefined) {
    const parts = Object.entries(outcome.details).map(
      ([key, values]) => `${key}: ${values.join(', ')}`,
    );
    if (parts.length > 0) return parts.join('; ');
  }
  return outcome.messageKey;
}

/** Client-side mirror of `dataDateAdvancePreview` so the sentence tracks the picker. */
function advancePreviewFor(dataDate: string, remainingCount: number): string {
  const [, m, d] = dataDate.split('-').map(Number);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const label = `${d} ${months[(m ?? 1) - 1] ?? 'Jan'}`;
  return `Advancing to ${label} re-dates ${remainingCount} remaining work packages`;
}

/**
 * Story 2.11 Project settings (Q1→B): the three schedule settings with teaching confirms.
 * Full schedule-strip chrome stays 2.15.
 */
export function ProjectScheduleSettingsForm({
  projectId,
  projectStart,
  projectFinish,
  dataDate,
  remainingLeafCount,
  finishTeaching,
  proposedToday,
}: {
  readonly projectId: string;
  readonly projectStart: string | null;
  readonly projectFinish: string | null;
  readonly dataDate: string | null;
  readonly remainingLeafCount: number;
  readonly finishTeaching: string;
  readonly proposedToday: string;
}) {
  const [pending, start] = useTransition();
  const [refuse, setRefuse] = useState<string | null>(null);
  const [finishConfirmed, setFinishConfirmed] = useState(false);
  const [startValue, setStartValue] = useState(projectStart ?? proposedToday);
  const [finishValue, setFinishValue] = useState(projectFinish ?? '');
  const [dataDateValue, setDataDateValue] = useState(dataDate ?? proposedToday);

  // After revalidatePath, props change — resync controlled inputs (BH10).
  useEffect(() => {
    setStartValue(projectStart ?? proposedToday);
  }, [projectStart, proposedToday]);
  useEffect(() => {
    setFinishValue(projectFinish ?? '');
  }, [projectFinish]);
  useEffect(() => {
    setDataDateValue(dataDate ?? proposedToday);
  }, [dataDate, proposedToday]);

  const liveAdvancePreview = advancePreviewFor(
    dataDateValue || proposedToday,
    remainingLeafCount,
  );
  const hasStart = projectStart !== null;

  return (
    <div className="sheet" data-testid="project-schedule-settings">
      {refuse !== null ? (
        <p className="caption" role="alert" data-testid="settings-refuse">
          {refuse}
        </p>
      ) : null}

      <section style={{ marginBottom: 24 }}>
        <h2 className="report-sub">Project start</h2>
        {projectStart === null ? (
          <p className="caption" data-testid="settings-no-start">
            no project start yet
          </p>
        ) : (
          <p className="caption">
            Current: <strong>{projectStart}</strong>
          </p>
        )}
        <form
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}
          action={(fd) => {
            start(async () => {
              setRefuse(null);
              const outcome = await setProjectStartAction(fd);
              if (!outcome.ok) setRefuse(refuseMessage(outcome));
            });
          }}
        >
          <input type="hidden" name="projectId" value={projectId} />
          <label>
            Set Project start{' '}
            <input
              type="date"
              name="projectStart"
              value={startValue}
              onChange={(e) => setStartValue(e.target.value)}
              required
              data-testid="settings-project-start"
            />
          </label>
          <button type="submit" disabled={pending}>
            Set Project start
          </button>
        </form>
        {projectStart !== null ? (
          <form
            style={{ marginTop: 8 }}
            action={(fd) => {
              start(async () => {
                setRefuse(null);
                const outcome = await clearProjectStartAction(fd);
                if (!outcome.ok) setRefuse(refuseMessage(outcome));
              });
            }}
          >
            <input type="hidden" name="projectId" value={projectId} />
            <button type="submit" disabled={pending} data-testid="settings-clear-start">
              Clear Project start
            </button>
          </form>
        ) : null}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 className="report-sub">Project finish</h2>
        <p className="caption">
          Current: <strong>{projectFinish ?? 'not set'}</strong>
        </p>
        <p className="caption" data-testid="finish-teaching">
          {finishTeaching}
        </p>
        {!hasStart ? (
          <p className="caption">Set Project start before editing Project finish.</p>
        ) : null}
        <label className="caption" style={{ display: 'block', marginTop: 8 }}>
          <input
            type="checkbox"
            checked={finishConfirmed}
            onChange={(e) => setFinishConfirmed(e.target.checked)}
            data-testid="finish-confirm"
            disabled={!hasStart}
          />{' '}
          I understand — this moves no work package
        </label>
        <form
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}
          action={(fd) => {
            start(async () => {
              setRefuse(null);
              const outcome = await patchProjectFinishAction(fd);
              if (!outcome.ok) setRefuse(refuseMessage(outcome));
              else setFinishConfirmed(false);
            });
          }}
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="confirmed" value={finishConfirmed ? '1' : '0'} />
          <label>
            Project finish{' '}
            <input
              type="date"
              name="projectFinish"
              value={finishValue}
              onChange={(e) => setFinishValue(e.target.value)}
              required
              data-testid="settings-project-finish"
              disabled={!hasStart}
            />
          </label>
          <button type="submit" disabled={pending || !finishConfirmed || !hasStart || !finishValue}>
            Set Project finish
          </button>
        </form>
        <form
          style={{ marginTop: 8 }}
          action={(fd) => {
            start(async () => {
              setRefuse(null);
              const outcome = await patchProjectFinishAction(fd);
              if (!outcome.ok) setRefuse(refuseMessage(outcome));
              else setFinishConfirmed(false);
            });
          }}
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="projectFinish" value="" />
          <input type="hidden" name="confirmed" value={finishConfirmed ? '1' : '0'} />
          <button
            type="submit"
            disabled={pending || !finishConfirmed || !hasStart || projectFinish === null}
            data-testid="settings-clear-finish"
          >
            Clear Project finish
          </button>
        </form>
      </section>

      <section>
        <h2 className="report-sub">Data Date</h2>
        <p className="caption">
          Current: <strong>{dataDate ?? 'not set'}</strong>
        </p>
        <p className="caption" data-testid="data-date-advance-preview">
          {liveAdvancePreview}
        </p>
        <p className="caption">
          Remaining work packages (no actual finish): {remainingLeafCount}
        </p>
        <form
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}
          action={(fd) => {
            start(async () => {
              setRefuse(null);
              const outcome = await patchDataDateAction(fd);
              if (!outcome.ok) setRefuse(refuseMessage(outcome));
            });
          }}
        >
          <input type="hidden" name="projectId" value={projectId} />
          <label>
            Advance Data Date to{' '}
            <input
              type="date"
              name="dataDate"
              value={dataDateValue}
              onChange={(e) => setDataDateValue(e.target.value)}
              required
              data-testid="settings-data-date"
              disabled={!hasStart}
            />
          </label>
          <button type="submit" disabled={pending || !hasStart}>
            Advance Data Date
          </button>
        </form>
      </section>
    </div>
  );
}

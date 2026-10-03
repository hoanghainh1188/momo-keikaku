'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import {
  clearProjectStartStripAction,
  patchDataDateStripAction,
  patchProjectFinishStripAction,
  setProjectStartStripAction,
  type PlanWriteOutcome,
} from '@/app/p/[projectId]/plan/actions';
import { planWriteRefuseMessage } from '@/lib/plan-write-refuse';
import { formatMinFloat, formatPlanDate } from '@momo/domain/present';
import { PLAN_GRID_SLOTS } from '@/lib/plan-grid-view';

export interface PlanScheduleStripProps {
  readonly projectId: string;
  readonly projectStart: string | null;
  readonly projectFinish: string | null;
  readonly dataDate: string | null;
  readonly computedFinish: string | null;
  readonly minFloat: number | null;
  readonly floatAnchorSentence: string | null;
  readonly finishTeaching: string;
  readonly proposedToday: string;
  readonly onRecalcSettled: (outcome: Extract<PlanWriteOutcome, { ok: true }>) => void;
  readonly onRefuse: (message: string) => void;
  readonly onPendingChange: (pending: boolean) => void;
}

/**
 * Sticky schedule strip (UX-DR5) — Project settings inline via fence kinds.
 * Data Date is date-edit only (Q2→A); no advance-to-period CTA.
 */
export function PlanScheduleStrip({
  projectId,
  projectStart,
  projectFinish,
  dataDate,
  computedFinish,
  minFloat,
  floatAnchorSentence,
  finishTeaching,
  proposedToday,
  onRecalcSettled,
  onRefuse,
  onPendingChange,
}: PlanScheduleStripProps) {
  const [pending, start] = useTransition();
  const [startValue, setStartValue] = useState(projectStart ?? proposedToday);
  const [finishValue, setFinishValue] = useState(projectFinish ?? '');
  const [dataDateValue, setDataDateValue] = useState(dataDate ?? proposedToday);
  const [finishConfirmed, setFinishConfirmed] = useState(false);
  const [editing, setEditing] = useState<'start' | 'finish' | 'dataDate' | null>(null);
  const finishConfirmId = useId();
  const dataDateInputId = 'plan-strip-data-date';

  useEffect(() => {
    setStartValue(projectStart ?? proposedToday);
  }, [projectStart, proposedToday]);
  useEffect(() => {
    setFinishValue(projectFinish ?? '');
  }, [projectFinish]);
  useEffect(() => {
    setDataDateValue(dataDate ?? proposedToday);
  }, [dataDate, proposedToday]);

  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);

  const cancelEdit = () => {
    setEditing(null);
    setFinishConfirmed(false);
  };

  const run = (fn: () => Promise<PlanWriteOutcome>) => {
    start(async () => {
      const outcome = await fn();
      if (!outcome.ok) {
        onRefuse(planWriteRefuseMessage(outcome));
        return;
      }
      setEditing(null);
      setFinishConfirmed(false);
      onRecalcSettled(outcome);
    });
  };

  const minFloatText = formatMinFloat(minFloat);
  const minFloatNegative = minFloat !== null && minFloat < 0;

  return (
    <div
      className="plan-schedule-strip"
      data-testid={PLAN_GRID_SLOTS[0]}
      role="region"
      aria-label="Schedule strip"
    >
      <div className="plan-strip-cell">
        <span className="plan-strip-label">Project start</span>
        {editing === 'start' ? (
          <form
            className="plan-strip-edit"
            onSubmit={(e) => {
              e.preventDefault();
              run(() =>
                setProjectStartStripAction({ projectId, projectStart: startValue }),
              );
            }}
          >
            <input
              type="date"
              value={startValue}
              onChange={(e) => setStartValue(e.target.value)}
              required
              data-testid="strip-project-start"
              disabled={pending}
            />
            <button type="submit" disabled={pending}>
              Set
            </button>
            {projectStart !== null ? (
              <button
                type="button"
                disabled={pending}
                data-testid="strip-clear-start"
                onClick={() => run(() => clearProjectStartStripAction({ projectId }))}
              >
                Clear
              </button>
            ) : null}
            <button type="button" onClick={cancelEdit} disabled={pending}>
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            className={`plan-strip-value ${projectStart === null ? 'plan-strip-notset' : ''}`}
            data-testid="strip-project-start-display"
            onClick={() => setEditing('start')}
          >
            {projectStart ? formatPlanDate(projectStart) : 'not set'}
          </button>
        )}
      </div>

      <div className="plan-strip-cell">
        <span className="plan-strip-label">Project finish</span>
        {editing === 'finish' ? (
          <form
            className="plan-strip-edit"
            onSubmit={(e) => {
              e.preventDefault();
              if (!finishConfirmed) {
                onRefuse('Confirm that this moves no work package before changing Project finish');
                return;
              }
              run(() =>
                patchProjectFinishStripAction({
                  projectId,
                  projectFinish: finishValue === '' ? null : finishValue,
                  confirmed: true,
                }),
              );
            }}
          >
            <p className="plan-strip-teaching" data-testid="strip-finish-teaching">
              {finishTeaching}
            </p>
            <label className="plan-strip-confirm">
              <input
                type="checkbox"
                checked={finishConfirmed}
                onChange={(e) => setFinishConfirmed(e.target.checked)}
                data-testid="strip-finish-confirm"
                id={finishConfirmId}
                disabled={pending || projectStart === null}
              />{' '}
              I understand — this moves no work package
            </label>
            <input
              type="date"
              value={finishValue}
              onChange={(e) => setFinishValue(e.target.value)}
              data-testid="strip-project-finish"
              disabled={pending || projectStart === null}
            />
            <button
              type="submit"
              disabled={pending || !finishConfirmed || projectStart === null}
            >
              Set
            </button>
            <button
              type="button"
              data-testid="strip-clear-finish"
              disabled={pending || !finishConfirmed || projectFinish === null}
              onClick={() => {
                if (!finishConfirmed) {
                  onRefuse(
                    'Confirm that this moves no work package before changing Project finish',
                  );
                  return;
                }
                run(() =>
                  patchProjectFinishStripAction({
                    projectId,
                    projectFinish: null,
                    confirmed: true,
                  }),
                );
              }}
            >
              Clear
            </button>
            <button type="button" onClick={cancelEdit} disabled={pending}>
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            className={`plan-strip-value ${projectFinish === null ? 'plan-strip-notset' : ''}`}
            data-testid="strip-project-finish-display"
            onClick={() => setEditing('finish')}
          >
            {projectFinish ? formatPlanDate(projectFinish) : 'not set'}
          </button>
        )}
      </div>

      <div className="plan-strip-cell">
        <span className="plan-strip-label">Data Date</span>
        {editing === 'dataDate' ? (
          <form
            className="plan-strip-edit"
            onSubmit={(e) => {
              e.preventDefault();
              run(() =>
                patchDataDateStripAction({ projectId, dataDate: dataDateValue }),
              );
            }}
          >
            <input
              id={dataDateInputId}
              type="date"
              value={dataDateValue}
              onChange={(e) => setDataDateValue(e.target.value)}
              required
              data-testid="strip-data-date"
              disabled={pending || projectStart === null}
            />
            <button type="submit" disabled={pending || projectStart === null}>
              Set
            </button>
            <button type="button" onClick={cancelEdit} disabled={pending}>
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="plan-strip-value"
            id={dataDateInputId}
            data-testid="strip-data-date-display"
            onClick={() => setEditing('dataDate')}
          >
            {dataDate ? formatPlanDate(dataDate) : '—'}
          </button>
        )}
      </div>

      <div className="plan-strip-cell">
        <span className="plan-strip-label">Computed finish</span>
        <span className="plan-strip-value" data-testid="strip-computed-finish">
          {computedFinish ? formatPlanDate(computedFinish) : '—'}
        </span>
      </div>

      <div className="plan-strip-cell">
        <span className="plan-strip-label">Min Float</span>
        <span
          className={`plan-strip-value ${minFloatNegative ? 'plan-float-neg' : ''}`}
          data-testid="strip-min-float"
        >
          {minFloatText}
          {minFloat !== null ? <span className="plan-u">d</span> : null}
        </span>
      </div>

      {floatAnchorSentence ? (
        <div className="plan-strip-anchor" data-testid="strip-float-anchor">
          {floatAnchorSentence}
        </div>
      ) : (
        <div className="plan-strip-anchor" data-testid="strip-float-anchor">
          —
        </div>
      )}
    </div>
  );
}

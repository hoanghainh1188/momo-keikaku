'use client';

import { useState, useTransition } from 'react';
import { setBaselineAction } from '@/app/p/[projectId]/baselines/actions';
import { planWriteRefuseMessage } from '@/lib/plan-write-refuse';

/**
 * Ready-path Set Baseline form for Review / Baselines (retro F9).
 * Thin client wrapper so writeLanded refuse surfaces without converting the whole
 * server button; Plan toolbar uses SetBaselineControl instead.
 */
export function SetBaselineReadyForm({
  projectId,
  label,
  testId = 'set-baseline',
}: {
  readonly projectId: string;
  readonly label: string;
  readonly testId?: string;
}) {
  const [pending, start] = useTransition();
  const [refuse, setRefuse] = useState<string | null>(null);
  return (
    <div className="stack" style={{ gap: 4 }}>
      <form
        className="btn-row"
        data-testid={testId}
        action={(fd) => {
          start(async () => {
            setRefuse(null);
            const outcome = await setBaselineAction(fd);
            if (!outcome.ok) setRefuse(planWriteRefuseMessage(outcome));
          });
        }}
      >
        <input type="hidden" name="projectId" value={projectId} />
        <button type="submit" className="btn primary" disabled={pending}>
          {label}
        </button>
      </form>
      {refuse !== null ? (
        <p className="caption" role="alert" data-testid={`${testId}-refuse`}>
          {refuse}
        </p>
      ) : null}
    </div>
  );
}

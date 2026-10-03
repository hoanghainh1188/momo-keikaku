'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { setBaselineAction } from '@/app/p/[projectId]/baselines/actions';

export type SetBaselineControlModel = {
  readonly projectId: string;
  readonly canSet: boolean;
  readonly hasBaseline: boolean;
  readonly notSchedulableCount: number;
  readonly exceptionsRailHref: string;
  readonly labels: {
    readonly setBaseline: string;
    readonly disabledTitle: string;
    readonly blocked: string;
    readonly notSchedulableLink: string;
  };
};

/**
 * Client *Set Baseline* control for the Plan toolbar (story 4.1). Server pages use
 * `SetBaselineButton` instead.
 */
export function SetBaselineControl({
  model,
  testId = 'plan-set-baseline',
}: {
  readonly model: SetBaselineControlModel;
  readonly testId?: string;
}) {
  const [pending, start] = useTransition();
  if (model.hasBaseline) return null;

  if (!model.canSet) {
    return (
      <div className="btn-row" data-testid={`${testId}-disabled`} style={{ marginLeft: 8 }}>
        <button
          type="button"
          className="btn"
          disabled
          title={model.labels.disabledTitle}
        >
          {model.labels.setBaseline}
        </button>
        {model.notSchedulableCount > 0 ? (
          <Link
            className="caption"
            href={model.exceptionsRailHref}
            data-testid={`${testId}-exceptions-link`}
          >
            {model.labels.notSchedulableLink}
          </Link>
        ) : (
          <span className="caption" data-testid={`${testId}-blocked`}>
            {model.labels.blocked}
          </span>
        )}
      </div>
    );
  }

  return (
    <form
      className="btn-row"
      style={{ marginLeft: 8 }}
      data-testid={testId}
      action={(fd) => {
        start(() => {
          void setBaselineAction(fd);
        });
      }}
    >
      <input type="hidden" name="projectId" value={model.projectId} />
      <button type="submit" className="btn primary" disabled={pending}>
        {model.labels.setBaseline}
      </button>
    </form>
  );
}

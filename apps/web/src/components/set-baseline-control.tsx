'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { setBaselineAction } from '@/app/p/[projectId]/baselines/actions';
import { setBaselineDisabledView } from '@/lib/set-baseline-ui';

export type SetBaselineControlModel = {
  readonly projectId: string;
  readonly canSet: boolean;
  readonly hasBaseline: boolean;
  readonly notSchedulableCount: number;
  readonly blockingWpIds: readonly string[];
  readonly exceptionsRailHref: string;
  readonly labels: {
    readonly setBaseline: string;
    readonly disabledTitle: string;
    readonly blocked: string;
    readonly notSchedulableLink: (count: number) => string;
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
  const view = setBaselineDisabledView({
    hasBaseline: model.hasBaseline,
    canSet: model.canSet,
    notSchedulableCount: model.notSchedulableCount,
    blockingWpIdsLength: model.blockingWpIds.length,
    exceptionsRailHref: model.exceptionsRailHref,
  });
  if (view.kind === 'hidden') return null;

  if (view.kind !== 'ready') {
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
        {view.kind === 'link' ? (
          <Link
            className="caption"
            href={view.href}
            data-testid={`${testId}-exceptions-link`}
          >
            {model.labels.notSchedulableLink(view.count)}
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

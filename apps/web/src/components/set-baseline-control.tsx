'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  setBaselineAction,
  type BaselineWriteOutcome,
} from '@/app/p/[projectId]/baselines/actions';
import { planWriteRefuseMessage } from '@/lib/plan-write-refuse';
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

function refuseText(outcome: Extract<BaselineWriteOutcome, { ok: false }>): string {
  return planWriteRefuseMessage(outcome);
}

/**
 * Client *Set Baseline* control for the Plan toolbar (story 4.1 + retro F9).
 * Review / Baselines use `SetBaselineButton` → `SetBaselineReadyForm` instead.
 * Awaits BaselineWriteOutcome and shows an inline refuse — no silent no-op.
 */
export function SetBaselineControl({
  model,
  testId = 'plan-set-baseline',
}: {
  readonly model: SetBaselineControlModel;
  readonly testId?: string;
}) {
  const [pending, start] = useTransition();
  const [refuse, setRefuse] = useState<string | null>(null);
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
    <div className="stack" style={{ marginLeft: 8, gap: 4 }}>
      <form
        className="btn-row"
        data-testid={testId}
        action={(fd) => {
          start(async () => {
            setRefuse(null);
            const outcome = await setBaselineAction(fd);
            if (!outcome.ok) setRefuse(refuseText(outcome));
          });
        }}
      >
        <input type="hidden" name="projectId" value={model.projectId} />
        <button type="submit" className="btn primary" disabled={pending}>
          {model.labels.setBaseline}
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

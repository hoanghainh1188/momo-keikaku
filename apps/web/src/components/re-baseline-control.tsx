'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  reBaselineAction,
  type BaselineWriteOutcome,
} from '@/app/p/[projectId]/baselines/actions';
import { planWriteRefuseMessage } from '@/lib/plan-write-refuse';
import { reBaselineDisabledView } from '@/lib/re-baseline-ui';

export type ReBaselineControlModel = {
  readonly projectId: string;
  readonly canReBaseline: boolean;
  readonly hasBaseline: boolean;
  readonly notSchedulableCount: number;
  readonly blockingWpIds: readonly string[];
  readonly exceptionsRailHref: string;
  readonly labels: {
    readonly reBaseline: string;
    readonly reasonLabel: string;
    readonly reasonPlaceholder: string;
    readonly reasonRequired: string;
    readonly disabledTitle: string;
    readonly blocked: string;
    readonly notSchedulableLink: (count: number) => string;
  };
};

function refuseText(outcome: Extract<BaselineWriteOutcome, { ok: false }>): string {
  return planWriteRefuseMessage(outcome);
}

/**
 * Client *Re-baseline* control with mandatory free-text reason (story 4.3, FR-16 + retro F9).
 * Awaits BaselineWriteOutcome and shows an inline refuse — no silent no-op.
 */
export function ReBaselineControl({
  model,
  testId = 're-baseline',
}: {
  readonly model: ReBaselineControlModel;
  readonly testId?: string;
}) {
  const [pending, start] = useTransition();
  const [refuse, setRefuse] = useState<string | null>(null);
  const view = reBaselineDisabledView({
    hasBaseline: model.hasBaseline,
    canReBaseline: model.canReBaseline,
    notSchedulableCount: model.notSchedulableCount,
    blockingWpIdsLength: model.blockingWpIds.length,
    exceptionsRailHref: model.exceptionsRailHref,
  });
  if (view.kind === 'hidden') return null;

  if (view.kind !== 'ready') {
    return (
      <div className="btn-row" data-testid={`${testId}-disabled`} style={{ marginTop: 8 }}>
        <button
          type="button"
          className="btn"
          disabled
          title={model.labels.disabledTitle}
        >
          {model.labels.reBaseline}
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
      className="stack"
      style={{ marginTop: 8, gap: 8, maxWidth: 480 }}
      data-testid={testId}
      onSubmit={(e) => {
        const reason = e.currentTarget.elements.namedItem('reason');
        if (!(reason instanceof HTMLTextAreaElement)) return;
        if (reason.value.trim() === '') {
          e.preventDefault();
          reason.setCustomValidity(model.labels.reasonRequired);
          reason.reportValidity();
          return;
        }
        reason.setCustomValidity('');
      }}
      action={(fd) => {
        start(async () => {
          setRefuse(null);
          const outcome = await reBaselineAction(fd);
          if (!outcome.ok) setRefuse(refuseText(outcome));
        });
      }}
    >
      <input type="hidden" name="projectId" value={model.projectId} />
      <label className="stack" style={{ gap: 4 }}>
        <span className="caption">{model.labels.reasonLabel}</span>
        <textarea
          name="reason"
          required
          rows={2}
          placeholder={model.labels.reasonPlaceholder}
          data-testid={`${testId}-reason`}
          title={model.labels.reasonRequired}
          onInput={(e) => {
            e.currentTarget.setCustomValidity('');
          }}
        />
      </label>
      <div className="btn-row">
        <button type="submit" className="btn primary" disabled={pending}>
          {model.labels.reBaseline}
        </button>
      </div>
      {refuse !== null ? (
        <p className="caption" role="alert" data-testid={`${testId}-refuse`}>
          {refuse}
        </p>
      ) : null}
    </form>
  );
}

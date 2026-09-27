import type {
  PlanExceptionsRailView,
  PlanGridViewModel,
  WhatMovedBandView,
} from '@/components/plan-grid-types';

/** Success payload after a plan write + re-read (story 2.15 / 2.16). */
export type PlanWriteSuccess = {
  readonly ok: true;
  readonly whatMoved: WhatMovedBandView | null;
  readonly exceptions: PlanExceptionsRailView;
  readonly scheduleStale: boolean;
  readonly haltedReason: string | null;
  readonly projectStart: string | null;
  readonly projectFinish: string | null;
  readonly dataDate: string | null;
  readonly computedFinish: string | null;
  readonly minFloat: number | null;
  readonly floatAnchorSentence: string | null;
};

export type PlanWriteRefuse = {
  readonly ok: false;
  readonly code: string;
  readonly messageKey: string;
  readonly details?: Readonly<Record<string, readonly string[]>>;
};

/** Map a successful plan-grid view into the client settle payload. */
export function toPlanWriteSuccess(view: PlanGridViewModel): PlanWriteSuccess {
  return {
    ok: true,
    whatMoved: view.whatMoved,
    exceptions: view.exceptions,
    scheduleStale: view.scheduleStale,
    haltedReason: view.haltedReason,
    projectStart: view.projectStart,
    projectFinish: view.projectFinish,
    dataDate: view.dataDate,
    computedFinish: view.computedFinish,
    minFloat: view.minFloat,
    floatAnchorSentence: view.floatAnchorSentence,
  };
}

/**
 * Write succeeded but the follow-up grid read failed — refuse so the client keeps
 * prior strip/What-moved state instead of claiming empty success.
 */
export function readAfterWriteRefuse(): PlanWriteRefuse {
  return {
    ok: false,
    code: 'read_after_write',
    messageKey: 'errors.read_after_write',
    details: {
      refuse: ['Schedule updated, but the Plan could not be re-read. Refresh to see what moved.'],
    },
  };
}

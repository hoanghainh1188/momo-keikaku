import type { PlanGridState } from '@momo/app';
import type { PlanGridRowView, PlanGridViewModel } from '@/components/plan-grid-types';

/** Map authorised plan-grid state → client props (BigInt → string). */
export function toPlanGridViewModel(
  grid: PlanGridState,
  userId: string,
): PlanGridViewModel {
  const rows: PlanGridRowView[] = grid.rows.map((r) => ({
    wpId: r.wpId,
    wbsCode: r.wbsCode,
    name: r.name,
    parentId: r.parentId,
    isLeaf: r.isLeaf,
    isMilestone: r.isMilestone,
    isCatchAll: r.isCatchAll,
    level: r.level,
    posInSet: r.posInSet,
    setSize: r.setSize,
    hasChildren: r.hasChildren,
    durationDays: r.durationDays,
    constraintType: r.constraintType,
    constraintDate: r.constraintDate,
    constraintLabel: r.constraintLabel,
    predecessorsText: r.predecessorsText,
    predecessorEdges: r.predecessorEdges.map((e) => ({
      predecessorWpId: e.predecessorWpId,
      lagDays: e.lagDays,
    })),
    earlyStart: r.earlyStart,
    earlyFinish: r.earlyFinish,
    floatDays: r.floatDays,
    isCritical: r.isCritical,
    state: r.state,
    notSchedulable: r.notSchedulable,
    actualStart: r.actualStart,
    actualFinish: r.actualFinish,
    recordedPct:
      r.recordedPct === null
        ? null
        : { num: r.recordedPct.num.toString(), den: r.recordedPct.den.toString() },
    remainingDays: r.remainingDays,
    exceptionLabel: r.exception?.label ?? null,
    exceptionKind: r.exception?.kind ?? null,
  }));

  return {
    projectId: grid.projectId,
    userId,
    dataDate: grid.dataDate,
    projectStart: grid.projectStart,
    noProjectStart: grid.projectStart === null,
    floatAnchorLabel: grid.floatAnchorLabel,
    scheduleStale: grid.scheduleStale,
    haltedReason: grid.haltedReason,
    leafCandidates: grid.leafCandidates.map((c) => ({
      wpId: c.wpId,
      wbsCode: c.wbsCode,
      name: c.name,
    })),
    rows,
  };
}

/** Slot / column contract for smoke assertions (no JSX). */
export const PLAN_GRID_SLOTS = [
  'schedule-strip-slot',
  'plan-toolbar',
  'what-moved-slot',
  'plan-tree',
  'exceptions-rail-slot',
] as const;

export const SCHEDULE_COLUMNS = [
  'Start',
  'Finish',
  'Dur',
  'Predecessors',
  'Constraint',
  'Float',
  'Critical',
  'Exception',
  'Recorded %',
] as const;

export const PROGRESS_COLUMNS = [
  'Actual start',
  'Actual finish',
  'Recorded %',
  'Remaining',
] as const;

export const PROGRESS_ABSENT = ['Observed %', 'Gap', 'Evidence'] as const;

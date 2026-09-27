import type { PlanGridState, PlanExceptionsRail, WhatMovedBand } from '@momo/app';
import type {
  PlanExceptionsRailView,
  PlanGridRowView,
  PlanGridViewModel,
  WhatMovedBandView,
} from '@/components/plan-grid-types';

function toWhatMovedView(band: WhatMovedBand): WhatMovedBandView {
  return {
    runSeq: band.runSeq,
    movedCount: band.movedCount,
    nothingMoved: band.nothingMoved,
    summaryLine: band.summaryLine,
    politeAnnounce: band.politeAnnounce,
    previousComputedFinish: band.previousComputedFinish,
    computedFinish: band.computedFinish,
    previousMinFloat: band.previousMinFloat,
    minFloat: band.minFloat,
    groups: band.groups.map((g) => ({
      cause: g.cause,
      entries: g.entries.map((e) => ({
        wpId: e.wpId,
        wbsCode: e.wbsCode,
        name: e.name,
        cause: e.cause,
        oldEarlyStart: e.oldEarlyStart,
        oldEarlyFinish: e.oldEarlyFinish,
        newEarlyStart: e.newEarlyStart,
        newEarlyFinish: e.newEarlyFinish,
      })),
    })),
    actorUserId: band.actorUserId,
    actorName: band.actorName,
    atIso: band.atIso,
  };
}

function toExceptionsView(rail: PlanExceptionsRail): PlanExceptionsRailView {
  return {
    totalCount: rail.totalCount,
    holidayCalendarVersionSeq: rail.holidayCalendarVersionSeq,
    calendarRangeStart: rail.calendarRangeStart,
    calendarRangeEnd: rail.calendarRangeEnd,
    violations: rail.violations.map((v) => ({
      wpId: v.wpId,
      wbsCode: v.wbsCode,
      name: v.name,
      label: v.label,
      isMilestone: v.isMilestone,
      constraintType: v.constraintType,
      askedDate: v.askedDate,
      derivedDate: v.derivedDate,
      daysLate: v.daysLate,
      chain: v.chain.map((c) => ({
        wpId: c.wpId,
        wbsCode: c.wbsCode,
        name: c.name,
        finish: c.finish,
        lagDays: c.lagDays,
        presentInLiveTree: c.presentInLiveTree,
      })),
    })),
    outOfSequence: rail.outOfSequence.map((e) => ({
      predecessorWpId: e.predecessorWpId,
      successorWpId: e.successorWpId,
      predecessorWbsCode: e.predecessorWbsCode,
      predecessorName: e.predecessorName,
      successorWbsCode: e.successorWbsCode,
      successorName: e.successorName,
      label: e.label,
      successorActualStart: e.successorActualStart,
      predecessorFinish: e.predecessorFinish,
      predecessorPresent: e.predecessorPresent,
      successorPresent: e.successorPresent,
    })),
    notSchedulable: rail.notSchedulable.map((n) => ({
      wpId: n.wpId,
      wbsCode: n.wbsCode,
      name: n.name,
      label: n.label,
      reason: n.reason,
    })),
  };
}

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
    projectFinish: grid.projectFinish,
    computedFinish: grid.computedFinish,
    minFloat: grid.minFloat,
    floatAnchorSentence: grid.floatAnchorSentence,
    finishTeaching: grid.finishTeaching,
    noProjectStart: grid.projectStart === null,
    floatAnchorLabel: grid.floatAnchorLabel,
    scheduleStale: grid.scheduleStale,
    haltedReason: grid.haltedReason,
    whatMoved: grid.whatMoved === null ? null : toWhatMovedView(grid.whatMoved),
    exceptions: toExceptionsView(grid.exceptions),
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

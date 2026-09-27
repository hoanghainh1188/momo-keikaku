/**
 * Serializable Plan grid row for the client treegrid (story 2.13 / 2.14 / 2.15 / 2.16).
 * BigInt ratios become strings for RSC → client props.
 */

export interface PlanGridLeafCandidateView {
  readonly wpId: string;
  readonly wbsCode: string;
  readonly name: string;
}

export interface PlanGridPredecessorEdgeView {
  readonly predecessorWpId: string;
  readonly lagDays: number;
}

export interface PlanGridRowView {
  readonly wpId: string;
  readonly wbsCode: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly isLeaf: boolean;
  readonly isMilestone: boolean;
  readonly isCatchAll: boolean;
  readonly level: number;
  readonly posInSet: number;
  readonly setSize: number;
  readonly hasChildren: boolean;
  readonly durationDays: number | null;
  readonly constraintType: string;
  readonly constraintDate: string | null;
  readonly constraintLabel: string;
  readonly predecessorsText: string;
  readonly predecessorEdges: readonly PlanGridPredecessorEdgeView[];
  readonly earlyStart: string | null;
  readonly earlyFinish: string | null;
  readonly floatDays: number | null;
  readonly isCritical: boolean;
  readonly state: string | null;
  readonly notSchedulable: boolean;
  readonly actualStart: string | null;
  readonly actualFinish: string | null;
  readonly recordedPct: { readonly num: string; readonly den: string } | null;
  readonly remainingDays: number | null;
  readonly exceptionLabel: string | null;
  readonly exceptionKind: 'violation' | 'out_of_sequence' | 'not_schedulable' | null;
}

export type WhatMovedCauseView =
  | 'edited'
  | 'moved by a predecessor'
  | 'calendar changed'
  | 'data date advanced'
  | 'actual dates recorded'
  | 'progress changed'
  | 'project dates changed';

export interface WhatMovedEntryView {
  readonly wpId: string;
  readonly wbsCode: string;
  readonly name: string;
  readonly cause: WhatMovedCauseView;
  readonly oldEarlyStart: string | null;
  readonly oldEarlyFinish: string | null;
  readonly newEarlyStart: string | null;
  readonly newEarlyFinish: string | null;
}

export interface WhatMovedCauseGroupView {
  readonly cause: WhatMovedCauseView;
  readonly entries: readonly WhatMovedEntryView[];
}

export interface WhatMovedBandView {
  readonly runSeq: number;
  readonly movedCount: number;
  readonly nothingMoved: boolean;
  readonly summaryLine: string;
  readonly politeAnnounce: string;
  readonly previousComputedFinish: string | null;
  readonly computedFinish: string | null;
  readonly previousMinFloat: number | null;
  readonly minFloat: number | null;
  readonly groups: readonly WhatMovedCauseGroupView[];
  readonly actorUserId: string;
  readonly actorName: string;
  readonly atIso: string;
}

export interface PlanExceptionsRailChainEntryView {
  readonly wpId: string;
  readonly wbsCode: string;
  readonly name: string;
  readonly finish: string | null;
  readonly lagDays: number | null;
  readonly presentInLiveTree: boolean;
}

export interface PlanExceptionsRailViolationView {
  readonly wpId: string;
  readonly wbsCode: string;
  readonly name: string;
  readonly label: string;
  readonly isMilestone: boolean;
  readonly constraintType: 'must_start_on' | 'must_finish_on';
  readonly askedDate: string;
  readonly derivedDate: string;
  readonly daysLate: number;
  readonly chain: readonly PlanExceptionsRailChainEntryView[];
}

export interface PlanExceptionsRailOosView {
  readonly predecessorWpId: string;
  readonly successorWpId: string;
  readonly predecessorWbsCode: string;
  readonly predecessorName: string;
  readonly successorWbsCode: string;
  readonly successorName: string;
  readonly label: string;
  readonly successorActualStart: string | null;
  readonly predecessorFinish: string | null;
  readonly predecessorPresent: boolean;
  readonly successorPresent: boolean;
}

export interface PlanExceptionsRailNotSchedulableView {
  readonly wpId: string;
  readonly wbsCode: string;
  readonly name: string;
  readonly label: string;
  readonly reason: 'no_duration';
}

export interface PlanExceptionsRailView {
  readonly totalCount: number;
  readonly holidayCalendarVersionSeq: number | null;
  readonly calendarRangeStart: string | null;
  readonly calendarRangeEnd: string | null;
  readonly violations: readonly PlanExceptionsRailViolationView[];
  readonly outOfSequence: readonly PlanExceptionsRailOosView[];
  readonly notSchedulable: readonly PlanExceptionsRailNotSchedulableView[];
}

/** Stable key for a flat rail walk item (j/k). */
export type ExceptionsRailItemKey =
  | `violation:${string}`
  | `oos:${string}->${string}`
  | `not_schedulable:${string}`;

export interface PlanGridViewModel {
  readonly projectId: string;
  readonly userId: string;
  readonly dataDate: string | null;
  readonly projectStart: string | null;
  readonly projectFinish: string | null;
  readonly computedFinish: string | null;
  readonly minFloat: number | null;
  readonly floatAnchorSentence: string | null;
  readonly finishTeaching: string;
  readonly noProjectStart: boolean;
  readonly floatAnchorLabel: 'vs Project finish' | 'vs computed finish' | null;
  readonly scheduleStale: boolean;
  readonly haltedReason: string | null;
  readonly whatMoved: WhatMovedBandView | null;
  readonly exceptions: PlanExceptionsRailView;
  readonly leafCandidates: readonly PlanGridLeafCandidateView[];
  readonly rows: readonly PlanGridRowView[];
}

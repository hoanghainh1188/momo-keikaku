/**
 * Serializable Plan grid row for the client treegrid (story 2.13).
 * BigInt ratios become strings for RSC → client props.
 */
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
  readonly constraintLabel: string;
  readonly predecessorsText: string;
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

export interface PlanGridViewModel {
  readonly projectId: string;
  readonly userId: string;
  readonly dataDate: string | null;
  readonly projectStart: string | null;
  readonly noProjectStart: boolean;
  readonly floatAnchorLabel: 'vs Project finish' | 'vs computed finish' | null;
  readonly scheduleStale: boolean;
  readonly haltedReason: string | null;
  readonly rows: readonly PlanGridRowView[];
}

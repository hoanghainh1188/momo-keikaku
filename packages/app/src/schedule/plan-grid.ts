/**
 * Story 2.13 — authorised Plan tree-grid read.
 * Story 2.15 — schedule strip scalars + What-moved band (prev/latest run join).
 * Story 2.16 — schedule-exceptions rail lists + calendar-range halt bounds.
 *
 * Joins live WP/edge inputs with `wp_schedule` and the latest `schedule_run` outputs (exceptions,
 * anchor). Display order is always `compareWp` (AD-28). Writes stay on `applyPlanChange`.
 */
import { and, eq } from 'drizzle-orm';
import {
  compareWp,
  parseStoredInputs,
  parseStoredOutputs,
  planBaselineCompare,
  remainingDuration,
  WP_MOVE_CAUSES,
  type ScheduleAnchor,
  type WpMoveCause,
} from '@momo/domain';
import {
  SUMMARY_NA_LABEL,
  formatFloatDisplay,
  formatMinFloat,
  formatPlanDate,
  formatPlanDateLong,
  formatPlanDateShort,
  inkTone,
} from '@momo/domain/present';
import type { Bound } from '../../../db/src/bound';
import { projectNotFound } from '../../../db/src/project-not-found';
import { planInputRepositoryOn } from '../../../db/src/repositories/plan-input';
import { scheduleRepositoryOn } from '../../../db/src/repositories/schedule';
import * as s from '../../../db/src/schema';
import { loadActiveBaselineForGrid } from '../baseline/active-baseline-for-grid';
import { authorize, PROJECT_REACH_ROLES } from '../authz/authorize';
import type { RequestContext } from '../authz/request-context';
import type { SchedulingBound } from '../ports/schedule-write';
import { ok, type Result } from '../result';
import type { ApplyPlanChangeDeps } from './apply-plan-change';
import { PROJECT_FINISH_TEACHING } from './plan-edit';

export {
  SUMMARY_NA_LABEL,
  formatFloatDisplay,
  formatMinFloat,
  formatPlanDate,
  formatPlanDateLong,
  formatPlanDateShort,
  inkTone,
};

/** Audit / schedule_run actor stamps are `user:<id>`; bare id for auth lookup + UI compare. */
const USER_ACTOR = /^user:(.+)$/;

export function actorUserIdOf(actor: string): string {
  return USER_ACTOR.exec(actor)?.[1] ?? actor;
}

export type PlanGridExceptionKind = 'violation' | 'out_of_sequence' | 'not_schedulable';

export interface PlanGridException {
  readonly kind: PlanGridExceptionKind;
  /** Glyph + word + number, e.g. "▲ Late 6d". */
  readonly label: string;
  readonly daysLate?: number;
}

export interface PlanGridPredecessorEdge {
  readonly predecessorWpId: string;
  readonly lagDays: number;
}

/** Leaf WP chip for predecessor autocomplete (UX-DR6). */
export interface PlanGridLeafCandidate {
  readonly wpId: string;
  readonly wbsCode: string;
  readonly name: string;
}

export interface PlanGridRow {
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
  /** Live incoming edges for the predecessor editor (story 2.14). */
  readonly predecessorEdges: readonly PlanGridPredecessorEdge[];
  readonly earlyStart: string | null;
  readonly earlyFinish: string | null;
  readonly floatDays: number | null;
  readonly isCritical: boolean;
  readonly state: string | null;
  readonly notSchedulable: boolean;
  readonly stale: boolean;
  readonly actualStart: string | null;
  readonly actualFinish: string | null;
  readonly recordedPct: { readonly num: bigint; readonly den: bigint } | null;
  /** Recomputed for Progress — never stored (2.9 Q1→B). */
  readonly remainingDays: number | null;
  readonly exception: PlanGridException | null;
  /**
   * Story 4.5 — Baseline compare preset fields (active `baseline_wp` vs Current Plan).
   * Null Baseline-side values mean N/A (summary / no Baseline / missing leaf).
   */
  readonly plannedMh: bigint | null;
  readonly baselineStart: string | null;
  readonly baselineFinish: string | null;
  readonly baselineDurationDays: number | null;
  readonly baselineMh: bigint | null;
  readonly startDeltaDays: number | null;
  readonly finishDeltaDays: number | null;
  readonly durationDeltaDays: number | null;
  readonly effortDeltaMh: bigint | null;
}

/** One moved WP under an FR-28 cause (story 2.15). */
export interface WhatMovedEntry {
  readonly wpId: string;
  readonly wbsCode: string;
  readonly name: string;
  readonly cause: WpMoveCause;
  readonly oldEarlyStart: string | null;
  readonly oldEarlyFinish: string | null;
  readonly newEarlyStart: string | null;
  readonly newEarlyFinish: string | null;
}

export interface WhatMovedCauseGroup {
  readonly cause: WpMoveCause;
  readonly entries: readonly WhatMovedEntry[];
}

/** What-moved band payload from latest vs previous successful run. */
export interface WhatMovedBand {
  readonly runSeq: number;
  readonly movedCount: number;
  readonly nothingMoved: boolean;
  readonly summaryLine: string;
  readonly politeAnnounce: string;
  readonly previousComputedFinish: string | null;
  readonly computedFinish: string | null;
  readonly previousMinFloat: number | null;
  readonly minFloat: number | null;
  readonly groups: readonly WhatMovedCauseGroup[];
  readonly actorUserId: string;
  readonly actorName: string;
  readonly atIso: string;
}

/** One WP on a violation's driving-predecessor chain (story 2.16). */
export interface PlanExceptionsRailChainEntry {
  readonly wpId: string;
  readonly wbsCode: string;
  readonly name: string;
  /** Finish used in the explainer — actualFinish when complete, else earlyFinish. */
  readonly finish: string | null;
  /** Lag on the edge from this WP toward the violated WP; null when no edge found. */
  readonly lagDays: number | null;
  /** False when the id is absent from the live tree (Arrow/Enter skip focus). */
  readonly presentInLiveTree: boolean;
}

export interface PlanExceptionsRailViolation {
  readonly wpId: string;
  readonly wbsCode: string;
  readonly name: string;
  readonly label: string;
  readonly isMilestone: boolean;
  readonly constraintType: 'must_start_on' | 'must_finish_on';
  readonly askedDate: string;
  readonly derivedDate: string;
  readonly daysLate: number;
  /** Engine order (immediate driver first); UI may reverse for display. */
  readonly chain: readonly PlanExceptionsRailChainEntry[];
}

/** One OOS edge (pred→succ), even when several share a successor. */
export interface PlanExceptionsRailOos {
  readonly predecessorWpId: string;
  readonly successorWpId: string;
  readonly predecessorWbsCode: string;
  readonly predecessorName: string;
  readonly successorWbsCode: string;
  readonly successorName: string;
  readonly label: string;
  /** Live successor actualStart — never invented. */
  readonly successorActualStart: string | null;
  /**
   * Predecessor finish: actualFinish when complete, else derived earlyFinish.
   * Null when neither is available (name WPs only).
   */
  readonly predecessorFinish: string | null;
  readonly predecessorPresent: boolean;
  readonly successorPresent: boolean;
}

export interface PlanExceptionsRailNotSchedulable {
  readonly wpId: string;
  readonly wbsCode: string;
  readonly name: string;
  readonly label: string;
  readonly reason: 'no_duration';
}

/** Ranked exceptions queue for the Plan rail (UX-DR8). Empty when halted / no run. */
export interface PlanExceptionsRail {
  readonly totalCount: number;
  readonly holidayCalendarVersionSeq: number | null;
  /** From latest run inputs — for calendar_range halt banner (Q1→A). */
  readonly calendarRangeStart: string | null;
  readonly calendarRangeEnd: string | null;
  readonly violations: readonly PlanExceptionsRailViolation[];
  readonly outOfSequence: readonly PlanExceptionsRailOos[];
  readonly notSchedulable: readonly PlanExceptionsRailNotSchedulable[];
}

export interface PlanGridState {
  readonly projectId: string;
  readonly projectStart: string | null;
  readonly projectFinish: string | null;
  readonly dataDate: string | null;
  readonly tzOffsetMinutes: number;
  readonly anchor: ScheduleAnchor | null;
  readonly computedFinish: string | null;
  /** Minimum Float against the run's anchor — null when no Float exists. */
  readonly minFloat: number | null;
  /** UX-DR5 full sentence (never a bare "vs …" label alone). */
  readonly floatAnchorSentence: string | null;
  readonly haltedReason: string | null;
  readonly scheduleStale: boolean;
  readonly floatAnchorLabel: 'vs Project finish' | 'vs computed finish' | null;
  /** Teaching copy for strip finish set/clear confirm (2.11 / 2.15). */
  readonly finishTeaching: string;
  /** Latest successful run's What-moved; null when no successful latest run. */
  readonly whatMoved: WhatMovedBand | null;
  /** Story 2.16 — ranked exceptions + calendar bounds (empty lists when halted). */
  readonly exceptions: PlanExceptionsRail;
  /** Leaf-only autocomplete candidates for predecessor cells (story 2.14). */
  readonly leafCandidates: readonly PlanGridLeafCandidate[];
  /** Story 4.5 — true when an active Baseline version exists (max seq). */
  readonly hasBaseline: boolean;
  readonly rows: readonly PlanGridRow[];
}

/** Empty rail payload — halted run, no run, or parse failure. */
export function emptyExceptionsRail(partial?: {
  readonly holidayCalendarVersionSeq?: number | null;
  readonly calendarRangeStart?: string | null;
  readonly calendarRangeEnd?: string | null;
}): PlanExceptionsRail {
  return {
    totalCount: 0,
    holidayCalendarVersionSeq: partial?.holidayCalendarVersionSeq ?? null,
    calendarRangeStart: partial?.calendarRangeStart ?? null,
    calendarRangeEnd: partial?.calendarRangeEnd ?? null,
    violations: [],
    outOfSequence: [],
    notSchedulable: [],
  };
}

/**
 * Q1→A calendar-range halt banner copy. Never invents bounds.
 * Missing range → "range unavailable" instead of fake dates.
 */
export function calendarRangeHaltBanner(input: {
  readonly rangeStart: string | null;
  readonly rangeEnd: string | null;
}): string {
  const loaded =
    input.rangeStart !== null && input.rangeEnd !== null
      ? `Loaded ${formatPlanDate(input.rangeStart)}–${formatPlanDate(input.rangeEnd)}.`
      : 'Loaded range unavailable.';
  return `Schedule halted: calendar range. ${loaded} Derived dates are stale — extend the Holiday Calendar range in Project settings.`;
}

/**
 * Build the ranked exceptions rail from a successful stored run + live joins.
 * Does not decode exceptions from halted (null outputs) runs — callers must pass empty.
 */
export function buildExceptionsRail(input: {
  readonly orderedIds: readonly string[];
  readonly wbsById: ReadonlyMap<string, string>;
  readonly nameById: ReadonlyMap<string, string>;
  readonly liveWpIds: ReadonlySet<string>;
  readonly milestoneIds: ReadonlySet<string>;
  readonly holidayCalendarVersionSeq: number | null;
  readonly calendarRangeStart: string | null;
  readonly calendarRangeEnd: string | null;
  readonly violations: readonly {
    readonly wpId: string;
    readonly constraintType: 'must_start_on' | 'must_finish_on';
    readonly askedDate: string;
    readonly derivedDate: string;
    readonly daysLate: number;
    readonly chain: readonly string[];
  }[];
  readonly outOfSequence: readonly {
    readonly predecessorId: string;
    readonly successorId: string;
  }[];
  readonly notSchedulable: readonly { readonly wpId: string; readonly reason: 'no_duration' }[];
  /** Live status actuals by wpId. */
  readonly actualByWp: ReadonlyMap<
    string,
    { readonly actualStart: string | null; readonly actualFinish: string | null }
  >;
  /** Latest schedule projection (or stored output) earlyFinish by wpId. */
  readonly earlyFinishByWp: ReadonlyMap<string, string | null>;
  /** Lag keyed `predId\0succId`. */
  readonly lagByEdge: ReadonlyMap<string, number>;
}): PlanExceptionsRail {
  const labelOf = (wpId: string, isMilestone: boolean, daysLate: number): string => {
    const resolved = resolveException({
      wpId,
      isLeaf: true,
      notSchedulableReason: null,
      violationsByWp: new Map([[wpId, { daysLate, isMilestone }]]),
      oosWpIds: new Set(),
    });
    return resolved?.label ?? `${isMilestone ? '◆' : '▲'} Late ${daysLate}d`;
  };

  const resolveWpLabel = (
    wpId: string,
  ): { readonly wbsCode: string; readonly name: string; readonly present: boolean } => {
    const present = input.liveWpIds.has(wpId);
    const wbsCode = input.wbsById.get(wpId) ?? '';
    const name = input.nameById.get(wpId) ?? '';
    if (wbsCode !== '' || name !== '') {
      return { wbsCode: wbsCode || wpId.slice(0, 8), name: name || wpId.slice(0, 8), present };
    }
    const short = wpId.length > 8 ? wpId.slice(0, 8) : wpId;
    return { wbsCode: short, name: short, present };
  };

  const finishOf = (wpId: string): string | null => {
    const actual = input.actualByWp.get(wpId);
    if (actual?.actualFinish) return actual.actualFinish;
    return input.earlyFinishByWp.get(wpId) ?? null;
  };

  const violationsSorted = [...input.violations].sort((a, b) => {
    if (b.daysLate !== a.daysLate) return b.daysLate - a.daysLate;
    return compareWp(
      { id: a.wpId, wbsCode: input.wbsById.get(a.wpId) ?? '' },
      { id: b.wpId, wbsCode: input.wbsById.get(b.wpId) ?? '' },
    );
  });

  const violations: PlanExceptionsRailViolation[] = violationsSorted.map((v) => {
    const isMilestone = input.milestoneIds.has(v.wpId);
    const self = resolveWpLabel(v.wpId);
    // Chain is immediate-driver first: chain[0] drives the violated WP; chain[i] drives chain[i-1].
    const chain: PlanExceptionsRailChainEntry[] = v.chain.map((id, i) => {
      const meta = resolveWpLabel(id);
      const successorId = i === 0 ? v.wpId : v.chain[i - 1]!;
      const lagDays = input.lagByEdge.get(`${id}\0${successorId}`) ?? null;
      return {
        wpId: id,
        wbsCode: meta.wbsCode,
        name: meta.name,
        finish: finishOf(id),
        lagDays,
        presentInLiveTree: meta.present,
      };
    });
    return {
      wpId: v.wpId,
      wbsCode: self.wbsCode,
      name: self.name,
      label: labelOf(v.wpId, isMilestone, v.daysLate),
      isMilestone,
      constraintType: v.constraintType,
      askedDate: v.askedDate,
      derivedDate: v.derivedDate,
      daysLate: v.daysLate,
      chain,
    };
  });

  const outOfSequence: PlanExceptionsRailOos[] = input.outOfSequence.map((e) => {
    const pred = resolveWpLabel(e.predecessorId);
    const succ = resolveWpLabel(e.successorId);
    const succActual = input.actualByWp.get(e.successorId);
    return {
      predecessorWpId: e.predecessorId,
      successorWpId: e.successorId,
      predecessorWbsCode: pred.wbsCode,
      predecessorName: pred.name,
      successorWbsCode: succ.wbsCode,
      successorName: succ.name,
      label: '⇄ Out of sequence',
      successorActualStart: succActual?.actualStart ?? null,
      predecessorFinish: finishOf(e.predecessorId),
      predecessorPresent: pred.present,
      successorPresent: succ.present,
    };
  });

  const notSchedulable: PlanExceptionsRailNotSchedulable[] = input.notSchedulable.map((n) => {
    const meta = resolveWpLabel(n.wpId);
    return {
      wpId: n.wpId,
      wbsCode: meta.wbsCode,
      name: meta.name,
      label: '⊘ No duration',
      reason: 'no_duration',
    };
  });

  return {
    totalCount: violations.length + outOfSequence.length + notSchedulable.length,
    holidayCalendarVersionSeq: input.holidayCalendarVersionSeq,
    calendarRangeStart: input.calendarRangeStart,
    calendarRangeEnd: input.calendarRangeEnd,
    violations,
    outOfSequence,
    notSchedulable,
  };
}

function asBound(scheduling: SchedulingBound): Bound {
  return scheduling as Bound;
}

export function formatConstraintLabel(
  constraintType: string,
  constraintDate: string | null,
): string {
  if (constraintType === 'must_start_on' && constraintDate) {
    return `Must start on ${formatPlanDate(constraintDate)}`;
  }
  if (constraintType === 'must_finish_on' && constraintDate) {
    return `Must finish on ${formatPlanDate(constraintDate)}`;
  }
  return 'As soon as possible';
}

/** MS-Project-shaped predecessor cell: `2.3FS+2d, 2.4`. */
export function formatPredecessorsText(
  successorWpId: string,
  edges: readonly {
    readonly predecessorWpId: string;
    readonly successorWpId: string;
    readonly lagDays: number;
  }[],
  wbsById: ReadonlyMap<string, string>,
): string {
  const preds = edges
    .filter((e) => e.successorWpId === successorWpId)
    .map((e) => {
      const code = wbsById.get(e.predecessorWpId) ?? e.predecessorWpId;
      if (e.lagDays === 0) return code;
      const sign = e.lagDays > 0 ? '+' : '';
      return `${code}FS${sign}${e.lagDays}d`;
    })
    .sort((a, b) => a.localeCompare(b));
  return preds.join(', ');
}

export function floatAnchorHeader(
  anchor: ScheduleAnchor | null,
): 'vs Project finish' | 'vs computed finish' | null {
  if (anchor === null) return null;
  return anchor.kind === 'project_finish' ? 'vs Project finish' : 'vs computed finish';
}

/**
 * UX-DR5 Float anchor sentence for the schedule strip.
 * Halted / missing run → null (strip shows "—" for derived scalars separately).
 */
export function floatAnchorSentence(
  anchor: ScheduleAnchor | null,
  projectFinish: string | null,
): string | null {
  if (anchor === null) return null;
  const date = formatPlanDate(anchor.date);
  if (anchor.kind === 'project_finish') {
    return `Float measured against the Project finish, ${date}`;
  }
  if (projectFinish === null) {
    return `Float measured against the computed finish, ${date} — relative, because no Project finish is set`;
  }
  return `Float measured against the computed finish, ${date}`;
}

/** Minimum Float scalar from scheduled outputs (same rule as the backward pass). */
export function minFloatFromRows(
  rows: readonly { readonly floatDays: number | null }[],
): number | null {
  let min: number | null = null;
  for (const row of rows) {
    if (row.floatDays === null) continue;
    if (min === null || row.floatDays < min) min = row.floatDays;
  }
  return min;
}

/** Spoken Float for polite announce: "minus 3" / "plus 4" / "0". */
export function speakFloat(minFloat: number | null): string {
  if (minFloat === null) return 'unavailable';
  if (minFloat < 0) return `minus ${Math.abs(minFloat)}`;
  if (minFloat > 0) return `plus ${minFloat}`;
  return '0';
}

export function formatRelativeAgo(at: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - at.getTime());
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 48) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

/**
 * Build What-moved from latest vs previous successful stored outputs.
 * First successful run (no previous) → nothing-moved wording without fake deltas.
 */
export function buildWhatMovedBand(input: {
  readonly runSeq: number;
  readonly actorUserId: string;
  readonly actorName: string;
  readonly at: Date;
  readonly latest: {
    readonly computedFinish: string | null;
    readonly minFloat: number | null;
    readonly wps: readonly {
      readonly wpId: string;
      readonly wbsCode: string;
      readonly name: string;
      readonly earlyStart: string | null;
      readonly earlyFinish: string | null;
      readonly cause: WpMoveCause | null;
    }[];
  };
  readonly previous: {
    readonly computedFinish: string | null;
    readonly minFloat: number | null;
    readonly earlyByWp: ReadonlyMap<
      string,
      { readonly earlyStart: string | null; readonly earlyFinish: string | null }
    >;
  } | null;
}): WhatMovedBand {
  const entries: WhatMovedEntry[] = [];
  for (const wp of input.latest.wps) {
    if (wp.cause === null) continue;
    const prev = input.previous?.earlyByWp.get(wp.wpId);
    entries.push({
      wpId: wp.wpId,
      wbsCode: wp.wbsCode,
      name: wp.name,
      cause: wp.cause,
      oldEarlyStart: prev?.earlyStart ?? null,
      oldEarlyFinish: prev?.earlyFinish ?? null,
      newEarlyStart: wp.earlyStart,
      newEarlyFinish: wp.earlyFinish,
    });
  }
  entries.sort((a, b) =>
    compareWp({ id: a.wpId, wbsCode: a.wbsCode }, { id: b.wpId, wbsCode: b.wbsCode }),
  );

  const groups: WhatMovedCauseGroup[] = [];
  for (const cause of WP_MOVE_CAUSES) {
    const groupEntries = entries.filter((e) => e.cause === cause);
    if (groupEntries.length === 0) continue;
    groups.push({ cause, entries: groupEntries });
  }

  const movedCount = entries.length;
  const nothingMoved = movedCount === 0;
  const prevFinish = input.previous?.computedFinish ?? null;
  const nextFinish = input.latest.computedFinish;
  const prevMin = input.previous?.minFloat ?? null;
  const nextMin = input.latest.minFloat;

  const summaryLine = nothingMoved
    ? 'No dates moved'
    : `${movedCount} work package${movedCount === 1 ? '' : 's'} moved · computed finish ${formatPlanDateShort(prevFinish)} → ${formatPlanDate(nextFinish)} · minimum Float ${formatMinFloat(prevMin)} → ${formatMinFloat(nextMin)}`;

  const politeAnnounce = nothingMoved
    ? 'No dates moved.'
    : `${movedCount} work package${movedCount === 1 ? '' : 's'} moved. Computed finish ${formatPlanDateLong(nextFinish)}. Minimum Float ${speakFloat(nextMin)}.`;

  return {
    runSeq: input.runSeq,
    movedCount,
    nothingMoved,
    summaryLine,
    politeAnnounce,
    previousComputedFinish: prevFinish,
    computedFinish: nextFinish,
    previousMinFloat: prevMin,
    minFloat: nextMin,
    groups: nothingMoved ? [] : groups,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    atIso: input.at.toISOString(),
  };
}

/**
 * Strip derived scalars: halted/missing run → honest "—" (null), never a stale finish/Float.
 * Used by getPlanGridState so the strip and What-moved cannot disagree with the matrix.
 */
export function stripDerivedScalars(input: {
  readonly haltedReason: string | null;
  readonly computedFinish: string | null;
  readonly minFloat: number | null;
  readonly anchor: ScheduleAnchor | null;
  readonly projectFinish: string | null;
}): {
  readonly computedFinish: string | null;
  readonly minFloat: number | null;
  readonly floatAnchorSentence: string | null;
} {
  if (input.haltedReason !== null) {
    return { computedFinish: null, minFloat: null, floatAnchorSentence: null };
  }
  return {
    computedFinish: input.computedFinish,
    minFloat: input.minFloat,
    floatAnchorSentence: floatAnchorSentence(input.anchor, input.projectFinish),
  };
}

/**
 * Whether Start/Finish/Float/Critical cells should blank to "—".
 * `calendar_range` keeps last-good `wp_schedule` values marked stale (founder 2026-09-27);
 * other halt reasons and non-halt stale rows stay blanked (Story 2.13).
 */
export function blankDerivedDates(input: {
  readonly haltedReason: string | null;
  readonly scheduleStale: boolean;
}): boolean {
  if (input.haltedReason === 'calendar_range') return false;
  return input.haltedReason !== null || input.scheduleStale;
}

export function recordedPctDisplay(
  pct: { readonly num: bigint; readonly den: bigint } | null,
): string {
  if (pct === null || pct.den === 0n) return 'none — scheduled as 0%';
  const tenths = Number((pct.num * 1000n) / pct.den);
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10;
  return frac === 0 ? `${whole}%` : `${whole}.${frac}%`;
}

/**
 * Pick one Exception cell label: violation (worst) → out-of-sequence → not-schedulable.
 * Full explainer popovers stay in 2.16.
 */
export function resolveException(input: {
  readonly wpId: string;
  readonly isLeaf: boolean;
  readonly notSchedulableReason: string | null;
  readonly violationsByWp: ReadonlyMap<
    string,
    { readonly daysLate: number; readonly isMilestone: boolean }
  >;
  readonly oosWpIds: ReadonlySet<string>;
}): PlanGridException | null {
  if (!input.isLeaf) return null;
  const violation = input.violationsByWp.get(input.wpId);
  if (violation) {
    const glyph = violation.isMilestone ? '◆' : '▲';
    return {
      kind: 'violation',
      label: `${glyph} Late ${violation.daysLate}d`,
      daysLate: violation.daysLate,
    };
  }
  if (input.oosWpIds.has(input.wpId)) {
    return { kind: 'out_of_sequence', label: '⇄ Out of sequence' };
  }
  if (input.notSchedulableReason === 'no_duration') {
    return { kind: 'not_schedulable', label: '⊘ No duration' };
  }
  return null;
}

/** Exception cell for a grid row — cleared when the latest run is halted (story 2.16 / retro F23). */
export function planGridExceptionCell(
  haltedReason: string | null,
  input: Parameters<typeof resolveException>[0],
): PlanGridException | null {
  if (haltedReason !== null) return null;
  return resolveException(input);
}

function depthOf(
  wpId: string,
  parentOf: ReadonlyMap<string, string | null>,
): number {
  let depth = 1;
  let cur: string | null | undefined = parentOf.get(wpId) ?? null;
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur)) break;
    seen.add(cur);
    depth += 1;
    cur = parentOf.get(cur) ?? null;
  }
  return depth;
}

/** Authorised Plan-grid read for story 2.13 / 2.15. */
export async function getPlanGridState<Handle>(
  deps: ApplyPlanChangeDeps<Handle>,
  ctx: RequestContext,
  input: { readonly projectId: string },
): Promise<Result<PlanGridState>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
  if (!roles.ok) return roles;

  const value = await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
    const bound = asBound(scope.bound);
    const [project] = await bound.tx
      .select({
        projectStart: s.project.projectStart,
        projectFinish: s.project.projectFinish,
        dataDate: s.project.dataDate,
        tzOffsetMinutes: s.project.tzOffsetMinutes,
      })
      .from(s.project)
      .where(and(eq(s.project.tenantId, bound.tenantId), eq(s.project.id, input.projectId)));
    if (!project) throw projectNotFound(input.projectId);

    const planInput = planInputRepositoryOn(bound);
    const schedule = scheduleRepositoryOn(bound);

    const [wps, edges, wpSchedules, latest, planRows, activeBaseline] = await Promise.all([
      planInput.listLiveWorkPackages(input.projectId),
      planInput.listLiveDependencies(input.projectId),
      schedule.loadWpSchedule(input.projectId),
      schedule.latestRun(input.projectId),
      schedule.loadPlanRows(input.projectId),
      loadActiveBaselineForGrid(bound, input.projectId),
    ]);

    const previous =
      latest !== null && latest.haltedReason === null && latest.outputs !== null
        ? await schedule.previousSuccessfulRun(input.projectId, latest.seq)
        : null;

    const ordered = [...wps].sort(compareWp);
    const wbsById = new Map(ordered.map((w) => [w.id, w.wbsCode] as const));
    const nameById = new Map(ordered.map((w) => [w.id, w.name] as const));
    const parentOf = new Map(ordered.map((w) => [w.id, w.parentId] as const));
    const childrenOf = new Map<string | null, typeof ordered>();
    for (const wp of ordered) {
      const key = wp.parentId;
      const list = childrenOf.get(key) ?? [];
      list.push(wp);
      childrenOf.set(key, list);
    }
    for (const [, kids] of childrenOf) {
      kids.sort(compareWp);
    }

    const scheduleByWp = new Map(wpSchedules.map((row) => [row.wpId, row] as const));
    const anyStale = wpSchedules.some((row) => row.stale);

    const milestoneIds = new Set(ordered.filter((w) => w.isMilestone).map((w) => w.id));
    const violationsByWp = new Map<string, { daysLate: number; isMilestone: boolean }>();
    const oosWpIds = new Set<string>();
    let anchor: ScheduleAnchor | null = null;
    let computedFinish: string | null = latest?.computedFinish ?? null;
    let minFloat: number | null = null;
    let whatMoved: WhatMovedBand | null = null;
    let exceptions: PlanExceptionsRail = emptyExceptionsRail();
    const haltedReason = latest?.haltedReason ?? null;

    if (latest?.outputs !== null && latest?.outputs !== undefined && latest.haltedReason === null) {
      try {
        const storedInputs = parseStoredInputs(latest.inputs);
        const storedOutputs = parseStoredOutputs(latest.outputs);
        const orderedIds = storedInputs.wps.map((w) => w.id);
        for (const v of storedOutputs.violations) {
          const wpId = orderedIds[v.wpId];
          if (wpId === undefined) continue;
          const prev = violationsByWp.get(wpId);
          if (prev === undefined || v.daysLate > prev.daysLate) {
            violationsByWp.set(wpId, {
              daysLate: v.daysLate,
              isMilestone: milestoneIds.has(wpId),
            });
          }
        }
        for (const e of storedOutputs.outOfSequence) {
          const succ = orderedIds[e.successorId];
          if (succ !== undefined) oosWpIds.add(succ);
        }
        anchor = storedOutputs.anchor;
        computedFinish = storedOutputs.computedFinish;
        minFloat = minFloatFromRows(storedOutputs.wps);

        // Story 2.16 — full rail payload (violations keep asked/derived/chain; OOS joins dates).
        const liveWpIds = new Set(ordered.map((w) => w.id));
        const actualByWp = new Map<
          string,
          { readonly actualStart: string | null; readonly actualFinish: string | null }
        >();
        for (const wp of ordered) {
          const status = planRows.statusHeads.get(wp.id);
          actualByWp.set(wp.id, {
            actualStart: status?.actualStart ?? null,
            actualFinish: status?.actualFinish ?? null,
          });
        }
        // Prefer live schedule projection; fall back to stored output earlyFinish.
        const earlyFinishByWp = new Map<string, string | null>();
        for (const row of wpSchedules) {
          earlyFinishByWp.set(row.wpId, row.earlyFinish);
        }
        for (let i = 0; i < storedOutputs.wps.length; i += 1) {
          const id = orderedIds[i];
          const row = storedOutputs.wps[i];
          if (id === undefined || row === undefined) continue;
          if (!earlyFinishByWp.has(id) || earlyFinishByWp.get(id) === null) {
            earlyFinishByWp.set(id, row.earlyFinish);
          }
        }
        // Lag from live edges; fall back to stored input edges (index-decoded).
        const lagByEdge = new Map<string, number>();
        for (const e of edges) {
          lagByEdge.set(`${e.predecessorWpId}\0${e.successorWpId}`, e.lagDays);
        }
        for (const e of storedInputs.edges) {
          const pred = orderedIds[e.predecessorId];
          const succ = orderedIds[e.successorId];
          if (pred === undefined || succ === undefined) continue;
          const key = `${pred}\0${succ}`;
          if (!lagByEdge.has(key)) lagByEdge.set(key, e.lagDays);
        }
        // Also seed wbs/name from stored inputs for deleted WPs still named in exceptions.
        const railWbs = new Map(wbsById);
        const railName = new Map(nameById);
        for (const w of storedInputs.wps) {
          if (!railWbs.has(w.id) && w.wbsCode) railWbs.set(w.id, w.wbsCode);
        }

        const decodedViolations = storedOutputs.violations.flatMap((v) => {
          const wpId = orderedIds[v.wpId];
          if (wpId === undefined) return [];
          const chain = v.chain.flatMap((idx) => {
            const id = orderedIds[idx];
            return id === undefined ? [] : [id];
          });
          return [
            {
              wpId,
              constraintType: v.constraintType,
              askedDate: v.askedDate,
              derivedDate: v.derivedDate,
              daysLate: v.daysLate,
              chain,
            },
          ];
        });
        const decodedOos = storedOutputs.outOfSequence.flatMap((e) => {
          const predecessorId = orderedIds[e.predecessorId];
          const successorId = orderedIds[e.successorId];
          if (predecessorId === undefined || successorId === undefined) return [];
          return [{ predecessorId, successorId }];
        });
        const decodedNs = storedOutputs.notSchedulable.flatMap((n) => {
          const wpId = orderedIds[n.wpId];
          if (wpId === undefined) return [];
          return [{ wpId, reason: 'no_duration' as const }];
        });

        exceptions = buildExceptionsRail({
          orderedIds,
          wbsById: railWbs,
          nameById: railName,
          liveWpIds,
          milestoneIds,
          holidayCalendarVersionSeq:
            storedInputs.calendar.versionSeq ?? latest.holidayCalendarVersionSeq,
          calendarRangeStart: storedInputs.calendar.rangeStart,
          calendarRangeEnd: storedInputs.calendar.rangeEnd,
          violations: decodedViolations,
          outOfSequence: decodedOos,
          notSchedulable: decodedNs,
          actualByWp,
          earlyFinishByWp,
          lagByEdge,
        });

        let previousPayload: {
          readonly computedFinish: string | null;
          readonly minFloat: number | null;
          readonly earlyByWp: ReadonlyMap<
            string,
            { readonly earlyStart: string | null; readonly earlyFinish: string | null }
          >;
        } | null = null;
        if (previous?.outputs !== null && previous?.outputs !== undefined) {
          try {
            const prevInputs = parseStoredInputs(previous.inputs);
            const prevOutputs = parseStoredOutputs(previous.outputs);
            const prevIds = prevInputs.wps.map((w) => w.id);
            const earlyByWp = new Map<
              string,
              { readonly earlyStart: string | null; readonly earlyFinish: string | null }
            >();
            for (let i = 0; i < prevOutputs.wps.length; i += 1) {
              const id = prevIds[i];
              const row = prevOutputs.wps[i];
              if (id === undefined || row === undefined) continue;
              earlyByWp.set(id, {
                earlyStart: row.earlyStart,
                earlyFinish: row.earlyFinish,
              });
            }
            previousPayload = {
              computedFinish: prevOutputs.computedFinish,
              minFloat: minFloatFromRows(prevOutputs.wps),
              earlyByWp,
            };
          } catch {
            previousPayload = null;
          }
        }

        const actorUserId = actorUserIdOf(latest.actor);
        let actorName = actorUserId;
        try {
          const [user] = await bound.tx
            .select({ name: s.authUser.name })
            .from(s.authUser)
            .where(eq(s.authUser.id, actorUserId));
          if (user?.name) actorName = user.name;
        } catch {
          // Global table may be unreachable under some RLS setups — fall back to actor id.
        }

        whatMoved = buildWhatMovedBand({
          runSeq: latest.seq,
          actorUserId,
          actorName,
          at: latest.at,
          latest: {
            computedFinish,
            minFloat,
            wps: storedOutputs.wps.flatMap((row, i) => {
              const wpId = orderedIds[i];
              if (wpId === undefined) return [];
              return [
                {
                  wpId,
                  wbsCode: wbsById.get(wpId) ?? storedInputs.wps[i]?.wbsCode ?? '',
                  name: nameById.get(wpId) ?? '',
                  earlyStart: row.earlyStart,
                  earlyFinish: row.earlyFinish,
                  cause: row.cause,
                },
              ];
            }),
          },
          previous: previousPayload,
        });
      } catch {
        // Malformed stored payload — infer kind from Project finish vs column date.
        if (latest.anchor) {
          const kind =
            project.projectFinish !== null && latest.anchor === project.projectFinish
              ? 'project_finish'
              : 'computed_finish';
          anchor = { kind, date: latest.anchor };
        }
        minFloat = minFloatFromRows(wpSchedules);
      }
    } else if (latest !== null) {
      // Halted or outputs-null: never decode exception lists; still surface calendar bounds for
      // the calendar_range banner (Q1→A).
      let rangeStart: string | null = null;
      let rangeEnd: string | null = null;
      let versionSeq: number | null = latest.holidayCalendarVersionSeq;
      try {
        const storedInputs = parseStoredInputs(latest.inputs);
        rangeStart = storedInputs.calendar.rangeStart;
        rangeEnd = storedInputs.calendar.rangeEnd;
        versionSeq = storedInputs.calendar.versionSeq;
      } catch {
        // Inputs unreadable — banner will say "range unavailable".
      }
      exceptions = emptyExceptionsRail({
        holidayCalendarVersionSeq: versionSeq,
        calendarRangeStart: rangeStart,
        calendarRangeEnd: rangeEnd,
      });
      if (latest.anchor) {
        const kind =
          project.projectFinish !== null && latest.anchor === project.projectFinish
            ? 'project_finish'
            : 'computed_finish';
        anchor = { kind, date: latest.anchor };
      } else {
        minFloat = haltedReason === null ? minFloatFromRows(wpSchedules) : null;
      }
    } else {
      minFloat = null;
    }

    if (minFloat === null && haltedReason === null) {
      minFloat = minFloatFromRows(wpSchedules);
    }

    const leafCandidates: PlanGridLeafCandidate[] = ordered
      .filter((w) => w.isLeaf)
      .map((w) => ({ wpId: w.id, wbsCode: w.wbsCode, name: w.name }));

    // Current Plan effort: leaf plannedMh from plan-input load; summaries roll up descendants.
    const plannedMhByWp = new Map(planRows.wps.map((w) => [w.id, w.plannedMh] as const));
    const rolledPlannedMh = (wpId: string, isLeaf: boolean): bigint => {
      if (isLeaf) return plannedMhByWp.get(wpId) ?? 0n;
      let sum = 0n;
      const stack = [...(childrenOf.get(wpId) ?? [])];
      while (stack.length > 0) {
        const child = stack.pop()!;
        if (child.isLeaf) sum += plannedMhByWp.get(child.id) ?? 0n;
        else stack.push(...(childrenOf.get(child.id) ?? []));
      }
      return sum;
    };

    // Prefer Current Plan calendar for working-day Δ; fall back to pin calendar.
    const planCalendar =
      planRows.calendar !== null
        ? {
            nonWorkingDays: planRows.calendar.nonWorkingDays,
            rangeStart: planRows.calendar.rangeStart,
            rangeEnd: planRows.calendar.rangeEnd,
          }
        : activeBaseline.pinCalendar;

    const rows: PlanGridRow[] = ordered.map((wp) => {
      const sched = scheduleByWp.get(wp.id);
      const notSchedulable = sched?.notSchedulableReason === 'no_duration';
      const siblings = childrenOf.get(wp.parentId) ?? [];
      const posInSet = siblings.findIndex((sib) => sib.id === wp.id) + 1;
      const status = planRows.statusHeads.get(wp.id);
      const pct = planRows.pctHeads.get(wp.id) ?? null;
      // calendar_range keeps last-good dates marked stale; other halt/stale → "—".
      const blankDerived = blankDerivedDates({
        haltedReason,
        scheduleStale: sched?.stale ?? false,
      });
      let remaining: number | null = null;
      if (wp.isLeaf && wp.durationDays !== null) {
        try {
          remaining = remainingDuration(wp.durationDays, pct);
        } catch {
          remaining = null;
        }
      }
      const predecessorEdges: PlanGridPredecessorEdge[] = edges
        .filter((e) => e.successorWpId === wp.id)
        .map((e) => ({ predecessorWpId: e.predecessorWpId, lagDays: e.lagDays }));
      const earlyStart = blankDerived ? null : (sched?.earlyStart ?? null);
      const earlyFinish = blankDerived ? null : (sched?.earlyFinish ?? null);
      const plannedMh = rolledPlannedMh(wp.id, wp.isLeaf);
      const compare = planBaselineCompare({
        wpId: wp.id,
        isLeaf: wp.isLeaf,
        baseline: activeBaseline.baselineByWp.get(wp.id) ?? null,
        baselineDurationDays: activeBaseline.baselineDurationByWp.get(wp.id) ?? null,
        derivedStart: earlyStart,
        derivedFinish: earlyFinish,
        durationDays: wp.durationDays,
        plannedMh,
        calendar: planCalendar,
      });
      return {
        wpId: wp.id,
        wbsCode: wp.wbsCode,
        name: wp.name,
        parentId: wp.parentId,
        isLeaf: wp.isLeaf,
        isMilestone: wp.isMilestone,
        isCatchAll: wp.isCatchAll,
        level: depthOf(wp.id, parentOf),
        posInSet: posInSet > 0 ? posInSet : 1,
        setSize: siblings.length || 1,
        hasChildren: (childrenOf.get(wp.id) ?? []).length > 0,
        durationDays: wp.durationDays,
        constraintType: wp.constraintType,
        constraintDate: wp.constraintDate,
        constraintLabel: formatConstraintLabel(wp.constraintType, wp.constraintDate),
        predecessorsText: formatPredecessorsText(wp.id, edges, wbsById),
        predecessorEdges,
        earlyStart,
        earlyFinish,
        floatDays: blankDerived ? null : (sched?.floatDays ?? null),
        isCritical: blankDerived ? false : (sched?.isCritical ?? false),
        state: sched?.state ?? null,
        notSchedulable,
        stale: sched?.stale ?? false,
        actualStart: status?.actualStart ?? null,
        actualFinish: status?.actualFinish ?? null,
        recordedPct: pct,
        remainingDays: remaining,
        exception: planGridExceptionCell(haltedReason, {
          wpId: wp.id,
          isLeaf: wp.isLeaf,
          notSchedulableReason: sched?.notSchedulableReason ?? null,
          violationsByWp,
          oosWpIds,
        }),
        plannedMh: compare.plannedMh,
        baselineStart: compare.baselineStart,
        baselineFinish: compare.baselineFinish,
        baselineDurationDays: compare.baselineDurationDays,
        baselineMh: compare.baselineMh,
        startDeltaDays: compare.startDeltaDays,
        finishDeltaDays: compare.finishDeltaDays,
        durationDeltaDays: compare.durationDeltaDays,
        effortDeltaMh: compare.effortDeltaMh,
      };
    });

    const strip = stripDerivedScalars({
      haltedReason,
      computedFinish,
      minFloat,
      anchor,
      projectFinish: project.projectFinish,
    });

    return {
      projectId: input.projectId,
      projectStart: project.projectStart,
      projectFinish: project.projectFinish,
      dataDate: project.dataDate,
      tzOffsetMinutes: project.tzOffsetMinutes,
      anchor,
      computedFinish: strip.computedFinish,
      minFloat: strip.minFloat,
      floatAnchorSentence: strip.floatAnchorSentence,
      haltedReason,
      scheduleStale: anyStale || haltedReason !== null,
      floatAnchorLabel: floatAnchorHeader(anchor),
      finishTeaching: PROJECT_FINISH_TEACHING,
      whatMoved,
      exceptions,
      leafCandidates,
      hasBaseline: activeBaseline.versionSeq !== null,
      rows,
    } satisfies PlanGridState;
  });

  return ok(value);
}

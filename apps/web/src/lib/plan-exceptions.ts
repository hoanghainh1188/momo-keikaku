/**
 * Story 2.16 — pure helpers for the exceptions rail (walk keys, banner, breakpoint).
 */
import type {
  ExceptionsRailItemKey,
  PlanExceptionsRailView,
} from '@/components/plan-grid-types';

export const EXCEPTIONS_RAIL_BREAKPOINT_PX = 1680;

export const VIOLATION_HONESTY_LINE =
  "This violation stays on this work package. It has not changed any other work package's Float.";

export const NOT_SCHEDULABLE_COPY =
  'No duration. Excluded from both passes and from the critical path; its successors are driven from its predecessors as though it were absent. It blocks the next Baseline.';

export const EMPTY_CHAIN_COPY = 'No driving chain recorded';

/** Q1→A calendar-range halt banner — never invents bounds. */
export function calendarRangeHaltBannerCopy(input: {
  readonly rangeStart: string | null;
  readonly rangeEnd: string | null;
  readonly formatDate: (iso: string | null | undefined) => string;
}): string {
  const loaded =
    input.rangeStart !== null && input.rangeEnd !== null
      ? `Loaded ${input.formatDate(input.rangeStart)}–${input.formatDate(input.rangeEnd)}.`
      : 'Loaded range unavailable.';
  return `Schedule halted: calendar range. ${loaded} Derived dates are stale — extend the Holiday Calendar range in Project settings.`;
}

/** Thin/generic 2.13 stale line — never the calendar-range copy. */
export function genericScheduleStaleCopy(haltedReason: string | null): string {
  return haltedReason
    ? `Schedule halted: ${haltedReason}. Derived dates are stale.`
    : 'Schedule outputs are stale — acknowledge the latest run.';
}

export function violationItemKey(wpId: string): ExceptionsRailItemKey {
  return `violation:${wpId}`;
}

export function oosItemKey(predId: string, succId: string): ExceptionsRailItemKey {
  return `oos:${predId}->${succId}`;
}

export function notSchedulableItemKey(wpId: string): ExceptionsRailItemKey {
  return `not_schedulable:${wpId}`;
}

/** Flat walk order: violations → OOS → not-schedulable (UX-DR8 group order). */
export function flattenExceptionsRailKeys(
  rail: PlanExceptionsRailView,
): readonly ExceptionsRailItemKey[] {
  const keys: ExceptionsRailItemKey[] = [];
  for (const v of rail.violations) keys.push(violationItemKey(v.wpId));
  for (const e of rail.outOfSequence) {
    keys.push(oosItemKey(e.predecessorWpId, e.successorWpId));
  }
  for (const n of rail.notSchedulable) keys.push(notSchedulableItemKey(n.wpId));
  return keys;
}

export function focusWpIdForRailKey(
  key: ExceptionsRailItemKey,
  rail: PlanExceptionsRailView,
): string | null {
  if (key.startsWith('violation:')) {
    const wpId = key.slice('violation:'.length);
    const row = rail.violations.find((v) => v.wpId === wpId);
    return row ? wpId : null;
  }
  if (key.startsWith('oos:')) {
    const body = key.slice('oos:'.length);
    const sep = body.indexOf('->');
    if (sep < 0) return null;
    const succId = body.slice(sep + 2);
    const row = rail.outOfSequence.find(
      (e) =>
        e.predecessorWpId === body.slice(0, sep) && e.successorWpId === succId,
    );
    // Focus the successor (the row whose Exception cell shows OOS).
    return row?.successorPresent ? succId : null;
  }
  if (key.startsWith('not_schedulable:')) {
    const wpId = key.slice('not_schedulable:'.length);
    const row = rail.notSchedulable.find((n) => n.wpId === wpId);
    return row ? wpId : null;
  }
  return null;
}

/** Primary grid WP for an Exception-cell activate / `e` key. */
export function railKeyForGridException(
  wpId: string,
  kind: 'violation' | 'out_of_sequence' | 'not_schedulable',
  rail: PlanExceptionsRailView,
): ExceptionsRailItemKey | null {
  if (kind === 'violation') {
    return rail.violations.some((v) => v.wpId === wpId) ? violationItemKey(wpId) : null;
  }
  if (kind === 'not_schedulable') {
    return rail.notSchedulable.some((n) => n.wpId === wpId)
      ? notSchedulableItemKey(wpId)
      : null;
  }
  // Cell shows one OOS label; open the first edge for this successor.
  const edge = rail.outOfSequence.find((e) => e.successorWpId === wpId);
  return edge ? oosItemKey(edge.predecessorWpId, edge.successorWpId) : null;
}

export type ExplainerTarget =
  | { readonly kind: 'violation'; readonly wpId: string }
  | {
      readonly kind: 'out_of_sequence';
      readonly predecessorWpId: string;
      readonly successorWpId: string;
    }
  | { readonly kind: 'not_schedulable'; readonly wpId: string };

export function explainerFromRailKey(key: ExceptionsRailItemKey): ExplainerTarget | null {
  if (key.startsWith('violation:')) {
    return { kind: 'violation', wpId: key.slice('violation:'.length) };
  }
  if (key.startsWith('oos:')) {
    const body = key.slice('oos:'.length);
    const sep = body.indexOf('->');
    if (sep < 0) return null;
    return {
      kind: 'out_of_sequence',
      predecessorWpId: body.slice(0, sep),
      successorWpId: body.slice(sep + 2),
    };
  }
  if (key.startsWith('not_schedulable:')) {
    return { kind: 'not_schedulable', wpId: key.slice('not_schedulable:'.length) };
  }
  return null;
}

/** After recalc: keep the same target if it still exists; else null (close). */
export function rebindExplainer(
  current: ExplainerTarget | null,
  rail: PlanExceptionsRailView,
): ExplainerTarget | null {
  if (current === null) return null;
  if (current.kind === 'violation') {
    return rail.violations.some((v) => v.wpId === current.wpId) ? current : null;
  }
  if (current.kind === 'not_schedulable') {
    return rail.notSchedulable.some((n) => n.wpId === current.wpId) ? current : null;
  }
  return rail.outOfSequence.some(
    (e) =>
      e.predecessorWpId === current.predecessorWpId &&
      e.successorWpId === current.successorWpId,
  )
    ? current
    : null;
}

export function oosExplainerProse(input: {
  readonly successorWbsCode: string;
  readonly successorName: string;
  readonly predecessorWbsCode: string;
  readonly predecessorName: string;
  readonly successorActualStart: string | null;
  readonly predecessorFinish: string | null;
  readonly formatDate: (iso: string | null | undefined) => string;
}): string {
  const succ = `WP ${input.successorWbsCode} ${input.successorName}`.trim();
  const pred = `WP ${input.predecessorWbsCode} ${input.predecessorName}`.trim();
  if (input.successorActualStart && input.predecessorFinish) {
    return `${succ} started ${input.formatDate(input.successorActualStart)}, before ${pred} finishes ${input.formatDate(input.predecessorFinish)}. Actual dates are kept. The successors of ${input.successorWbsCode} are driven from its actual start.`;
  }
  return `${succ} is out of sequence with ${pred}. Actual dates are kept when present.`;
}

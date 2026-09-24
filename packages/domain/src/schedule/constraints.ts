/**
 * Soft constraints for the forward pass (story 2.7). Internal to `domain/schedule`: not exported
 * from `index.ts`. Constraints never enter `backward.ts` and are never an anchor.
 *
 *   * *Must start on* holds a remaining WP back where the graph allows (early start =
 *     max(graph start, rolled date via `ceilPosition`)). Where the graph forces a later start,
 *     the graph wins and a violation is reported.
 *   * *Must finish on* never changes dates: a derived finish after the rolled date is a
 *     violation; finishing on or before it is success.
 *   * A constraint on a complete or in-progress WP is ignored for dates and for the violation
 *     list (Q5 → A).
 *   * A constraint date on a non-working day rolls: MSO via `ceilPosition`, MFO via
 *     `floorPosition` (Q4 → B). Outside the calendar range, or a rolled position still out of
 *     range, is a `calendar_range` halt naming the WP.
 *   * Violations report the PM's asked date (unrolled), the derived date, working days late
 *     (> 0) and the first-driver predecessor chain, sorted by days late descending then
 *     canonical (`compareWp`) index.
 */
import {
  ceilPosition,
  floorPosition,
  type IsoDate,
  type RangeSide,
  type WorkingDayIndex,
} from '../calendar';
import type { Plan } from './plan';
import type { ConstraintType, ConstraintViolation, ScheduleWp } from './recalculate';

/** A remaining leaf's rolled constraint bound, or the side of the range it left by. */
export type ConstraintBound =
  | { readonly ok: true; readonly position: number }
  | { readonly ok: false; readonly side: RangeSide };

/**
 * Rolls a remaining WP's constraint date onto a working-day position. `asap` returns `null`
 * (no bound). Outside the range, or a roll that still leaves no in-range working day, fails.
 */
export function rolledConstraint(
  cal: WorkingDayIndex,
  type: ConstraintType,
  date: IsoDate | null,
): ConstraintBound | null {
  if (type === 'asap') return null;
  // Pairing is asserted at the entry: `must_*` always carries a date here.
  if (type === 'must_start_on') {
    const position = ceilPosition(cal, date!);
    if (!position.ok) return position;
    return position.value < cal.days.length
      ? { ok: true, position: position.value }
      : { ok: false, side: 'after' };
  }
  const position = floorPosition(cal, date!);
  if (!position.ok) return position;
  return position.value >= 0
    ? { ok: true, position: position.value }
    : { ok: false, side: 'before' };
}

/**
 * Throws unless each WP's `constraintType` / `constraintDate` pair matches the product columns:
 * `asap` ↔ null, `must_*` ↔ a date.
 */
export function assertConstraintPairing(wp: ScheduleWp, name: string): void {
  const { constraintType: type, constraintDate: date } = wp;
  if (type === 'asap') {
    if (date !== null) {
      throw new RangeError(`${name} is asap but carries constraint date ${date}`);
    }
    return;
  }
  if (date === null) {
    throw new RangeError(`${name} has ${type} but no constraint date`);
  }
}

/** What the forward pass needs to apply and later report a remaining leaf's constraint. */
export interface AppliedConstraint {
  /** Rolled working-day position of the asked date. */
  readonly rolled: number;
  readonly type: 'must_start_on' | 'must_finish_on';
  /** The date the PM set, unrolled. */
  readonly askedDate: IsoDate;
}

/**
 * Resolves a remaining WP's constraint for the forward pass. Returns `null` when asap (nothing
 * to apply). Fails with a range side when the date leaves the calendar.
 */
export function resolveRemainingConstraint(
  cal: WorkingDayIndex,
  wp: ScheduleWp,
): AppliedConstraint | { readonly ok: false; readonly side: RangeSide } | null {
  if (wp.constraintType === 'asap') return null;
  const bound = rolledConstraint(cal, wp.constraintType, wp.constraintDate);
  if (bound === null) return null;
  if (!bound.ok) return bound;
  return {
    rolled: bound.position,
    type: wp.constraintType,
    askedDate: wp.constraintDate!,
  };
}

/**
 * Holds a remaining WP's early-start position back to a *must start on* bound when the graph
 * allows it. Returns the (possibly raised) start.
 */
export function holdBackStart(graphStart: number, constraint: AppliedConstraint | null): number {
  if (constraint === null || constraint.type !== 'must_start_on') return graphStart;
  return constraint.rolled > graphStart ? constraint.rolled : graphStart;
}

interface LeafForViolations {
  readonly state: 'complete' | 'in_progress' | 'remaining';
  readonly earlyStart: IsoDate | null;
  readonly earlyFinish: IsoDate | null;
  readonly positions: { readonly start: number; readonly finish: number } | null;
  readonly drivers: readonly number[];
  readonly notSchedulable: boolean;
}

/**
 * Collects soft-constraint misses on remaining dated leaves. Sort: days late descending, then
 * canonical index (AD-28 / `compareWp`).
 */
export function collectViolations(
  plan: Plan<ScheduleWp>,
  leaves: readonly (LeafForViolations | undefined)[],
  cal: WorkingDayIndex,
): ConstraintViolation[] {
  const rows: { index: number; violation: ConstraintViolation }[] = [];
  for (let i = 0; i < plan.wps.length; i++) {
    if (!plan.isOwn[i] || plan.isSummary[i]) continue;
    const leaf = leaves[i];
    if (leaf === undefined || leaf.notSchedulable || leaf.state !== 'remaining') continue;
    if (leaf.positions === null || leaf.earlyStart === null || leaf.earlyFinish === null) continue;
    const wp = plan.wps[i]!;
    if (wp.constraintType === 'asap') continue;
    const bound = rolledConstraint(cal, wp.constraintType, wp.constraintDate);
    // Range failures are halted in the forward pass; a remaining leaf that reached assemble has
    // a bound in range.
    if (bound === null || !bound.ok) continue;

    const derivedPos =
      wp.constraintType === 'must_start_on' ? leaf.positions.start : leaf.positions.finish;
    const derivedDate =
      wp.constraintType === 'must_start_on' ? leaf.earlyStart : leaf.earlyFinish;
    const daysLate = derivedPos - bound.position;
    if (daysLate <= 0) continue;

    rows.push({
      index: i,
      violation: {
        wpId: wp.id,
        constraintType: wp.constraintType,
        askedDate: wp.constraintDate!,
        derivedDate,
        daysLate,
        chain: firstDriverChain(leaves, plan, i),
      },
    });
  }
  rows.sort((a, b) => b.violation.daysLate - a.violation.daysLate || a.index - b.index);
  return rows.map((r) => r.violation);
}

/**
 * Walks `drivingPredecessors[0]` from `from` until a WP with no driver, with a cycle guard
 * (Q7 → A). Bridged drivers already appear in that list from 2.6.
 */
function firstDriverChain(
  leaves: readonly (LeafForViolations | undefined)[],
  plan: Plan<ScheduleWp>,
  from: number,
): string[] {
  const chain: string[] = [];
  const seen = new Set<number>();
  let current = from;
  for (;;) {
    const leaf = leaves[current];
    const first = leaf?.drivers[0];
    if (first === undefined) break;
    if (seen.has(first)) break;
    seen.add(first);
    chain.push(plan.wps[first]!.id);
    current = first;
  }
  return chain;
}

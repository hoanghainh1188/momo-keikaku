/**
 * FR-14 / AD-15: working-day maths and Reporting Periods live here and nowhere else.
 * Pure: never reads the clock.
 *
 * Dates are handled as plain 'YYYY-MM-DD' strings in the Project time zone.
 * The demo Project runs in Asia/Tokyo (fixed +09:00), so instant -> project date
 * is a fixed offset. A real implementation needs a tz database; noted as a demo
 * simplification in README-DEMO.md.
 */

import {
  DEFAULT_CALENDAR_RANGE_END,
  DEFAULT_CALENDAR_RANGE_START,
  JP_HOLIDAYS_2026,
  JP_NATIONAL_HOLIDAYS,
  NATIONAL_DATASET_VERSION,
  VN_HOLIDAYS_2026,
  VN_NATIONAL_HOLIDAYS,
  type NationalSet,
} from './national-dataset';

export type IsoDate = string; // YYYY-MM-DD
export type HolidayKind = 'jp' | 'vn';

export interface HolidayCalendar {
  id: string;
  /** date -> which country/countries it belongs to (for FR-14 shading) */
  holidays: Record<IsoDate, HolidayKind[]>;
}

export {
  DEFAULT_CALENDAR_RANGE_END,
  DEFAULT_CALENDAR_RANGE_START,
  JP_HOLIDAYS_2026,
  JP_NATIONAL_HOLIDAYS,
  NATIONAL_DATASET_VERSION,
  VN_HOLIDAYS_2026,
  VN_NATIONAL_HOLIDAYS,
  type NationalSet,
};

export function buildCalendar(
  id: string,
  opts: { jp: boolean; vn: boolean; extra?: IsoDate[] },
): HolidayCalendar {
  const holidays: Record<IsoDate, HolidayKind[]> = {};
  const add = (d: IsoDate, k: HolidayKind) => {
    holidays[d] = [...(holidays[d] ?? []), k];
  };
  if (opts.jp) JP_HOLIDAYS_2026.forEach((d) => add(d, 'jp'));
  if (opts.vn) VN_HOLIDAYS_2026.forEach((d) => add(d, 'vn'));
  (opts.extra ?? []).forEach((d) => add(d, 'jp'));
  return { id, holidays };
}

export function parseDate(d: IsoDate): Date {
  return new Date(`${d}T00:00:00.000Z`);
}
export function formatDate(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}
export function addDays(d: IsoDate, n: number): IsoDate {
  const t = parseDate(d);
  t.setUTCDate(t.getUTCDate() + n);
  return formatDate(t);
}
/** 0 = Sunday .. 6 = Saturday */
export function weekday(d: IsoDate): number {
  return parseDate(d).getUTCDay();
}
export function isWeekend(d: IsoDate): boolean {
  const w = weekday(d);
  return w === 0 || w === 6;
}
export function isWorkingDay(d: IsoDate, cal: HolidayCalendar): boolean {
  return !isWeekend(d) && !(d in cal.holidays);
}

/** Inclusive count of working days in [start, end]. Returns 0 when end < start. */
export function workingDaysBetween(start: IsoDate, end: IsoDate, cal: HolidayCalendar): number {
  if (end < start) return 0;
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (isWorkingDay(d, cal)) n += 1;
  return n;
}

export function addWorkingDays(start: IsoDate, n: number, cal: HolidayCalendar): IsoDate {
  let d = start;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (isWorkingDay(d, cal)) left -= 1;
  }
  return d;
}

export function nextWorkingDay(d: IsoDate, cal: HolidayCalendar): IsoDate {
  return addWorkingDays(d, 1, cal);
}

/** Project-local calendar date of an instant, for a fixed-offset time zone. */
export function projectDate(instantIso: string, tzOffsetMinutes: number): IsoDate {
  const t = new Date(instantIso);
  return formatDate(new Date(t.getTime() + tzOffsetMinutes * 60_000));
}

export interface ReportingPeriod {
  /** inclusive project-local dates */
  start: IsoDate;
  end: IsoDate;
  label: string;
}

/**
 * FR-28 / AD-15: weekly Reporting Period aligned to the teirei weekday.
 * The Period ENDS on the teirei weekday, so Wednesday evening's Review covers
 * the week that the Thursday meeting reports on.
 */
export function periodOf(
  instantIso: string,
  tzOffsetMinutes: number,
  teireiWeekday: number,
): ReportingPeriod {
  const d = projectDate(instantIso, tzOffsetMinutes);
  let end = d;
  // walk forward to the next teirei weekday (inclusive of today)
  for (let i = 0; i < 7; i += 1) {
    if (weekday(end) === teireiWeekday) break;
    end = addDays(end, 1);
  }
  const start = addDays(end, -6);
  return { start, end, label: `${start} – ${end}` };
}

export function periodContains(p: ReportingPeriod, date: IsoDate): boolean {
  return date >= p.start && date <= p.end;
}

// --- the bounded calendar (story 2.5, founder decision Q1 → A) --------------------------------
//
// The scheduler's working-day arithmetic. Unlike `HolidayCalendar` above (which `evm.ts` and
// `forecast.ts` use, and which walks forever), a `CalendarVersion` carries its own range and an
// EXHAUSTIVE non-working-day set: weekends are listed like any holiday, and no weekday rule
// applies. It has the shape of a `holiday_calendar_version` row (`non_working_days`,
// `range_start`, `range_end`), so a stored version is re-derivable from the row alone.
//
// Every answer that would leave the range is a typed failure naming the side it left by, never
// a guess (FR-6b: "a pass that runs past the calendar's loaded range halts").

/** A dated calendar version: every non-working day in `[rangeStart, rangeEnd]`, inclusive. */
export interface CalendarVersion {
  readonly nonWorkingDays: readonly IsoDate[];
  readonly rangeStart: IsoDate;
  readonly rangeEnd: IsoDate;
}

export type RangeSide = 'before' | 'after';

/** A value inside the calendar's range, or the side of the range the question left by. */
export type InRange<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly side: RangeSide };

/**
 * A `CalendarVersion` indexed so every question is O(1): the working days in range, in order,
 * and for every date in range the index of the last working day on or before it.
 *
 * Working-day positions are plain integers: position `i` is `days[i]`. Arithmetic on positions
 * may leave `[0, days.length)`; only turning a position back into a date checks the range.
 */
export interface WorkingDayIndex {
  readonly rangeStart: IsoDate;
  readonly rangeEnd: IsoDate;
  /** The working days in range, ascending. */
  readonly days: readonly IsoDate[];
  /** Date in range → index of the last working day on or before it (−1 when there is none). */
  readonly floorOf: ReadonlyMap<IsoDate, number>;
  readonly working: ReadonlySet<IsoDate>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Throws unless `d` is a real calendar date written `YYYY-MM-DD`. */
export function assertIsoDate(d: IsoDate, what: string): void {
  if (!ISO_DATE.test(d) || Number.isNaN(parseDate(d).getTime()) || formatDate(parseDate(d)) !== d) {
    throw new RangeError(`${what} "${d}" is not a YYYY-MM-DD calendar date`);
  }
}

/**
 * Indexes a calendar version. Throws (a caller defect) on a malformed date, an empty range, or
 * a non-working day outside the range: the set is exhaustive for the range and nothing else.
 */
export function workingDayIndex(version: CalendarVersion): WorkingDayIndex {
  assertIsoDate(version.rangeStart, 'calendar rangeStart');
  assertIsoDate(version.rangeEnd, 'calendar rangeEnd');
  if (version.rangeEnd < version.rangeStart) {
    throw new RangeError(
      `calendar range ${version.rangeStart} – ${version.rangeEnd} ends before it starts`,
    );
  }
  const nonWorking = new Set<IsoDate>();
  for (const d of version.nonWorkingDays) {
    assertIsoDate(d, 'calendar non-working day');
    if (d < version.rangeStart || d > version.rangeEnd) {
      throw new RangeError(
        `calendar non-working day ${d} is outside its range ${version.rangeStart} – ${version.rangeEnd}`,
      );
    }
    nonWorking.add(d);
  }
  const days: IsoDate[] = [];
  const floorOf = new Map<IsoDate, number>();
  const working = new Set<IsoDate>();
  for (let d = version.rangeStart; d <= version.rangeEnd; d = addDays(d, 1)) {
    if (!nonWorking.has(d)) {
      days.push(d);
      working.add(d);
    }
    floorOf.set(d, days.length - 1);
  }
  return { rangeStart: version.rangeStart, rangeEnd: version.rangeEnd, days, floorOf, working };
}

function outside(idx: WorkingDayIndex, d: IsoDate): RangeSide | null {
  if (d < idx.rangeStart) return 'before';
  if (d > idx.rangeEnd) return 'after';
  return null;
}

/** The floor position of an in-range date. Throws on a malformed one such as '2026-10-1'. */
function positionOf(idx: WorkingDayIndex, d: IsoDate): number {
  const floor = idx.floorOf.get(d);
  if (floor === undefined) throw new RangeError(`"${d}" is not a YYYY-MM-DD calendar date`);
  return floor;
}

/** The working day at position `i`, or the side of the range `i` lies beyond. */
export function workingDayAt(idx: WorkingDayIndex, i: number): InRange<IsoDate> {
  if (i < 0) return { ok: false, side: 'before' };
  if (i >= idx.days.length) return { ok: false, side: 'after' };
  return { ok: true, value: idx.days[i]! };
}

/**
 * The position of the last working day on or before `d`: `d`'s own position on a working day,
 * −1 when no working day in range precedes it. Fails only when `d` itself is outside the range.
 */
export function floorPosition(idx: WorkingDayIndex, d: IsoDate): InRange<number> {
  const side = outside(idx, d);
  if (side !== null) return { ok: false, side };
  return { ok: true, value: positionOf(idx, d) };
}

/**
 * The position of the first working day on or after `d`: `d`'s own position on a working day,
 * `days.length` when no working day in range follows it. Fails only when `d` is outside the range.
 */
export function ceilPosition(idx: WorkingDayIndex, d: IsoDate): InRange<number> {
  const side = outside(idx, d);
  if (side !== null) return { ok: false, side };
  const floor = positionOf(idx, d);
  return { ok: true, value: idx.working.has(d) ? floor : floor + 1 };
}

/** Q2: a date on a non-working day rolls forward to the next working day; a working day stays. */
export function rollForward(idx: WorkingDayIndex, d: IsoDate): InRange<IsoDate> {
  const position = ceilPosition(idx, d);
  return position.ok ? workingDayAt(idx, position.value) : position;
}

/**
 * The working day `n` working days after (`n` > 0) or before (`n` < 0) the working day `d`.
 * `d` must be a working day in range (roll it first); anything else is a caller defect and throws.
 */
export function shiftWorkingDays(idx: WorkingDayIndex, d: IsoDate, n: number): InRange<IsoDate> {
  if (!Number.isSafeInteger(n)) throw new RangeError(`shiftWorkingDays: ${n} is not an integer`);
  const side = outside(idx, d);
  if (side !== null) return { ok: false, side };
  if (!idx.working.has(d)) {
    throw new RangeError(`shiftWorkingDays: ${d} is not a working day; roll it forward first`);
  }
  return workingDayAt(idx, idx.floorOf.get(d)! + n);
}

// --- resolve at publish (story 2.12) -----------------------------------------------------------


export interface ResolveCalendarVersionArgs {
  readonly rangeStart?: IsoDate;
  readonly rangeEnd?: IsoDate;
  readonly calendarJp: boolean;
  readonly calendarVn: boolean;
  /** Live Project non-working days (heads of `calendar_day_event` with effect `add`). */
  readonly projectDays?: readonly IsoDate[];
}

export interface ResolvedCalendarVersion extends CalendarVersion {
  readonly nationalSets: readonly NationalSet[];
  readonly nationalDatasetVersion: typeof NATIONAL_DATASET_VERSION;
}

/**
 * Build the fully resolved non-working-day set over `[rangeStart, rangeEnd]`: every weekend,
 * selected national holidays that fall in range, and live Project days in range.
 */
export function resolveCalendarVersion(
  args: ResolveCalendarVersionArgs,
): ResolvedCalendarVersion {
  const rangeStart = args.rangeStart ?? DEFAULT_CALENDAR_RANGE_START;
  const rangeEnd = args.rangeEnd ?? DEFAULT_CALENDAR_RANGE_END;
  assertIsoDate(rangeStart, 'calendar rangeStart');
  assertIsoDate(rangeEnd, 'calendar rangeEnd');
  if (rangeEnd < rangeStart) {
    throw new RangeError(`calendar range ${rangeStart} – ${rangeEnd} ends before it starts`);
  }

  const nationalSets: NationalSet[] = [];
  const nationals = new Set<IsoDate>();
  if (args.calendarJp) {
    nationalSets.push('jp');
    for (const d of JP_NATIONAL_HOLIDAYS) {
      if (d >= rangeStart && d <= rangeEnd) nationals.add(d);
    }
  }
  if (args.calendarVn) {
    nationalSets.push('vn');
    for (const d of VN_NATIONAL_HOLIDAYS) {
      if (d >= rangeStart && d <= rangeEnd) nationals.add(d);
    }
  }

  const projectDays = new Set<IsoDate>();
  for (const d of args.projectDays ?? []) {
    assertIsoDate(d, 'project non-working day');
    if (d >= rangeStart && d <= rangeEnd) projectDays.add(d);
  }

  const nonWorkingDays: IsoDate[] = [];
  for (let d = rangeStart; d <= rangeEnd; d = addDays(d, 1)) {
    if (isWeekend(d) || nationals.has(d) || projectDays.has(d)) {
      nonWorkingDays.push(d);
    }
  }

  return {
    nonWorkingDays,
    rangeStart,
    rangeEnd,
    nationalSets,
    nationalDatasetVersion: NATIONAL_DATASET_VERSION,
  };
}

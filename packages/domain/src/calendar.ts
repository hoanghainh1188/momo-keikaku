/**
 * FR-14 / AD-15: working-day maths and Reporting Periods live here and nowhere else.
 * Pure: never reads the clock.
 *
 * Dates are handled as plain 'YYYY-MM-DD' strings in the Project time zone.
 * The demo Project runs in Asia/Tokyo (fixed +09:00), so instant -> project date
 * is a fixed offset. A real implementation needs a tz database; noted as a demo
 * simplification in README-DEMO.md.
 */

export type IsoDate = string; // YYYY-MM-DD
export type HolidayKind = 'jp' | 'vn';

export interface HolidayCalendar {
  id: string;
  /** date -> which country/countries it belongs to (for FR-14 shading) */
  holidays: Record<IsoDate, HolidayKind[]>;
}

/** FR-14: JP + VN national holidays. Demo dataset covers 2026 (extend to 2028 for production). */
export const JP_HOLIDAYS_2026: IsoDate[] = [
  '2026-01-01', '2026-01-12', '2026-02-11', '2026-02-23', '2026-03-20', '2026-04-29',
  '2026-05-03', '2026-05-04', '2026-05-05', '2026-05-06', '2026-07-20', '2026-08-11',
  '2026-09-21', '2026-09-22', '2026-09-23', '2026-10-12', '2026-11-03', '2026-11-23',
];
export const VN_HOLIDAYS_2026: IsoDate[] = [
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20',
  '2026-04-26', '2026-04-30', '2026-05-01', '2026-09-02',
];

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

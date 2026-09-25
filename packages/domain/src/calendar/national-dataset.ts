/**
 * Versioned JP / VN national holiday dataset (story 2.12 / FR-14 / AD-15 / Q3→B).
 *
 * Covers 2025-01-01 … 2028-12-31. Recorded as `national_dataset_version` provenance on each
 * published `holiday_calendar_version`. Corrections bump this id and republish.
 *
 * JP dates include substitute holidays (振替休日) and Citizens' Holidays (国民の休日) where the
 * Act produces them. VN dates are the statutory public-holiday cores (New Year, Tết, Hùng Kings,
 * Liberation / Labour, National Day) — compensatory weekend swaps stay Project days when needed.
 */
/** Plain YYYY-MM-DD — kept local so this module does not import `./index` (cycle). */
type IsoDate = string;

/** Provenance id written onto every published version built from this dataset. */
export const NATIONAL_DATASET_VERSION = 'national-2025-2028-v1' as const;

export type NationalSet = 'jp' | 'vn';

/** Japanese national holidays (incl. substitutes / Citizens' Holidays) for 2025–2028. */
export const JP_NATIONAL_HOLIDAYS: readonly IsoDate[] = [
  // 2025
  '2025-01-01',
  '2025-01-13',
  '2025-02-11',
  '2025-02-23',
  '2025-02-24',
  '2025-03-20',
  '2025-04-29',
  '2025-05-03',
  '2025-05-04',
  '2025-05-05',
  '2025-05-06',
  '2025-07-21',
  '2025-08-11',
  '2025-09-15',
  '2025-09-23',
  '2025-10-13',
  '2025-11-03',
  '2025-11-23',
  '2025-11-24',
  // 2026 (Cabinet Office)
  '2026-01-01',
  '2026-01-12',
  '2026-02-11',
  '2026-02-23',
  '2026-03-20',
  '2026-04-29',
  '2026-05-03',
  '2026-05-04',
  '2026-05-05',
  '2026-05-06',
  '2026-07-20',
  '2026-08-11',
  '2026-09-21',
  '2026-09-22',
  '2026-09-23',
  '2026-10-12',
  '2026-11-03',
  '2026-11-23',
  // 2027 (Cabinet Office)
  '2027-01-01',
  '2027-01-11',
  '2027-02-11',
  '2027-02-23',
  '2027-03-21',
  '2027-03-22',
  '2027-04-29',
  '2027-05-03',
  '2027-05-04',
  '2027-05-05',
  '2027-07-19',
  '2027-08-11',
  '2027-09-20',
  '2027-09-23',
  '2027-10-11',
  '2027-11-03',
  '2027-11-23',
  // 2028
  '2028-01-01',
  '2028-01-10',
  '2028-02-11',
  '2028-02-23',
  '2028-03-20',
  '2028-04-29',
  '2028-05-03',
  '2028-05-04',
  '2028-05-05',
  '2028-07-17',
  '2028-08-11',
  '2028-09-18',
  '2028-09-22',
  '2028-10-09',
  '2028-11-03',
  '2028-11-23',
];

/** Vietnamese statutory public holidays for 2025–2028 (Tết included). */
export const VN_NATIONAL_HOLIDAYS: readonly IsoDate[] = [
  // 2025
  '2025-01-01',
  '2025-01-25',
  '2025-01-26',
  '2025-01-27',
  '2025-01-28',
  '2025-01-29',
  '2025-04-07',
  '2025-04-30',
  '2025-05-01',
  '2025-09-01',
  '2025-09-02',
  // 2026 (matches prior JP_HOLIDAYS_2026 companion list)
  '2026-01-01',
  '2026-02-16',
  '2026-02-17',
  '2026-02-18',
  '2026-02-19',
  '2026-02-20',
  '2026-04-26',
  '2026-04-30',
  '2026-05-01',
  '2026-09-02',
  // 2027
  '2027-01-01',
  '2027-02-05',
  '2027-02-06',
  '2027-02-07',
  '2027-02-08',
  '2027-02-09',
  '2027-04-16',
  '2027-04-30',
  '2027-05-01',
  '2027-09-02',
  // 2028
  '2028-01-01',
  '2028-01-25',
  '2028-01-26',
  '2028-01-27',
  '2028-01-28',
  '2028-01-29',
  '2028-04-04',
  '2028-04-30',
  '2028-05-01',
  '2028-09-02',
];

/** Default publish range (founder Q3→B): history-ish 2025 actuals through 2028. */
export const DEFAULT_CALENDAR_RANGE_START: IsoDate = '2025-01-01';
export const DEFAULT_CALENDAR_RANGE_END: IsoDate = '2028-12-31';

/** Legacy 2026-only exports kept for EVM / `buildCalendar` callers. */
export const JP_HOLIDAYS_2026: IsoDate[] = JP_NATIONAL_HOLIDAYS.filter((d) => d.startsWith('2026-'));
export const VN_HOLIDAYS_2026: IsoDate[] = VN_NATIONAL_HOLIDAYS.filter((d) => d.startsWith('2026-'));

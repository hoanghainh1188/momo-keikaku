/**
 * Shared Plan EN display helpers (Epic 2 retro F2/F5).
 * Client-safe via `@momo/domain/present` (AD-1) — app and web must not keep local copies.
 */

export const SUMMARY_NA_LABEL =
  'not applicable — summary work package, rolled up from its children';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** EN display date: `19 Sep 2026` (EXPERIENCE). */
export function formatPlanDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1] ?? 'Jan'} ${y}`;
}

/** Short EN date without year — used in What-moved arrows. */
export function formatPlanDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1] ?? 'Jan'}`;
}

/** Long month for polite announce: `26 March 2027`. */
export function formatPlanDateLong(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_LONG[m - 1] ?? 'January'} ${y}`;
}

export function formatMinFloat(minFloat: number | null): string {
  if (minFloat === null) return '—';
  const sign = minFloat > 0 ? '+' : '';
  return `${sign}${minFloat}`;
}

export function inkTone(
  date: string | null,
  dataDate: string | null,
): 'muted' | 'full' | 'na' {
  if (date === null) return 'na';
  if (dataDate === null) return 'full';
  return date <= dataDate ? 'muted' : 'full';
}

export function formatFloatDisplay(floatDays: number | null, notSchedulable: boolean): {
  readonly text: string;
  readonly negative: boolean;
} {
  if (notSchedulable || floatDays === null) return { text: '—', negative: false };
  const sign = floatDays > 0 ? '+' : '';
  return { text: `${sign}${floatDays}`, negative: floatDays < 0 };
}

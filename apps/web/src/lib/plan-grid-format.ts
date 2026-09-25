/**
 * Plan grid display helpers (story 2.13). Mirrors `packages/app/src/schedule/plan-grid.ts`
 * pure formatters — web may not import that module (DB-bound use case).
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

/** EN display date: `19 Sep 2026`. */
export function formatPlanDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1] ?? 'Jan'} ${y}`;
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

export function recordedPctDisplay(
  pct: { readonly num: string; readonly den: string } | null,
): string {
  if (pct === null) return 'none — scheduled as 0%';
  const num = BigInt(pct.num);
  const den = BigInt(pct.den);
  if (den === 0n) return 'none — scheduled as 0%';
  const tenths = Number((num * 1000n) / den);
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10;
  return frac === 0 ? `${whole}%` : `${whole}.${frac}%`;
}

export type PlanPreset = 'schedule' | 'progress';

export function presetStorageKey(userId: string, projectId: string): string {
  return `momo.plan.preset:${userId}:${projectId}`;
}

export function readStoredPreset(userId: string, projectId: string): PlanPreset {
  if (typeof window === 'undefined') return 'schedule';
  try {
    const raw = window.localStorage.getItem(presetStorageKey(userId, projectId));
    if (raw === 'progress') return 'progress';
    return 'schedule';
  } catch {
    return 'schedule';
  }
}

export function writeStoredPreset(
  userId: string,
  projectId: string,
  preset: PlanPreset,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(presetStorageKey(userId, projectId), preset);
  } catch {
    // Quota / private mode — ignore; preset still works in-session.
  }
}

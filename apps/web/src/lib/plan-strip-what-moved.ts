/**
 * Story 2.15 — client-side schedule strip / What-moved helpers.
 * Mirrors packages/app plan-grid formatters the web cannot import.
 */

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

export function formatPlanDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1] ?? 'Jan'} ${y}`;
}

export function formatMinFloat(minFloat: number | null): string {
  if (minFloat === null) return '—';
  const sign = minFloat > 0 ? '+' : '';
  return `${sign}${minFloat}`;
}

export function formatRelativeAgo(atIso: string, nowMs: number): string {
  const at = Date.parse(atIso);
  if (Number.isNaN(at)) return '';
  const ms = Math.max(0, nowMs - at);
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

export function whatMovedDismissKey(projectId: string, runSeq: number): string {
  return `momo.plan.what-moved-dismissed:${projectId}:${runSeq}`;
}

export function readWhatMovedDismissed(projectId: string, runSeq: number): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(whatMovedDismissKey(projectId, runSeq)) === '1';
  } catch {
    return false;
  }
}

export function writeWhatMovedDismissed(projectId: string, runSeq: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(whatMovedDismissKey(projectId, runSeq), '1');
  } catch {
    // private mode — dismiss stays in-component only
  }
}

/** Prefer given name's first token for "edited by Hoang". */
export function shortActorName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'someone';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

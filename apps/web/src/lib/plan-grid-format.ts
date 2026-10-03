/**
 * Plan grid display helpers (story 2.13) — web-only pct/preset/ink-class helpers.
 * Shared EN formatters live in `@momo/domain/present` (Epic 2 retro F2/F5).
 */

import { inkTone } from '@momo/domain/present';

/** CSS classes for a derived-date cell (Data Date ink). */
export function dateInkClassName(date: string, dataDate: string | null): string {
  const tone = inkTone(date, dataDate);
  return `plan-date-btn ${tone === 'muted' ? 'plan-date-muted' : 'plan-date-full'}`;
}

/** Whole percent for inline editors; null when missing or den is 0. */
export function recordedPctWhole(
  pct: { readonly num: string; readonly den: string } | null,
): number | null {
  if (pct === null) return null;
  const den = BigInt(pct.den);
  if (den === 0n) return null;
  return Math.round(Number((BigInt(pct.num) * 1000n) / den) / 10);
}

/**
 * Whole-percent 0–100 → fence ratio. Returns null when invalid (not written).
 */
export function recordedPercentToRatio(
  percent: number,
): { readonly num: bigint; readonly den: bigint } | null {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) return null;
  return { num: BigInt(percent), den: 100n };
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

/**
 * Preset switch keeps the focused row (UX-DR24). Capture the id before setState so the
 * effect can restore DOM focus after the preset re-render.
 */
export function capturePresetFocusRestore(focusedWpId: string | null): string | null {
  return focusedWpId;
}

/** Keys `1`/`2` map to Schedule/Progress; `3`/`4` are reserved (Q4→A). */
export function presetFromDigitKey(key: string): PlanPreset | null {
  if (key === '1') return 'schedule';
  if (key === '2') return 'progress';
  return null;
}

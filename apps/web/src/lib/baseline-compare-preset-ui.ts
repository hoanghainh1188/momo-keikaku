/**
 * Story 4.5 — Baseline compare preset enable/disable + activate/restore (UX-DR23).
 * Pure helpers so disable / key-3 / stored-preset gating is unit-tested without JSX.
 */

import type { PlanPreset } from './plan-grid-format';

export function baselineComparePresetControl(hasBaseline: boolean): {
  readonly disabled: boolean;
  readonly title: string;
} {
  if (!hasBaseline) {
    return { disabled: true, title: 'No Baseline yet' };
  }
  return { disabled: false, title: 'Baseline compare' };
}

/**
 * Resolve a requested or stored preset against Baseline presence.
 * - `activate`: baseline without a Baseline → `null` (caller no-ops; key `3` / click).
 * - `restore`: stored baseline without a Baseline → `'schedule'` (mount / localStorage).
 */
export function resolvePlanPreset(
  requested: PlanPreset,
  hasBaseline: boolean,
  mode: 'activate' | 'restore',
): PlanPreset | null {
  if (requested !== 'baseline' || hasBaseline) return requested;
  return mode === 'restore' ? 'schedule' : null;
}

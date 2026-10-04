/**
 * Story 4.5 — Baseline compare preset enable/disable contract (UX-DR23).
 * Pure helper so the "No Baseline yet" disable path is unit-tested without JSX.
 */

export function baselineComparePresetControl(hasBaseline: boolean): {
  readonly disabled: boolean;
  readonly title: string;
  /** Digit key `3` may switch to the preset only when enabled. */
  readonly digitKeyActive: boolean;
} {
  if (!hasBaseline) {
    return { disabled: true, title: 'No Baseline yet', digitKeyActive: false };
  }
  return { disabled: false, title: 'Baseline compare', digitKeyActive: true };
}

/**
 * Epic 6 seam (story 4.4, FR-16): a Published Snapshot must record which Baseline version it
 * used. Stub only — no publish table, UI, or workflow here.
 */
export interface PublishedSnapshotBaselinePin {
  readonly baselineVersionSeq: number;
}

/**
 * Narrow an unknown pin to the typed contract. Requires a finite integer `baselineVersionSeq`.
 */
export function publishedSnapshotBaselinePin(
  value: unknown,
): PublishedSnapshotBaselinePin {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('PublishedSnapshotBaselinePin: expected object');
  }
  const seq = (value as { baselineVersionSeq?: unknown }).baselineVersionSeq;
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 1) {
    throw new TypeError(
      'PublishedSnapshotBaselinePin: baselineVersionSeq is required (positive integer)',
    );
  }
  return { baselineVersionSeq: seq };
}

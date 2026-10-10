/**
 * Divergence basis-column status tags (story 6.2). Pure so the EV-fall / low-evidence
 * matrix rows have an observing test without mounting the Review page.
 */

export type DivergenceStatusTagKey = 'low_evidence' | 'ev_fell' | 'estimate_driven';

export interface DivergenceStatusTag {
  readonly key: DivergenceStatusTagKey;
  /** Present only on the EV-fall tag (stable for tests / a11y hooks). */
  readonly testId?: 'ev-fell' | 'estimate-driven-ev';
}

export function divergenceStatusTags(row: {
  readonly lowEvidence: boolean;
  readonly baselineMh: bigint;
  readonly evFell: boolean;
  readonly estimateDrivenEv?: boolean;
}): readonly DivergenceStatusTag[] {
  const tags: DivergenceStatusTag[] = [];
  if (row.lowEvidence && row.baselineMh > 0n) {
    tags.push({ key: 'low_evidence' });
  }
  if (row.evFell) {
    tags.push({ key: 'ev_fell', testId: 'ev-fell' });
  }
  if (row.estimateDrivenEv) {
    tags.push({ key: 'estimate_driven', testId: 'estimate-driven-ev' });
  }
  return tags;
}

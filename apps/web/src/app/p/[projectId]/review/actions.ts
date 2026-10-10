'use server';

import { revalidatePath } from 'next/cache';
import { getProjectReview, planChange, requestContext } from '@/server/composition';

export type ReviewAcceptOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: string;
      readonly messageKey: string;
    };

/**
 * Story 6.4 — Accept Observed % into Recorded via the AD-25 fence.
 * Re-reads Observed for `wpId` from the live Review (never trusts client-supplied %).
 * Requires a non-empty reason; source is always `pm_override`.
 */
export async function acceptObservedPctAction(input: {
  readonly projectId: string;
  readonly wpId: string;
  readonly reason: string;
}): Promise<ReviewAcceptOutcome> {
  const reason = input.reason.trim();
  if (reason.length === 0) {
    return { ok: false, code: 'invalid_input', messageKey: 'review.accept_reason_required' };
  }
  if (!input.projectId || !input.wpId) {
    return { ok: false, code: 'invalid_input', messageKey: 'errors.invalid_input' };
  }

  const ctx = await requestContext();
  const loaded = await getProjectReview({ projectId: input.projectId }, ctx);
  if (!loaded.ok) {
    return {
      ok: false,
      code: loaded.error.code,
      messageKey: loaded.error.messageKey,
    };
  }

  const measure = loaded.value.review.evm?.perWp.find((w) => w.wpId === input.wpId);
  if (measure === undefined) {
    return { ok: false, code: 'invalid_input', messageKey: 'errors.invalid_input' };
  }
  const leaf = loaded.value.bundle.wps.find((w) => w.id === input.wpId);
  if (leaf === undefined || !leaf.isLeaf || leaf.isMilestone) {
    return { ok: false, code: 'invalid_input', messageKey: 'errors.invalid_input' };
  }

  const result = await planChange(
    {
      kind: 'patch_recorded_pct',
      projectId: input.projectId,
      wpId: input.wpId,
      recordedPctNum: measure.pctComplete.num,
      recordedPctDen: measure.pctComplete.den,
      reason,
      source: 'pm_override',
    },
    ctx,
  );
  if (!result.ok) {
    return {
      ok: false,
      code: result.error.code,
      messageKey: result.error.messageKey,
    };
  }
  revalidatePath(`/p/${input.projectId}/review`);
  revalidatePath(`/p/${input.projectId}/plan`);
  return { ok: true };
}

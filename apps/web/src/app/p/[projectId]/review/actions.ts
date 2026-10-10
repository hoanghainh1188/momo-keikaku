'use server';

import { revalidatePath } from 'next/cache';
import { planChange, requestContext } from '@/server/composition';

export type ReviewAcceptOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: string;
      readonly messageKey: string;
    };

/**
 * Story 6.4 — Accept Observed % into Recorded via the AD-25 fence.
 * Requires a non-empty reason; source is always `pm_override`.
 */
export async function acceptObservedPctAction(input: {
  readonly projectId: string;
  readonly wpId: string;
  /** Unreduced Observed Ratio numerator as a decimal string (RSC-safe). */
  readonly observedPctNum: string;
  readonly observedPctDen: string;
  readonly reason: string;
}): Promise<ReviewAcceptOutcome> {
  const reason = input.reason.trim();
  if (reason.length === 0) {
    return { ok: false, code: 'invalid_input', messageKey: 'review.accept_reason_required' };
  }
  let recordedPctNum: bigint;
  let recordedPctDen: bigint;
  try {
    recordedPctNum = BigInt(input.observedPctNum);
    recordedPctDen = BigInt(input.observedPctDen);
  } catch {
    return { ok: false, code: 'invalid_input', messageKey: 'errors.invalid_input' };
  }
  if (recordedPctDen === 0n) {
    return { ok: false, code: 'invalid_input', messageKey: 'errors.invalid_input' };
  }

  const ctx = await requestContext();
  const result = await planChange(
    {
      kind: 'patch_recorded_pct',
      projectId: input.projectId,
      wpId: input.wpId,
      recordedPctNum,
      recordedPctDen,
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

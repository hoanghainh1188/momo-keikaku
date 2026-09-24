'use server';

import { revalidatePath } from 'next/cache';
import {
  completeWp,
  deleteWp,
  firstObservedForWp,
  planChange,
  refuseDerivedDate,
  requestContext,
  wpDeleteConfirm,
  DERIVED_DATE_TEACHING,
} from '@/server/composition';

/**
 * Story 2.10 thin plan UI — server actions wrapping the fence (Q1 → B).
 * Full tree grid stays 2.13+.
 */

export type PlanWriteOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: string;
      readonly messageKey: string;
      readonly details?: Readonly<Record<string, readonly string[]>>;
    };

function refuseOutcome(result: {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly messageKey: string;
    readonly details?: Readonly<Record<string, readonly string[]>>;
  };
}): PlanWriteOutcome {
  return {
    ok: false,
    code: result.error.code,
    messageKey: result.error.messageKey,
    ...(result.error.details !== undefined ? { details: result.error.details } : {}),
  };
}

export async function completeWorkPackageAction(formData: FormData): Promise<PlanWriteOutcome> {
  const projectId = String(formData.get('projectId') ?? '');
  const wpId = String(formData.get('wpId') ?? '');
  const actualFinish = String(formData.get('actualFinish') ?? '');
  const actualStartRaw = formData.get('actualStart');
  const actualStart =
    actualStartRaw === null || actualStartRaw === '' ? null : String(actualStartRaw);
  const acceptProposal = formData.get('acceptFirstObserved') === '1';
  const advanceRaw = formData.get('advanceDataDate');
  const advanceDataDate =
    advanceRaw === null || advanceRaw === '' ? undefined : String(advanceRaw);

  const ctx = await requestContext();
  const result = await completeWp(
    {
      projectId,
      wpId,
      actualStart,
      actualFinish,
      source: acceptProposal ? 'accepted-from-proposal' : 'typed',
      ...(advanceDataDate !== undefined ? { advanceDataDate } : {}),
    },
    ctx,
  );
  if (!result.ok) return refuseOutcome(result);
  revalidatePath(`/p/${projectId}/plan`);
  return { ok: true };
}

export async function deleteWorkPackageAction(formData: FormData): Promise<PlanWriteOutcome> {
  const projectId = String(formData.get('projectId') ?? '');
  const wpId = String(formData.get('wpId') ?? '');
  const ctx = await requestContext();
  const result = await deleteWp({ projectId, wpId }, ctx);
  if (!result.ok) return refuseOutcome(result);
  revalidatePath(`/p/${projectId}/plan`);
  return { ok: true };
}

/** Teaching refuse — derived dates are never written (UX-DR12). */
export async function refuseDerivedDateAction(): Promise<{
  readonly message: string;
  readonly focus: 'constraint';
}> {
  refuseDerivedDate();
  return { message: DERIVED_DATE_TEACHING, focus: 'constraint' };
}

export async function loadFirstObservedAction(
  projectId: string,
  wpId: string,
): Promise<string | null> {
  const ctx = await requestContext();
  const result = await firstObservedForWp({ projectId, wpId }, ctx);
  if (!result.ok) return null;
  return result.value.firstObserved;
}

export async function loadDeleteConfirmAction(
  projectId: string,
  wpId: string,
): Promise<readonly { predecessorWpId: string; successorWpId: string }[]> {
  const ctx = await requestContext();
  const result = await wpDeleteConfirm({ projectId, wpId }, ctx);
  if (!result.ok) return [];
  return result.value.edges;
}

/** Generic fence pass-through for thin patches (duration / pct / name). */
export async function applyPlanMutationAction(input: unknown): Promise<PlanWriteOutcome> {
  const ctx = await requestContext();
  const result = await planChange(input, ctx);
  if (!result.ok) return refuseOutcome(result);
  if (typeof input === 'object' && input !== null && 'projectId' in input) {
    revalidatePath(`/p/${String((input as { projectId: string }).projectId)}/plan`);
  }
  return { ok: true };
}

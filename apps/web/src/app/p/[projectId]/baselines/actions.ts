'use server';

import { revalidatePath } from 'next/cache';
import { requestContext, reProjectBaseline, setProjectBaseline } from '@/server/composition';

/**
 * Story 4.1 / 4.3 + retro F9 — Set / Re-baseline write outcome.
 * Mirrors SettingsWriteOutcome / PlanWriteRefuse: refuse carries code + messageKey for UI.
 */
export type BaselineWriteOutcome =
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
}): BaselineWriteOutcome {
  return {
    ok: false,
    code: result.error.code,
    messageKey: result.error.messageKey,
    ...(result.error.details !== undefined ? { details: result.error.details } : {}),
  };
}

/** Local form/TOCTOU refuse when the action never calls the use case. */
function localRefuse(): BaselineWriteOutcome {
  return { ok: false, code: 'invalid_input', messageKey: 'errors.invalid_input' };
}

function revalidateBaselinePaths(projectId: string): void {
  revalidatePath(`/p/${projectId}/review`);
  revalidatePath(`/p/${projectId}/baselines`);
  revalidatePath(`/p/${projectId}/plan`);
}

/**
 * Story 4.1 — first Set Baseline. Shared by Review, Plan toolbar, and Baselines.
 * Revalidates only when the write landed; refuse is returned for the UI (retro F9).
 */
export async function setBaselineAction(formData: FormData): Promise<BaselineWriteOutcome> {
  const projectId = String(formData.get('projectId') ?? '');
  if (projectId === '') return localRefuse();
  const ctx = await requestContext();
  const result = await setProjectBaseline({ projectId }, ctx);
  if (!result.ok) return refuseOutcome(result);
  revalidateBaselinePaths(projectId);
  return { ok: true };
}

/**
 * Story 4.3 — Re-baseline with mandatory free-text reason.
 * Revalidates only when the write landed; refuse is returned for the UI (retro F9).
 */
export async function reBaselineAction(formData: FormData): Promise<BaselineWriteOutcome> {
  const projectId = String(formData.get('projectId') ?? '');
  const reasonRaw = formData.get('reason');
  if (projectId === '') return localRefuse();
  // File / non-string FormData entries must not coerce to "[object File]".
  if (typeof reasonRaw !== 'string') return localRefuse();
  const ctx = await requestContext();
  const result = await reProjectBaseline({ projectId, reason: reasonRaw }, ctx);
  if (!result.ok) return refuseOutcome(result);
  revalidateBaselinePaths(projectId);
  return { ok: true };
}

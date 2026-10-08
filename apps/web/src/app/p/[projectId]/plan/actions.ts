'use server';

import { revalidatePath } from 'next/cache';
import {
  applyPredecessors,
  clearProjectStartSetting,
  completeWp,
  deleteWp,
  firstObservedForWp,
  planChange,
  planGridState,
  patchDataDate,
  patchProjectFinish,
  refuseDerivedDate,
  requestContext,
  setProjectStartSetting,
  wpDeleteConfirm,
  DERIVED_DATE_TEACHING,
} from '@/server/composition';
import { recordedPercentToRatio } from '@/lib/plan-grid-format';
import { toPlanGridViewModel } from '@/lib/plan-grid-view';
import {
  readAfterWriteRefuse,
  toPlanWriteSuccess,
  type PlanWriteRefuse,
  type PlanWriteSuccess,
} from '@/lib/plan-write-success';

/**
 * Story 2.10 thin plan UI — server actions wrapping the fence (Q1 → B).
 * Story 2.15 widens success with What-moved + strip scalars for the band.
 */

export type { PlanWriteSuccess };
export type PlanWriteOutcome = PlanWriteSuccess | PlanWriteRefuse;

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

async function successFromGrid(projectId: string): Promise<PlanWriteOutcome> {
  const ctx = await requestContext();
  const grid = await planGridState(projectId, ctx);
  if (!grid.ok) return readAfterWriteRefuse();
  return toPlanWriteSuccess(toPlanGridViewModel(grid.value, ctx.userId));
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
  return successFromGrid(projectId);
}

export async function deleteWorkPackageAction(formData: FormData): Promise<PlanWriteOutcome> {
  const projectId = String(formData.get('projectId') ?? '');
  const wpId = String(formData.get('wpId') ?? '');
  const ctx = await requestContext();
  const result = await deleteWp({ projectId, wpId }, ctx);
  if (!result.ok) return refuseOutcome(result);
  revalidatePath(`/p/${projectId}/plan`);
  return successFromGrid(projectId);
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

/** *Set Project start* from the Plan no-start band (2.11). */
export async function setProjectStartPlanAction(formData: FormData): Promise<PlanWriteOutcome> {
  const projectId = String(formData.get('projectId') ?? '');
  const projectStart = String(formData.get('projectStart') ?? '');
  const ctx = await requestContext();
  const result = await setProjectStartSetting({ projectId, projectStart }, ctx);
  if (!result.ok) return refuseOutcome(result);
  revalidatePath(`/p/${projectId}/plan`);
  revalidatePath(`/p/${projectId}/settings`);
  return successFromGrid(projectId);
}

/** Generic fence pass-through for thin patches (duration / pct / name). */
export async function applyPlanMutationAction(input: unknown): Promise<PlanWriteOutcome> {
  const ctx = await requestContext();
  const result = await planChange(input, ctx);
  if (!result.ok) return refuseOutcome(result);
  let projectId = '';
  if (typeof input === 'object' && input !== null && 'projectId' in input) {
    projectId = String((input as { projectId: string }).projectId);
    revalidatePath(`/p/${projectId}/plan`);
  }
  if (projectId === '') {
    return {
      ok: false,
      code: 'invalid_input',
      messageKey: 'errors.invalid_input',
      details: { refuse: ['Missing projectId'] },
    };
  }
  return successFromGrid(projectId);
}

async function fenceMutation(
  projectId: string,
  mutation: unknown,
): Promise<PlanWriteOutcome> {
  const ctx = await requestContext();
  const result = await planChange(mutation, ctx);
  if (!result.ok) return refuseOutcome(result);
  revalidatePath(`/p/${projectId}/plan`);
  return successFromGrid(projectId);
}

/** Inline name edit (story 2.13 / Q2→B) — JSON-safe wrapper around the fence. */
export async function patchWpNameAction(input: {
  readonly projectId: string;
  readonly wpId: string;
  readonly name: string;
}): Promise<PlanWriteOutcome> {
  return fenceMutation(input.projectId, {
    kind: 'patch_wp_name',
    projectId: input.projectId,
    wpId: input.wpId,
    name: input.name,
  });
}

/** Story 5.12 / Q1→A: Plan-grid Catch-all toggle — appends wp_flag_event + dual-writes live column. */
export async function patchWpCatchAllAction(input: {
  readonly projectId: string;
  readonly wpId: string;
  readonly isCatchAll: boolean;
}): Promise<PlanWriteOutcome> {
  return fenceMutation(input.projectId, {
    kind: 'patch_catch_all',
    projectId: input.projectId,
    wpId: input.wpId,
    isCatchAll: input.isCatchAll,
  });
}

/** Inline duration edit (story 2.13 / Q2→B). */
export async function patchWpDurationAction(input: {
  readonly projectId: string;
  readonly wpId: string;
  readonly durationDays: number | null;
}): Promise<PlanWriteOutcome> {
  return fenceMutation(input.projectId, {
    kind: 'patch_duration',
    projectId: input.projectId,
    wpId: input.wpId,
    durationDays: input.durationDays,
  });
}

/**
 * Inline Recorded % edit (story 2.13 / Q2→B). Accepts whole-percent 0–100; converts to a
 * ratio for the fence (`num/100`). BigInt cannot cross the RSC action boundary.
 */
export async function patchWpRecordedPctAction(input: {
  readonly projectId: string;
  readonly wpId: string;
  readonly percent: number;
}): Promise<PlanWriteOutcome> {
  const ratio = recordedPercentToRatio(input.percent);
  if (ratio === null) {
    return { ok: false, code: 'invalid_input', messageKey: 'errors.invalid_input' };
  }
  return fenceMutation(input.projectId, {
    kind: 'patch_recorded_pct',
    projectId: input.projectId,
    wpId: input.wpId,
    recordedPctNum: ratio.num,
    recordedPctDen: ratio.den,
  });
}

/**
 * Story 2.14 — commit MS-Project predecessor text. FR-6a refuse keeps typed text; prose in
 * `details.refuse` for under-cell + assertive announce.
 */
export async function applyPredecessorsAction(input: {
  readonly projectId: string;
  readonly successorWpId: string;
  readonly text: string;
}): Promise<PlanWriteOutcome> {
  const ctx = await requestContext();
  const result = await applyPredecessors(input, ctx);
  if (!result.ok) return refuseOutcome(result);
  revalidatePath(`/p/${input.projectId}/plan`);
  return successFromGrid(input.projectId);
}

/** Story 2.14 — constraint type+date through `patch_constraint` (asap when date cleared). */
export async function patchWpConstraintAction(input: {
  readonly projectId: string;
  readonly wpId: string;
  readonly constraintType: 'asap' | 'must_start_on' | 'must_finish_on';
  readonly constraintDate: string | null;
}): Promise<PlanWriteOutcome> {
  const cleared = input.constraintDate === null || input.constraintDate === '';
  const constraintType = cleared ? 'asap' : input.constraintType;
  const constraintDate = cleared ? null : input.constraintDate;
  if (!cleared && constraintType === 'asap') {
    return {
      ok: false,
      code: 'invalid_input',
      messageKey: 'errors.invalid_input',
      details: { refuse: ['As soon as possible cannot carry a date'] },
    };
  }
  return fenceMutation(input.projectId, {
    kind: 'patch_constraint',
    projectId: input.projectId,
    wpId: input.wpId,
    constraintType,
    constraintDate,
  });
}

/** Story 2.15 — strip Project start via fence. */
export async function setProjectStartStripAction(input: {
  readonly projectId: string;
  readonly projectStart: string;
}): Promise<PlanWriteOutcome> {
  const ctx = await requestContext();
  const result = await setProjectStartSetting(input, ctx);
  if (!result.ok) return refuseOutcome(result);
  revalidatePath(`/p/${input.projectId}/plan`);
  revalidatePath(`/p/${input.projectId}/settings`);
  return successFromGrid(input.projectId);
}

/** Story 2.15 — strip clear Project start. */
export async function clearProjectStartStripAction(input: {
  readonly projectId: string;
}): Promise<PlanWriteOutcome> {
  const ctx = await requestContext();
  const result = await clearProjectStartSetting(input, ctx);
  if (!result.ok) return refuseOutcome(result);
  revalidatePath(`/p/${input.projectId}/plan`);
  revalidatePath(`/p/${input.projectId}/settings`);
  return successFromGrid(input.projectId);
}

/** Story 2.15 — strip Project finish (teaching confirm required). */
export async function patchProjectFinishStripAction(input: {
  readonly projectId: string;
  readonly projectFinish: string | null;
  readonly confirmed: boolean;
}): Promise<PlanWriteOutcome> {
  if (!input.confirmed) {
    return {
      ok: false,
      code: 'invalid_input',
      messageKey: 'errors.invalid_input',
      details: { confirmed: ['required'] },
    };
  }
  const ctx = await requestContext();
  const result = await patchProjectFinish(
    {
      projectId: input.projectId,
      projectFinish: input.projectFinish,
      confirmed: true,
    },
    ctx,
  );
  if (!result.ok) return refuseOutcome(result);
  revalidatePath(`/p/${input.projectId}/plan`);
  revalidatePath(`/p/${input.projectId}/settings`);
  return successFromGrid(input.projectId);
}

/** Story 2.15 — strip Data Date date-edit only (Q2→A; no advance-to-period CTA). */
export async function patchDataDateStripAction(input: {
  readonly projectId: string;
  readonly dataDate: string;
}): Promise<PlanWriteOutcome> {
  const ctx = await requestContext();
  const result = await patchDataDate(input, ctx);
  if (!result.ok) return refuseOutcome(result);
  revalidatePath(`/p/${input.projectId}/plan`);
  revalidatePath(`/p/${input.projectId}/settings`);
  return successFromGrid(input.projectId);
}

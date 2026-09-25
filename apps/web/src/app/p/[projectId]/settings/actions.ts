'use server';

import { revalidatePath } from 'next/cache';
import {
  addProjectCalendarDay,
  clearProjectStartSetting,
  patchDataDate,
  patchProjectFinish,
  patchProjectNationalCalendars,
  removeProjectCalendarDay,
  setProjectStartSetting,
  requestContext,
} from '@/server/composition';

export type SettingsWriteOutcome =
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
}): SettingsWriteOutcome {
  return {
    ok: false,
    code: result.error.code,
    messageKey: result.error.messageKey,
    ...(result.error.details !== undefined ? { details: result.error.details } : {}),
  };
}

function revalidateSettings(projectId: string) {
  revalidatePath(`/p/${projectId}/settings`);
  revalidatePath(`/p/${projectId}/plan`);
}

export async function setProjectStartAction(formData: FormData): Promise<SettingsWriteOutcome> {
  const projectId = String(formData.get('projectId') ?? '');
  const projectStart = String(formData.get('projectStart') ?? '');
  const ctx = await requestContext();
  const result = await setProjectStartSetting({ projectId, projectStart }, ctx);
  if (!result.ok) return refuseOutcome(result);
  revalidateSettings(projectId);
  return { ok: true };
}

export async function clearProjectStartAction(formData: FormData): Promise<SettingsWriteOutcome> {
  const projectId = String(formData.get('projectId') ?? '');
  const ctx = await requestContext();
  const result = await clearProjectStartSetting({ projectId }, ctx);
  if (!result.ok) return refuseOutcome(result);
  revalidateSettings(projectId);
  return { ok: true };
}

export async function patchProjectFinishAction(formData: FormData): Promise<SettingsWriteOutcome> {
  const projectId = String(formData.get('projectId') ?? '');
  const raw = formData.get('projectFinish');
  const projectFinish =
    raw === null || raw === '' ? null : String(raw);
  const confirmed = formData.get('confirmed') === '1';
  if (!confirmed) {
    return {
      ok: false,
      code: 'invalid_input',
      messageKey: 'errors.invalid_input',
      details: { confirmed: ['required'] },
    };
  }
  const ctx = await requestContext();
  const result = await patchProjectFinish({ projectId, projectFinish, confirmed: true }, ctx);
  if (!result.ok) return refuseOutcome(result);
  revalidateSettings(projectId);
  return { ok: true };
}

export async function patchDataDateAction(formData: FormData): Promise<SettingsWriteOutcome> {
  const projectId = String(formData.get('projectId') ?? '');
  const dataDate = String(formData.get('dataDate') ?? '');
  const ctx = await requestContext();
  const result = await patchDataDate({ projectId, dataDate }, ctx);
  if (!result.ok) return refuseOutcome(result);
  revalidateSettings(projectId);
  return { ok: true };
}

export async function patchNationalCalendarsAction(
  formData: FormData,
): Promise<SettingsWriteOutcome> {
  const projectId = String(formData.get('projectId') ?? '');
  const calendarJp = formData.get('calendarJp') === '1';
  const calendarVn = formData.get('calendarVn') === '1';
  const ctx = await requestContext();
  const result = await patchProjectNationalCalendars({ projectId, calendarJp, calendarVn }, ctx);
  if (!result.ok) return refuseOutcome(result);
  revalidateSettings(projectId);
  return { ok: true };
}

export async function addProjectDayAction(formData: FormData): Promise<SettingsWriteOutcome> {
  const projectId = String(formData.get('projectId') ?? '');
  const day = String(formData.get('day') ?? '');
  const ctx = await requestContext();
  const result = await addProjectCalendarDay({ projectId, day }, ctx);
  if (!result.ok) return refuseOutcome(result);
  revalidateSettings(projectId);
  return { ok: true };
}

export async function removeProjectDayAction(formData: FormData): Promise<SettingsWriteOutcome> {
  const projectId = String(formData.get('projectId') ?? '');
  const day = String(formData.get('day') ?? '');
  const ctx = await requestContext();
  const result = await removeProjectCalendarDay({ projectId, day }, ctx);
  if (!result.ok) return refuseOutcome(result);
  revalidateSettings(projectId);
  return { ok: true };
}

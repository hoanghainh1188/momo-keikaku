'use server';

import { revalidatePath } from 'next/cache';
import { requestContext, setProjectBaseline } from '@/server/composition';
import { writeLanded } from '@/server/result';

/**
 * Story 4.1 — first Set Baseline. Shared by Review, Plan toolbar, and Baselines.
 */
export async function setBaselineAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId') ?? '');
  if (projectId === '') return;
  const ctx = await requestContext();
  if (!writeLanded(await setProjectBaseline({ projectId }, ctx))) return;
  revalidatePath(`/p/${projectId}/review`);
  revalidatePath(`/p/${projectId}/baselines`);
  revalidatePath(`/p/${projectId}/plan`);
}

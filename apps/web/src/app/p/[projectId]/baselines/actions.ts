'use server';

import { revalidatePath } from 'next/cache';
import { requestContext, reProjectBaseline, setProjectBaseline } from '@/server/composition';
import { writeLanded } from '@/server/result';

function revalidateBaselinePaths(projectId: string): void {
  revalidatePath(`/p/${projectId}/review`);
  revalidatePath(`/p/${projectId}/baselines`);
  revalidatePath(`/p/${projectId}/plan`);
}

/**
 * Story 4.1 — first Set Baseline. Shared by Review, Plan toolbar, and Baselines.
 */
export async function setBaselineAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId') ?? '');
  if (projectId === '') return;
  const ctx = await requestContext();
  if (!writeLanded(await setProjectBaseline({ projectId }, ctx))) return;
  revalidateBaselinePaths(projectId);
}

/**
 * Story 4.3 — Re-baseline with mandatory free-text reason.
 */
export async function reBaselineAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId') ?? '');
  const reason = String(formData.get('reason') ?? '');
  if (projectId === '') return;
  const ctx = await requestContext();
  if (!writeLanded(await reProjectBaseline({ projectId, reason }, ctx))) return;
  revalidateBaselinePaths(projectId);
}

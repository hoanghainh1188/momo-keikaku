'use server';

/**
 * Snapshot pin actions (story 5.4): Refresh now and pin-state reload.
 */
import { revalidatePath } from 'next/cache';
import {
  getSnapshotPinState,
  requestSnapshotRefresh,
  requestContext,
} from '@/server/composition';
import { messageFromKey } from '@/server/error-message';

export type SnapshotRefreshState = {
  readonly error: string | null;
  readonly ok: boolean;
};

export const INITIAL_SNAPSHOT_REFRESH: SnapshotRefreshState = { error: null, ok: false };

export async function refreshSnapshotAction(
  prev: SnapshotRefreshState,
  formData: FormData,
): Promise<SnapshotRefreshState> {
  const ctx = await requestContext();
  const projectId = String(formData.get('projectId') ?? '');
  const connectorIdRaw = formData.get('connectorId');
  const connectorId =
    typeof connectorIdRaw === 'string' && connectorIdRaw.length > 0 ? connectorIdRaw : undefined;
  const result = await requestSnapshotRefresh({ projectId, connectorId }, ctx);
  if (!result.ok) {
    return { error: messageFromKey(result.error.messageKey), ok: false };
  }
  revalidatePath(`/p/${projectId}`);
  return { error: null, ok: true };
}

export async function loadSnapshotPinStateAction(input: {
  readonly projectId: string;
  readonly reviewPinnedSnapshotId?: string | null;
}) {
  const ctx = await requestContext();
  const result = await getSnapshotPinState(input, ctx);
  if (!result.ok) return { ok: false as const, error: messageFromKey(result.error.messageKey) };
  return {
    ok: true as const,
    value: {
      ...result.value,
      latestSnapshot: result.value.latestSnapshot
        ? {
            ...result.value.latestSnapshot,
            observedAt: result.value.latestSnapshot.observedAt.toISOString(),
          }
        : null,
      nextScheduledAt: result.value.nextScheduledAt.toISOString(),
      attempts: result.value.attempts.map((a) => ({
        ...a,
        attemptedAt: a.attemptedAt.toISOString(),
      })),
    },
  };
}

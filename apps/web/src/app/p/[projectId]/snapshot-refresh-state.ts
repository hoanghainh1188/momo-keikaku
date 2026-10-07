/**
 * The Refresh-now action's state shape and its initial value (story 5.4), kept OUT of
 * `snapshot-actions.ts`: a "use server" module may export async functions only, and Next refuses
 * the whole action module at run time — every server action on the page answering 500 — when it
 * exports an object.
 */
export type SnapshotRefreshState = {
  readonly error: string | null;
  readonly ok: boolean;
};

export const INITIAL_SNAPSHOT_REFRESH: SnapshotRefreshState = { error: null, ok: false };

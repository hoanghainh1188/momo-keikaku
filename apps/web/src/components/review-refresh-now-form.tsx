'use client';

/**
 * Story 6.7: Review header *Refresh now* — same action as the top-bar snapshot pin.
 */
import { useTranslations } from 'next-intl';
import { useTransition, type FormEvent } from 'react';
import { refreshSnapshotAction } from '@/app/p/[projectId]/snapshot-actions';
import { INITIAL_SNAPSHOT_REFRESH } from '@/app/p/[projectId]/snapshot-refresh-state';

export function ReviewRefreshNowForm({
  projectId,
  connectorId,
}: {
  readonly projectId: string;
  readonly connectorId: string;
}) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    startTransition(async () => {
      await refreshSnapshotAction(INITIAL_SNAPSHOT_REFRESH, new FormData(form));
    });
  }

  return (
    <form onSubmit={onSubmit} className="review-stale-refresh">
      <input type="hidden" name="projectId" value={projectId} />
      {connectorId ? <input type="hidden" name="connectorId" value={connectorId} /> : null}
      <button type="submit" className="btn" disabled={pending} data-testid="review-stale-refresh">
        {t('shell.refreshNow')}
      </button>
    </form>
  );
}

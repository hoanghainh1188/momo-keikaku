'use client';

/**
 * Story 6.7: Review header *Refresh now* — same action as the top-bar snapshot pin.
 */
import { useTranslations } from 'next-intl';
import { useState, useTransition, type FormEvent } from 'react';
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
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    startTransition(async () => {
      const next = await refreshSnapshotAction(INITIAL_SNAPSHOT_REFRESH, new FormData(form));
      if (!next.ok) {
        setError(next.error ?? t('shell.refreshNow'));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="review-stale-refresh">
      <input type="hidden" name="projectId" value={projectId} />
      {connectorId ? <input type="hidden" name="connectorId" value={connectorId} /> : null}
      <button type="submit" className="btn" disabled={pending} data-testid="review-stale-refresh">
        {t('shell.refreshNow')}
      </button>
      {error ? (
        <p className="caption" role="alert" data-testid="review-stale-refresh-error">
          {error}
        </p>
      ) : null}
    </form>
  );
}

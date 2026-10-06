'use client';

/**
 * Top-bar snapshot pin (story 5.4 / UX-DR20): live age, popover with time / Connectors /
 * next scheduled / Refresh now, and Review Re-pin when the open Review is older than latest.
 */
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition, type FormEvent } from 'react';
import {
  loadSnapshotPinStateAction,
  refreshSnapshotAction,
} from '@/app/p/[projectId]/snapshot-actions';
import { INITIAL_SNAPSHOT_REFRESH } from '@/app/p/[projectId]/snapshot-refresh-state';

export interface SnapshotPinProps {
  readonly projectId: string;
  readonly initialLabel: string;
  readonly initialAgeMinutes: number;
  /** Snapshot id the Review page loaded with; omit on non-Review surfaces. */
  readonly reviewPinnedSnapshotId?: string | null;
}

type PinDto = Extract<
  Awaited<ReturnType<typeof loadSnapshotPinStateAction>>,
  { ok: true }
>['value'];

function formatAge(minutes: number, t: ReturnType<typeof useTranslations>): string {
  if (minutes < 60) return t('shell.ageMinutes', { minutes });
  const h = Math.round(minutes / 60);
  if (h < 48) return t('shell.ageHours', { hours: h });
  return t('shell.ageDays', { days: Math.round(h / 24) });
}

function formatJst(iso: string): string {
  const d = new Date(iso);
  const jst = new Date(d.getTime() + 9 * 3600_000);
  const day = jst.getUTCDate();
  const month = jst.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  const hh = String(jst.getUTCHours()).padStart(2, '0');
  const mm = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${hh}:${mm} JST`;
}

export function SnapshotPin({
  projectId,
  initialLabel,
  initialAgeMinutes,
  reviewPinnedSnapshotId = null,
}: SnapshotPinProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const onReview = pathname?.includes('/review') ?? false;
  const [open, setOpen] = useState(false);
  const [ageMinutes, setAgeMinutes] = useState(initialAgeMinutes);
  const [label, setLabel] = useState(initialLabel);
  const [pin, setPin] = useState<PinDto | null>(null);
  const [refreshState, setRefreshState] = useState(INITIAL_SNAPSHOT_REFRESH);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const id = window.setInterval(() => {
      setAgeMinutes((m) => m + 1);
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadSnapshotPinStateAction({ projectId, reviewPinnedSnapshotId }).then((result) => {
      if (cancelled || !result.ok) return;
      setPin(result.value);
      setAgeMinutes(result.value.snapshotAgeMinutes);
      if (result.value.latestSnapshot) {
        setLabel(formatJst(result.value.latestSnapshot.observedAt));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, reviewPinnedSnapshotId]);

  const stale = ageMinutes > 24 * 60;
  const showRepin = onReview && (pin?.newerThanReviewPin ?? false);

  function onRefresh(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    startTransition(async () => {
      const next = await refreshSnapshotAction(refreshState, new FormData(form));
      setRefreshState(next);
      if (next.ok) {
        const reloaded = await loadSnapshotPinStateAction({
          projectId,
          reviewPinnedSnapshotId,
        });
        if (reloaded.ok) {
          setPin(reloaded.value);
          setAgeMinutes(reloaded.value.snapshotAgeMinutes);
          if (reloaded.value.latestSnapshot) {
            setLabel(formatJst(reloaded.value.latestSnapshot.observedAt));
          }
        }
      }
    });
  }

  function onRepin() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="snapshot-pin-wrap">
      <button
        type="button"
        className={`snapshot-pin${stale ? ' stale' : ''}`}
        data-testid="snapshot-pin"
        title={t('shell.snapshotPinTitle')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>{stale ? '▲' : '◉'}</span>
        <span>{t('shell.snapshotLabel', { label, age: formatAge(ageMinutes, t) })}</span>
      </button>
      {showRepin ? (
        <div className="snapshot-repin" data-testid="snapshot-repin">
          <span>{t('shell.newerSnapshotAvailable')}</span>
          <button type="button" className="btn" onClick={onRepin} disabled={pending}>
            {t('shell.repin')}
          </button>
        </div>
      ) : null}
      {open ? (
        <div className="snapshot-popover" data-testid="snapshot-popover" role="dialog">
          <p className="snapshot-popover-row">
            <span className="label">{t('shell.snapshotTime')}</span>{' '}
            {pin?.latestSnapshot ? formatJst(pin.latestSnapshot.observedAt) : label}
          </p>
          <p className="snapshot-popover-row">
            <span className="label">{t('shell.connectors')}</span>{' '}
            {pin?.connectors.map((c) => c.spaceLabel).join(', ') || t('common.em_dash')}
          </p>
          <p className="snapshot-popover-row">
            <span className="label">{t('shell.nextScheduled')}</span>{' '}
            {pin ? formatJst(pin.nextScheduledAt) : t('common.em_dash')}
          </p>
          {pin?.slowdownMessage ? (
            <p className="snapshot-popover-row caption" data-testid="snapshot-slowdown">
              {t('shell.scheduleSlowdown')}
            </p>
          ) : null}
          {pin && pin.attempts.length > 0 ? (
            <ul className="snapshot-attempts" data-testid="snapshot-attempts">
              {pin.attempts.slice(0, 5).map((a) => (
                <li key={a.seq}>
                  <code>{a.reasonCode}</code> · {formatJst(a.attemptedAt)}
                  <div className="caption">{a.message}</div>
                </li>
              ))}
            </ul>
          ) : null}
          <form onSubmit={onRefresh} className="snapshot-refresh-form">
            <input type="hidden" name="projectId" value={projectId} />
            {pin?.connectors[0] ? (
              <input type="hidden" name="connectorId" value={pin.connectors[0].id} />
            ) : null}
            <button type="submit" className="btn" disabled={pending} data-testid="snapshot-refresh">
              {t('shell.refreshNow')}
            </button>
          </form>
          {refreshState.error ? <p className="caption">{refreshState.error}</p> : null}
          {refreshState.ok ? (
            <p className="caption" data-testid="snapshot-refresh-ok">
              {t('shell.refreshQueued')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

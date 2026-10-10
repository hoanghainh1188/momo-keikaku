'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { acceptObservedPctAction } from '@/app/p/[projectId]/review/actions';

export type AcceptObservedPctModel = {
  readonly projectId: string;
  readonly wpId: string;
  readonly wbsCode: string;
  readonly name: string;
  readonly observedPctNum: string;
  readonly observedPctDen: string;
  readonly observedWhole: string;
  readonly remainingBefore: number | null;
  readonly remainingAfter: number | null;
};

/**
 * Story 6.4 Accept dialog: non-empty reason + this-WP remaining-duration consequence.
 * Esc closes and returns focus to the trigger; Cancel leaves the plan unchanged.
 */
export function AcceptObservedPctForm({ row }: { readonly row: AcceptObservedPctModel }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    reasonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        setError(null);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const consequence =
    row.remainingBefore !== null && row.remainingAfter !== null
      ? t('review.accept_consequence', {
          observed: row.observedWhole,
          before: row.remainingBefore,
          after: row.remainingAfter,
        })
      : t('review.accept_consequence_unavailable', { observed: row.observedWhole });

  return (
    <div className="stack" style={{ gap: 4 }}>
      <button
        ref={triggerRef}
        type="button"
        className="btn"
        data-testid={`accept-${row.wpId}`}
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
      >
        {t('review.accept')}
      </button>
      {open ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="formula-popover"
          data-testid={`accept-dialog-${row.wpId}`}
          style={{ position: 'relative', marginTop: 8 }}
        >
          <p id={titleId} className="label">
            {t('review.accept_title')}
          </p>
          <p className="caption">
            {row.wbsCode} · {row.name}
          </p>
          <p className="caption" data-testid={`accept-consequence-${row.wpId}`}>
            {consequence}
          </p>
          <label className="caption" htmlFor={`accept-reason-${row.wpId}`}>
            {t('review.accept_reason_label')}
          </label>
          <textarea
            ref={reasonRef}
            id={`accept-reason-${row.wpId}`}
            data-testid={`accept-reason-${row.wpId}`}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ width: '100%', marginTop: 4 }}
          />
          {error !== null ? (
            <p className="caption" role="alert" data-testid={`accept-error-${row.wpId}`}>
              {error}
            </p>
          ) : null}
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn primary"
              disabled={pending}
              data-testid={`accept-confirm-${row.wpId}`}
              onClick={() => {
                const trimmed = reason.trim();
                if (trimmed.length === 0) {
                  setError(t('review.accept_reason_required'));
                  return;
                }
                start(async () => {
                  setError(null);
                  const outcome = await acceptObservedPctAction({
                    projectId: row.projectId,
                    wpId: row.wpId,
                    observedPctNum: row.observedPctNum,
                    observedPctDen: row.observedPctDen,
                    reason: trimmed,
                  });
                  if (!outcome.ok) {
                    setError(
                      outcome.messageKey === 'review.accept_reason_required'
                        ? t('review.accept_reason_required')
                        : outcome.messageKey,
                    );
                    return;
                  }
                  setOpen(false);
                  setReason('');
                  triggerRef.current?.focus();
                });
              }}
            >
              {t('review.accept_confirm')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={pending}
              data-testid={`accept-cancel-${row.wpId}`}
              onClick={() => {
                setOpen(false);
                setError(null);
                setReason('');
                triggerRef.current?.focus();
              }}
            >
              {t('review.accept_cancel')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

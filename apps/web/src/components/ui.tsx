'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { present, type Metric } from '@momo/domain/present';

export function Section({
  title,
  intro,
  children,
  id,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="section" id={id} aria-labelledby={id ? `${id}-h` : undefined}>
      <h2 className="section-title" id={id ? `${id}-h` : undefined}>
        {title}
      </h2>
      {intro ? <p className="caption" style={{ margin: 0 }}>{intro}</p> : null}
      <hr className="section-rule" />
      {children}
    </section>
  );
}

/**
 * DESIGN: a metric cell is a 1px ink rule, a label, the figure, and the formula that
 * made it. No metric is shown without a way to see how it was made.
 */
export function MetricCell({
  label,
  metric,
  formula,
  note,
  xl,
  testId,
  tone,
}: {
  label: string;
  metric: Metric | { text: string; unit?: string | null };
  formula: string;
  note?: ReactNode;
  xl?: boolean;
  testId?: string;
  tone?: 'unplanned';
}) {
  const p =
    'kind' in metric
      ? present(metric)
      : { ...metric, unavailableReason: null, coverage: null as string | null };
  const unavailable = 'unavailableReason' in p && p.unavailableReason !== null;
  const coverage = 'coverage' in p ? p.coverage : null;
  return (
    <div className={`metric${xl ? ' xl' : ''}`} data-testid={testId}>
      <div className="label">{label}</div>
      <div
        className={`value${unavailable ? ' unavailable' : ''}`}
        style={tone === 'unplanned' ? { color: 'var(--unplanned)' } : undefined}
        data-testid={testId ? `${testId}-value` : undefined}
      >
        {p.text}
        {p.unit ? <span className="unit">{p.unit}</span> : null}
      </div>
      <div className="formula">
        {unavailable ? (p as { unavailableReason: string }).unavailableReason : formula}
      </div>
      {coverage ? <div className="caption">{coverage}</div> : null}
      {note ? <div className="delta">{note}</div> : null}
    </div>
  );
}

const GLYPH: Record<string, string> = {
  green: '●',
  amber: '▲',
  red: '◆',
  unavailable: '–',
};

/**
 * Health badge: glyph + word (+ optional driver). Story 6.5 / Q2-A: when `disclosure` is set,
 * click/Enter opens a non-modal popover (threshold rule + driving figure); Esc returns focus.
 */
export function HealthBadge({
  colour,
  label,
  word,
  disclosure,
  disclosureTitle,
  closeLabel,
}: {
  colour: string;
  label?: string;
  /** Colour word for glyph+word+rule display (defaults to `colour`). */
  word?: string;
  /** Hover/focus / click disclosure body (threshold rule + driving figure). */
  disclosure?: string | null;
  disclosureTitle?: string;
  closeLabel?: string;
}) {
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const interactive = Boolean(disclosure);
  const display = label ?? word ?? colour;

  useEffect(() => {
    if (!open) return;
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onDocKey);
    return () => document.removeEventListener('keydown', onDocKey);
  }, [open]);

  useEffect(() => {
    if (open) popRef.current?.focus();
  }, [open]);

  const badge = (
    <span className={`badge ${colour}`}>
      <span aria-hidden>{GLYPH[colour]}</span>
      {display}
    </span>
  );

  if (!interactive) return badge;

  return (
    <span className="health-badge-wrap">
      <button
        type="button"
        ref={triggerRef}
        className="health-badge-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? titleId : undefined}
        data-testid="health-badge-trigger"
        title={disclosure ?? undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {badge}
      </button>
      {open && disclosure ? (
        <div
          ref={popRef}
          className="formula-popover health-disclosure"
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          tabIndex={-1}
          data-testid="health-disclosure"
        >
          <p id={titleId} className="formula-popover-formula">
            {disclosureTitle ?? 'Health rule'}
          </p>
          <p className="formula-popover-interpret">{disclosure}</p>
          <button
            type="button"
            className="formula-popover-close caption"
            onClick={() => {
              setOpen(false);
              triggerRef.current?.focus();
            }}
          >
            {closeLabel ?? 'Close'}
          </button>
        </div>
      ) : null}
    </span>
  );
}

export function Internal() {
  const t = useTranslations();
  return <span className="tag internal">{t('ui.internal')}</span>;
}

export function UnplannedChip({ children }: { children: ReactNode }) {
  return (
    <span className="chip-unplanned">
      <span className="hatch-swatch" aria-hidden />
      {children}
    </span>
  );
}

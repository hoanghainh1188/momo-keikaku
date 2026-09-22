'use client';

import type { ReactNode } from 'react';
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
  const p = 'kind' in metric ? present(metric) : { ...metric, unavailableReason: null };
  const unavailable = 'unavailableReason' in p && p.unavailableReason !== null;
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

export function HealthBadge({ colour, label }: { colour: string; label?: string }) {
  return (
    <span className={`badge ${colour}`}>
      <span aria-hidden>{GLYPH[colour]}</span>
      {label ?? colour}
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

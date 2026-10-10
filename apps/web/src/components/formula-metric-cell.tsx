'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { present, type Metric } from '@momo/domain/present';
import type { FormulaPopoverModel } from '@/lib/review-formula-popover';

export function FormulaMetricCell({
  label,
  metric,
  formula,
  note,
  xl,
  testId,
  tone,
  popover,
}: {
  label: string;
  metric: Metric | { text: string; unit?: string | null };
  formula: string;
  note?: ReactNode;
  xl?: boolean;
  testId?: string;
  tone?: 'unplanned';
  popover?: FormulaPopoverModel | null;
}) {
  const t = useTranslations();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const p =
    'kind' in metric
      ? present(metric)
      : { ...metric, unavailableReason: null, coverage: null as string | null };
  const unavailable = 'unavailableReason' in p && p.unavailableReason !== null;
  const isBacExhausted = p.unavailableReason === 'BAC exhausted';
  const formulaCaption = unavailable && !isBacExhausted ? p.unavailableReason : formula;
  const coverage = 'coverage' in p ? p.coverage : null;
  const interactive = popover !== undefined && popover !== null;

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

  const inner = (
    <>
      <div className="label">{label}</div>
      <div
        className={`value${unavailable && !isBacExhausted ? ' unavailable' : ''}`}
        style={tone === 'unplanned' ? { color: 'var(--unplanned)' } : undefined}
        data-testid={testId ? `${testId}-value` : undefined}
      >
        {p.text}
        {p.unit ? <span className="unit">{p.unit}</span> : null}
      </div>
      <div className="formula">{formulaCaption}</div>
      {coverage ? <div className="caption">{coverage}</div> : null}
      {note ? <div className="delta">{note}</div> : null}
    </>
  );

  return (
    <div className={`metric${xl ? ' xl' : ''}${interactive ? ' metric--interactive' : ''}`} data-testid={testId}>
      {interactive ? (
        <>
          <button
            type="button"
            ref={triggerRef}
            className="metric-trigger"
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-controls={open ? titleId : undefined}
            data-testid={testId ? `${testId}-trigger` : undefined}
            onClick={() => setOpen((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setOpen(true);
              }
            }}
          >
            {inner}
          </button>
          {open && popover ? (
            <FormulaPopover
              popRef={popRef}
              titleId={titleId}
              model={popover}
              onClose={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
              closeLabel={t('review.metric_formula.close')}
              drillLabel={t('review.metric_formula.show_tickets_wps')}
              periodLabel={t('review.metric_formula.period_change')}
              inputsLabel={t('review.metric_formula.inputs')}
              interpretationLabel={t('review.metric_formula.interpretation')}
            />
          ) : null}
        </>
      ) : (
        inner
      )}
    </div>
  );
}

function FormulaPopover({
  popRef,
  titleId,
  model,
  onClose,
  closeLabel,
  drillLabel,
  periodLabel,
  inputsLabel,
  interpretationLabel,
}: {
  popRef: React.RefObject<HTMLDivElement | null>;
  titleId: string;
  model: FormulaPopoverModel;
  onClose: () => void;
  closeLabel: string;
  drillLabel: string;
  periodLabel: string;
  inputsLabel: string;
  interpretationLabel: string;
}) {
  const [showDrill, setShowDrill] = useState(false);

  return (
    <div
      ref={popRef}
      className="formula-popover"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="formula-popover"
    >
      <p id={titleId} className="formula-popover-formula">
        {model.formula}
      </p>
      <p className="caption">{inputsLabel}</p>
      <dl className="formula-popover-kv">
        {model.inputs.map((inp) => (
          <div key={inp.label}>
            <dt>{inp.label}</dt>
            <dd>{inp.value}</dd>
          </div>
        ))}
      </dl>
      {model.interpretation ? (
        <p className="formula-popover-interpret" data-testid="formula-interpretation">
          <span className="caption">{interpretationLabel}: </span>
          {model.interpretation}
        </p>
      ) : null}
      <p className="caption" data-testid="formula-period-change">
        {periodLabel}: {model.periodChange}
      </p>
      <button type="button" className="btn formula-popover-drill" onClick={() => setShowDrill((v) => !v)}>
        {drillLabel}
      </button>
      {showDrill && model.drillDown.length > 0 ? (
        <table className="ledger formula-popover-table">
          <thead>
            <tr>
              <th>WBS</th>
              <th>WP</th>
              <th className="num">h</th>
              <th>Tickets</th>
            </tr>
          </thead>
          <tbody>
            {model.drillDown.map((row) => (
              <tr key={row.wbsCode}>
                <td>{row.wbsCode}</td>
                <td>{row.name}</td>
                <td className="num">{row.contribution}</td>
                <td>{row.tickets.length > 0 ? row.tickets.join(', ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <button type="button" className="formula-popover-close caption" onClick={onClose}>
        {closeLabel}
      </button>
    </div>
  );
}

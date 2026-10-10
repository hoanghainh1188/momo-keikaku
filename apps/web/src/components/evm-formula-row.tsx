'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { FormulaPopoverModel } from '@/lib/review-formula-popover';

export function EvmFormulaRow({
  name,
  value,
  money,
  formula,
  reading,
  unplanned,
  testId,
  popover,
}: {
  name: string;
  value: string;
  money: string;
  formula: string;
  reading: string;
  unplanned?: boolean;
  testId?: string;
  popover?: FormulaPopoverModel | null;
}) {
  const t = useTranslations();
  const titleId = useId();
  const rowRef = useRef<HTMLTableRowElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const interactive = popover !== undefined && popover !== null;

  useEffect(() => {
    if (!open) return;
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        rowRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onDocKey);
    return () => document.removeEventListener('keydown', onDocKey);
  }, [open]);

  useEffect(() => {
    if (open) popRef.current?.focus();
  }, [open]);

  const openPopover = () => interactive && setOpen(true);

  return (
    <>
      <tr
        ref={rowRef}
        data-testid={testId}
        tabIndex={interactive ? 0 : undefined}
        className={interactive ? 'evm-row--interactive' : undefined}
        onClick={interactive ? () => setOpen((v) => !v) : undefined}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openPopover();
                }
              }
            : undefined
        }
      >
        <td style={unplanned ? { color: 'var(--unplanned)', fontWeight: 500 } : undefined}>
          {unplanned ? <span className="hatch-swatch" style={{ marginRight: 6 }} aria-hidden /> : null}
          {name}
        </td>
        <td className="num">{value}</td>
        <td className="num">{money}</td>
        <td>{formula}</td>
        <td>{reading}</td>
      </tr>
      {open && popover ? (
        <tr className="formula-popover-row">
          <td colSpan={5}>
            <FormulaPopoverPanel
              popRef={popRef}
              titleId={titleId}
              model={popover}
              onClose={() => {
                setOpen(false);
                rowRef.current?.focus();
              }}
              t={t}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function FormulaPopoverPanel({
  popRef,
  titleId,
  model,
  onClose,
  t,
}: {
  popRef: React.RefObject<HTMLDivElement | null>;
  titleId: string;
  model: FormulaPopoverModel;
  onClose: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [showDrill, setShowDrill] = useState(false);

  return (
    <div
      ref={popRef}
      className="formula-popover formula-popover--table"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="formula-popover"
    >
      <p id={titleId} className="formula-popover-formula">
        {model.formula}
      </p>
      <p className="caption">{t('review.metric_formula.inputs')}</p>
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
          <span className="caption">{t('review.metric_formula.interpretation')}: </span>
          {model.interpretation}
        </p>
      ) : null}
      <p className="caption" data-testid="formula-period-change">
        {t('review.metric_formula.period_change')}: {model.periodChange}
      </p>
      <button type="button" className="btn formula-popover-drill" onClick={() => setShowDrill((v) => !v)}>
        {t('review.metric_formula.show_tickets_wps')}
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
        {t('review.metric_formula.close')}
      </button>
    </div>
  );
}

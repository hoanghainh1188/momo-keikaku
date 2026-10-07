'use client';

import { useTranslations } from 'next-intl';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { cssPercent, hours, share, type Mh, type Ratio } from '@momo/domain/present';
import { ledgerTableRows } from '@/lib/mapping-coverage-model';
import { scopeSegmentMessageKey } from '@/lib/scope-segment-label';
import { scopeLedgerChrome } from '@/lib/scope-ledger-ui';

/**
 * The signature element: one square-cornered bar split into FR-20 (hours) or FR-23
 * (Ticket-share) buckets. Review keeps the static `role="img"` path; Mapping › Coverage
 * uses interactive segments (UX-DR18) with hours/Ticket toggle, adjacent text, and
 * "Show as table" (UX-DR26).
 */
const CLASS: Record<string, string> = {
  'mapped-baselined': 'mapped-baselined',
  'mapped-non-baselined': 'unplanned',
  mapped: 'mapped-baselined',
  'catch-all': 'catch-all',
  'catch-all-overflow': 'unplanned',
  unmapped: 'unplanned',
};

const SWATCH: Record<string, React.CSSProperties> = {
  'mapped-baselined': { background: 'var(--current-plan)' },
  mapped: { background: 'var(--current-plan)' },
  'catch-all': { background: 'var(--baseline)' },
};

export type ScopeLedgerSegment = {
  key: string;
  /** Stable key (same as `key`); UI translates — do not render raw. */
  label: string;
  /** Hours mode: milli-hours. Ticket mode: omit / 0n. */
  mh?: Mh;
  /** Ticket mode: count in the bucket. */
  count?: number;
  share: Ratio;
};

export type ScopeLedgerBarProps = {
  segments: ScopeLedgerSegment[];
  openingBalanceMh: Mh;
  totalMh: Mh;
  /**
   * When true (default), static `role="img"` bar — Review's Unplanned Scope Ledger.
   * When false, segments are buttons with arrow-key navigation and optional filter callback.
   */
  readOnly?: boolean;
  /** Hours ↔ Ticket-share toggle (Mapping › Coverage). */
  basis?: 'hours' | 'tickets';
  onBasisChange?: (basis: 'hours' | 'tickets') => void;
  activeSegmentKey?: string | null;
  onSegmentActivate?: (key: string | null) => void;
  /** Hour-share metric that may be unavailable (Ticket-Count Mode). */
  hourShareUnavailableReason?: string | null;
  /** Caption above the bar (defaults to the Review/legacy ledger title). */
  titleKey?: string;
  showOpeningBalanceFootnote?: boolean;
  /** Footnote message key when `showOpeningBalanceFootnote` (Coverage uses five-segment copy). */
  footnoteKey?: string;
};

export function ScopeLedgerBar({
  segments,
  openingBalanceMh,
  totalMh,
  readOnly = true,
  basis = 'hours',
  onBasisChange,
  activeSegmentKey = null,
  onSegmentActivate,
  hourShareUnavailableReason = null,
  titleKey = 'mapping.ledger.scope_ledger_every_hour_in_the_connector_apos_s_',
  showOpeningBalanceFootnote = true,
  footnoteKey = 'mapping.ledger.buckets_footnote',
}: ScopeLedgerBarProps) {
  const t = useTranslations();
  const chrome = scopeLedgerChrome(readOnly);
  const [showTable, setShowTable] = useState(false);
  const segmentRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tableToggleId = useId();

  function segmentLabel(key: string): string {
    return t(scopeSegmentMessageKey(basis, key));
  }

  const visible = segments.filter((s) => {
    if (basis === 'tickets') return (s.count ?? 0) > 0 || s.share.num > 0n;
    return (s.mh ?? 0n) > 0n;
  });
  // Empty Connector: still render the shell so toggles remain reachable.
  const display = visible.length > 0 ? visible : segments;

  function focusSegment(index: number) {
    const el = segmentRefs.current[index];
    el?.focus();
  }

  function onSegmentKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusSegment(Math.min(display.length - 1, index + 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusSegment(Math.max(0, index - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusSegment(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusSegment(display.length - 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onSegmentActivate?.(null);
    }
  }

  function segmentValueText(s: ScopeLedgerSegment): string {
    const label = segmentLabel(s.key);
    if (basis === 'tickets') {
      return t('mapping.ledger.ticket_value', {
        count: s.count ?? 0,
        share: share(s.share),
      });
    }
    return t('mapping.ledger.segment_title', {
      label,
      hours: hours(s.mh ?? 0n),
      share: share(s.share),
    });
  }

  const adjacentText = display
    .map((s) => {
      const label = segmentLabel(s.key);
      return basis === 'tickets'
        ? t('mapping.ledger.segment_aria_tickets', {
            label,
            count: s.count ?? 0,
            share: share(s.share),
          })
        : t('mapping.ledger.segment_aria', {
            label,
            hours: hours(s.mh ?? 0n),
            share: share(s.share),
          });
    })
    .join('; ');

  const unavailableReason =
    basis === 'hours' && hourShareUnavailableReason
      ? t(`mapping.ledger.unavailable.${hourShareUnavailableReason}` as 'mapping.ledger.unavailable.tracker_provides_no_hours')
      : null;

  // Ignore a stale checked state while hours are unavailable.
  const tableOpen = showTable && !unavailableReason;

  return (
    <div data-testid="scope-ledger-bar" data-readonly={readOnly || undefined}>
      <div className="label" style={{ marginBottom: 6 }}>
        {t(titleKey)}
      </div>

      {chrome.showBasisToggle && onBasisChange ? (
        <div
          role="group"
          aria-label={t('mapping.ledger.basis_toggle_aria')}
          style={{ display: 'flex', gap: 8, marginBottom: 10 }}
        >
          <button
            type="button"
            className="btn"
            aria-pressed={basis === 'hours'}
            data-testid="scope-basis-hours"
            onClick={() => onBasisChange('hours')}
          >
            {t('mapping.ledger.basis_hours')}
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={basis === 'tickets'}
            data-testid="scope-basis-tickets"
            onClick={() => onBasisChange('tickets')}
          >
            {t('mapping.ledger.basis_tickets')}
          </button>
        </div>
      ) : null}

      {unavailableReason ? (
        <p className="caption" data-testid="scope-hour-unavailable" style={{ marginBottom: 8 }}>
          {unavailableReason}
        </p>
      ) : null}

      {!unavailableReason ? (
        <div
          className="scope-bar"
          role={chrome.role}
          aria-label={adjacentText}
          data-testid="scope-bar"
        >
          {display.map((s, index) => {
            const width = cssPercent(s.share.den === 0n ? { num: 0n, den: 1n } : s.share);
            const className = `scope-seg ${CLASS[s.key] ?? 'unplanned'}`;
            if (readOnly) {
              return (
                <div
                  key={s.key}
                  className={className}
                  style={{ width }}
                  title={segmentValueText(s)}
                  data-testid={`scope-seg-${s.key}`}
                />
              );
            }
            const pressed = activeSegmentKey === s.key;
            const label = segmentLabel(s.key);
            return (
              <button
                key={s.key}
                type="button"
                ref={(el) => {
                  segmentRefs.current[index] = el;
                }}
                className={className}
                style={{
                  width,
                  outlineOffset: pressed ? -2 : undefined,
                  boxShadow: pressed ? 'inset 0 0 0 2px var(--ink)' : undefined,
                  cursor: 'pointer',
                }}
                title={segmentValueText(s)}
                data-testid={`scope-seg-${s.key}`}
                aria-pressed={pressed}
                aria-label={
                  basis === 'tickets'
                    ? t('mapping.ledger.segment_aria_tickets', {
                        label,
                        count: s.count ?? 0,
                        share: share(s.share),
                      })
                    : t('mapping.ledger.segment_aria', {
                        label,
                        hours: hours(s.mh ?? 0n),
                        share: share(s.share),
                      })
                }
                onClick={() => onSegmentActivate?.(pressed ? null : s.key)}
                onKeyDown={(e) => onSegmentKeyDown(e, index)}
              />
            );
          })}
        </div>
      ) : null}

      {/* Adjacent text — figures also appear here, not only in the bar (UX-DR26). */}
      <p className="caption" data-testid="scope-adjacent-text" style={{ marginTop: 8 }}>
        {unavailableReason ?? (adjacentText || t('mapping.ledger.empty'))}
      </p>

      {chrome.showTableToggle ? (
        <div style={{ marginTop: 8 }}>
          <label htmlFor={tableToggleId} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input
              id={tableToggleId}
              type="checkbox"
              checked={tableOpen}
              disabled={!!unavailableReason}
              onChange={(e) => setShowTable(e.target.checked)}
              data-testid="scope-show-as-table"
            />
            {t('mapping.ledger.show_as_table')}
          </label>
        </div>
      ) : null}

      {(chrome.showLegend || tableOpen) && !unavailableReason ? (
        chrome.showLegend ? (
          <div className="scope-legend">
            {display
              .filter((s) => (s.mh ?? 0n) > 0n)
              .map((s) => (
                <div key={s.key}>
                  <div className="k">
                    {CLASS[s.key] === 'unplanned' ? (
                      <span className="hatch-swatch" aria-hidden />
                    ) : (
                      <span className="swatch" style={SWATCH[s.key]} aria-hidden />
                    )}
                    {segmentLabel(s.key)}
                  </div>
                  <div className="v" data-testid={`scope-value-${s.key}`}>
                    {hours(s.mh ?? 0n)}
                    <span className="unit">h</span>{' '}
                    <span className="caption">({share(s.share)})</span>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <table className="ledger" data-testid="scope-ledger-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>{t('mapping.ledger.table_bucket')}</th>
                <th className="num">
                  {basis === 'tickets' ? t('mapping.ledger.table_tickets') : t('mapping.hours')}
                </th>
                <th className="num">{t('mapping.ledger.table_share')}</th>
              </tr>
            </thead>
            <tbody>
              {ledgerTableRows(display, basis).map((row) => (
                <tr key={row.key} data-testid={`scope-table-row-${row.key}`}>
                  <td>{segmentLabel(row.key)}</td>
                  <td className="num">
                    {basis === 'tickets'
                      ? row.quantity
                      : `${hours(typeof row.quantity === 'bigint' ? row.quantity : 0n)}h`}
                  </td>
                  <td className="num">{share(row.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}

      {showOpeningBalanceFootnote ? (
        <p className="caption" style={{ marginTop: 12 }}>
          {t(footnoteKey, {
            totalHours: hours(totalMh),
            openingHours: hours(openingBalanceMh),
          })}
        </p>
      ) : null}
    </div>
  );
}

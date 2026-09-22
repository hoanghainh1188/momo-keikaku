'use client';

import { useTranslations } from 'next-intl';
import { cssPercent, hours, share, type Mh, type Ratio } from '@momo/domain/present';

/**
 * The signature element: one square-cornered bar split into the four FR-20 buckets,
 * in fixed order, with hours and share directly beneath each segment — no
 * legend-only reading. Unplanned buckets carry the 藤 violet hatch so they read
 * without colour.
 */
const CLASS: Record<string, string> = {
  'mapped-baselined': 'mapped-baselined',
  'mapped-non-baselined': 'unplanned',
  'catch-all': 'catch-all',
  'catch-all-overflow': 'unplanned',
  unmapped: 'unplanned',
};

const SWATCH: Record<string, React.CSSProperties> = {
  'mapped-baselined': { background: 'var(--current-plan)' },
  'catch-all': { background: 'var(--baseline)' },
};

export function ScopeLedgerBar({
  segments,
  openingBalanceMh,
  totalMh,
}: {
  segments: { key: string; label: string; mh: Mh; share: Ratio }[];
  openingBalanceMh: Mh;
  totalMh: Mh;
}) {
  const t = useTranslations();
  const visible = segments.filter((s) => s.mh > 0n);
  return (
    <div data-testid="scope-ledger-bar">
      <div className="label" style={{ marginBottom: 6 }}>{t('mapping.ledger.scope_ledger_every_hour_in_the_connector_apos_s_')}</div>
      <div
        className="scope-bar"
        role="img"
        aria-label={visible
          .map((s) =>
            t('mapping.ledger.segment_aria', {
              label: s.label,
              hours: hours(s.mh),
              share: share(s.share),
            }),
          )
          .join('; ')}
      >
        {visible.map((s) => (
          <div
            key={s.key}
            className={`scope-seg ${CLASS[s.key] ?? 'unplanned'}`}
            style={{ width: cssPercent(s.share) }}
            title={t('mapping.ledger.segment_title', {
              label: s.label,
              hours: hours(s.mh),
              share: share(s.share),
            })}
            data-testid={`scope-seg-${s.key}`}
          />
        ))}
      </div>
      <div className="scope-legend">
        {visible.map((s) => (
          <div key={s.key}>
            <div className="k">
              {CLASS[s.key] === 'unplanned' ? (
                <span className="hatch-swatch" aria-hidden />
              ) : (
                <span className="swatch" style={SWATCH[s.key]} aria-hidden />
              )}
              {s.label}
            </div>
            <div className="v" data-testid={`scope-value-${s.key}`}>
              {hours(s.mh)}
              <span className="unit">h</span>{' '}
              <span className="caption">({share(s.share)})</span>
            </div>
          </div>
        ))}
      </div>
      <p className="caption" style={{ marginTop: 12 }}>
        {t('mapping.ledger.buckets_footnote', {
          totalHours: hours(totalMh),
          openingHours: hours(openingBalanceMh),
        })}
      </p>
    </div>
  );
}

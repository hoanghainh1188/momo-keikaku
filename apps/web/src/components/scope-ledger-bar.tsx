import { cssPercent, hours, share, type Mh, type Ratio } from '@momo/domain';

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
  const visible = segments.filter((s) => s.mh > 0n);
  return (
    <div data-testid="scope-ledger-bar">
      <div className="label" style={{ marginBottom: 6 }}>
        Scope ledger — every hour in the Connector&apos;s scope, in one of four buckets
      </div>
      <div className="scope-bar" role="img" aria-label={visible
        .map((s) => `${s.label} ${hours(s.mh)} hours, ${share(s.share)}`)
        .join('; ')}>
        {visible.map((s) => (
          <div
            key={s.key}
            className={`scope-seg ${CLASS[s.key] ?? 'unplanned'}`}
            style={{ width: cssPercent(s.share) }}
            title={`${s.label}: ${hours(s.mh)}h (${share(s.share)})`}
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
        The four buckets are mutually exclusive and sum to {hours(totalMh)}h — nothing in scope
        is silently excluded. Opening Balances ({hours(openingBalanceMh)}h) sit outside the bar
        and are reported separately.
      </p>
    </div>
  );
}

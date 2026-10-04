import { baselineComparePanelView } from '@/lib/baseline-compare-ui';

/** Local view shapes — AD-1: web must not import `@momo/domain` compute modules. */

type EdgeIdentity = {
  readonly predecessorWpId: string;
  readonly successorWpId: string;
  readonly type: string;
};

type Pct = { readonly num: bigint; readonly den: bigint };

type InputChange =
  | { readonly kind: 'edge_added'; readonly edge: EdgeIdentity }
  | { readonly kind: 'edge_removed'; readonly edge: EdgeIdentity }
  | {
      readonly kind: 'edge_lag_changed';
      readonly edge: EdgeIdentity;
      readonly fromLagDays: number;
      readonly toLagDays: number;
    }
  | {
      readonly kind: 'constraint_changed';
      readonly wpId: string;
      readonly fromType: string;
      readonly fromDate: string | null;
      readonly toType: string;
      readonly toDate: string | null;
    }
  | {
      readonly kind: 'duration_changed';
      readonly wpId: string;
      readonly fromDays: number | null;
      readonly toDays: number | null;
    }
  | {
      readonly kind: 'actual_dates_changed';
      readonly wpId: string;
      readonly fromStart: string | null;
      readonly fromFinish: string | null;
      readonly toStart: string | null;
      readonly toFinish: string | null;
    }
  | {
      readonly kind: 'recorded_pct_changed';
      readonly wpId: string;
      readonly fromPct: Pct | null;
      readonly toPct: Pct | null;
    }
  | {
      readonly kind: 'milestone_changed';
      readonly wpId: string;
      readonly from: boolean;
      readonly to: boolean;
    }
  | {
      readonly kind: 'calendar_version_changed';
      readonly fromVersionSeq: number;
      readonly toVersionSeq: number;
    }
  | {
      readonly kind: 'project_start_changed';
      readonly from: string;
      readonly to: string;
    }
  | {
      readonly kind: 'project_finish_changed';
      readonly from: string | null;
      readonly to: string | null;
    }
  | {
      readonly kind: 'data_date_changed';
      readonly from: string;
      readonly to: string;
    };

export type BaselineCompareView = {
  readonly projectChanges: readonly InputChange[];
  readonly wpDateDeltas: readonly {
    readonly wpId: string;
    readonly wbsCode: string;
    readonly fromEarlyStart: string | null;
    readonly fromEarlyFinish: string | null;
    readonly toEarlyStart: string | null;
    readonly toEarlyFinish: string | null;
    readonly accountedBy: readonly InputChange[];
    readonly unattributed: boolean;
  }[];
};

function formatPct(pct: Pct | null): string {
  if (pct === null) return '—';
  return `${pct.num}/${pct.den}`;
}

function formatChange(change: InputChange): string {
  switch (change.kind) {
    case 'edge_added':
      return `Edge added: ${change.edge.predecessorWpId} → ${change.edge.successorWpId} (${change.edge.type})`;
    case 'edge_removed':
      return `Edge removed: ${change.edge.predecessorWpId} → ${change.edge.successorWpId} (${change.edge.type})`;
    case 'edge_lag_changed':
      return `Lag changed: ${change.edge.predecessorWpId} → ${change.edge.successorWpId} (${change.fromLagDays}d → ${change.toLagDays}d)`;
    case 'constraint_changed':
      return `Constraint: ${change.wpId} (${change.fromType}${change.fromDate ? ` ${change.fromDate}` : ''} → ${change.toType}${change.toDate ? ` ${change.toDate}` : ''})`;
    case 'duration_changed':
      return `Duration: ${change.wpId} (${change.fromDays ?? '—'} → ${change.toDays ?? '—'}d)`;
    case 'actual_dates_changed':
      return `Actual dates: ${change.wpId} (${change.fromStart ?? '—'}…${change.fromFinish ?? '—'} → ${change.toStart ?? '—'}…${change.toFinish ?? '—'})`;
    case 'recorded_pct_changed':
      return `Percent complete: ${change.wpId} (${formatPct(change.fromPct)} → ${formatPct(change.toPct)})`;
    case 'milestone_changed':
      return `Milestone: ${change.wpId} (${change.from ? 'yes' : 'no'} → ${change.to ? 'yes' : 'no'})`;
    case 'calendar_version_changed':
      return `Holiday Calendar version: ${change.fromVersionSeq} → ${change.toVersionSeq}`;
    case 'project_start_changed':
      return `Project start: ${change.from} → ${change.to}`;
    case 'project_finish_changed':
      return `Project finish: ${change.from ?? '—'} → ${change.to ?? '—'}`;
    case 'data_date_changed':
      return `Data Date: ${change.from} → ${change.to}`;
  }
}

export type BaselineCompareLabels = {
  readonly title: string;
  readonly versionA: string;
  readonly versionB: string;
  readonly compare: string;
  readonly needTwo: string;
  readonly projectChanges: string;
  readonly noProjectChanges: string;
  readonly wpDates: string;
  readonly noWpDates: string;
  readonly wbs: string;
  readonly wpId: string;
  readonly fromDates: string;
  readonly toDates: string;
  readonly accountedBy: string;
  readonly unattributed: string;
};

/**
 * Story 4.4 — version A/B picker + plan-diff sections on `/baselines`.
 * Submit is a GET so the RSC reloads with `from` / `to` query params.
 */
export function BaselineComparePanel({
  versionSeqs,
  fromVersionSeq,
  toVersionSeq,
  compare,
  error,
  labels,
}: {
  readonly versionSeqs: readonly number[];
  readonly fromVersionSeq: number | null;
  readonly toVersionSeq: number | null;
  readonly compare: BaselineCompareView | null;
  readonly error: string | null;
  readonly labels: BaselineCompareLabels;
}) {
  const view = baselineComparePanelView({
    versionCount: versionSeqs.length,
    error,
  });

  return (
    <section data-testid="baseline-compare" style={{ marginTop: 24 }}>
      <h2 className="report-title" style={{ fontSize: '1.1rem' }}>
        {labels.title}
      </h2>
      {view.kind === 'need_two' ? (
        <p className="caption" data-testid="baseline-compare-need-two">
          {labels.needTwo}
        </p>
      ) : (
        <>
          <form method="get" className="btn-row" style={{ gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
            <label className="caption">
              {labels.versionA}{' '}
              <select
                name="from"
                defaultValue={fromVersionSeq ?? versionSeqs[0]}
                data-testid="baseline-compare-from"
              >
                {versionSeqs.map((seq) => (
                  <option key={`from-${seq}`} value={seq}>
                    {seq}
                  </option>
                ))}
              </select>
            </label>
            <label className="caption">
              {labels.versionB}{' '}
              <select
                name="to"
                defaultValue={toVersionSeq ?? versionSeqs[versionSeqs.length - 1]}
                data-testid="baseline-compare-to"
              >
                {versionSeqs.map((seq) => (
                  <option key={`to-${seq}`} value={seq}>
                    {seq}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn" data-testid="baseline-compare-submit">
              {labels.compare}
            </button>
          </form>
          {view.error !== null ? (
            <p className="caption" data-testid="baseline-compare-error" style={{ marginTop: 8 }}>
              {view.error}
            </p>
          ) : null}
        </>
      )}

      {compare !== null ? (
        <div data-testid="baseline-compare-result" style={{ marginTop: 16 }}>
          <h3 className="caption" style={{ fontWeight: 600 }}>
            {labels.projectChanges}
          </h3>
          {compare.projectChanges.length === 0 ? (
            <p className="caption" data-testid="baseline-compare-no-project-changes">
              {labels.noProjectChanges}
            </p>
          ) : (
            <ul data-testid="baseline-compare-project-changes">
              {compare.projectChanges.map((change, i) => (
                <li key={`${change.kind}-${i}`} data-testid={`baseline-compare-change-${change.kind}`}>
                  {formatChange(change)}
                </li>
              ))}
            </ul>
          )}

          <h3 className="caption" style={{ fontWeight: 600, marginTop: 16 }}>
            {labels.wpDates}
          </h3>
          {compare.wpDateDeltas.length === 0 ? (
            <p className="caption" data-testid="baseline-compare-no-wp-dates">
              {labels.noWpDates}
            </p>
          ) : (
            <table className="ledger" data-testid="baseline-compare-wp-dates">
              <thead>
                <tr>
                  <th>{labels.wbs}</th>
                  <th>{labels.wpId}</th>
                  <th>{labels.fromDates}</th>
                  <th>{labels.toDates}</th>
                  <th>{labels.accountedBy}</th>
                </tr>
              </thead>
              <tbody>
                {compare.wpDateDeltas.map((row) => (
                  <tr
                    key={row.wpId}
                    data-testid={`baseline-compare-wp-${row.wpId}`}
                    data-unattributed={row.unattributed ? 'true' : 'false'}
                  >
                    <td>{row.wbsCode}</td>
                    <td>{row.wpId}</td>
                    <td>
                      {row.fromEarlyStart ?? '—'} … {row.fromEarlyFinish ?? '—'}
                    </td>
                    <td>
                      {row.toEarlyStart ?? '—'} … {row.toEarlyFinish ?? '—'}
                    </td>
                    <td>
                      {row.unattributed ? (
                        <span className="tag" data-testid={`baseline-compare-unattributed-${row.wpId}`}>
                          {labels.unattributed}
                        </span>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {row.accountedBy.map((c, i) => (
                            <li key={`${row.wpId}-${c.kind}-${i}`}>{formatChange(c)}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </section>
  );
}

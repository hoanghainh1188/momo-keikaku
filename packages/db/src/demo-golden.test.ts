import { describe, expect, it } from 'vitest';
import {
  checkLedgerInvariant,
  clientProjection,
  computeReview,
  DEFAULT_VISIBILITY,
  hours,
  present,
  share,
  sum,
} from '@momo/domain';
import { asOfDate, buildDemoState, currentPeriod } from './fixtures';

/**
 * Golden numbers for the demo dataset.
 *
 * These are the figures the Reconciliation Review renders. They are computed here
 * straight from the fixture files through the pure domain core, with no database
 * involved, so a mismatch between this file and the screen means the persistence
 * layer has introduced a difference.
 *
 * Regenerating the fixtures (`pnpm tsx scripts/gen-fixtures.ts`) will change these
 * numbers; update them deliberately, never to make the suite pass.
 */
function review() {
  const state = buildDemoState();
  return {
    state,
    result: computeReview({
      project: state.project,
      calendar: state.calendar,
      wps: state.wps,
      baselineVersions: state.baselineVersions,
      activeBaselineSeq: state.activeBaselineSeq,
      ledger: state.ledger,
      mappingEvents: state.mappingEvents,
      pinnedSnapshot: state.snapshots[state.snapshots.length - 1]!,
      resources: state.resources,
      period: currentPeriod(state),
      asOf: asOfDate(state),
      dispositions: [],
    }),
  };
}

describe('demo dataset — golden EVM figures', () => {
  const { state, result: r } = review();

  it('pins the Review to the latest of six weekly Tracker Snapshots', () => {
    expect(state.snapshots).toHaveLength(6);
    expect(r.snapshot.id).toBe('snap-ec-phase2-0006');
    expect(r.measurementBasis).toBe('hours');
  });

  it('lands on the Reporting Period that contains the demo anchor', () => {
    expect(currentPeriod(state).label).toBe('2026-09-11 – 2026-09-17');
    expect(asOfDate(state)).toBe('2026-09-16');
  });

  it('carries effort as exact bigint milli-hours and ratios unreduced (AD-4)', () => {
    expect(r.evm.bacMh).toBe(2_936_000n);
    expect(r.evm.acMh).toBe(1_661_495n);
    expect(r.evm.spi.kind === 'value' && r.evm.spi.value).toEqual({ num: r.evm.evMh, den: r.evm.pvMh });
  });

  it('reports the headline EVM figures in effort hours', () => {
    expect(hours(r.evm.bacMh)).toBe('2936.0');
    expect(hours(r.evm.pvMh)).toBe('1459.8');
    expect(hours(r.evm.evMh)).toBe('1330.8');
    expect(hours(r.evm.acMh)).toBe('1661.5');
  });

  it('reports SPI, both CPIs and TCPI', () => {
    expect(present(r.evm.spi).text).toBe('0.91');
    expect(present(r.evm.cpiAllIn).text).toBe('0.80');
    expect(present(r.evm.cpiPlannedScope).text).toBe('0.92');
    expect(present(r.evm.tcpi).text).toBe('1.26');
  });

  it('reports the forecast', () => {
    expect(present(r.evm.eacMh).text).toBe('3665.6');
    expect(present(r.evm.etcMh).text).toBe('2004.1');
    expect(present(r.evm.vacMh).text).toBe('-729.6');
    expect(r.forecast.forecastFinish).toBe('2026-12-15');
    expect(r.forecast.baselineFinish).toBe('2026-11-27');
  });

  it('splits Unplanned Work into all three of its components', () => {
    const by = Object.fromEntries(r.unplanned.components.map((c) => [c.key, hours(c.mh)]));
    expect(by).toEqual({
      unmapped: '166.0',
      'non-baselined': '0.0',
      'catch-all-overflow': '50.8',
    });
    expect(hours(r.unplanned.cumulative.unplannedMh)).toBe('216.8');
  });

  it('carries the figures the Review page used to compute itself, as it rendered them', () => {
    // Moved off the page with the web → domain/present edge: each component's share of
    // Unplanned Work, PV/EV money at the Project default Rate, and "behind plan". The texts
    // are the baseline commit's rendered HTML.
    const shares = Object.fromEntries(
      r.unplanned.components.map((c) => [c.key, c.share === null ? null : share(c.share)]),
    );
    expect(shares).toEqual({
      unmapped: '76.6%',
      'non-baselined': '0.0%',
      'catch-all-overflow': '23.4%',
    });
    expect(r.money).toEqual({ pvJpy: 5_839_220n, evJpy: 5_323_172n });
    expect(r.behindPlan).toBe(true);
  });

  it('shows Unplanned Work in the 10–20% amber band for the period', () => {
    expect(share(r.unplanned.sharePeriod!)).toBe('16.8%');
    expect(share(r.unplanned.shareCumulative!)).toBe('13.0%');
    expect(hours(r.unplanned.period.unplannedMh)).toBe('29.1');
  });

  it('colours the three Health Indicators and the overall status', () => {
    expect(r.health.indicators.map((i) => [i.key, i.colour])).toEqual([
      ['schedule', 'amber'],
      ['effort_cost', 'red'],
      ['unplanned', 'amber'],
    ]);
    expect(r.health.overall).toBe('red');
  });

  it('reports Opening Balances separately from period metrics', () => {
    expect(hours(r.openingBalanceMh)).toBe('900.2');
    expect(hours(r.attribution.period.totalMh)).toBe('172.9');
  });

  it('keeps the four scope-ledger buckets mutually exclusive and summing to the total', () => {
    const total = sum(r.scopeLedger.map((s) => s.mh));
    expect(total).toBe(r.attribution.cumulative.totalMh);
    expect(total).toBe(1_661_495n);
    expect(hours(total)).toBe('1661.5');
  });

  it('groups Unmapped Work by Tracker attribute — the UJ-3 bug story', () => {
    expect(r.unmappedGroups.map((g) => [g.label, g.ticketCount, hours(g.mh)])).toEqual([
      ['Bug', 11, '86.7'],
      ['Feature-Request', 6, '46.7'],
      ['Infrastructure', 5, '32.6'],
    ]);
    expect(r.coverage.unmappedTickets).toBe(22);
  });

  it('reports Mapping coverage and the scope-ledger shares as the baseline rendered them', () => {
    // Measured from the Review and Mapping pages at the baseline commit (3c52748), before the
    // shares became exact Ratios: 90.0% of hours, 81.0% of Tickets, and the bar's legend.
    expect(share(r.coverage.mappedHourShare)).toBe('90.0%');
    expect(share(r.coverage.mappedTicketShare)).toBe('81.0%');
    expect(Object.fromEntries(r.scopeLedger.map((s) => [s.key, share(s.share)]))).toEqual({
      'mapped-baselined': '82.1%',
      'mapped-non-baselined': '0.0%',
      'catch-all': '4.8%',
      'catch-all-overflow': '3.1%',
      unmapped: '10.0%',
    });
  });

  it('flags the slipped milestone that keeps Schedule out of green', () => {
    expect(r.milestones.filter((m) => m.slipped).map((m) => m.name)).toEqual([
      'Checkout feature complete',
    ]);
  });

  it('holds the FR-42 invariant: Σ ledger deltas per Ticket = last observed actual hours', () => {
    const check = checkLedgerInvariant(state.ledger, state.snapshots[state.snapshots.length - 1]!);
    expect(check.violations).toEqual([]);
    expect(check.ok).toBe(true);
  });
});

describe('client projection (FR-34 / AD-12)', () => {
  const { result } = review();
  const c = clientProjection(result, 'EC phase 2', DEFAULT_VISIBILITY);

  it('shows the same Health Indicators and Unplanned Work share as the PM Review', () => {
    expect(c.overall).toBe('red');
    expect(c.unplanned.sharePeriod).toBe('16.8%');
    expect(c.unplanned.hours).toBe('29.1');
  });

  it('carries no money, rates, people, Tracker Accounts or Ticket content', () => {
    // No exact quantity at all: a `bigint` (milli-hours, yen) or a `Ratio` (whose num/den are
    // milli-hours) is a magnitude the client is not shown, even when no field names money.
    const exact: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (typeof node === 'bigint') exact.push(`${path} is a bigint`);
      else if (node !== null && typeof node === 'object') {
        if ('num' in node && 'den' in node) exact.push(`${path} is a Ratio`);
        for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
      }
    };
    walk(c, '$');
    expect(exact).toEqual([]);
    const serialised = JSON.stringify(c);
    expect(serialised).not.toMatch(/¥/);
    expect(serialised).not.toMatch(/yenPerHour|jpy|Jpy/);
    // no Ticket keys, no assignee account ids, no resource names
    expect(serialised).not.toMatch(/EC2-\d+/);
    expect(serialised).not.toMatch(/bk-\d+/);
    expect(serialised).not.toMatch(/Nguyen|Tran|Le Thu|Pham|Vo Gia|Do Hong/);
  });

  it('hides the optional sections by default but never the Unplanned Work indicator', () => {
    expect(c.unplanned.breakdown).toBeNull();
    expect(c.evm).toBeNull();
    expect(c.indicators.find((i) => i.key === 'unplanned')).toBeDefined();
  });

  it('shows the schedule only to WBS level 2', () => {
    expect(c.schedule.every((s) => s.wbsCode.split('.').length <= 2)).toBe(true);
  });
});

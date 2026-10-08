import { describe, expect, it } from 'vitest';
import {
  checkLedgerInvariant,
  computeReview,
  hours,
  present,
  share,
  sum,
} from '@momo/domain';
import {
  asOfDate,
  buildDemoState,
  currentPeriod,
  stampDemoLedgerConnectorId,
} from './fixtures';

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
 *
 * IN MEMORY, WITH THE FIXTURE'S BASELINE. The seeded database holds no Baseline until Epic 4
 * (story 2.1, decision 2-A), so `db-round-trip.test.ts` pins the no-Baseline Review; this file
 * keeps the full EVM figures, from the Baseline the fixture carries in memory. Story 2.2 moved
 * the planned dates off the Work Packages and onto that Baseline alone, and none of these
 * figures moved with them.
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
      ledger: stampDemoLedgerConnectorId(state.ledger),
      mappingEvents: state.mappingEvents,
      pinnedSnapshot: state.snapshots[state.snapshots.length - 1]!,
      resources: state.resources,
      period: currentPeriod(state),
      asOf: asOfDate(state),
      dispositions: [],
      measurementBasis: state.measurementBasis,
      resolvedStatusIds: new Set(['Closed']),
    }),
  };
}

/** The Baseline-derived part of the Review, which the fixture's in-memory Baseline makes present. */
function baselineDerived<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`the in-memory demo Review has no ${what}, but its Baseline is active`);
  return value;
}

describe('demo dataset — golden EVM figures', () => {
  const { state, result: r } = review();
  const evm = baselineDerived(r.evm, 'EVM');
  const forecast = baselineDerived(r.forecast, 'forecast');
  const milestones = baselineDerived(r.milestones, 'milestones');

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
    expect(evm.bacMh).toBe(2_936_000n);
    expect(evm.acMh.kind).toBe('value');
    expect(evm.pvMh.kind).toBe('value');
    expect(evm.evMh.kind).toBe('value');
    expect(evm.spi.kind).toBe('value');
    if (evm.acMh.kind !== 'value' || evm.pvMh.kind !== 'value' || evm.evMh.kind !== 'value' || evm.spi.kind !== 'value') {
      throw new Error('expected value metrics');
    }
    expect(evm.acMh.value).toBe(1_661_495n);
    expect(evm.spi.value).toEqual({ num: evm.evMh.value, den: evm.pvMh.value });
  });

  it('reports the headline EVM figures in effort hours', () => {
    expect(hours(evm.bacMh)).toBe('2936.0');
    expect(evm.pvMh.kind).toBe('value');
    expect(evm.evMh.kind).toBe('value');
    expect(evm.acMh.kind).toBe('value');
    if (evm.pvMh.kind !== 'value' || evm.evMh.kind !== 'value' || evm.acMh.kind !== 'value') {
      throw new Error('expected value metrics');
    }
    expect(hours(evm.pvMh.value)).toBe('1459.8');
    expect(hours(evm.evMh.value)).toBe('1330.8');
    expect(hours(evm.acMh.value)).toBe('1661.5');
  });

  it('reports SPI, both CPIs and TCPI', () => {
    expect(present(evm.spi).text).toBe('0.91');
    expect(present(evm.cpiAllIn).text).toBe('0.80');
    expect(present(evm.cpiPlannedScope).text).toBe('0.92');
    expect(present(evm.tcpi).text).toBe('1.26');
  });

  it('reports the forecast', () => {
    expect(present(evm.eacMh).text).toBe('3665.6');
    expect(present(evm.etcMh).text).toBe('2004.1');
    expect(present(evm.vacMh).text).toBe('-729.6');
    expect(forecast.forecastFinish).toBe('2026-12-15');
    expect(forecast.baselineFinish).toBe('2026-11-27');
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
    // Story 5.13: single fixture Connector; label falls back to id without connectorsForCoverage.
    expect(r.openingBalanceByConnector).toEqual([
      { connectorId: 'con-fixture-ec2', label: 'con-fixture-ec2', mh: 900_228n },
    ]);
  });

  it('keeps the four scope-ledger buckets mutually exclusive and summing to the total', () => {
    const total = sum(r.scopeLedger.map((s) => s.mh));
    expect(total).toBe(r.attribution.cumulative.totalMh);
    expect(total).toBe(1_661_495n);
    expect(hours(total)).toBe('1661.5');
  });

  it('proves Period four-bucket sum equals period.totalMh excluding Opening Balances (story 5.13)', () => {
    const p = r.attribution.period;
    expect(
      p.mappedBaselinedMh +
        p.mappedNonBaselinedMh +
        p.catchAllMh +
        p.catchAllOverflowMh +
        p.unmappedMh,
    ).toBe(p.totalMh);
    // Same Period total the Opening Balances test already pins via hours() → '172.9'.
    expect(hours(p.totalMh)).toBe('172.9');
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
    expect(milestones.filter((m) => m.slipped).map((m) => m.name)).toEqual([
      'Checkout feature complete',
    ]);
  });

  it('holds the FR-42 invariant: Σ ledger deltas per Ticket = last observed actual hours', () => {
    const check = checkLedgerInvariant(state.ledger, state.snapshots[state.snapshots.length - 1]!);
    expect(check.violations).toEqual([]);
    expect(check.ok).toBe(true);
  });
});

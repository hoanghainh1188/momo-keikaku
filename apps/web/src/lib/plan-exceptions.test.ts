/**
 * Story 2.16 — exceptions rail walk keys, banner copy, explainer rebind.
 */
import { describe, expect, it } from 'vitest';
import type { PlanExceptionsRailView } from '@/components/plan-grid-types';
import {
  calendarRangeHaltBannerCopy,
  EMPTY_CHAIN_COPY,
  EXCEPTIONS_RAIL_BREAKPOINT_PX,
  flattenExceptionsRailKeys,
  focusWpIdForRailKey,
  genericScheduleStaleCopy,
  groupIdForRailKey,
  nextDrawerOpenForBreakpoint,
  nextDrawerOpenForXKey,
  notSchedulableItemKey,
  oosExplainerProse,
  oosItemKey,
  railKeyForGridException,
  rebindExplainer,
  scheduleStaleBannerKind,
  VIOLATION_HONESTY_LINE,
  violationItemKey,
  walkExceptionsRailKey,
} from './plan-exceptions';

const sampleRail: PlanExceptionsRailView = {
  totalCount: 4,
  holidayCalendarVersionSeq: 3,
  calendarRangeStart: '2026-01-01',
  calendarRangeEnd: '2028-12-31',
  violations: [
    {
      wpId: 'v1',
      wbsCode: '5.2',
      name: 'Final',
      label: '◆ Late 6d',
      isMilestone: true,
      constraintType: 'must_finish_on',
      askedDate: '2027-03-18',
      derivedDate: '2027-03-26',
      daysLate: 6,
      chain: [],
    },
  ],
  outOfSequence: [
    {
      predecessorWpId: 'p',
      successorWpId: 's',
      predecessorWbsCode: '2.3',
      predecessorName: 'Pred',
      successorWbsCode: '2.4',
      successorName: 'Succ',
      label: '⇄ Out of sequence',
      successorActualStart: '2026-09-12',
      predecessorFinish: '2026-09-19',
      predecessorPresent: true,
      successorPresent: true,
    },
    {
      predecessorWpId: 'p2',
      successorWpId: 's',
      predecessorWbsCode: '2.2',
      predecessorName: 'Other',
      successorWbsCode: '2.4',
      successorName: 'Succ',
      label: '⇄ Out of sequence',
      successorActualStart: '2026-09-12',
      predecessorFinish: null,
      predecessorPresent: false,
      successorPresent: true,
    },
  ],
  notSchedulable: [
    {
      wpId: 'n1',
      wbsCode: '4.7',
      name: 'Report',
      label: '⊘ No duration',
      reason: 'no_duration',
    },
  ],
};

describe('plan-exceptions helpers (story 2.16)', () => {
  it('pins the ≥1680 breakpoint and empty-chain / honesty copy', () => {
    expect(EXCEPTIONS_RAIL_BREAKPOINT_PX).toBe(1680);
    expect(EMPTY_CHAIN_COPY).toBe('No driving chain recorded');
    expect(VIOLATION_HONESTY_LINE).toMatch(/has not changed any other work package's Float/);
  });

  it('flattens rail keys in group order and walks focus targets', () => {
    expect(flattenExceptionsRailKeys(sampleRail)).toEqual([
      violationItemKey('v1'),
      oosItemKey('p', 's'),
      oosItemKey('p2', 's'),
      notSchedulableItemKey('n1'),
    ]);
    expect(focusWpIdForRailKey(violationItemKey('v1'), sampleRail)).toBe('v1');
    expect(focusWpIdForRailKey(oosItemKey('p', 's'), sampleRail)).toBe('s');
    expect(focusWpIdForRailKey(notSchedulableItemKey('n1'), sampleRail)).toBe('n1');
  });

  it('maps Exception-cell priority to the matching rail key (first OOS edge)', () => {
    expect(railKeyForGridException('v1', 'violation', sampleRail)).toBe(violationItemKey('v1'));
    expect(railKeyForGridException('s', 'out_of_sequence', sampleRail)).toBe(oosItemKey('p', 's'));
    expect(railKeyForGridException('n1', 'not_schedulable', sampleRail)).toBe(
      notSchedulableItemKey('n1'),
    );
    expect(railKeyForGridException('missing', 'violation', sampleRail)).toBeNull();
  });

  it('rebinds or closes the explainer after a recalc settles', () => {
    expect(
      rebindExplainer({ kind: 'violation', wpId: 'v1' }, sampleRail),
    ).toEqual({ kind: 'violation', wpId: 'v1' });
    expect(
      rebindExplainer({ kind: 'violation', wpId: 'gone' }, sampleRail),
    ).toBeNull();
    expect(
      rebindExplainer(
        { kind: 'out_of_sequence', predecessorWpId: 'p', successorWpId: 's' },
        sampleRail,
      ),
    ).toEqual({ kind: 'out_of_sequence', predecessorWpId: 'p', successorWpId: 's' });
    const empty: PlanExceptionsRailView = {
      ...sampleRail,
      totalCount: 0,
      violations: [],
      outOfSequence: [],
      notSchedulable: [],
    };
    expect(rebindExplainer({ kind: 'not_schedulable', wpId: 'n1' }, empty)).toBeNull();
  });

  it('uses calendar-range banner only for that halt; other stale keeps thin copy', () => {
    expect(
      calendarRangeHaltBannerCopy({
        rangeStart: '2026-01-01',
        rangeEnd: '2028-12-31',
        formatDate: (iso) => (iso === '2026-01-01' ? '1 Jan 2026' : '31 Dec 2028'),
      }),
    ).toMatch(/Schedule halted: calendar range\. Loaded 1 Jan 2026–31 Dec 2028/);
    expect(
      calendarRangeHaltBannerCopy({
        rangeStart: null,
        rangeEnd: null,
        formatDate: () => '—',
      }),
    ).toContain('range unavailable');
    expect(genericScheduleStaleCopy('graph_invalid')).toBe(
      'Schedule halted: graph_invalid. Derived dates are stale.',
    );
    expect(genericScheduleStaleCopy(null)).toMatch(/stale/);
    expect(genericScheduleStaleCopy('calendar_range')).not.toContain('extend the Holiday');
  });

  it('writes neutral OOS prose from pinned dates and falls back without inventing', () => {
    expect(
      oosExplainerProse({
        successorWbsCode: '2.4',
        successorName: 'Succ',
        predecessorWbsCode: '2.3',
        predecessorName: 'Pred',
        successorActualStart: '2026-09-12',
        predecessorFinish: '2026-09-19',
        formatDate: (iso) => (iso === '2026-09-12' ? '12 Sep 2026' : '19 Sep 2026'),
      }),
    ).toMatch(/started 12 Sep 2026, before WP 2\.3 Pred finishes 19 Sep 2026/);
    expect(
      oosExplainerProse({
        successorWbsCode: '2.4',
        successorName: 'Succ',
        predecessorWbsCode: '2.3',
        predecessorName: 'Pred',
        successorActualStart: null,
        predecessorFinish: null,
        formatDate: () => '—',
      }),
    ).toMatch(/out of sequence with WP 2\.3/);
  });

  it('walks j/k across groups; empty is no-op; selecting a key expands its group id', () => {
    const keys = flattenExceptionsRailKeys(sampleRail);
    expect(walkExceptionsRailKey([], null, 'j')).toBeNull();
    expect(walkExceptionsRailKey(keys, null, 'j')).toBe(violationItemKey('v1'));
    expect(walkExceptionsRailKey(keys, violationItemKey('v1'), 'j')).toBe(oosItemKey('p', 's'));
    expect(walkExceptionsRailKey(keys, oosItemKey('p', 's'), 'k')).toBe(violationItemKey('v1'));
    expect(groupIdForRailKey(oosItemKey('p2', 's'))).toBe('oos');
    expect(groupIdForRailKey(notSchedulableItemKey('n1'))).toBe('not_schedulable');
  });

  it('makes x a no-op when pinned and restores drawer preference across the breakpoint', () => {
    expect(nextDrawerOpenForXKey({ pinned: true, drawerOpen: false })).toEqual({
      drawerOpen: false,
      changed: false,
    });
    expect(nextDrawerOpenForXKey({ pinned: false, drawerOpen: false })).toEqual({
      drawerOpen: true,
      changed: true,
    });
    expect(
      nextDrawerOpenForBreakpoint({
        wasPinned: false,
        nowPinned: true,
        drawerOpen: true,
        drawerPref: false,
      }),
    ).toEqual({ drawerOpen: false, drawerPref: true });
    expect(
      nextDrawerOpenForBreakpoint({
        wasPinned: true,
        nowPinned: false,
        drawerOpen: false,
        drawerPref: true,
      }),
    ).toEqual({ drawerOpen: true, drawerPref: true });
    expect(EXCEPTIONS_RAIL_BREAKPOINT_PX).toBe(1680);
  });

  it('gates calendar-range vs generic stale banners (duration-while-halted honesty)', () => {
    expect(scheduleStaleBannerKind('calendar_range', true)).toBe('calendar_range');
    expect(scheduleStaleBannerKind('graph_invalid', true)).toBe('generic');
    expect(scheduleStaleBannerKind(null, true)).toBe('generic');
    expect(scheduleStaleBannerKind(null, false)).toBeNull();
    // Halted run: empty rail + calendar banner — never a green schedule surface.
    const haltedEmpty: PlanExceptionsRailView = {
      totalCount: 0,
      holidayCalendarVersionSeq: null,
      calendarRangeStart: '2026-01-01',
      calendarRangeEnd: '2028-12-31',
      violations: [],
      outOfSequence: [],
      notSchedulable: [],
    };
    expect(haltedEmpty.totalCount).toBe(0);
    expect(
      calendarRangeHaltBannerCopy({
        rangeStart: haltedEmpty.calendarRangeStart,
        rangeEnd: haltedEmpty.calendarRangeEnd,
        formatDate: (iso) => iso ?? '',
      }),
    ).toMatch(/extend the Holiday Calendar range in Project settings/);
  });
});

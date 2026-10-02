/**
 * Story 2.13 — Plan grid pure helpers (order, ink, Float, Exception, predecessors).
 */
import { describe, expect, it } from 'vitest';
import { compareWp } from '@momo/domain';
import {
  actorUserIdOf,
  buildExceptionsRail,
  buildWhatMovedBand,
  blankDerivedDates,
  calendarRangeHaltBanner,
  emptyExceptionsRail,
  floatAnchorHeader,
  floatAnchorSentence,
  formatConstraintLabel,
  formatFloatDisplay,
  formatPlanDate,
  formatPredecessorsText,
  formatRelativeAgo,
  inkTone,
  minFloatFromRows,
  recordedPctDisplay,
  planGridExceptionCell,
  resolveException,
  stripDerivedScalars,
  SUMMARY_NA_LABEL,
} from './plan-grid';

describe('actorUserIdOf (story 2.15)', () => {
  it('strips the user: audit stamp so UI can compare to RequestContext.userId', () => {
    expect(actorUserIdOf('user:user-s215')).toBe('user-s215');
    expect(actorUserIdOf('user:user-s215-other')).toBe('user-s215-other');
    expect(actorUserIdOf('legacy-bare')).toBe('legacy-bare');
  });
});

describe('plan-grid display helpers (story 2.13)', () => {
  it('formats EN plan dates', () => {
    expect(formatPlanDate('2026-09-19')).toBe('19 Sep 2026');
    expect(formatPlanDate(null)).toBe('—');
  });

  it('splits Data Date ink muted vs full', () => {
    expect(inkTone('2026-09-19', '2026-09-19')).toBe('muted');
    expect(inkTone('2026-09-18', '2026-09-19')).toBe('muted');
    expect(inkTone('2026-09-20', '2026-09-19')).toBe('full');
    expect(inkTone(null, '2026-09-19')).toBe('na');
  });

  it('keeps minus sign on negative Float', () => {
    expect(formatFloatDisplay(-3, false)).toEqual({ text: '-3', negative: true });
    expect(formatFloatDisplay(4, false)).toEqual({ text: '+4', negative: false });
    expect(formatFloatDisplay(0, false)).toEqual({ text: '0', negative: false });
    expect(formatFloatDisplay(-1, true)).toEqual({ text: '—', negative: false });
  });

  it('names Float anchor in the header short form', () => {
    expect(floatAnchorHeader({ kind: 'project_finish', date: '2027-03-31' })).toBe(
      'vs Project finish',
    );
    expect(floatAnchorHeader({ kind: 'computed_finish', date: '2027-03-12' })).toBe(
      'vs computed finish',
    );
    expect(floatAnchorHeader(null)).toBeNull();
  });

  it('writes the UX-DR5 Float anchor as a sentence', () => {
    expect(
      floatAnchorSentence({ kind: 'project_finish', date: '2027-03-31' }, '2027-03-31'),
    ).toBe('Float measured against the Project finish, 31 Mar 2027');
    expect(
      floatAnchorSentence({ kind: 'computed_finish', date: '2027-03-12' }, null),
    ).toBe(
      'Float measured against the computed finish, 12 Mar 2027 — relative, because no Project finish is set',
    );
  });

  it('keeps last-good row dates on calendar_range; blanks other halt/stale', () => {
    expect(blankDerivedDates({ haltedReason: 'calendar_range', scheduleStale: true })).toBe(
      false,
    );
    expect(blankDerivedDates({ haltedReason: 'calendar_range', scheduleStale: false })).toBe(
      false,
    );
    expect(blankDerivedDates({ haltedReason: 'graph_invalid', scheduleStale: true })).toBe(true);
    expect(blankDerivedDates({ haltedReason: null, scheduleStale: true })).toBe(true);
    expect(blankDerivedDates({ haltedReason: null, scheduleStale: false })).toBe(false);
  });

  it('blanks strip computed finish / min Float / anchor when the run is halted', () => {
    const halted = stripDerivedScalars({
      haltedReason: 'calendar_range',
      computedFinish: '2027-03-26',
      minFloat: 4,
      anchor: { kind: 'computed_finish', date: '2027-03-26' },
      projectFinish: null,
    });
    expect(halted).toEqual({
      computedFinish: null,
      minFloat: null,
      floatAnchorSentence: null,
    });

    const ok = stripDerivedScalars({
      haltedReason: null,
      computedFinish: '2027-03-26',
      minFloat: 4,
      anchor: { kind: 'computed_finish', date: '2027-03-26' },
      projectFinish: null,
    });
    expect(ok.computedFinish).toBe('2027-03-26');
    expect(ok.minFloat).toBe(4);
    expect(ok.floatAnchorSentence).toMatch(/relative, because no Project finish is set/);

    const missing = stripDerivedScalars({
      haltedReason: null,
      computedFinish: null,
      minFloat: null,
      anchor: null,
      projectFinish: null,
    });
    expect(missing.computedFinish).toBeNull();
    expect(missing.minFloat).toBeNull();
    expect(missing.floatAnchorSentence).toBeNull();
  });

  it('derives min Float and builds What-moved nothing-moved / groups', () => {
    expect(minFloatFromRows([{ floatDays: 4 }, { floatDays: -3 }, { floatDays: null }])).toBe(
      -3,
    );
    const first = buildWhatMovedBand({
      runSeq: 1,
      actorUserId: 'u1',
      actorName: 'Hoang',
      at: new Date('2026-09-26T10:00:00Z'),
      latest: {
        computedFinish: '2027-03-26',
        minFloat: 4,
        wps: [
          {
            wpId: 'a',
            wbsCode: '1.1',
            name: 'Leaf',
            earlyStart: '2026-10-01',
            earlyFinish: '2026-10-05',
            cause: null,
          },
        ],
      },
      previous: null,
    });
    expect(first.nothingMoved).toBe(true);
    expect(first.summaryLine).toBe('No dates moved');
    expect(first.politeAnnounce).toBe('No dates moved.');

    // Parse-failure / missing previous with causes still present — keep groups, null old dates.
    const orphanPrev = buildWhatMovedBand({
      runSeq: 3,
      actorUserId: 'u1',
      actorName: 'Hoang',
      at: new Date('2026-09-26T10:10:00Z'),
      latest: {
        computedFinish: '2027-03-26',
        minFloat: 2,
        wps: [
          {
            wpId: 'a',
            wbsCode: '1.1',
            name: 'Leaf',
            earlyStart: '2026-10-08',
            earlyFinish: '2026-10-12',
            cause: 'edited',
          },
        ],
      },
      previous: null,
    });
    expect(orphanPrev.nothingMoved).toBe(false);
    expect(orphanPrev.movedCount).toBe(1);
    expect(orphanPrev.groups).toHaveLength(1);
    expect(orphanPrev.groups[0]!.entries[0]!.oldEarlyStart).toBeNull();
    expect(orphanPrev.summaryLine).toContain('1 work package moved');

    const moved = buildWhatMovedBand({
      runSeq: 2,
      actorUserId: 'u2',
      actorName: 'Hoang Linh',
      at: new Date('2026-09-26T10:05:00Z'),
      latest: {
        computedFinish: '2027-03-26',
        minFloat: -3,
        wps: [
          {
            wpId: 'a',
            wbsCode: '1.1',
            name: 'Leaf',
            earlyStart: '2026-10-08',
            earlyFinish: '2026-10-12',
            cause: 'edited',
          },
          {
            wpId: 'b',
            wbsCode: '1.2',
            name: 'Succ',
            earlyStart: '2026-10-13',
            earlyFinish: '2026-10-20',
            cause: 'moved by a predecessor',
          },
        ],
      },
      previous: {
        computedFinish: '2027-03-12',
        minFloat: 4,
        earlyByWp: new Map([
          ['a', { earlyStart: '2026-10-01', earlyFinish: '2026-10-05' }],
          ['b', { earlyStart: '2026-10-06', earlyFinish: '2026-10-13' }],
        ]),
      },
    });
    expect(moved.nothingMoved).toBe(false);
    expect(moved.movedCount).toBe(2);
    expect(moved.summaryLine).toContain('2 work packages moved');
    expect(moved.summaryLine).toContain('minimum Float +4 → -3');
    expect(moved.groups.map((g) => g.cause)).toEqual([
      'edited',
      'moved by a predecessor',
    ]);
    expect(moved.politeAnnounce).toMatch(/Minimum Float minus 3/);
    expect(formatRelativeAgo(new Date('2026-09-26T10:02:00Z'), new Date('2026-09-26T10:05:00Z'))).toBe(
      '3 min ago',
    );
  });

  it('formats constraint and predecessor cells', () => {
    expect(formatConstraintLabel('asap', null)).toBe('As soon as possible');
    expect(formatConstraintLabel('must_finish_on', '2027-03-18')).toBe(
      'Must finish on 18 Mar 2027',
    );
    const wbs = new Map([
      ['a', '2.3'],
      ['b', '2.4'],
    ]);
    expect(
      formatPredecessorsText(
        's',
        [
          { predecessorWpId: 'a', successorWpId: 's', lagDays: 2 },
          { predecessorWpId: 'b', successorWpId: 's', lagDays: 0 },
        ],
        wbs,
      ),
    ).toBe('2.3FS+2d, 2.4');
  });

  it('resolves Exception glyph+word+number with priority', () => {
    const violations = new Map([
      ['v', { daysLate: 6, isMilestone: false }],
      ['m', { daysLate: 6, isMilestone: true }],
    ]);
    const oos = new Set(['o']);
    expect(
      resolveException({
        wpId: 'v',
        isLeaf: true,
        notSchedulableReason: null,
        violationsByWp: violations,
        oosWpIds: oos,
      })?.label,
    ).toBe('▲ Late 6d');
    expect(
      resolveException({
        wpId: 'm',
        isLeaf: true,
        notSchedulableReason: null,
        violationsByWp: violations,
        oosWpIds: oos,
      })?.label,
    ).toBe('◆ Late 6d');
    expect(
      resolveException({
        wpId: 'o',
        isLeaf: true,
        notSchedulableReason: null,
        violationsByWp: violations,
        oosWpIds: oos,
      })?.label,
    ).toBe('⇄ Out of sequence');
    expect(
      resolveException({
        wpId: 'n',
        isLeaf: true,
        notSchedulableReason: 'no_duration',
        violationsByWp: violations,
        oosWpIds: oos,
      })?.label,
    ).toBe('⊘ No duration');
    expect(
      resolveException({
        wpId: 'v',
        isLeaf: false,
        notSchedulableReason: null,
        violationsByWp: violations,
        oosWpIds: oos,
      }),
    ).toBeNull();
  });

  it('exposes the summary em-dash accessible name', () => {
    expect(SUMMARY_NA_LABEL).toMatch(/summary work package/);
  });

  it('renders Recorded % and none state', () => {
    expect(recordedPctDisplay(null)).toBe('none — scheduled as 0%');
    expect(recordedPctDisplay({ num: 1n, den: 4n })).toBe('25%');
  });

  it('orders grid keys with compareWp, not raw WBS string order', () => {
    const rows = [
      { id: 'b', wbsCode: '10' },
      { id: 'a', wbsCode: '2' },
    ];
    const sorted = [...rows].sort(compareWp);
    expect(sorted.map((r) => r.wbsCode)).toEqual(['2', '10']);
  });
});

describe('planGridExceptionCell (story 2.16 / retro F23)', () => {
  const base = {
    wpId: 'leaf-1',
    isLeaf: true,
    notSchedulableReason: 'no_duration' as const,
    violationsByWp: new Map<string, never>(),
    oosWpIds: new Set<string>(),
  };

  it('returns null when the latest run is halted', () => {
    expect(resolveException(base)).not.toBeNull();
    expect(planGridExceptionCell('calendar_range', base)).toBeNull();
    expect(planGridExceptionCell('graph_invalid', base)).toBeNull();
  });

  it('delegates to resolveException when not halted', () => {
    expect(planGridExceptionCell(null, base)).toEqual(resolveException(base));
  });
});

describe('exceptions rail builders (story 2.16)', () => {
  it('writes the Q1→A calendar-range halt banner with loaded range or unavailable', () => {
    expect(
      calendarRangeHaltBanner({
        rangeStart: '2026-01-01',
        rangeEnd: '2028-12-31',
      }),
    ).toBe(
      'Schedule halted: calendar range. Loaded 1 Jan 2026–31 Dec 2028. Derived dates are stale — extend the Holiday Calendar range in Project settings.',
    );
    expect(calendarRangeHaltBanner({ rangeStart: null, rangeEnd: null })).toContain(
      'range unavailable',
    );
    expect(calendarRangeHaltBanner({ rangeStart: '2026-01-01', rangeEnd: null })).toContain(
      'range unavailable',
    );
  });

  it('returns an empty rail for halted / no-run and ranks multi-kind + multi-edge', () => {
    expect(emptyExceptionsRail().totalCount).toBe(0);

    const rail = buildExceptionsRail({
      orderedIds: ['v', 'm', 'p', 's1', 's2', 'n'],
      wbsById: new Map([
        ['v', '5.4'],
        ['m', '5.2'],
        ['p', '3.5'],
        ['s1', '3.6'],
        ['s2', '3.7'],
        ['n', '4.7'],
      ]),
      nameById: new Map([
        ['v', 'Warranty'],
        ['m', 'Final'],
        ['p', 'Pred'],
        ['s1', 'SuccA'],
        ['s2', 'SuccB'],
        ['n', 'Report'],
      ]),
      liveWpIds: new Set(['v', 'm', 'p', 's1', 's2', 'n']),
      milestoneIds: new Set(['m']),
      holidayCalendarVersionSeq: 3,
      calendarRangeStart: '2026-01-01',
      calendarRangeEnd: '2028-12-31',
      violations: [
        {
          wpId: 'v',
          constraintType: 'must_finish_on',
          askedDate: '2027-04-02',
          derivedDate: '2027-04-09',
          daysLate: 5,
          chain: ['p'],
        },
        {
          wpId: 'm',
          constraintType: 'must_finish_on',
          askedDate: '2027-03-18',
          derivedDate: '2027-03-26',
          daysLate: 6,
          chain: [],
        },
        // Same WP also Late + will appear in OOS below (multi-kind).
        {
          wpId: 's1',
          constraintType: 'must_start_on',
          askedDate: '2026-09-01',
          derivedDate: '2026-09-08',
          daysLate: 5,
          chain: ['missing'],
        },
      ],
      outOfSequence: [
        { predecessorId: 'p', successorId: 's1' },
        { predecessorId: 'p', successorId: 's2' },
      ],
      notSchedulable: [{ wpId: 'n', reason: 'no_duration' }],
      actualByWp: new Map([
        ['s1', { actualStart: '2026-09-07', actualFinish: null }],
        ['s2', { actualStart: '2026-09-08', actualFinish: null }],
        ['p', { actualStart: '2026-08-01', actualFinish: '2026-09-14' }],
      ]),
      earlyFinishByWp: new Map([
        ['p', '2026-09-14'],
        ['v', '2027-04-09'],
      ]),
      lagByEdge: new Map([['p\0v', 2]]),
    });

    expect(rail.totalCount).toBe(6); // 3 violations + 2 OOS + 1 NS
    // Worst-late first; tie on daysLate → compareWp (3.6 before 5.4).
    expect(rail.violations.map((v) => v.wpId)).toEqual(['m', 's1', 'v']);
    expect(rail.violations[0]!.label).toBe('◆ Late 6d');
    expect(rail.violations[0]!.chain).toEqual([]);
    expect(rail.violations[1]!.chain[0]!.presentInLiveTree).toBe(false);
    expect(rail.violations[1]!.chain[0]!.wbsCode).toMatch(/missing|miss/);
    // One-link: lag on p→v (immediate driver of violated WP).
    expect(rail.violations[2]!.wpId).toBe('v');
    expect(rail.violations[2]!.chain[0]!.lagDays).toBe(2);
    expect(rail.outOfSequence).toHaveLength(2);
    expect(rail.outOfSequence[0]!.successorActualStart).toBe('2026-09-07');
    expect(rail.outOfSequence[0]!.predecessorFinish).toBe('2026-09-14');
    expect(rail.notSchedulable[0]!.label).toBe('⊘ No duration');
    expect(rail.holidayCalendarVersionSeq).toBe(3);
  });

  it('pairs multi-hop chain lag toward the violated WP (immediate-driver first)', () => {
    const rail = buildExceptionsRail({
      orderedIds: ['p0', 'p1', 'w'],
      wbsById: new Map([
        ['p0', '1.0'],
        ['p1', '1.1'],
        ['w', '1.2'],
      ]),
      nameById: new Map([
        ['p0', 'Root'],
        ['p1', 'Mid'],
        ['w', 'Late'],
      ]),
      liveWpIds: new Set(['p0', 'p1', 'w']),
      milestoneIds: new Set(),
      holidayCalendarVersionSeq: 1,
      calendarRangeStart: null,
      calendarRangeEnd: null,
      violations: [
        {
          wpId: 'w',
          constraintType: 'must_finish_on',
          askedDate: '2027-01-01',
          derivedDate: '2027-01-15',
          daysLate: 10,
          chain: ['p1', 'p0'],
        },
      ],
      outOfSequence: [],
      notSchedulable: [],
      actualByWp: new Map(),
      earlyFinishByWp: new Map([
        ['p0', '2026-12-01'],
        ['p1', '2026-12-10'],
      ]),
      lagByEdge: new Map([
        ['p1\0w', 3],
        ['p0\0p1', 1],
        // Wrong-direction keys must not win.
        ['p1\0p0', 99],
        ['p0\0w', 98],
      ]),
    });
    expect(rail.violations[0]!.chain.map((c) => c.wpId)).toEqual(['p1', 'p0']);
    expect(rail.violations[0]!.chain[0]!.lagDays).toBe(3);
    expect(rail.violations[0]!.chain[1]!.lagDays).toBe(1);
  });

  it('omits invented OOS dates when actual/finish are missing', () => {
    const rail = buildExceptionsRail({
      orderedIds: ['p', 's'],
      wbsById: new Map([
        ['p', '2.3'],
        ['s', '2.4'],
      ]),
      nameById: new Map([
        ['p', 'Pred'],
        ['s', 'Succ'],
      ]),
      liveWpIds: new Set(['p', 's']),
      milestoneIds: new Set(),
      holidayCalendarVersionSeq: 1,
      calendarRangeStart: null,
      calendarRangeEnd: null,
      violations: [],
      outOfSequence: [{ predecessorId: 'p', successorId: 's' }],
      notSchedulable: [],
      actualByWp: new Map(),
      earlyFinishByWp: new Map(),
      lagByEdge: new Map(),
    });
    expect(rail.outOfSequence[0]!.successorActualStart).toBeNull();
    expect(rail.outOfSequence[0]!.predecessorFinish).toBeNull();
  });
});

/**
 * Story 2.13 — Plan grid pure helpers (order, ink, Float, Exception, predecessors).
 */
import { describe, expect, it } from 'vitest';
import { compareWp } from '@momo/domain';
import {
  actorUserIdOf,
  buildWhatMovedBand,
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

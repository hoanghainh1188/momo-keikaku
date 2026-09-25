/**
 * Story 2.13 — Plan grid pure helpers (order, ink, Float, Exception, predecessors).
 */
import { describe, expect, it } from 'vitest';
import { compareWp } from '@momo/domain';
import {
  floatAnchorHeader,
  formatConstraintLabel,
  formatFloatDisplay,
  formatPlanDate,
  formatPredecessorsText,
  inkTone,
  recordedPctDisplay,
  resolveException,
  SUMMARY_NA_LABEL,
} from './plan-grid';

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

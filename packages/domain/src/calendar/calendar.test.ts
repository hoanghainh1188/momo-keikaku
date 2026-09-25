import { describe, expect, it } from 'vitest';
import {
  addDays,
  ceilPosition,
  floorPosition,
  isWeekend,
  rollForward,
  shiftWorkingDays,
  workingDayAt,
  workingDayIndex,
  type CalendarVersion,
  type IsoDate,
} from './index';

/** A hand-built version: every weekend in range, plus `holidays`. */
function version(rangeStart: IsoDate, rangeEnd: IsoDate, holidays: IsoDate[] = []): CalendarVersion {
  const nonWorkingDays: IsoDate[] = [...holidays];
  for (let d = rangeStart; d <= rangeEnd; d = addDays(d, 1)) if (isWeekend(d)) nonWorkingDays.push(d);
  return { nonWorkingDays, rangeStart, rangeEnd };
}

// 2026-10-05 is a Monday; 2026-10-10/11 is a weekend.
const OCTOBER = workingDayIndex(version('2026-10-01', '2026-10-31', ['2026-10-14']));

describe('the bounded calendar (story 2.5, Q1 → A)', () => {
  it('lists only the working days in range, in order', () => {
    expect(OCTOBER.days.slice(0, 8)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-12',
    ]);
    expect(OCTOBER.days).not.toContain('2026-10-14'); // the listed holiday
  });

  it('applies no weekend rule of its own: an unlisted Saturday is a working day', () => {
    const index = workingDayIndex({
      nonWorkingDays: [],
      rangeStart: '2026-10-10',
      rangeEnd: '2026-10-11',
    });
    expect(index.days).toEqual(['2026-10-10', '2026-10-11']);
  });

  it('shifts forward and back by working days, skipping weekends and holidays', () => {
    expect(shiftWorkingDays(OCTOBER, '2026-10-09', 1)).toEqual({ ok: true, value: '2026-10-12' });
    expect(shiftWorkingDays(OCTOBER, '2026-10-13', 1)).toEqual({ ok: true, value: '2026-10-15' });
    expect(shiftWorkingDays(OCTOBER, '2026-10-12', -1)).toEqual({ ok: true, value: '2026-10-09' });
    expect(shiftWorkingDays(OCTOBER, '2026-10-12', 0)).toEqual({ ok: true, value: '2026-10-12' });
  });

  it('fails with the side of the range a shift leaves by, never guessing', () => {
    expect(shiftWorkingDays(OCTOBER, '2026-10-30', 1)).toEqual({ ok: false, side: 'after' });
    expect(shiftWorkingDays(OCTOBER, '2026-10-01', -1)).toEqual({ ok: false, side: 'before' });
    expect(shiftWorkingDays(OCTOBER, '2026-11-02', 0)).toEqual({ ok: false, side: 'after' });
    expect(workingDayAt(OCTOBER, OCTOBER.days.length)).toEqual({ ok: false, side: 'after' });
    expect(workingDayAt(OCTOBER, -1)).toEqual({ ok: false, side: 'before' });
  });

  it('refuses to shift from a non-working day: roll it forward first', () => {
    expect(() => shiftWorkingDays(OCTOBER, '2026-10-10', 1)).toThrow(/not a working day/);
  });

  it('rolls a non-working day forward to the next working day, and leaves a working day alone', () => {
    expect(rollForward(OCTOBER, '2026-10-10')).toEqual({ ok: true, value: '2026-10-12' });
    expect(rollForward(OCTOBER, '2026-10-14')).toEqual({ ok: true, value: '2026-10-15' });
    expect(rollForward(OCTOBER, '2026-10-08')).toEqual({ ok: true, value: '2026-10-08' });
    // 31 Oct is a Saturday and the last day in range: no working day follows it.
    expect(rollForward(OCTOBER, '2026-10-31')).toEqual({ ok: false, side: 'after' });
    expect(rollForward(OCTOBER, '2026-09-30')).toEqual({ ok: false, side: 'before' });
  });

  it('gives floor and ceiling positions for any date in range', () => {
    const friday = OCTOBER.days.indexOf('2026-10-09');
    expect(floorPosition(OCTOBER, '2026-10-10')).toEqual({ ok: true, value: friday });
    expect(ceilPosition(OCTOBER, '2026-10-10')).toEqual({ ok: true, value: friday + 1 });
    expect(floorPosition(OCTOBER, '2026-10-09')).toEqual({ ok: true, value: friday });
    expect(ceilPosition(OCTOBER, '2026-10-09')).toEqual({ ok: true, value: friday });
    expect(floorPosition(OCTOBER, '2026-11-01')).toEqual({ ok: false, side: 'after' });
  });

  it('gives −1 as the floor of a range that opens on non-working days', () => {
    const index = workingDayIndex(version('2026-10-10', '2026-10-16'));
    expect(floorPosition(index, '2026-10-11')).toEqual({ ok: true, value: -1 });
    expect(ceilPosition(index, '2026-10-11')).toEqual({ ok: true, value: 0 });
  });

  it('refuses a malformed date that sorts inside the range', () => {
    expect(() => floorPosition(OCTOBER, '2026-10-1')).toThrow(/not a YYYY-MM-DD calendar date/);
    expect(() => ceilPosition(OCTOBER, '2026-10-1')).toThrow(/not a YYYY-MM-DD calendar date/);
  });

  it('refuses a malformed version (a caller defect)', () => {
    expect(() => workingDayIndex({ nonWorkingDays: [], rangeStart: '2026-10-31', rangeEnd: '2026-10-01' })).toThrow(
      /ends before it starts/,
    );
    expect(() => workingDayIndex({ nonWorkingDays: [], rangeStart: '2026-02-30', rangeEnd: '2026-03-01' })).toThrow(
      /not a YYYY-MM-DD calendar date/,
    );
    expect(() =>
      workingDayIndex({ nonWorkingDays: ['2026-11-01'], rangeStart: '2026-10-01', rangeEnd: '2026-10-31' }),
    ).toThrow(/outside its range/);
  });
});

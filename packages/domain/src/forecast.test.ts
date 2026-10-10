import { describe, expect, it } from 'vitest';
import { buildCalendar } from './calendar';
import { computeForecast, finishGapWorkingDays } from './forecast';
import type { EvmResult } from './evm';
import type { BaselineVersion } from './types';
import { hoursToMh, ratio } from './units';

const cal = buildCalendar('test', { jp: false, vn: false });

const baseline: BaselineVersion = {
  seq: 1,
  id: 'bl-1',
  reason: 'x',
  recordedAt: '2026-06-01T00:00:00.000Z',
  actor: 'user:pm',
  wps: [
    {
      wpId: 'WP-A',
      start: '2026-06-08', // Mon — later than pinned Project start in one case
      finish: '2026-06-19', // Fri; 10 working days from 2026-06-08
      baselineMh: hoursToMh(100),
      isMilestone: false,
      isCatchAll: false,
    },
  ],
};

function evmStub(over: {
  spiNum?: bigint;
  spiDen?: bigint;
  spiKind?: 'value' | 'unavailable';
  ev?: bigint;
  bac?: bigint;
  eac?: bigint;
}): EvmResult {
  const spi =
    over.spiKind === 'unavailable'
      ? ({ kind: 'unavailable', reason: 'no_pv', unit: 'ratio', coverage: null } as const)
      : ({
          kind: 'value',
          value: ratio(over.spiNum ?? 100n, over.spiDen ?? 100n),
          unit: 'ratio',
          coverage: null,
        } as const);
  const eac = over.eac ?? hoursToMh(200);
  return {
    bacMh: over.bac ?? hoursToMh(100),
    pvMh: { kind: 'value', value: hoursToMh(50), unit: 'mh', coverage: null },
    evMh: { kind: 'value', value: over.ev ?? hoursToMh(40), unit: 'mh', coverage: null },
    acMh: { kind: 'value', value: hoursToMh(50), unit: 'mh', coverage: null },
    svMh: { kind: 'value', value: hoursToMh(-10), unit: 'mh', coverage: null },
    cvMh: { kind: 'value', value: hoursToMh(-10), unit: 'mh', coverage: null },
    spi,
    cpiAllIn: { kind: 'value', value: ratio(80n, 100n), unit: 'ratio', coverage: null },
    cpiPlannedScope: { kind: 'value', value: ratio(90n, 100n), unit: 'ratio', coverage: null },
    tcpi: { kind: 'value', value: ratio(120n, 100n), unit: 'ratio', coverage: null },
    eacMh: { kind: 'value', value: eac, unit: 'mh', coverage: null },
    etcMh: { kind: 'value', value: hoursToMh(150), unit: 'mh', coverage: null },
    vacMh: { kind: 'value', value: hoursToMh(-100), unit: 'mh', coverage: null },
    bacExhausted: false,
    byWp: [],
  } as unknown as EvmResult;
}

describe('finishGapWorkingDays', () => {
  it('is 0 when dates match; signed when they disagree', () => {
    expect(finishGapWorkingDays('2026-06-10', '2026-06-10', cal)).toBe(0);
    expect(finishGapWorkingDays('2026-06-10', '2026-06-11', cal)).toBe(1); // Wed→Thu
    expect(finishGapWorkingDays('2026-06-11', '2026-06-10', cal)).toBe(-1);
    expect(finishGapWorkingDays('2026-06-12', '2026-06-15', cal)).toBe(1); // Fri→Mon
  });
});

describe('computeForecast (FR-32 dual finishes)', () => {
  it('happy path: both finishes labelled; EAC is Typical eacMh; gap when they disagree', () => {
    // SPI = 1 → trend finish = baseline finish (duration stretch = duration)
    const r = computeForecast(evmStub({ spiNum: 100n, spiDen: 100n, ev: hoursToMh(100), bac: hoursToMh(100) }), baseline, '2026-06-05', cal, {
      computedFinish: '2026-06-12',
      baselineProjectStart: '2026-06-08',
    });
    expect(r.eacMh).toEqual(evmStub({}).eacMh);
    expect(r.forecastFinish).toBe('2026-06-19');
    expect(r.trendFinish).toBe('2026-06-19');
    expect(r.computedFinish).toBe('2026-06-12');
    expect(r.finishGapWd).toBe(finishGapWorkingDays('2026-06-12', '2026-06-19', cal));
    expect(r.finishGapWd).toBeGreaterThan(0);
    expect(r.note).toMatch(/Trend heuristic/);
  });

  it('SPI unavailable or ≤ 0 → trend null; computed still shown; no gap chrome', () => {
    const unavailable = computeForecast(evmStub({ spiKind: 'unavailable' }), baseline, '2026-06-05', cal, {
      computedFinish: '2026-06-19',
    });
    expect(unavailable.forecastFinish).toBeNull();
    expect(unavailable.trendFinish).toBeNull();
    expect(unavailable.computedFinish).toBe('2026-06-19');
    expect(unavailable.finishGapWd).toBeNull();

    const zero = computeForecast(evmStub({ spiNum: 0n, spiDen: 1n }), baseline, '2026-06-05', cal, {
      computedFinish: '2026-06-19',
    });
    expect(zero.forecastFinish).toBeNull();
    expect(zero.computedFinish).toBe('2026-06-19');
    expect(zero.finishGapWd).toBeNull();
  });

  it('EV < BAC floor: trend never earlier than nextWorkingDay(asOf)', () => {
    // SPI ≫ 1 would otherwise pull the finish earlier than asOf's next WD.
    const r = computeForecast(
      evmStub({ spiNum: 200n, spiDen: 100n, ev: hoursToMh(10), bac: hoursToMh(100) }),
      baseline,
      '2026-06-17', // Wed → floor Thu 2026-06-18
      cal,
      { computedFinish: '2026-06-30' },
    );
    expect(r.forecastFinish).toBe('2026-06-18');
    expect(r.trendFinish).toBe('2026-06-18');
  });

  it('dates agree → both shown; finishGapWd null (no disagreement chrome)', () => {
    const r = computeForecast(
      evmStub({ spiNum: 100n, spiDen: 100n, ev: hoursToMh(100), bac: hoursToMh(100) }),
      baseline,
      '2026-06-05',
      cal,
      { computedFinish: '2026-06-19', baselineProjectStart: '2026-06-08' },
    );
    expect(r.forecastFinish).toBe('2026-06-19');
    expect(r.computedFinish).toBe('2026-06-19');
    expect(r.finishGapWd).toBeNull();
  });

  it('no computedFinish → computed null; trend may still show; no gap', () => {
    const r = computeForecast(
      evmStub({ spiNum: 100n, spiDen: 100n, ev: hoursToMh(100), bac: hoursToMh(100) }),
      baseline,
      '2026-06-05',
      cal,
    );
    expect(r.computedFinish).toBeNull();
    expect(r.forecastFinish).toBe('2026-06-19');
    expect(r.finishGapWd).toBeNull();
  });

  it('Baseline Project start wins over min WP start; missing pin falls back to min WP start', () => {
    // Pinned start Mon 2026-06-01; WP start is 2026-06-08. Duration from pinned start is longer.
    const pinned = computeForecast(
      evmStub({ spiNum: 100n, spiDen: 100n, ev: hoursToMh(100), bac: hoursToMh(100) }),
      baseline,
      '2026-06-05',
      cal,
      { baselineProjectStart: '2026-06-01' },
    );
    expect(pinned.baselineStart).toBe('2026-06-01');
    // 15 WD Mon Jun 1 .. Fri Jun 19 → finish stays 2026-06-19 at SPI=1
    expect(pinned.forecastFinish).toBe('2026-06-19');

    const fallback = computeForecast(
      evmStub({ spiNum: 100n, spiDen: 100n, ev: hoursToMh(100), bac: hoursToMh(100) }),
      baseline,
      '2026-06-05',
      cal,
    );
    expect(fallback.baselineStart).toBe('2026-06-08');
    expect(fallback.forecastFinish).toBe('2026-06-19');
  });

  it('reuses EAC from evm.eacMh (does not re-derive)', () => {
    const evm = evmStub({ eac: hoursToMh(999) });
    const r = computeForecast(evm, baseline, '2026-06-05', cal);
    expect(r.eacMh).toBe(evm.eacMh);
    expect(r.eacMh.kind === 'value' && r.eacMh.value).toBe(hoursToMh(999));
  });
});

import { describe, expect, it } from 'vitest';
import {
  compareRatio,
  computeHealth,
  resolveThresholds,
  type HealthInput,
  type HealthScheduleFeed,
} from './health';
import { DEFAULT_THRESHOLDS } from './types';
import { ratio, type RatioMetric } from './units';

const value = (num: bigint, den: bigint = 100n): RatioMetric => ({
  kind: 'value',
  value: ratio(num, den),
  unit: 'ratio',
  coverage: null,
});

function baseEvm(overrides: {
  spi?: RatioMetric;
  cpi?: RatioMetric;
  tcpi?: RatioMetric;
  bacExhausted?: boolean;
} = {}) {
  return {
    spi: overrides.spi ?? value(100n, 100n),
    cpiAllIn: overrides.cpi ?? value(100n, 100n),
    tcpi: overrides.tcpi ?? value(100n, 100n),
    bacExhausted: overrides.bacExhausted ?? false,
  } as HealthInput['evm'];
}

function baseInput(partial: Partial<HealthInput> = {}): HealthInput {
  return {
    evm: baseEvm(),
    thresholds: DEFAULT_THRESHOLDS,
    unplannedSharePeriod: ratio(5n, 100n),
    unplannedShareCumulative: ratio(8n, 100n),
    slippedMilestones: [],
    measurementBasis: 'hours',
    ...partial,
  };
}

describe('compareRatio (AR-6)', () => {
  it('lands exactly on 0.95 / 0.85 boundaries via cross-multiplication', () => {
    expect(compareRatio(ratio(95n, 100n), DEFAULT_THRESHOLDS.ratioGreen)).toBe(0);
    expect(compareRatio(ratio(85n, 100n), DEFAULT_THRESHOLDS.ratioAmber)).toBe(0);
    expect(compareRatio(ratio(94n, 100n), DEFAULT_THRESHOLDS.ratioGreen)).toBe(-1);
    expect(compareRatio(ratio(84n, 100n), DEFAULT_THRESHOLDS.ratioAmber)).toBe(-1);
  });
});

describe('resolveThresholds (FR-31 / A1)', () => {
  it('uses Tenant defaults when no Project override', () => {
    const tenant = {
      ...DEFAULT_THRESHOLDS,
      ratioGreen: ratio(90n, 100n),
    };
    const r = resolveThresholds({ tenantDefaults: tenant, projectOverride: null });
    expect(r.thresholds.ratioGreen).toEqual(ratio(90n, 100n));
    expect(r.source).toBe('tenant');
    expect(r.sources.ratioGreen).toBe('tenant');
  });

  it('lets Project override win; partial keys fall through to Tenant', () => {
    const tenant = {
      ...DEFAULT_THRESHOLDS,
      ratioAmber: ratio(80n, 100n),
    };
    const r = resolveThresholds({
      tenantDefaults: tenant,
      projectOverride: { ratioGreen: ratio(97n, 100n) },
    });
    expect(r.thresholds.ratioGreen).toEqual(ratio(97n, 100n));
    expect(r.sources.ratioGreen).toBe('project');
    expect(r.thresholds.ratioAmber).toEqual(ratio(80n, 100n));
    expect(r.sources.ratioAmber).toBe('tenant');
    expect(r.source).toBe('project');
  });

  it('falls back to DEFAULT_THRESHOLDS with source default when Tenant head missing', () => {
    const r = resolveThresholds({ tenantDefaults: null, projectOverride: null });
    expect(r.thresholds).toEqual(DEFAULT_THRESHOLDS);
    expect(r.source).toBe('default');
    expect(Object.values(r.sources).every((s) => s === 'default')).toBe(true);
  });
});

describe('computeHealth matrix', () => {
  it('colours SPI/CPI bands on exact boundaries', () => {
    const green = computeHealth(baseInput({ evm: baseEvm({ spi: value(95n, 100n) }) }));
    expect(green.indicators.find((i) => i.key === 'schedule')!.colour).toBe('green');

    const amber = computeHealth(baseInput({ evm: baseEvm({ spi: value(85n, 100n) }) }));
    expect(amber.indicators.find((i) => i.key === 'schedule')!.colour).toBe('amber');

    const red = computeHealth(baseInput({ evm: baseEvm({ spi: value(84n, 100n) }) }));
    expect(red.indicators.find((i) => i.key === 'schedule')!.colour).toBe('red');
  });

  it('TCPI cross / BAC exhausted → Effort/Cost red whatever CPI; CPI shown beside TCPI', () => {
    const tcpi = computeHealth(
      baseInput({
        evm: baseEvm({
          cpi: value(110n, 100n),
          tcpi: value(12n, 10n),
        }),
      }),
    );
    const effort = tcpi.indicators.find((i) => i.key === 'effort_cost')!;
    expect(effort.colour).toBe('red');
    expect(effort.driver).toMatch(/CPI/);
    expect(effort.driver).toMatch(/TCPI/);
    expect(effort.rule).toMatch(/shown beside TCPI/);

    const bac = computeHealth(
      baseInput({
        evm: baseEvm({ cpi: value(110n, 100n), bacExhausted: true }),
      }),
    );
    expect(bac.indicators.find((i) => i.key === 'effort_cost')!.colour).toBe('red');
  });

  it('Unplanned uses Period share; cumulative rendered beside', () => {
    const r = computeHealth(
      baseInput({
        unplannedSharePeriod: ratio(15n, 100n),
        unplannedShareCumulative: ratio(25n, 100n),
      }),
    );
    const u = r.indicators.find((i) => i.key === 'unplanned')!;
    expect(u.colour).toBe('amber');
    expect(u.driver).toMatch(/cumulative/);
  });

  it('null Period share → unavailable', () => {
    const r = computeHealth(baseInput({ unplannedSharePeriod: null }));
    expect(r.indicators.find((i) => i.key === 'unplanned')!.colour).toBe('unavailable');
  });

  it('calendar Milestone slip → Schedule ≥ amber and names calendar slip', () => {
    const r = computeHealth(
      baseInput({
        evm: baseEvm({ spi: value(100n, 100n) }),
        slippedMilestones: [{ wbsCode: '1.0', name: 'M', baselineDate: '2026-01-01' }],
      }),
    );
    const s = r.indicators.find((i) => i.key === 'schedule')!;
    expect(s.colour).toBe('amber');
    expect(s.rule).toMatch(/calendar Milestone slip/);
  });

  it('derived Milestone slip → ≥ amber and names derived-slip (and both when calendar also fires)', () => {
    const feed: HealthScheduleFeed = {
      minFloatDays: 2,
      floatAnchorKind: 'project_finish',
      mfoViolations: [],
      derivedSlippedMilestones: [
        {
          wbsCode: '2.0',
          name: 'Gate',
          baselineDate: '2026-06-01',
          derivedDate: '2026-06-10',
        },
      ],
    };
    const derivedOnly = computeHealth(
      baseInput({ evm: baseEvm({ spi: value(100n, 100n) }), scheduleFeed: feed }),
    );
    expect(derivedOnly.indicators.find((i) => i.key === 'schedule')!.rule).toMatch(
      /derived-date Milestone slip/,
    );

    const both = computeHealth(
      baseInput({
        evm: baseEvm({ spi: value(100n, 100n) }),
        slippedMilestones: [{ wbsCode: '1.0', name: 'M', baselineDate: '2026-01-01' }],
        scheduleFeed: feed,
      }),
    );
    expect(both.indicators.find((i) => i.key === 'schedule')!.rule).toMatch(/both milestone rules/);
  });

  it('negative Float vs Project finish → Schedule red; relative Float says cannot fire whatever the colour', () => {
    const neg = computeHealth(
      baseInput({
        evm: baseEvm({ spi: value(100n, 100n) }),
        scheduleFeed: {
          minFloatDays: -3,
          floatAnchorKind: 'project_finish',
          mfoViolations: [],
          derivedSlippedMilestones: [],
        },
      }),
    );
    expect(neg.indicators.find((i) => i.key === 'schedule')!.colour).toBe('red');
    expect(neg.indicators.find((i) => i.key === 'schedule')!.rule).toMatch(/minimum Float/);

    const relativeGreen = computeHealth(
      baseInput({
        evm: baseEvm({ spi: value(100n, 100n) }),
        scheduleFeed: {
          minFloatDays: -3,
          floatAnchorKind: 'computed_finish',
          mfoViolations: [],
          derivedSlippedMilestones: [],
        },
      }),
    );
    const green = relativeGreen.indicators.find((i) => i.key === 'schedule')!;
    expect(green.colour).toBe('green');
    expect(green.rule).toMatch(/relative/);
    expect(green.rule).toMatch(/cannot fire/);

    // Caveat still appends when colour is already amber (calendar slip).
    const relativeAmber = computeHealth(
      baseInput({
        evm: baseEvm({ spi: value(100n, 100n) }),
        slippedMilestones: [{ wbsCode: '1.0', name: 'M', baselineDate: '2026-01-01' }],
        scheduleFeed: {
          minFloatDays: 0,
          floatAnchorKind: 'computed_finish',
          mfoViolations: [],
          derivedSlippedMilestones: [],
        },
      }),
    );
    const amber = relativeAmber.indicators.find((i) => i.key === 'schedule')!;
    expect(amber.colour).toBe('amber');
    expect(amber.rule).toMatch(/calendar Milestone slip/);
    expect(amber.rule).toMatch(/cannot fire/);
  });

  it('unmet MFO → ≥ amber; Milestone MFO → red; names worst + days late', () => {
    const leaf = computeHealth(
      baseInput({
        evm: baseEvm({ spi: value(100n, 100n) }),
        scheduleFeed: {
          minFloatDays: 0,
          floatAnchorKind: 'project_finish',
          mfoViolations: [
            {
              wpId: 'w1',
              wbsCode: '1.1',
              name: 'Build',
              daysLate: 4,
              isMilestone: false,
            },
          ],
          derivedSlippedMilestones: [],
        },
      }),
    );
    const leafInd = leaf.indicators.find((i) => i.key === 'schedule')!;
    expect(leafInd.colour).toBe('amber');
    expect(leafInd.rule).toMatch(/must-finish-on/);
    expect(leafInd.rule).toMatch(/4 working day/);

    const ms = computeHealth(
      baseInput({
        evm: baseEvm({ spi: value(100n, 100n) }),
        scheduleFeed: {
          minFloatDays: 0,
          floatAnchorKind: 'project_finish',
          mfoViolations: [
            {
              wpId: 'm1',
              wbsCode: '2.0',
              name: 'Gate',
              daysLate: 6,
              isMilestone: true,
            },
          ],
          derivedSlippedMilestones: [],
        },
      }),
    );
    expect(ms.indicators.find((i) => i.key === 'schedule')!.colour).toBe('red');
    expect(ms.indicators.find((i) => i.key === 'schedule')!.rule).toMatch(/Milestone/);
  });

  it('composes milestone + MFO naming when negative Float also fires (does not overwrite)', () => {
    const r = computeHealth(
      baseInput({
        evm: baseEvm({ spi: value(100n, 100n) }),
        slippedMilestones: [{ wbsCode: '1.0', name: 'M', baselineDate: '2026-01-01' }],
        scheduleFeed: {
          minFloatDays: -2,
          floatAnchorKind: 'project_finish',
          mfoViolations: [
            {
              wpId: 'm1',
              wbsCode: '2.0',
              name: 'Gate',
              daysLate: 5,
              isMilestone: true,
            },
          ],
          derivedSlippedMilestones: [
            {
              wbsCode: '2.0',
              name: 'Gate',
              baselineDate: '2026-06-01',
              derivedDate: '2026-06-10',
            },
          ],
        },
      }),
    );
    const s = r.indicators.find((i) => i.key === 'schedule')!;
    expect(s.colour).toBe('red');
    expect(s.rule).toMatch(/both milestone rules/);
    expect(s.rule).toMatch(/calendar Milestone slip/);
    expect(s.rule).toMatch(/derived-date Milestone slip/);
    expect(s.rule).toMatch(/must-finish-on/);
    expect(s.rule).toMatch(/5 working day/);
    expect(s.rule).toMatch(/minimum Float/);
    expect(s.driver).toMatch(/Float -2/);
    expect(s.driver).toMatch(/MFO 5d late/);
  });

  it('overall is worst of three and never green while Schedule is red', () => {
    const r = computeHealth(
      baseInput({
        evm: baseEvm({
          spi: value(100n, 100n),
          cpi: value(110n, 100n),
        }),
        scheduleFeed: {
          minFloatDays: -1,
          floatAnchorKind: 'project_finish',
          mfoViolations: [],
          derivedSlippedMilestones: [],
        },
        unplannedSharePeriod: ratio(1n, 100n),
      }),
    );
    expect(r.indicators.find((i) => i.key === 'schedule')!.colour).toBe('red');
    expect(r.indicators.find((i) => i.key === 'effort_cost')!.colour).toBe('green');
    expect(r.overall).toBe('red');
  });

  it('every indicator carries glyph-ready colour, word driver, rule, and disclosure', () => {
    const r = computeHealth(baseInput());
    for (const i of r.indicators) {
      expect(i.colour).toMatch(/green|amber|red|unavailable/);
      expect(i.driver.length).toBeGreaterThan(0);
      expect(i.rule.length).toBeGreaterThan(0);
      expect(i.disclosure).toContain(i.rule);
    }
  });
});

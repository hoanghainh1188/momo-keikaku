import { describe, expect, it } from 'vitest';
import { computeEvm, type EvmInput } from './evm';
import { buildFormulaMetricDetails } from './formula-popover-detail';
import { hoursToMh } from './units';

const cal = { id: 'demo', holidays: {} };

function miniInput(asOf: string): EvmInput {
  return {
    asOf,
    calendar: cal,
    baseline: {
      seq: 1,
      id: 'b',
      reason: '',
      recordedAt: '',
      actor: '',
      wps: [
        {
          wpId: 'wp1',
          start: '2026-06-01',
          finish: '2026-06-10',
          baselineMh: hoursToMh(100),
          isMilestone: false,
          isCatchAll: false,
        },
      ],
    },
    wps: [
      {
        id: 'wp1',
        parentId: null,
        wbsCode: '1',
        name: 'Leaf',
        isLeaf: true,
        isMilestone: false,
        isCatchAll: false,
        plannedMh: 0n,
        assignedResourceIds: [],
        actualStart: null,
        actualFinish: null,
      },
    ],
    mappedTicketsByWp: new Map(),
    acByWp: new Map([['wp1', hoursToMh(10)]]),
    unplannedAcMh: 0n,
    totalAcMh: hoursToMh(10),
    plannedScopeAcMh: hoursToMh(10),
    measurementBasis: 'hours',
  };
}

describe('formula-popover-detail', () => {
  it('builds one detail per metric with period change text', () => {
    const current = computeEvm(miniInput('2026-06-05'));
    const prior = computeEvm(miniInput('2026-06-01'));
    const details = buildFormulaMetricDetails(current, prior, new Map());
    expect(details.length).toBeGreaterThan(10);
    const sv = details.find((d) => d.id === 'sv');
    expect(sv?.periodChange).not.toBe('—');
  });
});

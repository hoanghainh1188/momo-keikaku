import { describe, expect, it } from 'vitest';
import { FORMULA_VERSION } from './evm';
import {
  computeAt,
  formulaAt,
  registeredFormulaVersions,
} from './formula-version';
import { periodOf } from './calendar';
import type { ReviewInput } from './review';
import { DEFAULT_THRESHOLDS } from './types';

const minimalInput: ReviewInput = {
  project: {
    id: 'p',
    name: 'p',
    clientName: 'c',
    contractType: '準委任',
    tzOffsetMinutes: 540,
    teireiWeekday: 4,
    defaultRateYenPerHour: 4000n,
    eacMethod: 'typical',
    thresholds: DEFAULT_THRESHOLDS,
  },
  calendar: { id: 'cal', holidays: {} },
  wps: [],
  baselineVersions: [],
  activeBaselineSeq: null,
  ledger: [],
  mappingEvents: [],
  pinnedSnapshot: {
    snapshotId: '',
    observedAt: '2026-09-16T09:00:00.000Z',
    hoursFieldPresent: false,
    tickets: [],
  },
  resources: [],
  period: periodOf('2026-09-16T09:00:00.000Z', 540, 4),
  asOf: '2026-09-16',
  dispositions: [],
  formulaVersion: FORMULA_VERSION,
};

describe('formulaVersion registry (AD-10)', () => {
  it('registers the current EVM formula key as executable', () => {
    expect(registeredFormulaVersions()).toContain(FORMULA_VERSION);
    expect(formulaAt(FORMULA_VERSION)(minimalInput).formulaVersion).toBe(FORMULA_VERSION);
    expect(computeAt(FORMULA_VERSION, minimalInput).formulaVersion).toBe(FORMULA_VERSION);
  });

  it('refuses an unknown formulaVersion by name', () => {
    expect(() => formulaAt('evm-never-registered')).toThrow(/unknown formulaVersion/);
    expect(() => computeAt('evm-never-registered', minimalInput)).toThrow(
      /unknown formulaVersion/,
    );
  });
});

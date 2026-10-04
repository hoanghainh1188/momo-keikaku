import { describe, expect, it } from 'vitest';
import { planWriteRefuseMessage } from './plan-write-refuse';

describe('planWriteRefuseMessage', () => {
  it('prefers details.refuse[0] over messageKey', () => {
    expect(
      planWriteRefuseMessage({
        messageKey: 'errors.invalid_input',
        details: { refuse: ['2.1 → 2.3 → 2.1 would be a cycle'] },
      }),
    ).toBe('2.1 → 2.3 → 2.1 would be a cycle');
  });

  it('falls back to joined details then messageKey', () => {
    expect(
      planWriteRefuseMessage({
        messageKey: 'errors.invalid_input',
        details: { dependencies: ['dependency_cycle'] },
      }),
    ).toBe('dependencies: dependency_cycle');
    expect(planWriteRefuseMessage({ messageKey: 'errors.invalid_input' })).toBe(
      'errors.invalid_input',
    );
  });

  it('maps Baseline incomplete_plan details for Set/Re refuse alerts (retro F9)', () => {
    expect(
      planWriteRefuseMessage({
        messageKey: 'errors.invalid_input',
        details: { baseline: ['incomplete_plan'] },
      }),
    ).toBe('baseline: incomplete_plan');
  });
});

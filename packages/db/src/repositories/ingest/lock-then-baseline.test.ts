/**
 * Epic-5-retro F4 regression: lock-then-baseline order and the holdsWatermark guard.
 * Pure — no Postgres. A REQUIRE_DB write path still exercises the live lock.
 */
import { describe, expect, it } from 'vitest';
import type { Tx } from '../../with-tenant';
import {
  assertBaselineHeadUnderProjectLock,
  lockThenReadBaselineHead,
} from './index';

describe('lockThenReadBaselineHead (epic-5-retro F4)', () => {
  it('invokes lock before reading Baseline head', async () => {
    const order: string[] = [];
    const seq = await lockThenReadBaselineHead(
      async () => {
        order.push('lock');
      },
      async () => {
        order.push('baseline');
        return 7;
      },
    );
    expect(order).toEqual(['lock', 'baseline']);
    expect(seq).toBe(7);
  });

  it('does not read Baseline head when lock rejects', async () => {
    let read = false;
    await expect(
      lockThenReadBaselineHead(
        async () => {
          throw new Error('lock failed');
        },
        async () => {
          read = true;
          return null;
        },
      ),
    ).rejects.toThrow('lock failed');
    expect(read).toBe(false);
  });
});

describe('assertBaselineHeadUnderProjectLock (epic-5-retro F4)', () => {
  it('refuses a transaction that does not hold the Project watermark', () => {
    const fakeTx = {} as Tx;
    expect(() => assertBaselineHeadUnderProjectLock(fakeTx)).toThrow(
      /without Project watermark lock/,
    );
  });
});

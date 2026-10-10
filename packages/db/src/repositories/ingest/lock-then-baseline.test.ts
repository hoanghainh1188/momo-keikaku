/**
 * Epic-5-retro F4 regression: lock-then-baseline order and the Project-key guard.
 * Pure — no Postgres. A REQUIRE_DB write path still exercises the live lock.
 */
import { describe, expect, it } from 'vitest';
import { stubExclusiveWatermark } from '../../watermark-lock';
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
  it('refuses a transaction that does not hold any watermark', () => {
    const fakeTx = {} as Tx;
    expect(() => assertBaselineHeadUnderProjectLock(fakeTx, 'prj-1')).toThrow(
      /project:prj-1/,
    );
  });

  it('refuses Tenant-only exclusive (not project:<projectId>)', () => {
    const fakeTx = {} as Tx;
    stubExclusiveWatermark(fakeTx, 'tenant');
    expect(() => assertBaselineHeadUnderProjectLock(fakeTx, 'prj-1')).toThrow(
      /project:prj-1/,
    );
  });

  it('refuses exclusive on a different Project id', () => {
    const fakeTx = {} as Tx;
    stubExclusiveWatermark(fakeTx, 'project:prj-other');
    expect(() => assertBaselineHeadUnderProjectLock(fakeTx, 'prj-1')).toThrow(
      /project:prj-1/,
    );
  });

  it('allows exclusive on project:<projectId>', () => {
    const fakeTx = {} as Tx;
    stubExclusiveWatermark(fakeTx, 'project:prj-1');
    expect(() => assertBaselineHeadUnderProjectLock(fakeTx, 'prj-1')).not.toThrow();
  });
});

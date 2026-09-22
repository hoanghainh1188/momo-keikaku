import { describe, expect, it } from 'vitest';
import type { Db } from './client';
import { tenantCurrencyOn } from './repo-tenant-currency';

describe('tenantCurrencyOn.setCurrency', () => {
  it('throws when no tenant row is updated', async () => {
    const db = {
      update: () => ({
        set: () => ({
          where: async () => ({ rowCount: 0 }),
        }),
      }),
    } as unknown as Db;

    await expect(tenantCurrencyOn(db).setCurrency('ten-missing', 'JPY')).rejects.toThrow(
      /exactly one row/,
    );
  });
});

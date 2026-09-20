import { describe, expect, it } from 'vitest';

/**
 * The fail-boot contract, gated.
 *
 * `config.ts`'s whole reason to exist is that a missing key stops the process *naming the
 * key*, rather than surfacing as an `undefined` hours later. Until now that was proved by a
 * hand-run probe, which means relaxing a key to `.default(...)` would keep the inferred type
 * `string`, pass every typecheck, and let the worker boot silently against the wrong
 * connection string.
 *
 * `parseConfig` takes the environment as an argument precisely so this needs no real one.
 * The import is dynamic behind two assignments only because the module also parses
 * `process.env` eagerly at load for the real boot path (recorded in deferred-work.md).
 */
process.env.DATABASE_URL ??= 'postgres://owner:owner@localhost:55433/momo_keikaku';
process.env.APP_DATABASE_URL ??= 'postgres://momo_app:momo_app@localhost:55433/momo_keikaku';

const { parseConfig } = await import('./config');

const COMPLETE = {
  DATABASE_URL: 'postgres://momo:momo@localhost:55433/momo_keikaku',
  APP_DATABASE_URL: 'postgres://momo_app:momo_app@localhost:55433/momo_keikaku',
} as const;

describe('parseConfig', () => {
  it('returns both connection strings when both are present', () => {
    expect(parseConfig({ ...COMPLETE })).toEqual(COMPLETE);
  });

  // One case per key per failure mode, because "required" and "not empty" are two different
  // schema clauses and a regression can remove either one on its own.
  for (const key of ['DATABASE_URL', 'APP_DATABASE_URL'] as const) {
    it(`fails naming ${key} when it is absent`, () => {
      const { [key]: _omitted, ...rest } = COMPLETE;
      expect(() => parseConfig(rest)).toThrow(new RegExp(`Invalid configuration: .*${key} is required`));
    });

    it(`fails naming ${key} when it is empty`, () => {
      expect(() => parseConfig({ ...COMPLETE, [key]: '' })).toThrow(
        new RegExp(`Invalid configuration: .*${key} must not be empty`),
      );
    });
  }
});

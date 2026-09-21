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
 * The import is dynamic behind two assignments because the module once parsed
 * `process.env` eagerly at load. It no longer does — `config` is a getter per key, read
 * lazily — so the assignments are now belt and braces rather than required.
 */
process.env.DATABASE_URL ??= 'postgres://owner:owner@localhost:55433/momo_keikaku';
process.env.APP_DATABASE_URL ??= 'postgres://momo_app:momo_app@localhost:55433/momo_keikaku';

const { parseConfig } = await import('./config');

const COMPLETE = {
  DATABASE_URL: 'postgres://momo:momo@localhost:55433/momo_keikaku',
  APP_DATABASE_URL: 'postgres://momo_app:momo_app@localhost:55433/momo_keikaku',
  BETTER_AUTH_SECRET: 'a-test-secret-that-is-long-enough-000',
  BETTER_AUTH_URL: 'http://localhost:3101',
  SEED_DEMO_PASSWORD: 'demo-password',
} as const;

describe('parseConfig', () => {
  it('returns every key when all are present, with the idle timeout defaulted to 8 hours', () => {
    expect(parseConfig({ ...COMPLETE })).toEqual({ ...COMPLETE, SESSION_IDLE_TIMEOUT_HOURS: 8 });
  });

  it('reads SESSION_IDLE_TIMEOUT_HOURS as a whole number of hours', () => {
    expect(parseConfig({ ...COMPLETE, SESSION_IDLE_TIMEOUT_HOURS: '12' }).SESSION_IDLE_TIMEOUT_HOURS).toBe(12);
    for (const bad of ['0', '1.5', 'eight']) {
      expect(() => parseConfig({ ...COMPLETE, SESSION_IDLE_TIMEOUT_HOURS: bad })).toThrow(
        /Invalid configuration: SESSION_IDLE_TIMEOUT_HOURS/,
      );
    }
  });

  it('refuses a short BETTER_AUTH_SECRET and a relative BETTER_AUTH_URL, naming each', () => {
    expect(() => parseConfig({ ...COMPLETE, BETTER_AUTH_SECRET: 'short' })).toThrow(
      /Invalid configuration: BETTER_AUTH_SECRET must be at least 32 characters/,
    );
    expect(() => parseConfig({ ...COMPLETE, BETTER_AUTH_URL: '/relative' })).toThrow(
      /Invalid configuration: BETTER_AUTH_URL must be an absolute URL/,
    );
  });

  for (const key of ['BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'SEED_DEMO_PASSWORD'] as const) {
    it(`fails naming ${key} when it is absent`, () => {
      const { [key]: _omitted, ...rest } = COMPLETE;
      expect(() => parseConfig(rest)).toThrow(new RegExp(`Invalid configuration: .*${key} is required`));
    });
  }

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

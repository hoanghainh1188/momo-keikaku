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

const { parseConfig, parseConfigKey, parseGoogleProvider } = await import('./config');

const COMPLETE = {
  DATABASE_URL: 'postgres://momo:momo@localhost:55433/momo_keikaku',
  APP_DATABASE_URL: 'postgres://momo_app:momo_app@localhost:55433/momo_keikaku',
  BETTER_AUTH_SECRET: 'a-test-secret-that-is-long-enough-000',
  BETTER_AUTH_URL: 'http://localhost:3101',
  SEED_DEMO_PASSWORD: 'demo-password',
  DEPLOYMENT: 'local',
} as const;

describe('parseConfig', () => {
  it('returns every key when all are present, with the idle timeout defaulted to 8 hours', () => {
    expect(parseConfig({ ...COMPLETE })).toEqual({
      ...COMPLETE,
      SESSION_IDLE_TIMEOUT_HOURS: 8,
      AUTH_GOOGLE: 'off',
      MAILER: 'console',
      CLOCK_MODE: 'system',
      SEED_PROFILE: 'demo',
    });
  });

  it('reads SESSION_IDLE_TIMEOUT_HOURS as a whole number of hours', () => {
    expect(parseConfig({ ...COMPLETE, SESSION_IDLE_TIMEOUT_HOURS: '12' }).SESSION_IDLE_TIMEOUT_HOURS).toBe(12);
    // `0x10` and `1e2` are the ones the raw coercion read as 16 and 100 — a typo becoming a
    // different idle timeout rather than a named failure. `721` is the ceiling, which had no case.
    for (const bad of ['0', '1.5', 'eight', '0x10', '1e2', ' 12 ', '721']) {
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

  /**
   * ONE CASE PER KEY PER FAILURE MODE, as this file states below — two clauses had none.
   * `SEED_DEMO_PASSWORD`'s floor is the demo Tenant Admin's sign-in credential; the URL's scheme
   * is what Better Auth matches request Origins against, and `.url()` alone accepted
   * `javascript:`, `mailto:` and `ftp:` (measured).
   */
  it('refuses a short SEED_DEMO_PASSWORD and a non-origin BETTER_AUTH_URL, naming each', () => {
    expect(() => parseConfig({ ...COMPLETE, SEED_DEMO_PASSWORD: 'short' })).toThrow(
      /Invalid configuration: SEED_DEMO_PASSWORD must be at least 8 characters/,
    );
    for (const bad of ['javascript:alert(1)', 'mailto:a@b.example', 'ftp://host', 'http://a.example/path']) {
      expect(() => parseConfig({ ...COMPLETE, BETTER_AUTH_URL: bad }), bad).toThrow(
        /Invalid configuration: BETTER_AUTH_URL/,
      );
    }
    for (const ok of ['http://localhost:3101', 'https://app.example']) {
      expect(parseConfig({ ...COMPLETE, BETTER_AUTH_URL: ok }).BETTER_AUTH_URL, ok).toBe(ok);
    }
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

/**
 * Google sign-in's keys (story 1.4 slice 3, AD-17): off unless configured; `on` requires all three
 * and names every missing one; the issuer is `https:` unless its host is loopback.
 */
const GOOGLE = {
  AUTH_GOOGLE: 'on',
  GOOGLE_CLIENT_ID: 'momo-local-client',
  GOOGLE_CLIENT_SECRET: 'momo-local-secret',
  GOOGLE_ISSUER_URL: 'https://accounts.google.com',
} as const;

describe('googleProvider', () => {
  it('is null when AUTH_GOOGLE is absent or off, whatever else is set', () => {
    expect(parseGoogleProvider({})).toBeNull();
    expect(parseGoogleProvider({ ...GOOGLE, AUTH_GOOGLE: 'off' })).toBeNull();
    expect(parseConfig({ ...COMPLETE }).AUTH_GOOGLE).toBe('off');
  });

  it('answers the three keys when on', () => {
    expect(parseGoogleProvider({ ...GOOGLE })).toEqual({
      clientId: 'momo-local-client',
      clientSecret: 'momo-local-secret',
      issuer: 'https://accounts.google.com',
    });
  });

  it('fails naming GOOGLE_CLIENT_SECRET when on without a client secret — and every other missing key', () => {
    const { GOOGLE_CLIENT_SECRET: _secret, ...noSecret } = GOOGLE;
    expect(() => parseGoogleProvider(noSecret)).toThrow(
      /^Invalid configuration: GOOGLE_CLIENT_SECRET is required when AUTH_GOOGLE=on$/,
    );
    expect(() => parseGoogleProvider({ AUTH_GOOGLE: 'on' })).toThrow(
      /GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_ISSUER_URL are required when AUTH_GOOGLE=on/,
    );
    expect(() => parseConfig({ ...COMPLETE, ...noSecret })).toThrow(
      /Invalid configuration: GOOGLE_CLIENT_SECRET is required when AUTH_GOOGLE=on/,
    );
    expect(parseConfig({ ...COMPLETE, ...GOOGLE }).GOOGLE_CLIENT_SECRET).toBe('momo-local-secret');
  });

  it('refuses an AUTH_GOOGLE that is neither off nor on, and an empty key', () => {
    expect(() => parseGoogleProvider({ ...GOOGLE, AUTH_GOOGLE: 'yes' })).toThrow(/AUTH_GOOGLE must be `off` or `on`/);
    expect(() => parseGoogleProvider({ ...GOOGLE, GOOGLE_CLIENT_ID: '' })).toThrow(/GOOGLE_CLIENT_ID must not be empty/);
  });

  it('takes an https issuer anywhere, and an http one only on a loopback host', () => {
    for (const issuer of ['http://localhost:4455', 'http://127.0.0.1:4455/', 'http://[::1]:4455']) {
      expect(parseGoogleProvider({ ...GOOGLE, GOOGLE_ISSUER_URL: issuer })?.issuer, issuer).toBe(issuer);
    }
    for (const issuer of ['http://accounts.google.com', 'http://10.0.0.5:4455', 'accounts.google.com', 'ftp://localhost']) {
      expect(() => parseGoogleProvider({ ...GOOGLE, GOOGLE_ISSUER_URL: issuer }), issuer).toThrow(
        /GOOGLE_ISSUER_URL must be an absolute https: URL/,
      );
      expect(() => parseConfig({ ...COMPLETE, ...GOOGLE, GOOGLE_ISSUER_URL: issuer }), issuer).toThrow(
        /GOOGLE_ISSUER_URL must be an absolute https: URL/,
      );
    }
  });
});

/** The mail transport (story 1.4 slice 4, AD-17): `console` by default; `ses` is accepted too. */
describe('MAILER', () => {
  it('defaults to console', () => {
    expect(parseConfig({ ...COMPLETE }).MAILER).toBe('console');
  });

  it('accepts ses, even though only console ships today', () => {
    expect(parseConfig({ ...COMPLETE, MAILER: 'ses' }).MAILER).toBe('ses');
  });

  it('refuses anything else, naming the key', () => {
    expect(() => parseConfig({ ...COMPLETE, MAILER: 'smtp' })).toThrow(
      /Invalid configuration: MAILER must be `console` or `ses`/,
    );
  });
});

/** AD-17 profile + fixture clock (story 1.8). */
describe('DEPLOYMENT and local-only refusals', () => {
  it('requires DEPLOYMENT, naming the key when absent', () => {
    const { DEPLOYMENT: _omitted, ...rest } = COMPLETE;
    expect(() => parseConfig(rest)).toThrow(/Invalid configuration: .*DEPLOYMENT is required/);
  });

  it('accepts local with console mail and fixture clock when the anchor is set', () => {
    expect(
      parseConfig({
        ...COMPLETE,
        CLOCK_MODE: 'fixture',
        FIXTURE_TIME_ANCHOR: '2026-09-16T09:00:00.000Z',
        TRACKER_ADAPTER_OVERRIDE: 'fixture',
      }),
    ).toMatchObject({
      DEPLOYMENT: 'local',
      CLOCK_MODE: 'fixture',
      FIXTURE_TIME_ANCHOR: '2026-09-16T09:00:00.000Z',
      TRACKER_ADAPTER_OVERRIDE: 'fixture',
      MAILER: 'console',
    });
  });

  it('refuses CLOCK_MODE=fixture without FIXTURE_TIME_ANCHOR', () => {
    expect(() => parseConfig({ ...COMPLETE, CLOCK_MODE: 'fixture' })).toThrow(
      /Invalid configuration: FIXTURE_TIME_ANCHOR is required when CLOCK_MODE=fixture/,
    );
  });

  for (const deployment of ['staging', 'production'] as const) {
    it(`refuses MAILER=console under DEPLOYMENT=${deployment}, naming MAILER`, () => {
      expect(() => parseConfig({ ...COMPLETE, DEPLOYMENT: deployment, MAILER: 'console' })).toThrow(
        /Invalid configuration: MAILER is `console`, which is only allowed when DEPLOYMENT=local/,
      );
    });

    it(`refuses CLOCK_MODE=fixture under DEPLOYMENT=${deployment}, naming CLOCK_MODE`, () => {
      expect(() =>
        parseConfig({
          ...COMPLETE,
          DEPLOYMENT: deployment,
          MAILER: 'ses',
          CLOCK_MODE: 'fixture',
          FIXTURE_TIME_ANCHOR: '2026-09-16T09:00:00.000Z',
        }),
      ).toThrow(
        /Invalid configuration: CLOCK_MODE is `fixture`, which is only allowed when DEPLOYMENT=local/,
      );
    });

    it(`refuses TRACKER_ADAPTER_OVERRIDE=fixture under DEPLOYMENT=${deployment}`, () => {
      expect(() =>
        parseConfig({
          ...COMPLETE,
          DEPLOYMENT: deployment,
          MAILER: 'ses',
          TRACKER_ADAPTER_OVERRIDE: 'fixture',
        }),
      ).toThrow(
        /Invalid configuration: TRACKER_ADAPTER_OVERRIDE is `fixture`, which is only allowed when DEPLOYMENT=local/,
      );
    });

    it(`accepts DEPLOYMENT=${deployment} with MAILER=ses and CLOCK_MODE=system`, () => {
      expect(parseConfig({ ...COMPLETE, DEPLOYMENT: deployment, MAILER: 'ses' })).toMatchObject({
        DEPLOYMENT: deployment,
        MAILER: 'ses',
        CLOCK_MODE: 'system',
      });
    });
  }

  it('defaults SEED_PROFILE to demo and accepts load', () => {
    expect(parseConfig({ ...COMPLETE }).SEED_PROFILE).toBe('demo');
    expect(parseConfig({ ...COMPLETE, SEED_PROFILE: 'load' }).SEED_PROFILE).toBe('load');
  });
});

/**
 * Process getters use `parseConfigKey`, not `parseConfig`. The AD-17 / fixture-anchor
 * refusals must fire on the per-key path too (story 1.8).
 */
describe('parseConfigKey AD-17 and fixture-anchor refusals', () => {
  it('refuses CLOCK_MODE=fixture without FIXTURE_TIME_ANCHOR', () => {
    expect(() => parseConfigKey({ ...COMPLETE, CLOCK_MODE: 'fixture' }, 'CLOCK_MODE')).toThrow(
      /Invalid configuration: FIXTURE_TIME_ANCHOR is required when CLOCK_MODE=fixture/,
    );
  });

  it('accepts CLOCK_MODE=fixture when FIXTURE_TIME_ANCHOR is set under local', () => {
    expect(
      parseConfigKey(
        {
          ...COMPLETE,
          CLOCK_MODE: 'fixture',
          FIXTURE_TIME_ANCHOR: '2026-09-16T09:00:00.000Z',
        },
        'CLOCK_MODE',
      ),
    ).toBe('fixture');
  });

  for (const deployment of ['staging', 'production'] as const) {
    it(`refuses MAILER=console under DEPLOYMENT=${deployment} via parseConfigKey`, () => {
      expect(() =>
        parseConfigKey({ ...COMPLETE, DEPLOYMENT: deployment, MAILER: 'console' }, 'MAILER'),
      ).toThrow(
        /Invalid configuration: MAILER is `console`, which is only allowed when DEPLOYMENT=local/,
      );
    });

    it(`refuses CLOCK_MODE=fixture under DEPLOYMENT=${deployment} via parseConfigKey`, () => {
      expect(() =>
        parseConfigKey(
          {
            ...COMPLETE,
            DEPLOYMENT: deployment,
            MAILER: 'ses',
            CLOCK_MODE: 'fixture',
            FIXTURE_TIME_ANCHOR: '2026-09-16T09:00:00.000Z',
          },
          'CLOCK_MODE',
        ),
      ).toThrow(
        /Invalid configuration: CLOCK_MODE is `fixture`, which is only allowed when DEPLOYMENT=local/,
      );
    });

    it(`refuses TRACKER_ADAPTER_OVERRIDE=fixture under DEPLOYMENT=${deployment} via parseConfigKey`, () => {
      expect(() =>
        parseConfigKey(
          {
            ...COMPLETE,
            DEPLOYMENT: deployment,
            MAILER: 'ses',
            TRACKER_ADAPTER_OVERRIDE: 'fixture',
          },
          'TRACKER_ADAPTER_OVERRIDE',
        ),
      ).toThrow(
        /Invalid configuration: TRACKER_ADAPTER_OVERRIDE is `fixture`, which is only allowed when DEPLOYMENT=local/,
      );
    });
  }
});

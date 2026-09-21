import { describe, expect, it } from 'vitest';
import type { Db } from '@momo/db';
import { SESSION_UPDATE_AGE_SECONDS, authOptions } from './auth';

/**
 * The auth configuration, pinned with no database (story 1.4 slice 1). `tests/identity.test.ts`
 * drives the same options against Postgres; this file is the gate that still runs without one.
 */
const OPTIONS = authOptions({
  db: {} as Db,
  secret: 'auth-options-test-secret-0123456789abcd',
  baseURL: 'http://localhost:3101',
  idleHours: 8,
  generateId: () => '019b76da-a800-7000-8000-0f0000000000',
});

describe('the Better Auth options', () => {
  it('keeps the session cookie cache off, so every request reaches the session table', () => {
    expect(OPTIONS.session.cookieCache).toEqual({ enabled: false });
  });

  it('makes the idle timeout the session lifetime, sliding every five minutes', () => {
    expect(OPTIONS.session.expiresIn).toBe(8 * 60 * 60);
    expect(OPTIONS.session.updateAge).toBe(SESSION_UPDATE_AGE_SECONDS);
    expect(SESSION_UPDATE_AGE_SECONDS).toBe(300);
  });

  it('enables email + password with sign-up disabled', () => {
    expect(OPTIONS.emailAndPassword).toEqual({ enabled: true, disableSignUp: true });
  });

  it('adds the two product fields, neither of them client-writable', () => {
    expect(OPTIONS.session.additionalFields.activeTenantId.input).toBe(false);
    expect(OPTIONS.user.additionalFields.locale.input).toBe(false);
    expect(OPTIONS.user.modelName).toBe('auth_user');
  });

  it('takes identity ids from the id port it is given', () => {
    expect(OPTIONS.advanced.database.generateId()).toBe('019b76da-a800-7000-8000-0f0000000000');
  });

  it('puts nextCookies() last', () => {
    expect(OPTIONS.plugins.map((plugin) => plugin.id)).toEqual(['next-cookies']);
  });

  it('refuses an idle timeout that is not a whole number of hours', () => {
    for (const idleHours of [0, 1.5, Number.NaN]) {
      expect(() => authOptions({ ...OPTIONS_INPUT, idleHours })).toThrow(/idleHours/);
    }
  });
});

const OPTIONS_INPUT = {
  db: {} as Db,
  secret: 'auth-options-test-secret-0123456789abcd',
  baseURL: 'http://localhost:3101',
  idleHours: 8,
  generateId: () => 'id',
};

import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@momo/db';
import { SESSION_UPDATE_AGE_SECONDS, authOptions } from './auth';
import { discoveryUrlOf, verifiedGoogleIdentity, withoutProviderTokens } from './google';
import { resetLinkOf, resetPasswordMail } from './reset';

/**
 * The auth configuration, pinned with no database (story 1.4 slice 1). `tests/identity.test.ts`
 * drives the same options against Postgres; this file is the gate that still runs without one.
 */
const NOW = new Date('2026-09-22T08:00:00Z');
const MAILER = { send: vi.fn(async () => {}) };
const IDENTITY_EVENTS = { record: vi.fn(async () => {}) };

const OPTIONS = authOptions({
  db: {} as Db,
  secret: 'auth-options-test-secret-0123456789abcd',
  baseURL: 'http://localhost:3101',
  idleHours: 8,
  generateId: () => '019b76da-a800-7000-8000-0f0000000000',
  mailer: MAILER,
  now: () => NOW,
  identityEvents: IDENTITY_EVENTS,
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

  it('enables email + password with sign-up disabled, and pins the reset timing (story 1.4 slice 4)', () => {
    expect(OPTIONS.emailAndPassword).toMatchObject({
      enabled: true,
      disableSignUp: true,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
    });
    expect(OPTIONS.emailAndPassword.sendResetPassword).toEqual(expect.any(Function));
    expect(OPTIONS.emailAndPassword.onPasswordReset).toEqual(expect.any(Function));
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
  mailer: MAILER,
  now: () => NOW,
  identityEvents: IDENTITY_EVENTS,
};

/** An unsigned JWT carrying `claims` — `verifiedGoogleIdentity` only decodes (the plugin verified). */
function jwtOf(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(claims)}.c2ln`;
}

const GOOGLE = { clientId: 'client-x', clientSecret: 'secret-x', issuer: 'http://127.0.0.1:4455/' };
const WITH_GOOGLE = authOptions({ ...OPTIONS_INPUT, google: GOOGLE });

/** The one generic OAuth provider config the plugin was built with. */
function googleConfig() {
  const plugin = WITH_GOOGLE.plugins.find((candidate) => candidate.id === 'generic-oauth') as
    | { options?: { config?: Record<string, unknown>[] } }
    | undefined;
  expect(plugin?.options?.config).toHaveLength(1);
  return plugin!.options!.config![0]!;
}

describe('Google sign-in options (story 1.4 slice 3)', () => {
  it('registers no OAuth provider when Google is absent or null', () => {
    expect(authOptions({ ...OPTIONS_INPUT, google: null }).plugins.map((plugin) => plugin.id)).toEqual(['next-cookies']);
  });

  it('registers Google through genericOAuth, before nextCookies()', () => {
    expect(WITH_GOOGLE.plugins.map((plugin) => plugin.id)).toEqual(['generic-oauth', 'next-cookies']);
  });

  it('configures one provider: google, discovered from the issuer, verified id tokens, no sign-up', () => {
    expect(googleConfig()).toMatchObject({
      providerId: 'google',
      clientId: 'client-x',
      clientSecret: 'secret-x',
      discoveryUrl: 'http://127.0.0.1:4455/.well-known/openid-configuration',
      pkce: true,
      scopes: ['openid', 'email', 'profile'],
      requireIdTokenVerification: true,
      disableProviderLogout: true,
      disableSignUp: true,
      getUserInfo: verifiedGoogleIdentity,
    });
    expect(googleConfig().mapProfileToUser).toBeUndefined();
  });

  it('links by verified email only: no trusted provider, the local email verified too, no token rewrite', () => {
    for (const options of [OPTIONS, WITH_GOOGLE]) {
      expect(options.account).toEqual({
        storeStateStrategy: 'database',
        updateAccountOnSignIn: false,
        accountLinking: { enabled: true, requireLocalEmailVerified: true, trustedProviders: [] },
      });
      expect(options.databaseHooks.account.create.before).toBe(withoutProviderTokens);
    }
  });

  it('sends every OAuth refusal to /sign-in?google=refused', () => {
    expect(WITH_GOOGLE.onAPIError).toEqual({ errorURL: '/sign-in?google=refused' });
  });

  it('keeps /sign-in/social disabled over HTTP even with Google on', () => {
    expect(WITH_GOOGLE.disabledPaths).toContain('/sign-in/social');
  });
});

describe('discoveryUrlOf', () => {
  it('appends the well-known path once, whatever trailing slashes the issuer has', () => {
    for (const issuer of ['https://accounts.google.com', 'https://accounts.google.com/', 'https://accounts.google.com//']) {
      expect(discoveryUrlOf(issuer)).toBe('https://accounts.google.com/.well-known/openid-configuration');
    }
  });
});

describe('verifiedGoogleIdentity — the one refusal point', () => {
  const CLAIMS = { sub: 'sub-1', email: 'Hoang@Example.test', email_verified: true, name: 'Hoang' };

  it('answers the identity of a token whose email_verified is exactly true', async () => {
    expect(await verifiedGoogleIdentity({ idToken: jwtOf(CLAIMS) })).toEqual({
      id: 'sub-1',
      sub: 'sub-1',
      email: 'Hoang@Example.test',
      emailVerified: true,
      name: 'Hoang',
    });
  });

  it('refuses no id token, and an unverified, missing or non-boolean email_verified', async () => {
    expect(await verifiedGoogleIdentity({})).toBeNull();
    expect(await verifiedGoogleIdentity({ idToken: '' })).toBeNull();
    expect(await verifiedGoogleIdentity({ idToken: 'not-a-jwt' })).toBeNull();
    for (const emailVerified of [false, 'false', 'true', 1, null, undefined]) {
      expect(await verifiedGoogleIdentity({ idToken: jwtOf({ ...CLAIMS, email_verified: emailVerified }) }), String(emailVerified)).toBeNull();
    }
  });

  it('refuses a token with no subject or no email', async () => {
    expect(await verifiedGoogleIdentity({ idToken: jwtOf({ ...CLAIMS, sub: '' }) })).toBeNull();
    expect(await verifiedGoogleIdentity({ idToken: jwtOf({ ...CLAIMS, email: undefined }) })).toBeNull();
  });
});

describe('withoutProviderTokens — the account create hook', () => {
  it('nulls the tokens, their expiries and scope of a google row and leaves every other row alone', async () => {
    const row = {
      providerId: 'google',
      accountId: 'sub-1',
      userId: 'u',
      accessToken: 'a',
      refreshToken: 'r',
      idToken: 'i',
      accessTokenExpiresAt: new Date('2026-09-22T00:00:00Z'),
      refreshTokenExpiresAt: new Date('2026-09-23T00:00:00Z'),
      scope: 'openid,email,profile',
    };
    expect(await withoutProviderTokens(row)).toEqual({
      data: {
        ...row,
        accessToken: null,
        refreshToken: null,
        idToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scope: null,
      },
    });
    expect(await withoutProviderTokens({ providerId: 'credential' })).toBeUndefined();
  });
});

describe('password reset options (story 1.4 slice 4)', () => {
  it('pins the timing explicitly rather than inheriting Better Auth\'s defaults', () => {
    expect(OPTIONS.emailAndPassword.resetPasswordTokenExpiresIn).toBe(3600);
    expect(OPTIONS.emailAndPassword.revokeSessionsOnPasswordReset).toBe(true);
  });
});

describe('resetLinkOf — the product\'s own link', () => {
  it('builds /reset-password?token=… under the given base URL, never Better Auth\'s own url', () => {
    expect(resetLinkOf('http://localhost:3101', 'tok-abc')).toBe(
      'http://localhost:3101/reset-password?token=tok-abc',
    );
  });

  it('strips trailing slashes from the base URL, so the path is never doubled', () => {
    for (const baseURL of ['http://localhost:3101', 'http://localhost:3101/', 'http://localhost:3101//']) {
      expect(resetLinkOf(baseURL, 'tok-abc')).toBe('http://localhost:3101/reset-password?token=tok-abc');
    }
  });

  it('encodes a token that needs it', () => {
    expect(resetLinkOf('http://localhost:3101', 'a b/c')).toBe(
      'http://localhost:3101/reset-password?token=a%20b%2Fc',
    );
  });
});

describe('resetPasswordMail — the one mail copy builder (hardcoded English)', () => {
  it('carries the address, a fixed subject, and the link in the body', () => {
    const mail = resetPasswordMail({ to: 'hoang@momo-digital.example', link: 'http://localhost:3101/reset-password?token=x' });
    expect(mail.to).toBe('hoang@momo-digital.example');
    expect(mail.subject).toBe('Reset your momo-keikaku password');
    expect(mail.text).toContain('http://localhost:3101/reset-password?token=x');
    expect(mail.text).toContain('expires in 1 hour');
  });

  it('is pure: the same input always answers the same mail', () => {
    const input = { to: 'a@example.test', link: 'http://localhost:3101/reset-password?token=y' };
    expect(resetPasswordMail(input)).toEqual(resetPasswordMail(input));
  });
});

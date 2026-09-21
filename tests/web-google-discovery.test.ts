import { afterAll, describe, expect, it, vi } from 'vitest';
import { systemClock } from '../packages/adapters/src';
import { closeAllPools } from '../packages/db/src/client';
import { startFakeOidc } from './support/fake-oidc';

/**
 * The web composition root's Google wiring, with the REAL `createAuth` and the fake OIDC provider
 * (story 1.4 slice 3) — no database: nothing here carries a session cookie, so Better Auth never
 * queries, and the pool `getDb` builds is never connected.
 *
 *   * `AUTH_GOOGLE=on` without a client secret fails naming `GOOGLE_CLIENT_SECRET` when the auth
 *     instance is first built — not at import, and not with a default.
 *   * The middleware's session refresh NEVER fetches the issuer's discovery document: its instance
 *     is built without Google. With discovery failing (a 500 from the fake, which still counts the
 *     request), the middleware path makes no request at all, while the sign-in page's
 *     `googleEnabled()` asks once, fails fast, and hides the button.
 */

const fake = await startFakeOidc({
  clock: systemClock,
  clientId: 'web-google-client',
  clientSecret: 'web-google-secret',
  redirectUri: 'http://localhost:3101/api/auth/callback/google',
  discovery: 'error',
});

/** `next/headers` resolved from `apps/web`, as `tests/web-composition.test.ts` explains. */
const nextHeadersPath = await vi.hoisted(async () => {
  const { createRequire } = await import('node:module');
  return createRequire(new URL('../apps/web/package.json', import.meta.url)).resolve('next/headers');
});
vi.mock(nextHeadersPath, () => ({ headers: async () => new Headers() }));

vi.stubEnv('APP_DATABASE_URL', 'postgres://momo_app:momo_app@127.0.0.1:1/never_connected');
vi.stubEnv('BETTER_AUTH_SECRET', 'web-google-test-secret-0123456789abcdef');
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3101');
vi.stubEnv('AUTH_GOOGLE', 'on');
vi.stubEnv('GOOGLE_CLIENT_ID', 'web-google-client');
vi.stubEnv('GOOGLE_CLIENT_SECRET', undefined);
vi.stubEnv('GOOGLE_ISSUER_URL', fake.issuer);

const composition = await import('../apps/web/src/server/composition');

afterAll(async () => {
  vi.unstubAllEnvs();
  await fake.close();
  await closeAllPools();
});

describe('the composition root with Google on (story 1.4 slice 3)', () => {
  it('fails naming GOOGLE_CLIENT_SECRET when the auth instance is first built without one', async () => {
    await expect(composition.googleEnabled()).rejects.toThrow(/GOOGLE_CLIENT_SECRET is required when AUTH_GOOGLE=on/);
    expect(fake.hits().discovery).toBe(0);
  });

  it('refreshes the middleware\'s session without ever fetching discovery', async () => {
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'web-google-secret');
    expect(await composition.refreshSession(new Headers())).toEqual({ signedIn: false, setCookies: [] });
    expect(fake.hits().discovery, 'the middleware path asked the provider').toBe(0);
  });

  it('hides the button when discovery fails fast, having asked once — and the middleware still never asks', async () => {
    expect(await composition.googleEnabled()).toBe(false);
    expect(fake.hits().discovery).toBe(1);
    expect(await composition.googleSignIn()).toBeNull();
    await composition.refreshSession(new Headers());
    expect(fake.hits().discovery).toBe(1);
  });
});

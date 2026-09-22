import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { isPublicPath, sessionGate, type GateSession } from './session-gate';

/**
 * The middleware's logic (story 1.4 slice 1), with a fake session check: a `Request` in, the
 * response out. No composition root, no Better Auth, no database — `tests/identity.test.ts` pins
 * the real session check (`sessionForMiddleware`) against Postgres.
 */

const SLID = 'momo.session_token=signed.value; Max-Age=28800; Path=/; HttpOnly; SameSite=Lax';

function gateAnswering(session: GateSession) {
  const seen: Headers[] = [];
  const gate = sessionGate(async (headers) => {
    seen.push(headers);
    return session;
  });
  return { gate, seen };
}

const request = (path: string, init?: { headers?: Record<string, string> }) =>
  new NextRequest(new URL(path, 'http://localhost:3101'), init);

describe('the session gate', () => {
  it('lets a live session through and forwards the Set-Cookie that slid it', async () => {
    const { gate, seen } = gateAnswering({ signedIn: true, setCookies: [SLID] });
    const response = await gate(request('/p/prj-ec2/plan', { headers: { cookie: 'momo.session_token=x' } }));

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.getSetCookie()).toEqual([SLID]);
    expect(seen[0]?.get('cookie')).toBe('momo.session_token=x');
  });

  it('redirects to /sign-in when there is no session — /c/ included — and still forwards the cookie deletion', async () => {
    const cleared = 'momo.session_token=; Max-Age=0; Path=/';
    for (const path of ['/', '/p/prj-ec2/plan', '/c/prj-ec2']) {
      const { gate } = gateAnswering({ signedIn: false, setCookies: [cleared] });
      const response = await gate(request(path));
      expect(response.status, path).toBe(307);
      expect(new URL(response.headers.get('location')!).pathname, path).toBe('/sign-in');
      expect(response.headers.getSetCookie(), path).toEqual([cleared]);
    }
  });

  it('never asks about a session on the public paths, so /sign-in cannot redirect to itself', async () => {
    for (const path of [
      '/sign-in',
      '/no-access',
      '/forgot-password',
      '/reset-password',
      '/api/auth/get-session',
      '/api/auth/sign-in/email',
    ]) {
      const { gate, seen } = gateAnswering({ signedIn: false, setCookies: [] });
      const response = await gate(request(path));
      expect(response.headers.get('location'), path).toBeNull();
      expect(seen, path).toEqual([]);
    }
  });

  it('treats only the exact public paths as public', () => {
    expect(isPublicPath('/sign-in')).toBe(true);
    expect(isPublicPath('/sign-in/x')).toBe(false);
    expect(isPublicPath('/sign-inx')).toBe(false);
    expect(isPublicPath('/api/authx')).toBe(false);
    expect(isPublicPath('/p/sign-in')).toBe(false);
    // Story 1.4 slice 4: /forgot-password and /reset-password join the exact-match set.
    expect(isPublicPath('/forgot-password')).toBe(true);
    expect(isPublicPath('/reset-password')).toBe(true);
    expect(isPublicPath('/forgot-password/x')).toBe(false);
    expect(isPublicPath('/forgot-passwordx')).toBe(false);
    expect(isPublicPath('/reset-password/x')).toBe(false);
    expect(isPublicPath('/reset-passwordx')).toBe(false);
  });
});

/**
 * The middleware file itself: its matcher must agree with `isPublicPath` — a path the matcher lets
 * past the gate must be public, and a protected path must reach it. The composition root is
 * mocked, so importing the middleware reads no configuration.
 */
vi.mock('@/server/composition', () => ({
  refreshSession: vi.fn(async () => ({ signedIn: false, setCookies: [] })),
}));

describe('the middleware wiring', () => {
  it('runs on the Node runtime and wires the session gate', async () => {
    const { config, middleware } = await import('../middleware');
    expect(config.runtime).toBe('nodejs');
    const response = await middleware(request('/p/x/review'));
    expect(new URL(response.headers.get('location')!).pathname).toBe('/sign-in');
  });

  it('matches exactly the paths isPublicPath calls protected', async () => {
    const { config } = await import('../middleware');
    // Next anchors a matcher to the whole pathname.
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    const table: readonly (readonly [string, boolean])[] = [
      ['/', false],
      ['/p/x/review', false],
      ['/c/x', false],
      ['/sign-inx', false],
      ['/sign-in/x', false],
      ['/no-access/x', false],
      ['/forgot-password/x', false],
      ['/forgot-passwordx', false],
      ['/reset-password/x', false],
      ['/reset-passwordx', false],
      ['/api/authx', false],
      ['/sign-in', true],
      ['/no-access', true],
      ['/forgot-password', true],
      ['/reset-password', true],
      ['/api/auth', true],
      ['/api/auth/get-session', true],
    ];
    for (const [path, isPublic] of table) {
      expect(isPublicPath(path), path).toBe(isPublic);
      expect(matcher.test(path), `matcher on ${path}`).toBe(!isPublic);
    }
  });
});

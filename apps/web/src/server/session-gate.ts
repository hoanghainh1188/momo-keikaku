import { NextResponse, type NextRequest } from 'next/server';

/**
 * THE MIDDLEWARE'S LOGIC (story 1.4 slice 1), apart from the middleware file so a test can drive
 * it with a `Request` and a fake session check — no composition root, no Better Auth, no database.
 *
 * Every route but `/sign-in`, `/no-access`, `/forgot-password`, `/reset-password` and
 * `/api/auth/*` requires a session — `/c/` included,
 * because the Client View is a PM/Admin preview until OQ-8. For those routes it:
 *
 *   * asks the session check, which also SLIDES the session (Better Auth pushes its expiry forward
 *     when it is older than `updateAge`) and returns the `Set-Cookie` that carries the new
 *     expiry — forwarded here on the response, which is what makes the timeout IDLE-based: with
 *     `nextCookies()`, Better Auth does not refresh on a pure RSC render, which cannot set cookies;
 *   * redirects to `/sign-in` when there is no live session.
 *
 * It is a fast path, not the authority. A session that passes here can still resolve to "not
 * signed in" — its active Tenant may not match a membership — and `requestContext()` in the
 * composition root decides that on every render.
 */

export interface GateSession {
  readonly signedIn: boolean;
  readonly setCookies: readonly string[];
}

export type SessionCheck = (headers: Headers) => Promise<GateSession>;

/**
 * The paths reachable without a session. `/sign-in` never redirects on its own. `/forgot-password`
 * and `/reset-password` (story 1.4 slice 4) join it for the same reason: a signed-out visitor is
 * exactly who needs a password reset, and a signed-in one reaching either page harmlessly resets
 * their own password.
 */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/sign-in' ||
    pathname === '/no-access' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/api/auth' ||
    pathname.startsWith('/api/auth/')
  );
}

export function sessionGate(check: SessionCheck): (request: NextRequest) => Promise<NextResponse> {
  return async (request) => {
    if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next();

    const session = await check(request.headers);
    const response = session.signedIn
      ? NextResponse.next()
      : NextResponse.redirect(new URL('/sign-in', request.url));
    for (const cookie of session.setCookies) response.headers.append('set-cookie', cookie);
    return response;
  };
}

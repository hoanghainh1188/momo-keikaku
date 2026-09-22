import { refreshSession } from '@/server/composition';
import { sessionGate } from '@/server/session-gate';

/**
 * Story 1.4 slice 1: every page and action request passes through the session gate
 * (`server/session-gate.ts`), which slides the session and forwards its cookie, or redirects to
 * `/sign-in`. On the NODE runtime — Better Auth's Drizzle adapter needs `pg`, which the edge
 * runtime cannot load (Next 15.5 made Node middleware stable; the file is still `middleware.ts`
 * until the Next 16 upgrade). This bundle builds its own lazily-built auth instance and pool.
 */
export const middleware = sessionGate(refreshSession);

export const config = {
  runtime: 'nodejs',
  // Static assets and EXACTLY the public paths (`/sign-in`, `/no-access`, `/forgot-password`,
  // `/reset-password` and `/api/auth` and `/api/auth/*`) never reach the gate — anchored, so
  // `/sign-inx` or `/sign-in/x` still do, as `isPublicPath` says. `session-gate.test.ts` runs
  // this regex against `isPublicPath`.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sign-in$|no-access$|forgot-password$|reset-password$|api/auth(?:/|$)).*)',
  ],
};

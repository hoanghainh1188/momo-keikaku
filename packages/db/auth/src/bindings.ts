/**
 * WHAT THE WEB EDGE DOES WITH THE AUTH INSTANCE (story 1.4 slice 1): serve the three endpoints
 * this slice uses, refresh a session for the middleware, sign in, sign out. The composition root
 * binds each to its one instance and to the request's headers; nothing in `apps/web` but the
 * composition root imports this package (`pnpm depcruise`).
 */
import { isAPIError } from 'better-auth/api';
import { AUTH_BASE_PATH, type Auth } from './auth';

/**
 * The endpoints served over HTTP, by method. Everything else under `/api/auth` answers 404 —
 * parametrised routes included (`/reset-password/:token`, `/callback/:id`), which Better Auth's
 * own `disabledPaths` cannot reach because it matches exact paths only.
 */
export const SERVED_AUTH_ENDPOINTS: readonly { readonly method: string; readonly path: string }[] = [
  { method: 'GET', path: '/get-session' },
  { method: 'POST', path: '/sign-out' },
  { method: 'POST', path: '/sign-in/email' },
];

function notFound(): Response {
  return new Response('Not Found', { status: 404, headers: { 'cache-control': 'no-store' } });
}

/** The endpoint path under the base path, or `null` when the request is not under it at all. */
function endpointOf(url: string): string | null {
  const { pathname } = new URL(url);
  if (pathname !== AUTH_BASE_PATH && !pathname.startsWith(`${AUTH_BASE_PATH}/`)) return null;
  const rest = pathname.slice(AUTH_BASE_PATH.length);
  // Trailing slashes are stripped, so `/get-session/` is treated as `/get-session`; any other
  // spelling (a doubled slash inside the path) matches no allowlisted endpoint and answers 404.
  return rest.replace(/\/+$/, '') || '/';
}

/** The route handler: Better Auth for the allowlist, 404 for anything else. */
export function serveAllowlisted(auth: Auth): (request: Request) => Promise<Response> {
  return async (request) => {
    const endpoint = endpointOf(request.url);
    const served = SERVED_AUTH_ENDPOINTS.some(
      (allowed) => allowed.method === request.method && allowed.path === endpoint,
    );
    if (!served) return notFound();
    return auth.handler(request);
  };
}

/** What the middleware needs: whether a live session came in, and the cookies to send back. */
export interface MiddlewareSession {
  readonly signedIn: boolean;
  /** Every `Set-Cookie` Better Auth wrote (the slid session cookie, or its deletion). */
  readonly setCookies: readonly string[];
}

/**
 * Reads the session AND SLIDES IT (story 1.4's idle timeout): `getSession` with `returnHeaders`,
 * refresh allowed. With `nextCookies()`, Better Auth skips the refresh on a pure RSC request, so
 * this call — from the Node-runtime middleware, on every page and action request — is what makes
 * the timeout idle-based. The authoritative check is still `resolveRequestContext`.
 */
export async function sessionForMiddleware(auth: Auth, headers: Headers): Promise<MiddlewareSession> {
  const { headers: returned, response } = await auth.api.getSession({ headers, returnHeaders: true });
  return {
    signedIn: response !== null,
    setCookies: returned.getSetCookie(),
  };
}

/**
 * Email + password sign-in, always `rememberMe: true` (with `false` Better Auth never slides the
 * session). The session cookie reaches the browser through `nextCookies()`. Answers only
 * whether it worked: the caller shows ONE generic message for every refusal, so an unknown email
 * and a wrong password cannot be told apart.
 */
export async function signInWithPassword(
  auth: Auth,
  headers: Headers,
  credentials: { readonly email: string; readonly password: string },
): Promise<boolean> {
  try {
    await auth.api.signInEmail({
      body: { email: credentials.email, password: credentials.password, rememberMe: true },
      headers,
    });
    return true;
  } catch (error) {
    if (!isAPIError(error)) throw error;
    // The caller still sees only `false`. But anything other than the invalid-credentials refusal
    // (a wrong origin or URL, a disabled path) is a misconfiguration, not a wrong password — leave a
    // trace of it. Status and code only: never the email or the password.
    const code = (error as { body?: { code?: unknown } }).body?.code;
    if (code !== 'INVALID_EMAIL_OR_PASSWORD') {
      console.warn(`[auth] sign-in refused by Better Auth: status ${String(error.status)}, code ${String(code)}`);
    }
    return false;
  }
}

/** Ends the request's session and clears its cookie (through `nextCookies()`). */
export async function signOutOf(auth: Auth, headers: Headers): Promise<void> {
  try {
    await auth.api.signOut({ headers });
  } catch (error) {
    // Signing out a request that has no session is not a failure: it is already signed out.
    if (isAPIError(error)) return;
    throw error;
  }
}

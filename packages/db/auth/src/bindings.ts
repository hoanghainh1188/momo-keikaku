/**
 * WHAT THE WEB EDGE DOES WITH THE AUTH INSTANCE (story 1.4 slices 1 and 3): serve the endpoints
 * in use, refresh a session for the middleware, sign in with a password or start a Google sign-in,
 * sign out. The composition root binds each to its instance and to the request's headers; nothing
 * in `apps/web` but the composition root imports this package (`pnpm depcruise`).
 */
import { isAPIError } from 'better-auth/api';
import { AUTH_BASE_PATH, type Auth } from './auth';
import { GOOGLE_PROVIDER_ID } from './google';

/** One endpoint served over HTTP. */
export interface ServedEndpoint {
  readonly method: string;
  readonly path: string;
}

/**
 * The endpoints served over HTTP whatever is configured, by method. Everything else under
 * `/api/auth` answers 404 — parametrised routes included (`/reset-password/:token`,
 * `/callback/:id`), which Better Auth's own `disabledPaths` cannot reach because it matches exact
 * paths only. `servedEndpoints` adds the one conditional entry.
 */
export const SERVED_AUTH_ENDPOINTS: readonly ServedEndpoint[] = [
  { method: 'GET', path: '/get-session' },
  { method: 'POST', path: '/sign-out' },
  { method: 'POST', path: '/sign-in/email' },
];

/** Google's callback: served only while the provider is REGISTERED on the instance. */
export const GOOGLE_CALLBACK_ENDPOINT: ServedEndpoint = {
  method: 'GET',
  path: `/callback/${GOOGLE_PROVIDER_ID}`,
};

/**
 * Whether the instance registered Google: configured AND its discovery succeeded. Awaiting the
 * context is what fetches discovery on a fresh instance (once; a fast failure skips the provider
 * for the life of the instance, and Better Auth logs it).
 */
export async function googleRegistered(auth: Auth): Promise<boolean> {
  const context = await auth.$context;
  return context.socialProviders.some((provider) => provider.id === GOOGLE_PROVIDER_ID);
}

/**
 * The HTTP allowlist of this instance: `SERVED_AUTH_ENDPOINTS`, plus `GET /callback/google` when
 * Google is registered — and nothing else, ever. `/sign-in/social` in particular is never served:
 * a Google sign-in starts from a server action (`googleSignIn`).
 */
export async function servedEndpoints(auth: Auth): Promise<readonly ServedEndpoint[]> {
  return (await googleRegistered(auth))
    ? [...SERVED_AUTH_ENDPOINTS, GOOGLE_CALLBACK_ENDPOINT]
    : SERVED_AUTH_ENDPOINTS;
}

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

/** The route handler: Better Auth for the instance's allowlist, 404 for anything else. */
export function serveAllowlisted(auth: Auth): (request: Request) => Promise<Response> {
  return async (request) => {
    const endpoint = endpointOf(request.url);
    const served = (await servedEndpoints(auth)).some(
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

/** Where a Google sign-in goes next, and the cookies Better Auth set to bind its state. */
export interface GoogleSignInStart {
  /** The provider's authorization URL (Google's, or the fake's). */
  readonly url: string;
  /**
   * The `Set-Cookie`s of the call — the signed `momo.state` cookie. A server action ignores them:
   * `nextCookies()` has already set them on the response. Tests forward them to the callback.
   */
  readonly setCookies: readonly string[];
}

/**
 * Starts a Google sign-in, server-side (`auth.api.signInSocial`; `/sign-in/social` itself is
 * never served over HTTP). It creates the OAuth state — a `verification` row plus the signed
 * `momo.state` cookie — and answers the provider's authorization URL, or `null` when Google is
 * not registered or Better Auth refuses (logged, status and code only). After the callback the
 * browser lands on `/`; every refusal lands on `/sign-in?google=refused`.
 */
export async function googleSignIn(auth: Auth, headers: Headers): Promise<GoogleSignInStart | null> {
  if (!(await googleRegistered(auth))) return null;
  try {
    const { headers: returned, response } = await auth.api.signInSocial({
      body: { provider: GOOGLE_PROVIDER_ID, callbackURL: '/', disableRedirect: true },
      headers,
      returnHeaders: true,
    });
    if (typeof response.url !== 'string' || response.url === '') return null;
    return { url: response.url, setCookies: returned.getSetCookie() };
  } catch (error) {
    if (!isAPIError(error)) throw error;
    const code = (error as { body?: { code?: unknown } }).body?.code;
    console.warn(`[auth] Google sign-in refused by Better Auth: status ${String(error.status)}, code ${String(code)}`);
    return null;
  }
}

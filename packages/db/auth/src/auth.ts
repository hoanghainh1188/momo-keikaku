/**
 * THE AUTH INSTANCE, BUILT FROM ARGUMENTS (story 1.4 slices 1 and 3).
 *
 * `createAuth` is a factory, and everything reaches it as an argument — the database handle, the
 * secret, the base URL, the idle hours, the id generator and, when Google sign-in is on, the
 * Google provider — because this package may import neither `@momo/app` (its config) nor
 * `@momo/adapters` (the Clock and the id port), and may not read the environment. `apps/web`'s
 * composition root builds its instances lazily, on first use (importing the composition root
 * reads no configuration): one with Google for pages, actions and the route handler, and one
 * WITHOUT Google for the middleware's session refresh, so the middleware never waits on discovery.
 *
 * WHAT IS DECIDED HERE, and pinned by `auth.test.ts`, `tests/identity.test.ts` and
 * `tests/google-sign-in.test.ts`:
 *
 *   * email + password, and SIGN-UP DISABLED: users are seeded (and, later, created by an audited
 *     use case). No password reset and no mail yet.
 *   * Google, when `google` is given (`google.ts`): one OIDC provider through `genericOAuth`,
 *     discovered from its issuer, every sign-in on a verified id token whose `email_verified` is
 *     exactly `true`, and LINK BY VERIFIED EMAIL TO AN EXISTING USER ONLY (founder decision
 *     2026-09-21): the provider's `disableSignUp`, `google` NOT a trusted provider, and
 *     `requireLocalEmailVerified` — the local user's email must be verified too. An already-linked
 *     Google `sub` signs in as its user whatever email it now carries.
 *   * Provider tokens are not kept: a Google `account` row's access, refresh and id tokens are
 *     null (`withoutProviderTokens`), and `updateAccountOnSignIn: false` keeps a later sign-in from
 *     writing them back.
 *   * EVERY OAuth refusal — a forged, missing or expired `state` included — redirects to
 *     `/sign-in?google=refused` (`onAPIError.errorURL`; Better Auth reads it on OAuth paths only).
 *     Without it a bad state would land on Better Auth's own `/api/auth/error` page.
 *   * `session.expiresIn` = the idle timeout, `updateAge` = 5 minutes: a session seen at least
 *     every `expiresIn` slides (the middleware refreshes it on page and action requests); one
 *     that is not expires. `rememberMe: false` would disable the refresh, so sign-in always
 *     passes `true`.
 *   * `session.cookieCache` DISABLED. A cached session cookie would let a revoked or re-tenanted
 *     session act until the cache expired; every request must reach the session table.
 *   * two product fields, neither client-writable (`input: false`): the session's
 *     `activeTenantId` (written only by `setActiveTenant`, through the internal adapter, because
 *     `auth.api.updateSession` refuses `input: false` fields even on the server) and the user's
 *     `locale`.
 *   * ids from the caller's generator (UUIDv7 from the id port), not Better Auth's random ones.
 *   * `nextCookies()` LAST, so the session cookie set by a server action reaches the browser.
 *
 * Better Auth stamps `expires_at`/`created_at` from its own `Date` — the named AD-15 exception
 * (ARCHITECTURE-SPINE.md): session expiry is Better Auth's authority, and nothing in this product
 * compares a session time against the `Clock`. The OAuth state's ten-minute expiry is its too.
 */
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { authSchema, type Db } from '@momo/db';
import {
  GOOGLE_REFUSED_URL,
  googlePlugin,
  withoutProviderTokens,
  type GoogleProviderOptions,
} from './google';

/** Where the route handler is mounted (`apps/web/src/app/api/auth/[...all]/route.ts`). */
export const AUTH_BASE_PATH = '/api/auth';

/** How often a live session's expiry is pushed forward, in seconds. */
export const SESSION_UPDATE_AGE_SECONDS = 5 * 60;

/**
 * Endpoints never served over HTTP, switched off in Better Auth's HTTP router. NOT the
 * boundary: `disabledPaths` matches exact paths in the router only (a parametrised route such as
 * `/reset-password/:token` is not an exact path). The boundary is `serveAllowlisted`, which
 * answers 404 to everything but the served endpoints. `/sign-in/social` stays here with Google on:
 * `disabledPaths` gates the router only, and the server action starts a Google sign-in through
 * `auth.api.signInSocial` (`googleSignIn`), which it does not reach.
 */
const DISABLED_PATHS = [
  '/sign-up/email',
  '/update-session',
  '/update-user',
  '/change-password',
  '/set-password',
  '/change-email',
  '/delete-user',
  '/request-password-reset',
  '/reset-password',
  '/verify-email',
  '/send-verification-email',
  '/verify-password',
  '/list-sessions',
  '/revoke-session',
  '/revoke-sessions',
  '/revoke-other-sessions',
  '/sign-in/social',
  '/link-social',
  '/unlink-account',
  '/list-accounts',
  '/refresh-token',
  '/get-access-token',
  '/account-info',
];

export interface CreateAuthOptions {
  /** The restricted application role's handle: it holds DML on the four Better Auth tables. */
  readonly db: Db;
  /** `BETTER_AUTH_SECRET`. */
  readonly secret: string;
  /** `BETTER_AUTH_URL`, the web app's origin. */
  readonly baseURL: string;
  /** `SESSION_IDLE_TIMEOUT_HOURS`. */
  readonly idleHours: number;
  /** New identity ids — UUIDv7 from the id port (`uuidV7IdsOn(systemClock)`). */
  readonly generateId: () => string;
  /**
   * Google sign-in (story 1.4 slice 3): `@momo/app`'s `googleProvider()`, or absent/`null` when
   * it is off. Absent, the instance registers no OAuth provider at all.
   */
  readonly google?: GoogleProviderOptions | null;
}

/** The options, as a value — so a test can pin them without building an instance. */
export function authOptions(options: CreateAuthOptions) {
  if (!Number.isInteger(options.idleHours) || options.idleHours < 1) {
    throw new Error(`createAuth was given idleHours ${String(options.idleHours)}; it must be a whole number of hours, at least 1.`);
  }
  return {
    appName: 'momo-keikaku',
    secret: options.secret,
    baseURL: options.baseURL,
    basePath: AUTH_BASE_PATH,
    trustedOrigins: [options.baseURL],
    database: drizzleAdapter(options.db, { provider: 'pg', schema: authSchema }),
    emailAndPassword: { enabled: true, disableSignUp: true },
    user: {
      modelName: 'auth_user',
      additionalFields: {
        locale: { type: 'string', required: false, defaultValue: 'en', input: false },
      },
    },
    session: {
      expiresIn: options.idleHours * 60 * 60,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      cookieCache: { enabled: false },
      additionalFields: {
        activeTenantId: { type: 'string', required: false, input: false },
      },
    },
    account: {
      // The OAuth state lives in the `verification` table, bound to a signed `momo.state` cookie.
      storeStateStrategy: 'database',
      // A return sign-in writes no provider token back (see `withoutProviderTokens`).
      updateAccountOnSignIn: false,
      accountLinking: {
        enabled: true,
        // Pinned rather than defaulted: a link needs the LOCAL email verified as well, and no
        // provider is trusted to skip the provider-side `email_verified` check.
        requireLocalEmailVerified: true,
        trustedProviders: [],
      },
    },
    databaseHooks: {
      account: { create: { before: withoutProviderTokens } },
    },
    // Read by Better Auth on OAuth paths only: the one place every Google refusal lands.
    onAPIError: { errorURL: GOOGLE_REFUSED_URL },
    advanced: {
      cookiePrefix: 'momo',
      database: { generateId: () => options.generateId() },
    },
    disabledPaths: DISABLED_PATHS,
    telemetry: { enabled: false },
    // `nextCookies()` last, always: a plugin after it with `hooks.after` could set cookies it
    // never forwards.
    plugins: [...(options.google ? [googlePlugin(options.google)] : []), nextCookies()],
  } satisfies BetterAuthOptions;
}

/** A Better Auth instance, built from arguments. See the module note. */
export function createAuth(options: CreateAuthOptions) {
  return betterAuth(authOptions(options));
}

export type Auth = ReturnType<typeof createAuth>;

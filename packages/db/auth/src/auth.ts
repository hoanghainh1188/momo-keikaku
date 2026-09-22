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
 *     use case). Password reset (story 1.4 slice 4) is mail-backed: `sendResetPassword` and
 *     `onPasswordReset` below, `resetPasswordTokenExpiresIn` and `revokeSessionsOnPasswordReset`
 *     pinned rather than inherited. The mailer, the identity-event writer and `now` all arrive as
 *     arguments, exactly as `google` does — this package reads no environment and no wall clock.
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
import { and, eq, like } from 'drizzle-orm';
import { account, authSchema, authUser, verification, type Db } from '@momo/db';
import {
  GOOGLE_REFUSED_URL,
  googlePlugin,
  withoutProviderTokens,
  type GoogleProviderOptions,
} from './google';
import {
  RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS,
  resetLinkOf,
  resetPasswordMail,
  type IdentityEventWriter,
  type ResetMailer,
} from './reset';

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
  /** Password reset's mail transport (story 1.4 slice 4): `@momo/app`'s `MailerPort`. Always given — unlike Google, email + password (and its reset) is never optional. */
  readonly mailer: ResetMailer;
  /**
   * Wall time (AD-15), for the identity event's `at` — the one Better Auth exception (its own
   * `Date`) covers its four tables, not this one. `@momo/adapters`'s `systemClock.now`.
   */
  readonly now: () => Date;
  /** Where a completed reset is recorded (story 1.4 slice 4). `@momo/db`'s `identityEventWriterOn(db)`. */
  readonly identityEvents: IdentityEventWriter;
}

/** Whether `userId` already holds a credential (password) account — no DB read outside a `tx`. */
async function hasCredentialAccount(db: Db, userId: string): Promise<boolean> {
  const rows = await db.transaction((tx) =>
    tx
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
      .limit(1),
  );
  return rows.length > 0;
}

/** Sets `email_verified` — a completed reset is what proves the address (founder decision). */
async function markEmailVerified(db: Db, userId: string, at: Date): Promise<void> {
  await db.transaction((tx) =>
    tx.update(authUser).set({ emailVerified: true, updatedAt: at }).where(eq(authUser.id, userId)),
  );
}

/**
 * Deletes every OTHER outstanding `reset-password:*` token of this user. `consumeVerificationValue`
 * deletes only the ONE row matching the identifier just consumed (`identifier = reset-password:
 * <token>`, unique per token), so a second link requested earlier and never followed would
 * otherwise still work after this one is used.
 */
async function invalidateOtherResetTokens(db: Db, userId: string): Promise<void> {
  await db.transaction((tx) =>
    tx
      .delete(verification)
      .where(and(eq(verification.value, userId), like(verification.identifier, 'reset-password:%'))),
  );
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
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      // Story 1.4 slice 4, both stated rather than inherited — but they are NOT the same kind of
      // line, and deleting either is not the same kind of mistake:
      //
      //   * `resetPasswordTokenExpiresIn` restates Better Auth's own default (3600 s), so removing
      //     it changes no behaviour. It is here to make the hour a decision, and `auth.test.ts`'s
      //     options pin is the only thing that can catch its removal.
      //   * `revokeSessionsOnPasswordReset` OVERRIDES Better Auth's default, which is `false`
      //     (`@better-auth/core`'s `init-options`; the flag is read at `password.mjs:171`).
      //     Removing it silently leaves every existing session alive through a reset — including
      //     the session of whoever the reset was meant to lock out. The integration test in
      //     `tests/password-reset.test.ts` fails if it goes.
      resetPasswordTokenExpiresIn: RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS,
      revokeSessionsOnPasswordReset: true,
      // THE REQUEST SIDE. Called only when Better Auth already found a user by email (an unknown
      // email never reaches here, and the endpoint still answers its one generic sentence either
      // way). A Google-only user — one with no credential account — gets no mail: this flow
      // creates no user and no account row for a user who has none, and the only account
      // `resetPassword` (the consume endpoint) would create is reachable solely through a token
      // this branch never mails out. A mailer failure is logged WITHOUT the address and never
      // surfaced — the request still answers exactly as on success (NFR-S5). Only the error's
      // `name` is logged, never `message`: a real transport's rejection carries the address in its
      // message (SES "Invalid destination: …", SMTP 550), which is exactly what must not be logged.
      sendResetPassword: async ({ user, token }) => {
        if (!(await hasCredentialAccount(options.db, user.id))) return;
        const link = resetLinkOf(options.baseURL, token);
        try {
          await options.mailer.send(resetPasswordMail({ to: user.email, link }));
        } catch (error) {
          console.warn(
            `[auth] password-reset mail failed to send: ${error instanceof Error ? error.name : 'unknown error'}`,
          );
        }
      },
      // THE CONSUME SIDE, fired AFTER the password is replaced and BEFORE session revocation
      // (Better Auth's own ordering, `password.mjs`: it awaits this, then — only if it returns —
      // deletes the user's sessions). MUST NOT THROW: an uncaught rejection here is not an
      // `APIError`, so it escapes `bindings.ts`'s catch as an unhandled 500 AND skips session
      // revocation entirely, on a request that already replaced the password and spent the token.
      // So every step below runs inside one try/catch that only logs.
      //
      // The event is written FIRST, `email_verified` second: `identity_event` is insert-only and
      // can never be corrected, so if only one of the two survives a mid-way failure it must be
      // the one that explains what happened, not a flag with no record of why it changed.
      // `invalidateOtherResetTokens` runs last — a second outstanding link surviving one more
      // moment is far less harm than the two ahead of it not landing.
      onPasswordReset: async ({ user }) => {
        try {
          const at = options.now();
          await options.identityEvents.record({
            id: options.generateId(),
            userId: user.id,
            action: 'password.reset',
            at,
          });
          await markEmailVerified(options.db, user.id, at);
          await invalidateOtherResetTokens(options.db, user.id);
        } catch (error) {
          console.warn(
            `[auth] onPasswordReset failed after a completed reset: ${error instanceof Error ? error.name : 'unknown error'}`,
          );
        }
      },
    },
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

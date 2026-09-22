// `packages/db/auth` is the single sanctioned Better Auth <-> Drizzle binding, exposed to
// `apps/web` as an identity port. It is one of AD-1's two named carve-outs (the other is
// `apps/web/src/server/composition.ts`), which is why it is its own unit rather than a folder
// inside `packages/db/src`.
//
// It is the ONLY package that imports `better-auth`, and in `apps/web` only the composition root
// imports it (`pnpm depcruise`, rules `better-auth-only-in-db-auth` and
// `web-db-auth-only-from-composition-root`). Role, membership and revocation changes go through
// app use cases, never through here (story 1.4 slices 2–4). Google sign-in (slice 3) is one OIDC
// provider registered from an issuer URL (`google.ts`), off unless the caller passes it. Password
// reset (slice 4) is mail-backed (`reset.ts`'s pure link and copy, `auth.ts`'s callbacks); the
// mailer and the identity-event writer arrive as arguments, exactly as Google's provider does.
export { AUTH_BASE_PATH, SESSION_UPDATE_AGE_SECONDS, authOptions, createAuth } from './auth';
export type { Auth, CreateAuthOptions } from './auth';
export { identityOn, lookupUserOn, type BetterAuthIdentity, type IdentityUser, type SessionIdentity } from './identity';
export {
  SERVED_AUTH_ENDPOINTS,
  googleRegistered,
  googleSignIn,
  requestPasswordReset,
  resetPassword,
  serveAllowlisted,
  sessionForMiddleware,
  signInWithPassword,
  signOutOf,
  type GoogleSignInStart,
  type MiddlewareSession,
  type ServedEndpoint,
} from './bindings';
export type { GoogleProviderOptions } from './google';
export {
  RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS,
  resetLinkOf,
  type IdentityEventWriter,
  type ResetMailer,
} from './reset';
export { hashPassword, verifyPassword } from './password';

/**
 * GOOGLE, AS ONE OIDC PROVIDER (story 1.4 slice 3).
 *
 * Better Auth's `genericOAuth` plugin with `providerId: 'google'`, driven by an ISSUER URL: Google's
 * in production, the in-repo fake (`tests/support/fake-oidc.ts`) in local dev and CI. One code path
 * for both — the built-in Google provider hardcodes Google's token endpoint and JWKS URL, so it
 * could never talk to the fake. The plugin uses the core `/sign-in/social` and `/callback/:id`
 * routes; the first is never served over HTTP (`auth.ts`'s `disabledPaths`, and the allowlist in
 * `bindings.ts`), only called server-side by `googleSignIn`.
 *
 * WHAT IS DECIDED HERE:
 *
 *   * Discovery from `<issuer>/.well-known/openid-configuration`, fetched when the instance is
 *     first used. A fast failure (refused, an error status, no `jwks_uri`) skips the provider for
 *     the life of that instance, and Better Auth logs it: no button, `/callback/google` 404.
 *   * `requireIdTokenVerification`: EVERY sign-in, first or later, needs an id token verified by
 *     the plugin (signature against the discovered JWKS, `iss`, `aud`, `exp` when present, and the nonce bound to
 *     the flow's state) — before `getUserInfo` below is even called.
 *   * `getUserInfo` is THE refusal point. It answers `null` — which Better Auth turns into a
 *     redirect to the error URL — when the token response carries no id token, or when the token's
 *     `email_verified` is not exactly `true` (a string `"true"` included). It never calls the
 *     userinfo endpoint. `mapProfileToUser` could not refuse (a throw there is a 500).
 *   * `disableSignUp`: an unknown email is refused and no user is created. Sign-up on the OAuth
 *     callback reads only the provider's flag; `emailAndPassword.disableSignUp` does not cover it.
 *   * PKCE, scopes `openid email profile`, and no provider logout.
 */
import type { BetterAuthPlugin } from 'better-auth';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';

/** The provider id — the `account.provider_id` of a Google link and the callback's path segment. */
export const GOOGLE_PROVIDER_ID = 'google';

/** The one place a Google refusal lands (`onAPIError.errorURL` in `auth.ts`). */
export const GOOGLE_REFUSED_URL = '/sign-in?google=refused';

/** What `createAuth` needs to register Google. `@momo/app`'s `GoogleProviderConfig`, structurally. */
export interface GoogleProviderOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  /** The OIDC issuer, e.g. `https://accounts.google.com`. */
  readonly issuer: string;
}

/** The discovery document's URL: trailing slashes stripped, so the path is never doubled. */
export function discoveryUrlOf(issuer: string): string {
  return `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;
}

/** The claims of a JWT, decoded without verification — the plugin verified it already. */
function claimsOf(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
    return typeof decoded === 'object' && decoded !== null && !Array.isArray(decoded)
      ? (decoded as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The identity a Google sign-in may proceed with. A type literal: the plugin wants an index signature. */
export type VerifiedGoogleIdentity = {
  readonly id: string;
  readonly sub: string;
  readonly email: string;
  readonly emailVerified: true;
  readonly name: string;
};

/**
 * The provider's `getUserInfo`: the identity in an ALREADY VERIFIED id token, or `null` (a refusal).
 * The plugin verifies the token before calling this whenever the token response carries one; when
 * it does not, this is where the sign-in stops — and the userinfo endpoint is never asked instead.
 */
export async function verifiedGoogleIdentity(tokens: {
  readonly idToken?: string | undefined;
}): Promise<VerifiedGoogleIdentity | null> {
  if (typeof tokens.idToken !== 'string' || tokens.idToken === '') return null;
  const claims = claimsOf(tokens.idToken);
  if (claims === null) return null;
  const { sub, email, email_verified: emailVerified, name } = claims;
  if (typeof sub !== 'string' || sub === '') return null;
  if (typeof email !== 'string' || email === '') return null;
  if (emailVerified !== true) return null;
  return { id: sub, sub, email, emailVerified: true, name: typeof name === 'string' ? name : '' };
}

/** The `genericOAuth` plugin, registering Google — and only Google — from its issuer. */
export function googlePlugin(google: GoogleProviderOptions): BetterAuthPlugin {
  return genericOAuth({
    config: [
      {
        providerId: GOOGLE_PROVIDER_ID,
        name: 'Google',
        clientId: google.clientId,
        clientSecret: google.clientSecret,
        discoveryUrl: discoveryUrlOf(google.issuer),
        pkce: true,
        scopes: ['openid', 'email', 'profile'],
        requireIdTokenVerification: true,
        disableProviderLogout: true,
        disableSignUp: true,
        getUserInfo: verifiedGoogleIdentity,
      },
    ],
  });
}

/**
 * `databaseHooks.account.create.before`: a Google link keeps NO provider token. The access,
 * refresh and id tokens are stored as null — and so are their expiries and scope, so the row does
 * not describe tokens it does not hold; with `account.updateAccountOnSignIn: false` a later
 * sign-in writes none either (`auth.ts`). Every other provider's row passes untouched.
 */
export async function withoutProviderTokens(account: { readonly providerId: string }) {
  if (account.providerId !== GOOGLE_PROVIDER_ID) return undefined;
  return {
    data: {
      ...account,
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      scope: null,
    },
  };
}

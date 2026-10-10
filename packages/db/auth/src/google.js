import { genericOAuth } from 'better-auth/plugins/generic-oauth';
/** The provider id — the `account.provider_id` of a Google link and the callback's path segment. */
export const GOOGLE_PROVIDER_ID = 'google';
/** The one place a Google refusal lands (`onAPIError.errorURL` in `auth.ts`). */
export const GOOGLE_REFUSED_URL = '/sign-in?google=refused';
/** The discovery document's URL: trailing slashes stripped, so the path is never doubled. */
export function discoveryUrlOf(issuer) {
    return `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;
}
/** The claims of a JWT, decoded without verification — the plugin verified it already. */
function claimsOf(jwt) {
    const parts = jwt.split('.');
    if (parts.length !== 3)
        return null;
    try {
        const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        return typeof decoded === 'object' && decoded !== null && !Array.isArray(decoded)
            ? decoded
            : null;
    }
    catch {
        return null;
    }
}
/**
 * The provider's `getUserInfo`: the identity in an ALREADY VERIFIED id token, or `null` (a refusal).
 * The plugin verifies the token before calling this whenever the token response carries one; when
 * it does not, this is where the sign-in stops — and the userinfo endpoint is never asked instead.
 */
export async function verifiedGoogleIdentity(tokens) {
    if (typeof tokens.idToken !== 'string' || tokens.idToken === '')
        return null;
    const claims = claimsOf(tokens.idToken);
    if (claims === null)
        return null;
    const { sub, email, email_verified: emailVerified, name } = claims;
    if (typeof sub !== 'string' || sub === '')
        return null;
    if (typeof email !== 'string' || email === '')
        return null;
    if (emailVerified !== true)
        return null;
    return { id: sub, sub, email, emailVerified: true, name: typeof name === 'string' ? name : '' };
}
/** The `genericOAuth` plugin, registering Google — and only Google — from its issuer. */
export function googlePlugin(google) {
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
export async function withoutProviderTokens(account) {
    if (account.providerId !== GOOGLE_PROVIDER_ID)
        return undefined;
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

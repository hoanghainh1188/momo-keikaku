/**
 * THE IDENTITY PORT (story 1.4 slice 1, AD-1 carve-out 1): what `resolveRequestContext` needs
 * from the session store, and nothing more.
 *
 * DECLARED HERE, SATISFIED STRUCTURALLY. `packages/db/auth` implements it on Better Auth
 * (`identityOn(auth, db)`) and may not import `@momo/app`; the composition root's `satisfies` checks
 * the match. The request's headers are a type parameter, so this layer never names a web type.
 *
 * Sign-in and sign-out are NOT here: they are the composition root's auth bindings, called by the
 * web's own actions. Role, membership and revocation changes are not here either, and never will
 * be: they are audited use cases (slices 2 and later), not side effects of the auth adapter.
 */
export {};

/**
 * The seed's password hash (story 1.4 slice 1): Better Auth's own scrypt, so the hash the seed
 * writes into `account.password` is one `signInEmail` verifies. `scripts/seed.ts` calls it with
 * `SEED_DEMO_PASSWORD`; `packages/db` never sees the password, only this hash.
 */
import { hashPassword as betterAuthHash, verifyPassword as betterAuthVerify } from 'better-auth/crypto';
export async function hashPassword(password) {
    if (password.length === 0)
        throw new Error('hashPassword was given an empty password.');
    return betterAuthHash(password);
}
/**
 * The same scrypt, read backwards — Better Auth's own verifier, so this answers the question
 * `signInEmail` asks and not a re-implementation of it. Nothing in the product calls this: sign-in
 * goes through Better Auth, which verifies internally. It exists for the seed gate in
 * `tests/identity.test.ts`, which had no way to tell the hash of `SEED_DEMO_PASSWORD` from the
 * hash of anything else — `account.password IS NOT NULL` was the whole assertion, so hashing the
 * wrong string kept every gate green and locked both demo users out of the documented login
 * (fifth review pass, 2026-09-22).
 */
export async function verifyPassword(hash, password) {
    return betterAuthVerify({ hash, password });
}

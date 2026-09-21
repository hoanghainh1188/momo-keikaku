/**
 * The seed's password hash (story 1.4 slice 1): Better Auth's own scrypt, so the hash the seed
 * writes into `account.password` is one `signInEmail` verifies. `scripts/seed.ts` calls it with
 * `SEED_DEMO_PASSWORD`; `packages/db` never sees the password, only this hash.
 */
import { hashPassword as betterAuthHash } from 'better-auth/crypto';

export async function hashPassword(password: string): Promise<string> {
  if (password.length === 0) throw new Error('hashPassword was given an empty password.');
  return betterAuthHash(password);
}

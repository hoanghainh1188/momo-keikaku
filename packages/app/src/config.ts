// The ONE place in application code that reads `process.env`. Everything else takes
// configuration as a value, so a missing key is a boot failure naming the key rather
// than an `undefined` that surfaces as a wrong figure hours later.
//
// ESLint's environment ban (see eslint.config.js) exempts exactly this file and
// `**/*.test.ts` — the test exemption is forced by an existing test that reads
// `process.env.REQUIRE_DB`, and is recorded in deferred-work.md. The clock adapter is NOT
// exempt from it: the two bans are switched independently, so each sanctioned home is still
// fenced in the direction it has no business going. This file, in turn, is still forbidden
// to read the wall clock. Adding a second environment reader in application code is a lint
// error, by design.
//
// The schema is deliberately thin — two connection strings, and they are two on purpose:
//
//   * DATABASE_URL names the OWNING role. `drizzle-kit`, `scripts/seed.ts` and
//     `scripts/db-policies.ts` connect as it, and the pg-boss migrator step assumes
//     ownership from it. It exists because some work is genuinely owner work: DDL,
//     TRUNCATE, CREATE POLICY, CREATE ROLE.
//   * APP_DATABASE_URL names the restricted `app` role — a non-owner without BYPASSRLS,
//     holding DML on the `pgboss` schema plus exactly the per-table privileges the
//     table-class registry states, and no TRUNCATE anywhere. From story 1.2 on this is
//     what the APPLICATION connects as: `apps/web` (through
//     `apps/web/src/server/composition.ts`), `apps/worker`, `scripts/peek-db.ts` and both
//     round-trip tests. That was the point of the story — FORCE row-level security does
//     nothing against the superuser the owner happens to be, so policies read through the
//     owner prove nothing.
//
// EACH KEY IS PARSED WHEN IT IS FIRST READ, not all of them at boot. That is deliberate and
// it is the one thing to preserve when adding a key. `apps/web` and `apps/worker` hold only
// the restricted credential; requiring them to also have the owner's connection string in
// their environment — where they can read it — would hand the whole separation back. The
// promise is unchanged: a process that reads a key it has not been given fails naming that
// key, at the first read rather than at the first query. `parseConfig` still parses the whole
// schema at once, for callers (the migration scripts) that genuinely need both.
//
// Later stories extend this schema (session idle timeout, mail transport, the fixture-mode
// clock anchor) by adding keys here — never by reading the environment somewhere else.
import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z
    .string({
      error:
        'is required — the PostgreSQL connection string, e.g. postgres://user:pass@host:port/db',
    })
    .min(1, 'must not be empty — it is the PostgreSQL connection string'),

  // The worker connects as this role and pg-boss is constructed with `migrate: false` and
  // `createSchema: false`, so the role needs no DDL rights at all. Its user and password
  // are also what the migrator step creates the role from, which is why one string carries
  // the whole identity rather than a name and a password drifting apart in two keys.
  APP_DATABASE_URL: z
    .string({
      error:
        'is required — the PostgreSQL connection string for the restricted application role, e.g. postgres://momo_app:momo_app@host:port/db',
    })
    .min(1, 'must not be empty — it is the restricted application role connection string'),
});

export type AppConfig = z.infer<typeof configSchema>;

/**
 * Parses a raw environment into the application configuration.
 *
 * Throws naming every offending key. Takes the environment as an argument so the
 * parse is a pure function of its input and can be exercised without mutating the
 * real process environment.
 */
export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  const result = configSchema.safeParse(env);
  if (result.success) return result.data;

  const named = result.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid configuration: ${named}`);
}

/**
 * Parses ONE key out of a raw environment, failing naming it.
 *
 * The per-key half of `parseConfig`. It reuses the same schema, so a key's rules are stated
 * once: `configSchema.shape[key]` is the very validator `parseConfig` applies.
 */
export function parseConfigKey<K extends keyof AppConfig>(
  env: Record<string, string | undefined>,
  key: K,
): AppConfig[K] {
  const result = configSchema.shape[key].safeParse(env[key]);
  if (result.success) return result.data as AppConfig[K];
  const named = result.error.issues.map((issue) => issue.message).join('; ');
  throw new Error(`Invalid configuration: ${key} ${named}`);
}

/**
 * The parsed configuration, one key at a time.
 *
 * A getter per key rather than an eagerly parsed object: reading `config.APP_DATABASE_URL`
 * validates APP_DATABASE_URL and nothing else, so a process that legitimately holds one
 * credential is not required to have the other in its environment. See the header — this is
 * what lets `apps/web` and `apps/worker` boot with the restricted role alone.
 *
 * Not memoised. Each read re-validates, which costs a zod parse of one string and means a
 * caller can never observe a value the environment no longer holds.
 */
export const config: AppConfig = {
  get DATABASE_URL(): string {
    return parseConfigKey(process.env, 'DATABASE_URL');
  },
  get APP_DATABASE_URL(): string {
    return parseConfigKey(process.env, 'APP_DATABASE_URL');
  },
};

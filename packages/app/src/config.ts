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
// schema at once; today only its tests call it, and any whole-schema caller must supply EVERY
// required key — both connection strings, the Better Auth secret and URL, and the seed password
// (and, with AUTH_GOOGLE=on, the three Google keys).
//
// Later stories extend this schema (mail transport, the fixture-mode clock anchor) by adding
// keys here — never by reading the environment somewhere else. Story 1.4 slice 1 added the four
// identity keys below: the Better Auth secret and base URL, the session idle timeout, and the
// demo password the seed hashes. Only the web process reads the first three, and only the seed
// the fourth, which is exactly what the per-key getters are for.
//
// Story 1.4 slice 3 added Google sign-in, OFF UNLESS CONFIGURED (AD-17): `AUTH_GOOGLE` is `off`
// by default, and `on` requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_ISSUER_URL`
// together. The three are optional one by one — a process with Google off must not need them —
// so the "required together" rule lives in two places that state it once each: `googleProvider()`,
// the accessor the web composition root reads (it fails naming every missing key at first read),
// and `parseConfig`'s `superRefine`. The issuer must be `https:`, unless its host is loopback (the
// in-repo fake OIDC provider, `tests/support/fake-oidc.ts`, in local dev and CI).
//
// Story 1.4 slice 4 added `MAILER` (AD-17's dev default, AD-18): `console` unless a deployment
// names another transport. `ses` (Epic 8) is ACCEPTED here and fails only at the composition root,
// naming the missing adapter — the key is not a lie about what ships today; it is the name of what
// will, so a deployment can be configured for it ahead of the adapter landing.
import { z } from 'zod';

/** Hosts an `http:` issuer may name: this machine only (the fake OIDC provider). */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** `https:`, or any scheme-valid URL on a loopback host — the issuer rule, stated once. */
function isAcceptableIssuer(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
}

/** The keys `AUTH_GOOGLE=on` requires, in the order a failure names them. */
const GOOGLE_KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_ISSUER_URL'] as const;

const configShape = z.object({
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

  // Better Auth signs its session cookie with this. Required, never defaulted: a default secret
  // is a secret everybody has. 32 characters is Better Auth's own floor for a production secret.
  BETTER_AUTH_SECRET: z
    .string({
      error: 'is required — the secret Better Auth signs session cookies with (32+ characters)',
    })
    .min(32, 'must be at least 32 characters — it signs every session cookie'),

  // The origin the web app is served from, e.g. http://localhost:3101. Better Auth checks the
  // Origin of every state-changing request against it.
  BETTER_AUTH_URL: z
    .string({ error: 'is required — the web app origin, e.g. http://localhost:3101' })
    .url('must be an absolute URL — the web app origin, e.g. http://localhost:3101'),

  // FR (sign-in scope): the idle timeout, configurable, default 8 hours. A session that sees no
  // page or action request for this long is refused on the next one.
  SESSION_IDLE_TIMEOUT_HOURS: z.coerce
    .number({ error: 'must be a whole number of hours' })
    .int('must be a whole number of hours')
    .min(1, 'must be at least 1 hour')
    .max(24 * 30, 'must be at most 720 hours (30 days)')
    .default(8),

  // The password the seed gives the demo users `linh` and `hoang` (founder decision,
  // 2026-09-21). Required by `pnpm seed` and nothing else; CI sets it.
  SEED_DEMO_PASSWORD: z
    .string({ error: 'is required by the seed — the demo users\' password (8+ characters)' })
    .min(8, 'must be at least 8 characters — it is the demo users\' password'),

  // Google sign-in (story 1.4 slice 3). `off` unless a deployment turns it on (AD-17).
  AUTH_GOOGLE: z
    .enum(['off', 'on'], { error: 'must be `off` or `on` — whether Google sign-in is offered' })
    .default('off'),

  // The OAuth client registered for this deployment. Never a real Google client in the
  // repository or in CI: there, they name the in-repo fake.
  GOOGLE_CLIENT_ID: z.string().min(1, 'must not be empty — the OAuth client id').optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'must not be empty — the OAuth client secret').optional(),

  // The OIDC issuer, e.g. https://accounts.google.com. Discovery is fetched from
  // `<issuer>/.well-known/openid-configuration`.
  GOOGLE_ISSUER_URL: z
    .string()
    .refine(
      isAcceptableIssuer,
      'must be an absolute https: URL (http: only on a loopback host) — the OIDC issuer, e.g. https://accounts.google.com',
    )
    .optional(),

  // Password reset's mail transport (story 1.4 slice 4, AD-17's dev default). `console` writes
  // every message to the server log; `ses` is Epic 8's, and is accepted here so a deployment can
  // name it before the adapter exists — the composition root fails naming the missing adapter.
  MAILER: z
    .enum(['console', 'ses'], { error: 'must be `console` or `ses` — which mail transport to use' })
    .default('console'),
});

/** Whole-schema parsing adds the one cross-key rule: `AUTH_GOOGLE=on` needs all three Google keys. */
const configSchema = configShape.superRefine((value, ctx) => {
  if (value.AUTH_GOOGLE !== 'on') return;
  for (const key of GOOGLE_KEYS) {
    if (value[key] === undefined) {
      ctx.addIssue({ code: 'custom', path: [key], message: 'is required when AUTH_GOOGLE=on' });
    }
  }
});

export type AppConfig = z.infer<typeof configShape>;

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
 * once: `configShape.shape[key]` is the very validator `parseConfig` applies.
 */
export function parseConfigKey<K extends keyof AppConfig>(
  env: Record<string, string | undefined>,
  key: K,
): AppConfig[K] {
  const result = configShape.shape[key].safeParse(env[key]);
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
  get BETTER_AUTH_SECRET(): string {
    return parseConfigKey(process.env, 'BETTER_AUTH_SECRET');
  },
  get BETTER_AUTH_URL(): string {
    return parseConfigKey(process.env, 'BETTER_AUTH_URL');
  },
  get SESSION_IDLE_TIMEOUT_HOURS(): number {
    return parseConfigKey(process.env, 'SESSION_IDLE_TIMEOUT_HOURS');
  },
  get SEED_DEMO_PASSWORD(): string {
    return parseConfigKey(process.env, 'SEED_DEMO_PASSWORD');
  },
  get AUTH_GOOGLE(): 'off' | 'on' {
    return parseConfigKey(process.env, 'AUTH_GOOGLE');
  },
  get GOOGLE_CLIENT_ID(): string | undefined {
    return parseConfigKey(process.env, 'GOOGLE_CLIENT_ID');
  },
  get GOOGLE_CLIENT_SECRET(): string | undefined {
    return parseConfigKey(process.env, 'GOOGLE_CLIENT_SECRET');
  },
  get GOOGLE_ISSUER_URL(): string | undefined {
    return parseConfigKey(process.env, 'GOOGLE_ISSUER_URL');
  },
  get MAILER(): 'console' | 'ses' {
    return parseConfigKey(process.env, 'MAILER');
  },
};

/** The Google provider, as `createAuth` takes it (`@momo/db-auth`'s `google` option). */
export interface GoogleProviderConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly issuer: string;
}

/**
 * Google sign-in's configuration from a raw environment: `null` when `AUTH_GOOGLE` is `off` (the
 * default), otherwise all three keys — or a failure NAMING EVERY MISSING ONE. Each key's own rule
 * (non-empty; the issuer `https:` unless loopback) is `parseConfigKey`'s, so it is stated once.
 */
export function parseGoogleProvider(env: Record<string, string | undefined>): GoogleProviderConfig | null {
  if (parseConfigKey(env, 'AUTH_GOOGLE') === 'off') return null;
  const missing = GOOGLE_KEYS.filter((key) => env[key] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Invalid configuration: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required when AUTH_GOOGLE=on`,
    );
  }
  return {
    clientId: parseConfigKey(env, 'GOOGLE_CLIENT_ID')!,
    clientSecret: parseConfigKey(env, 'GOOGLE_CLIENT_SECRET')!,
    issuer: parseConfigKey(env, 'GOOGLE_ISSUER_URL')!,
  };
}

/**
 * The process's Google provider, read when it is first asked for — by the web composition root,
 * when it builds its auth instance. `null` when Google sign-in is off.
 */
export function googleProvider(): GoogleProviderConfig | null {
  return parseGoogleProvider(process.env);
}

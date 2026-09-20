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
// The schema is deliberately thin: DATABASE_URL is the only configuration this repo
// has today. Later stories extend it (session idle timeout, mail transport, the
// fixture-mode clock anchor) by adding keys here — never by reading the environment
// somewhere else.
import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z
    .string({
      error:
        'is required — the PostgreSQL connection string, e.g. postgres://user:pass@host:port/db',
    })
    .min(1, 'must not be empty — it is the PostgreSQL connection string'),
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
 * Parsed once, at module load, so boot fails at the boundary instead of at the first
 * query. Importing this module in a process without the required keys is meant to
 * throw.
 */
export const config: AppConfig = parseConfig(process.env);

/**
 * Shared pino logger with AD-16 / NFR-S2 redaction (story 1.7).
 *
 * Lives in `packages/app` so both inbound adapters (`apps/web`, `apps/worker`) may import it
 * without opening the `packages/adapters` carve-out. Paths cover Tracker credentials and OAuth
 * secrets: `*.apiKey`, `*.token`, `*.password`, `*.clientSecret`, `*.idToken`, and
 * `authorization`. A LoggerPort can wait until more call sites exist.
 */
import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';

/** The redaction paths AD-16 names — kept as one list the AC and tests can point at. */
export const PINO_REDACT_PATHS = [
  // Nested (AD-16 wording) and top-level — pino's `*.x` does not match a root key `x`.
  'apiKey',
  '*.apiKey',
  'token',
  '*.token',
  'password',
  '*.password',
  'clientSecret',
  '*.clientSecret',
  'idToken',
  '*.idToken',
  'authorization',
  // Story 5.8 / NFR-S6: Tracker Account display names and emails are personal data.
  'displayName',
  '*.displayName',
  'email',
  '*.email',
  'display_name',
  '*.display_name',
] as const;

const CENSOR = '[Redacted]';

/**
 * Merges caller redact with AD-16 paths + censor. An array `redact` alone would drop the
 * AD-16 list; object `paths` are unioned with it, never replaced.
 */
function mergeRedact(redact: LoggerOptions['redact']): LoggerOptions['redact'] {
  if (redact === undefined) {
    return { paths: [...PINO_REDACT_PATHS], censor: CENSOR };
  }
  if (Array.isArray(redact)) {
    return {
      paths: [...new Set([...PINO_REDACT_PATHS, ...redact])],
      censor: CENSOR,
    };
  }
  return {
    ...redact,
    paths: [...new Set([...PINO_REDACT_PATHS, ...(redact.paths ?? [])])],
    censor: redact.censor ?? CENSOR,
  };
}

/** Builds a pino logger with the AD-16 redact list. Optional stream for tests. */
export function createLogger(
  options: LoggerOptions & {
    /**
     * Write synchronously to stdout. The worker uses this so lifecycle lines
     * (`started` / `stopped`) survive process exit for operators and the SIGTERM test.
     */
    readonly syncStdout?: boolean;
  } = {},
  destination?: DestinationStream,
): Logger {
  const { syncStdout, redact: callerRedact, ...rest } = options;
  const opts: LoggerOptions = { ...rest, redact: mergeRedact(callerRedact) };
  if (destination !== undefined) return pino(opts, destination);
  if (syncStdout === true) return pino(opts, pino.destination({ sync: true, dest: 1 }));
  return pino(opts);
}

export type { Logger };

import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  COMPOSE_APP_DATABASE_URL,
  COMPOSE_DATABASE_URL,
  missingKeys,
  parseEnvFile,
  resolveDevEnv,
  type RandomBytes,
} from './env';

/** Deterministic bytes, so a test can tell two generated values apart without real randomness. */
function counterBytes(): RandomBytes {
  let next = 0;
  return (size) => Uint8Array.from({ length: size }, () => next++ % 256);
}

describe('resolveDevEnv (decision Q1-A)', () => {
  it('generates a file when none exists, with every required key', () => {
    const { env, fileToWrite } = resolveDevEnv({}, null, counterBytes(), 3101);

    expect(fileToWrite).not.toBeNull();
    expect(missingKeys(env)).toEqual([]);
    expect(env.DATABASE_URL).toBe(COMPOSE_DATABASE_URL);
    expect(env.APP_DATABASE_URL).toBe(COMPOSE_APP_DATABASE_URL);
    expect(env.BETTER_AUTH_URL).toBe('http://localhost:3101');
    expect(parseEnvFile(fileToWrite!)).toMatchObject({
      BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
      SEED_DEMO_PASSWORD: env.SEED_DEMO_PASSWORD,
    });
  });

  it('writes the web port it was given into BETTER_AUTH_URL', () => {
    const { env } = resolveDevEnv({}, null, counterBytes(), 3111);
    expect(env.BETTER_AUTH_URL).toBe('http://localhost:3111');
  });

  it('generates a secret of at least 32 characters and a password of at least 8', () => {
    const { env } = resolveDevEnv({}, null, randomBytes);
    expect(env.BETTER_AUTH_SECRET!.length).toBeGreaterThanOrEqual(32);
    expect(env.BETTER_AUTH_SECRET).toHaveLength(48);
    expect(env.SEED_DEMO_PASSWORD!.length).toBeGreaterThanOrEqual(8);
  });

  it('generates different values on different runs', () => {
    const a = resolveDevEnv({}, null, randomBytes).env;
    const b = resolveDevEnv({}, null, randomBytes).env;
    expect(a.BETTER_AUTH_SECRET).not.toBe(b.BETTER_AUTH_SECRET);
    expect(a.SEED_DEMO_PASSWORD).not.toBe(b.SEED_DEMO_PASSWORD);
  });

  it('never rewrites an existing file, and reads its values', () => {
    const existing = 'BETTER_AUTH_SECRET=from-the-file-0123456789abcdef0123456789\n';
    const { env, fileToWrite } = resolveDevEnv({}, existing, counterBytes());

    expect(fileToWrite).toBeNull();
    expect(env.BETTER_AUTH_SECRET).toBe('from-the-file-0123456789abcdef0123456789');
  });

  it('does not fill in a key the existing file lacks — the missing-key check names it', () => {
    const { env, fileToWrite } = resolveDevEnv(
      {},
      `DATABASE_URL=${COMPOSE_DATABASE_URL}\n`,
      counterBytes(),
    );
    expect(fileToWrite).toBeNull();
    expect(missingKeys(env)).toEqual([
      'APP_DATABASE_URL',
      'SEED_DEMO_PASSWORD',
      'BETTER_AUTH_SECRET',
      'BETTER_AUTH_URL',
    ]);
  });

  it('lets a key set in the shell win over the file', () => {
    const file = 'SEED_DEMO_PASSWORD=from-file\nDATABASE_URL=postgres://file@x/db\n';
    const { env } = resolveDevEnv(
      { SEED_DEMO_PASSWORD: 'from-shell', OTHER: 'kept' },
      file,
      counterBytes(),
    );
    expect(env.SEED_DEMO_PASSWORD).toBe('from-shell');
    expect(env.DATABASE_URL).toBe('postgres://file@x/db');
    expect(env.OTHER).toBe('kept');
  });

  it('lets a shell key win over a freshly generated file too', () => {
    const { env, fileToWrite } = resolveDevEnv(
      { BETTER_AUTH_URL: 'http://localhost:4000' },
      null,
      counterBytes(),
    );
    expect(env.BETTER_AUTH_URL).toBe('http://localhost:4000');
    // The file still records its own value: the shell only wins for this run.
    expect(parseEnvFile(fileToWrite!).BETTER_AUTH_URL).toBe('http://localhost:3101');
  });

  it('treats an empty shell value as unset', () => {
    const { env } = resolveDevEnv({ SEED_DEMO_PASSWORD: '' }, 'SEED_DEMO_PASSWORD=pw123456\n', counterBytes());
    expect(env.SEED_DEMO_PASSWORD).toBe('pw123456');
  });

  it('does not mutate the environment it was given', () => {
    const shell = { KEEP: 'x' };
    resolveDevEnv(shell, null, counterBytes());
    expect(shell).toEqual({ KEEP: 'x' });
  });
});

describe('parseEnvFile', () => {
  it('skips comments and blanks, drops `export`, and strips one pair of quotes', () => {
    expect(
      parseEnvFile(
        ['# a comment', '', 'A=1', 'export B="two words"', "C='3'", 'D=has=equals', 'junk'].join(
          '\n',
        ),
      ),
    ).toEqual({ A: '1', B: 'two words', C: '3', D: 'has=equals' });
  });
});

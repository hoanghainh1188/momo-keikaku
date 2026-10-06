/**
 * Shared pino logger with AD-16 / NFR-S2 redaction (story 1.7) — unit pins.
 */
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger, PINO_REDACT_PATHS } from './logger';

describe('createLogger redaction (AD-16 / NFR-S2)', () => {
  it('names every AD-16 redact path', () => {
    expect(PINO_REDACT_PATHS).toEqual(
      expect.arrayContaining([
        '*.apiKey',
        '*.token',
        '*.password',
        '*.clientSecret',
        '*.idToken',
        'authorization',
        'displayName',
        '*.displayName',
        'email',
        '*.email',
      ]),
    );
  });

  it('createLogger builds a logger', () => {
    expect(createLogger({ level: 'silent' })).toBeDefined();
  });

  it('keeps AD-16 paths when caller passes an array redact', async () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(String(chunk));
        cb();
      },
    });
    const log = createLogger({ level: 'info', redact: ['customSecret'] }, stream);
    log.info({ apiKey: 'secret-key', customSecret: 'x', safe: 'ok' });
    await new Promise((r) => setImmediate(r));
    const line = chunks.join('');
    expect(line).not.toContain('secret-key');
    expect(line).not.toContain('"x"');
    expect(line).toContain('"safe":"ok"');
  });

  it('redacts credential fields from log output via createLogger', async () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(String(chunk));
        cb();
      },
    });
    const log = createLogger({ level: 'info' }, stream);
    log.info({
      apiKey: 'secret-key',
      nested: { token: 'tok', password: 'pw', clientSecret: 'cs', idToken: 'idt' },
      authorization: 'Bearer abc',
      safe: 'ok',
    });
    await new Promise((r) => setImmediate(r));
    const line = chunks.join('');
    expect(line).toContain('[Redacted]');
    expect(line).toContain('"safe":"ok"');
    expect(line).not.toContain('secret-key');
    expect(line).not.toContain('Bearer abc');
    expect(line).not.toContain('"tok"');
  });

  it('redacts Tracker Account displayName and email (NFR-S6)', async () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(String(chunk));
        cb();
      },
    });
    const log = createLogger({ level: 'info' }, stream);
    log.info({
      accountId: 'acct-1',
      displayName: 'Secret Person',
      email: 'secret@example.com',
      nested: { displayName: 'Nested Person', email: 'nested@example.com' },
    });
    await new Promise((r) => setImmediate(r));
    const line = chunks.join('');
    expect(line).toContain('"accountId":"acct-1"');
    expect(line).not.toContain('Secret Person');
    expect(line).not.toContain('secret@example.com');
    expect(line).not.toContain('Nested Person');
    expect(line).not.toContain('nested@example.com');
  });
});

import { describe, expect, it } from 'vitest';
import { consoleMailLine, mailerConsoleOn } from './mailer-console';

/** The dev mailer writes to a sink it is given, never to `console.log` itself. */
describe('mailerConsoleOn', () => {
  it('writes one line to the sink, carrying the address, the subject and the body', async () => {
    const lines: string[] = [];
    const mailer = mailerConsoleOn((line) => lines.push(line));

    await mailer.send({
      to: 'hoang@momo-digital.example',
      subject: 'Reset your momo-keikaku password',
      text: 'Reset it here: http://localhost:3101/reset-password?token=abc',
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(consoleMailLine({
      to: 'hoang@momo-digital.example',
      subject: 'Reset your momo-keikaku password',
      text: 'Reset it here: http://localhost:3101/reset-password?token=abc',
    }));
    expect(lines[0]).toContain('to: hoang@momo-digital.example');
    expect(lines[0]).toContain('subject: Reset your momo-keikaku password');
    expect(lines[0]).toContain('http://localhost:3101/reset-password?token=abc');
  });

  it('writes one line per message, in order, to a sink of the caller\'s choosing', async () => {
    const lines: string[] = [];
    const mailer = mailerConsoleOn((line) => lines.push(line));

    await mailer.send({ to: 'a@example.test', subject: 'One', text: 'first' });
    await mailer.send({ to: 'b@example.test', subject: 'Two', text: 'second' });

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('to: a@example.test');
    expect(lines[1]).toContain('to: b@example.test');
  });

  it('propagates a sink failure rather than swallowing it — the caller decides what to do with it', async () => {
    const mailer = mailerConsoleOn(() => {
      throw new Error('sink exploded');
    });
    await expect(
      mailer.send({ to: 'a@example.test', subject: 'x', text: 'y' }),
    ).rejects.toThrow('sink exploded');
  });
});

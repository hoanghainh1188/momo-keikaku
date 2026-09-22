/**
 * THE CONSOLE MAILER (story 1.4 slice 4, AD-17's dev default; AD-18).
 *
 * `packages/app`'s `MailerPort`, satisfied structurally (like every other adapter here — this
 * package implements the ports, never imports them). It writes every message to a SINK rather
 * than sending it anywhere: local dev and CI never send real mail, and this is the only mailer
 * that ships until Epic 8's `mailer-ses`, which the AWS account and sender domain exist to test
 * against — the port is shaped so it is a drop-in.
 *
 * THE SINK IS AN ARGUMENT, not `console.log` called from inside this module: the composition
 * root hands `console.log` over (`webMailer()`), and a test hands a capturing fake instead, in
 * `ids.test.ts`'s shape — hand-rolled, no mocking library. That is also what makes the "reads no
 * environment, no wall clock" rule checkable by inspection: there is nothing here to read either
 * from, since the message and the sink both arrive as arguments.
 *
 * No `JSON.stringify`: a mail message is already plain strings, so there is no JSON to serialise
 * here at all — `packages/domain`'s `stringify` is the one sanctioned place a stored value meets
 * `JSON.stringify`, and this adapter carries no stored value.
 */
export interface ConsoleMailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** Where a written mail begins and ends, so a scanning eye (or a test) can find one in a log. */
const RULE = '--- mail (console) ---';
const END = '--- end mail ---';

/** One line for a sink to write — `console.log`, or a test's capturing fake. */
export function consoleMailLine(message: ConsoleMailMessage): string {
  return [RULE, `to: ${message.to}`, `subject: ${message.subject}`, '', message.text, END].join('\n');
}

/** `MailerPort`, writing to `sink` instead of a transport. */
export function mailerConsoleOn(sink: (line: string) => void) {
  return {
    send: async (message: ConsoleMailMessage): Promise<void> => {
      sink(consoleMailLine(message));
    },
  };
}

/** Where a written mail begins and ends, so a scanning eye (or a test) can find one in a log. */
const RULE = '--- mail (console) ---';
const END = '--- end mail ---';
/** One line for a sink to write — `console.log`, or a test's capturing fake. */
export function consoleMailLine(message) {
    return [RULE, `to: ${message.to}`, `subject: ${message.subject}`, '', message.text, END].join('\n');
}
/** `MailerPort`, writing to `sink` instead of a transport. */
export function mailerConsoleOn(sink) {
    return {
        send: async (message) => {
            sink(consoleMailLine(message));
        },
    };
}

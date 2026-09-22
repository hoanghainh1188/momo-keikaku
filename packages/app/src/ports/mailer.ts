/**
 * MAIL, AS A PORT (AD-17, AD-18, story 1.4 slice 4).
 *
 * The architecture says an outbound side effect this product does not own the transport for
 * arrives as a `Clock` does: injected, never reached for. `packages/adapters` owns the
 * implementation the demo runs on (`mailerConsoleOn`, story 1.4 slice 4's `mailer-console`);
 * `mailer-ses` (Epic 8) is the drop-in replacement once the AWS account and sender domain exist
 * to test it against, satisfying this exact port.
 *
 * DECLARED HERE, SATISFIED STRUCTURALLY — exactly like the repository ports and `Clock`.
 * `packages/db/auth` may import neither this package nor `packages/adapters` (AD-1), so
 * `CreateAuthOptions`'s own `ResetMailer` (`packages/db/auth/src/reset.ts`) restates this shape,
 * and the composition root's `satisfies MailerPort` is where TypeScript checks the two agree.
 *
 * One message, one member — a plain-text mail. Mail copy is hardcoded English (`packages/i18n`
 * is empty until story 1.9); there is no HTML body and no template engine to keep in scope.
 */
export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface MailerPort {
  readonly send: (message: MailMessage) => Promise<void>;
}

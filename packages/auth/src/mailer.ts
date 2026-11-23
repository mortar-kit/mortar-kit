// Sending email: the small adapter the email sign-in method sends through.
// Mortar ships a console mailer for development and `resendMailer`
// (resend.ts); a site wraps any other provider (Postmark, SES, SMTP via
// nodemailer) in a few lines.

/** One email to send. */
export interface MailMessage {
  to: string;
  subject: string;
  /** Plain-text body. */
  text: string;
  /** HTML body, for clients that show it. */
  html?: string;
  /** Where replies go instead of the sender, e.g. the visitor who filled in a contact form. */
  replyTo?: string;
}

/**
 * Sends email. Implement it over your provider; the sender address is the
 * mailer's business. Throw if the message wasn't accepted.
 *
 * @example
 * ```ts
 * const mailer: Mailer = {
 *   async send(message) {
 *     await resend.emails.send({ from: 'Site <admin@example.com>', ...message });
 *   },
 * };
 * ```
 */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * A mailer that prints each message (sign-in links and codes included) to
 * the server's console instead of sending it. For development only.
 */
export function consoleMailer(log: (text: string) => void = console.log): Mailer {
  return {
    async send(message) {
      const replyTo = message.replyTo ? ` (reply to ${message.replyTo})` : '';
      log(`\n[mortar] Email to ${message.to}${replyTo}: ${message.subject}\n\n${message.text}\n`);
    },
  };
}

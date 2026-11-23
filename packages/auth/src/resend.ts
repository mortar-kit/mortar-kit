// resendMailer: an optional Mailer over Resend's HTTP API (one fetch, no
// SDK). Any other provider is a few lines of your own Mailer.
import type { Mailer } from './mailer.ts';

/** Options for `resendMailer`. */
export interface ResendMailerOptions {
  /** A Resend API key (`re_…`), from the environment. */
  apiKey: string;
  /** The sender, on a domain verified with Resend, e.g. `'Site <admin@example.com>'`. */
  from: string;
  /** For tests: the fetch to send with. */
  fetch?: typeof fetch;
}

const ENDPOINT = 'https://api.resend.com/emails';

/**
 * A mailer that sends through Resend. Throws when Resend refuses a message,
 * so the sign-in shows an error instead of waiting for an email that won't come.
 *
 * @example
 * ```ts
 * email({ mailer: resendMailer({ apiKey: process.env.RESEND_API_KEY!, from: 'Site <admin@example.com>' }), store });
 * ```
 */
export function resendMailer(options: ResendMailerOptions): Mailer {
  if (!options.apiKey) throw new Error('Mortar auth: resendMailer needs an apiKey.');
  if (!options.from) throw new Error('Mortar auth: resendMailer needs a from address.');
  const send = options.fetch ?? fetch;
  return {
    async send(message) {
      const response = await send(ENDPOINT, {
        method: 'POST',
        headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: options.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
      });
      if (!response.ok) throw new Error(`Resend refused the email (${response.status}): ${await response.text().catch(() => '')}`);
    },
  };
}

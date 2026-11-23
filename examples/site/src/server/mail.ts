// What brick actions get from the server (ActionContext, declared in
// src/actions.ts): a mailer and the default inbox, and a per-client limit
// on form posts. Server only: src/server/content.ts imports it.
//
// Environment:
// - CONTACT_TO: where contact forms send messages when the brick doesn't
//   name an address. Development falls back to admin@example.com.
// - RESEND_API_KEY / MORTAR_EMAIL_FROM: send through Resend (the same
//   settings as sign-in emails). Without them, development prints each
//   message to the server console.
import { consoleMailer, createLimiter, resendMailer, type Mailer } from '@mortar-kit/auth';
import type { ActionContext } from '@mortar-kit/core';

const dev = import.meta.env.DEV;
const env = process.env;

const mailer: Mailer | undefined =
  env.RESEND_API_KEY && env.MORTAR_EMAIL_FROM ? resendMailer({ apiKey: env.RESEND_API_KEY, from: env.MORTAR_EMAIL_FROM }) : dev ? consoleMailer() : undefined;

const inbox = env.CONTACT_TO || (dev ? 'admin@example.com' : undefined);

if (!mailer) console.warn('Forms: no mailer. Set RESEND_API_KEY and MORTAR_EMAIL_FROM to send messages.');

/** What every brick action gets. */
export const actionContext: ActionContext = { mailer, inbox };

/** Ten form posts per client every ten minutes, across all brick forms. */
const limiter = createLimiter(10, 10 * 60 * 1000);

/**
 * True when this request's client has posted too many forms lately. Keyed
 * by the proxy's X-Forwarded-For (or X-Real-IP); without either, posts
 * aren't limited.
 */
export function overLimit(request: Request | undefined): boolean {
  const forwarded = request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const client = forwarded || request?.headers.get('x-real-ip')?.trim();
  return client ? limiter(client) > 0 : false;
}

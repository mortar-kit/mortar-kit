// The contact form's server side: takes the form post from the
// contact-form brick, checks it, emails it to the site's inbox and sends
// the visitor back to the page with the outcome in the URL (post, redirect,
// get), so it works without JavaScript and a refresh never sends twice.
// Run from src/middleware.ts, ahead of Mortar's middleware.
//
// Environment:
// - CONTACT_TO: the address messages go to. Development falls back to
//   admin@example.com; without it a production server answers "failed".
// - RESEND_API_KEY / MORTAR_EMAIL_FROM: send through Resend (the same
//   settings as sign-in emails). Without them, development prints each
//   message to the server console.
import { consoleMailer, createLimiter, resendMailer, type Mailer } from '@mortar-kit/auth';

import { CONTACT_ANCHOR, CONTACT_HONEYPOT, CONTACT_LIMITS, CONTACT_PATH, CONTACT_STATUS, type ContactStatus } from '../contact.ts';

const dev = import.meta.env.DEV;
const env = process.env;

/** Where messages go. */
const recipient = env.CONTACT_TO || (dev ? 'admin@example.com' : undefined);

/** How messages are sent: Resend when configured, the console in development. */
const mailer: Mailer | undefined =
  env.RESEND_API_KEY && env.MORTAR_EMAIL_FROM ? resendMailer({ apiKey: env.RESEND_API_KEY, from: env.MORTAR_EMAIL_FROM }) : dev ? consoleMailer() : undefined;

if (!recipient || !mailer) console.warn('Contact form: set CONTACT_TO, RESEND_API_KEY and MORTAR_EMAIL_FROM to send messages.');

/** Larger bodies than this are refused before they are read. */
const MAX_BODY = 32 * 1024;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A checked message. */
interface Message {
  name: string;
  email: string;
  message: string;
}

/** Takes a request; answers a contact post with its redirect, anything else with undefined. */
export type ContactHandler = (request: Request) => Promise<Response | undefined>;

/**
 * A handler for posts to CONTACT_PATH that mails each message with `mailer`
 * to `to`. Without either, every valid post answers "failed".
 */
export function createContactHandler(options: { mailer: Mailer | undefined; to: string | undefined }): ContactHandler {
  // Five messages per client every ten minutes.
  const limiter = createLimiter(5, 10 * 60 * 1000);
  const { mailer: send, to } = options;
  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== CONTACT_PATH || request.method !== 'POST') return undefined;
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return back(url, '/', 'invalid');

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return back(url, '/', 'invalid');
    }
    const page = returnPath(form.get('return'), url);

    // A bot filled in the hidden field: say it worked, send nothing.
    if (text(form, CONTACT_HONEYPOT)) return back(url, page, 'sent');

    const client = clientKey(request);
    if (client !== undefined && limiter(client) > 0) return back(url, page, 'busy');

    const message = check(form);
    if (!message) return back(url, page, 'invalid');
    if (!send || !to) return back(url, page, 'failed');

    try {
      await send.send({
        to,
        replyTo: message.email,
        subject: `Contact form: ${message.name}`,
        text: `${message.name} <${message.email}> wrote, from ${page}:\n\n${message.message}\n`,
      });
    } catch (error) {
      console.error('Contact form: the message was not sent.', error);
      return back(url, page, 'failed');
    }
    return back(url, page, 'sent');
  };
}

/** The site's contact handler, configured from the environment. */
export const handleContact: ContactHandler = createContactHandler({ mailer, to: recipient });

/** The form's fields, trimmed, or undefined when one is missing, too long or not an address. */
function check(form: FormData): Message | undefined {
  // No line breaks in the name: it goes in the subject.
  const name = text(form, 'name').replace(/\s+/g, ' ');
  const email = text(form, 'email');
  const message = text(form, 'message');
  if (!name || name.length > CONTACT_LIMITS.name) return undefined;
  if (!EMAIL.test(email) || email.length > CONTACT_LIMITS.email) return undefined;
  if (!message || message.length > CONTACT_LIMITS.message) return undefined;
  return { name, email, message };
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** The page to send the visitor back to: a path on this site, else the home page. */
function returnPath(value: FormDataEntryValue | null, site: URL): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/';
  const target = new URL(value, site);
  return target.origin === site.origin ? target.pathname : '/';
}

/** 303 to `page?contact=<status>#contact`, so the browser GETs the page and scrolls to the form. */
function back(site: URL, page: string, status: ContactStatus): Response {
  const target = new URL(page, site);
  target.searchParams.set(CONTACT_STATUS, status);
  target.hash = CONTACT_ANCHOR;
  return new Response(null, { status: 303, headers: { location: target.pathname + target.search + target.hash } });
}

/** Who sent the post, from the proxy's headers; without them, posts aren't limited. */
function clientKey(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || undefined;
}

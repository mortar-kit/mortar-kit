// What the contact form brick and its server handler agree on: where the
// form posts, the field names and limits, and the status the handler puts
// in the URL when it sends the visitor back. No UI and no server code, so
// both sides can import it.

/** Where the contact form posts (handled by src/server/contact.ts, in the middleware). */
export const CONTACT_PATH = '/contact';

/** The query parameter the handler sets on the page it redirects back to. */
export const CONTACT_STATUS = 'contact';

/** The element id the redirect scrolls to (`#contact`). */
export const CONTACT_ANCHOR = 'contact';

/**
 * How a post went: sent; a field was missing or too long; the visitor sent
 * too many messages; or the mailer failed (or no recipient is configured).
 */
export type ContactStatus = 'sent' | 'invalid' | 'busy' | 'failed';

/** Longest values the form accepts, enforced by the browser (maxlength) and again by the server. */
export const CONTACT_LIMITS = { name: 100, email: 254, message: 5000 } as const;

/**
 * The honeypot field: hidden from people, so a value in it means a bot
 * filled in the form. The handler then pretends it sent the message.
 */
export const CONTACT_HONEYPOT = 'website';

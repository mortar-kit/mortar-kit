// Passwordless email sign-in. One email carries both a link and a 6-digit
// code: the link for the device the email is read on, the code for typing
// into the browser that asked. Only someone `authorize` accepts is sent
// anything, and the sign-in page reads "check your email" either way, so
// it never tells who has access. The pending sign-in is kept in a
// ContentStore (reserved collection `mortar-auth-tokens`), one record per
// address, holding only keyed hashes: single use, expiring, a few tries.
// The link opens the sign-in page, which posts it on a button press, so
// mail scanners that open links don't use it up.
import type { ContentStore } from '@mortar-kit/core';

import { formValue, readForm, type AuthMethod, type AuthMethodContext } from './auth.ts';
import type { Mailer } from './mailer.ts';
import { randomDigits, randomToken } from './seal.ts';

/** Options for `email`. */
export interface EmailOptions {
  /** Sends the sign-in emails. `consoleMailer()` prints them, for development. */
  mailer: Mailer;
  /**
   * Keeps pending sign-ins (hashes, for minutes). Any ContentStore works;
   * with the JSON-file store, use a directory outside your content and git
   * (e.g. `createJsonFileStore({ dir: '.data' })`).
   */
  store: ContentStore;
  /** The site's name in the email's subject and text. Default: the site's host. */
  siteName?: string;
  /** Minutes until a link or code expires. Default 15. */
  expiresIn?: number;
  /** Label of the email field's button. Default "Email me a sign-in link". */
  label?: string;
  /** The method's id, in its URLs. Default `email`. */
  id?: string;
}

/** The reserved collection pending email sign-ins are stored in. */
export const EMAIL_TOKENS_COLLECTION = 'mortar-auth-tokens';

const MAX_ATTEMPTS = 5;
const RESEND_AFTER = 60_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Pending {
  tokenHash: string;
  codeHash: string;
  /** Times in milliseconds. */
  sent: number;
  expires: number;
  attempts: number;
}

/** Sign in with a link or code sent by email. */
export function email(options: EmailOptions): AuthMethod {
  const id = options.id ?? 'email';
  const store = options.store;
  const ttl = (options.expiresIn ?? 15) * 60_000;

  const slugOf = async (ctx: AuthMethodContext, address: string) => (await ctx.sealer.hash(`email:${address}`)).slice(0, 40);
  const read = async (slug: string): Promise<Pending | null> => {
    const raw = (await store.get(EMAIL_TOKENS_COLLECTION, slug)) as { fields?: Partial<Pending> } | undefined;
    const f = raw?.fields;
    if (!f || typeof f.tokenHash !== 'string' || typeof f.codeHash !== 'string' || typeof f.expires !== 'number') return null;
    return { tokenHash: f.tokenHash, codeHash: f.codeHash, expires: f.expires, sent: Number(f.sent) || 0, attempts: Number(f.attempts) || 0 };
  };
  const write = (slug: string, pending: Pending) => store.put(EMAIL_TOKENS_COLLECTION, { id: slug, slug, fields: { ...pending } });
  /** Drops other addresses' expired sign-ins, so they don't pile up. */
  const sweep = async () => {
    const now = Date.now();
    for (const raw of await store.list(EMAIL_TOKENS_COLLECTION)) {
      const r = raw as { slug?: unknown; fields?: { expires?: unknown } };
      if (typeof r.slug === 'string' && !(Number(r.fields?.expires) > now)) await store.remove(EMAIL_TOKENS_COLLECTION, r.slug);
    }
  };

  return {
    id,
    label: options.label ?? 'Email me a sign-in link',
    input: 'email',

    async start(request, ctx) {
      const address = (formValue(await readForm(request), 'email') ?? '').trim().toLowerCase();
      if (address.length > 254 || !EMAIL.test(address)) return ctx.fail('invalid-email');
      const sentPage = ctx.redirect(ctx.signInUrl({ method: id, sent: address, returnTo: ctx.returnTo }));

      await sweep().catch((error: unknown) => console.error('Mortar auth: could not clear expired email sign-ins.', error));
      if (!(await ctx.allows({ email: address, method: id }))) return sentPage;
      const slug = await slugOf(ctx, address);
      const previous = await read(slug);
      // Asked again within a minute: the first email is on its way.
      if (previous && Date.now() - previous.sent < RESEND_AFTER && previous.expires > Date.now()) return sentPage;

      const token = randomToken();
      const code = randomDigits(6);
      const now = Date.now();
      await write(slug, { tokenHash: await ctx.sealer.hash(token), codeHash: await ctx.sealer.hash(code), sent: now, expires: now + ttl, attempts: 0 });
      const link = ctx.signInUrl({ method: id, email: address, token, returnTo: ctx.returnTo });
      const site = options.siteName ?? new URL(link).host;
      const minutes = Math.round(ttl / 60_000);
      try {
        await options.mailer.send({
          to: address,
          subject: `Your sign-in code for ${site}: ${code}`,
          text: `Your code to sign in to ${site} is ${code}.\n\nOr open this link:\n${link}\n\nBoth expire in ${minutes} minutes and work once. If you didn't ask to sign in, ignore this email.`,
          html:
            `<p>Your code to sign in to ${escape(site)} is <strong style="font-size:1.25em;letter-spacing:0.1em">${code}</strong>.</p>` +
            `<p>Or <a href="${escape(link)}">sign in with this link</a>.</p>` +
            `<p>Both expire in ${minutes} minutes and work once. If you didn't ask to sign in, ignore this email.</p>`,
        });
      } catch (error) {
        await store.remove(EMAIL_TOKENS_COLLECTION, slug);
        throw error;
      }
      return sentPage;
    },

    async callback(request, ctx) {
      // Links open the sign-in page, which posts here; a GET is someone's guess.
      if (request.method !== 'POST') return ctx.fail('invalid');
      const form = await readForm(request);
      const address = (formValue(form, 'email') ?? '').trim().toLowerCase();
      const token = formValue(form, 'token');
      const code = formValue(form, 'code')?.replace(/\s+/g, '');
      if (!address || (!token && !code)) return ctx.fail('invalid');

      const slug = await slugOf(ctx, address);
      const pending = await read(slug);
      if (!pending) return ctx.fail('expired');
      if (pending.expires <= Date.now()) {
        await store.remove(EMAIL_TOKENS_COLLECTION, slug);
        return ctx.fail('expired');
      }
      const matches = token ? (await ctx.sealer.hash(token)) === pending.tokenHash : (await ctx.sealer.hash(code!)) === pending.codeHash;
      if (!matches) {
        const attempts = pending.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) await store.remove(EMAIL_TOKENS_COLLECTION, slug);
        else await write(slug, { ...pending, attempts });
        // A wrong code keeps the code form open; a wrong link starts again.
        if (attempts >= MAX_ATTEMPTS) return ctx.fail('expired');
        return ctx.fail('invalid', code ? { method: id, sent: address } : {});
      }
      await store.remove(EMAIL_TOKENS_COLLECTION, slug);
      return { identity: { email: address, method: id }, returnTo: ctx.returnTo };
    },
  };
}

function escape(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
